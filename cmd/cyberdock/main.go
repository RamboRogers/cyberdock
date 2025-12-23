package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cyberdock/internal/cert"
	"github.com/cyberdock/internal/registry"
	"github.com/cyberdock/internal/ui"
	"github.com/gorilla/mux"
)

const (
	defaultPort         = 5000
	defaultRegistryPort = 5000  // Kept for backward compatibility
	defaultUIPort       = 5001  // Kept for backward compatibility
	version             = "0.3.4d"
)

// These will be set at build time
var (
	telemetryToken string
	telemetryURL   string
)

type telemetryData struct {
	SystemID string `json:"system_id"`
	Version  string `json:"version"`
	Token    string `json:"token"`
}

func getSystemID() string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return "cyberdock_unknown"
	}

	// Find the first non-loopback interface with a MAC address
	var macAddr string
	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback == 0 && len(iface.HardwareAddr) > 0 {
			macAddr = iface.HardwareAddr.String()
			break
		}
	}

	if macAddr == "" {
		return "cyberdock_unknown"
	}

	// Create a hash of the MAC address
	hasher := sha256.New()
	hasher.Write([]byte(macAddr))
	hash := hex.EncodeToString(hasher.Sum(nil))

	// Return first 12 characters of hash prefixed with cyberdock_
	return "cyberdock_" + hash[:12]
}

func checkTelemetry() {
	data := telemetryData{
		SystemID: getSystemID(),
		Version:  version,
		Token:    telemetryToken,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	req, err := http.NewRequest("POST", telemetryURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return
	}

	req.Header.Set("X-API-Token", telemetryToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return
	}

	var result struct {
		Authorized int    `json:"authorized"`
		Timestamp  string `json:"timestamp"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return
	}

	if result.Authorized != 1 {
		return
	}
}

func main() {
	// Check telemetry first
	checkTelemetry()

	// Parse command line flags
	port := flag.Int("p", defaultPort, "Port for CyberDock server (registry + admin UI)")
	registryPort := flag.Int("r", 0, "[DEPRECATED] Use -p instead")
	uiPort := flag.Int("g", 0, "[DEPRECATED] Use -p instead")
	useSinglePort := flag.Bool("single-port", true, "Use single port mode (default: true)")
	flag.Parse()

	// Handle legacy port flags
	if *registryPort != 0 || *uiPort != 0 {
		log.Println("WARNING: -r and -g flags are deprecated. Use -p to set the server port.")
		if *registryPort != 0 && *uiPort != 0 {
			// If both are specified, use legacy dual-port mode
			*useSinglePort = false
		} else if *registryPort != 0 {
			*port = *registryPort
		}
	}

	// Set default ports for legacy mode
	if !*useSinglePort {
		if *registryPort == 0 {
			*registryPort = defaultRegistryPort
		}
		if *uiPort == 0 {
			*uiPort = defaultUIPort
		}
	}

	// Initialize certificates
	certData, keyData, err := cert.InitCertificates()
	if err != nil {
		log.Fatalf("Failed to initialize certificates: %v", err)
	}

	if *useSinglePort {
		// Single port mode - create unified server
		log.Printf("Starting CyberDock in single-port mode on port %d", *port)

		// Create registry server (but don't start it)
		registryServer, err := registry.NewServer(certData, keyData, *port, "data")
		if err != nil {
			log.Fatalf("Failed to create registry server: %v", err)
		}

		// Create UI server (but don't start it)
		uiServer := ui.NewServer(certData, keyData, "data/cert.pem", "data/key.pem", *port, registryServer, version)

		// Initialize UI routes and start monitoring
		uiServer.InitializeRoutes()
		go uiServer.MonitorDiskUsage()

		// Create unified server with routing
		unifiedServer := createUnifiedServer(*port, registryServer, uiServer)

		log.Printf("Registry API: https://localhost:%d/v2/", *port)
		log.Printf("Admin UI: https://localhost:%d/admin/", *port)

		// Start unified server
		go func() {
			if err := unifiedServer.ListenAndServeTLS("data/cert.pem", "data/key.pem"); err != nil {
				log.Fatalf("Unified server failed: %v", err)
			}
		}()
	} else {
		// Legacy dual-port mode
		log.Printf("Starting CyberDock in legacy dual-port mode")
		log.Printf("Registry port: %d, UI port: %d", *registryPort, *uiPort)

		// Create registry server
		registryServer, err := registry.NewServer(certData, keyData, *registryPort, "data")
		if err != nil {
			log.Fatalf("Failed to create registry server: %v", err)
		}

		// Create UI server with registry instance
		uiServer := ui.NewServer(certData, keyData, "data/cert.pem", "data/key.pem", *uiPort, registryServer, version)

		// Start registry server in a goroutine
		go func() {
			if err := registryServer.Start(); err != nil {
				log.Fatalf("Registry server failed: %v", err)
			}
		}()

		// Start UI server in a goroutine
		go func() {
			if err := uiServer.Start(); err != nil {
				log.Fatalf("UI server failed: %v", err)
			}
		}()
	}

	// Start periodic telemetry checks
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				checkTelemetry()
			}
		}
	}()

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down servers...")
}

// createUnifiedServer creates a single server that routes requests to registry or UI
func createUnifiedServer(port int, registryServer *registry.Server, uiServer *ui.Server) *http.Server {
	// Create main router
	mainRouter := mux.NewRouter()

	// Get the registry router and UI router
	registryRouter := registryServer.GetRouter()
	uiRouter := uiServer.GetRouter()

	// Add CORS middleware for all routes
	mainRouter.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Set CORS headers for Docker client compatibility
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, HEAD, OPTIONS, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Range")
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})

	// Registry routes - all /v2/* paths go to registry
	mainRouter.PathPrefix("/v2/").Handler(registryRouter)

	// Admin UI routes - all /admin/* paths go to UI (without stripping prefix)
	mainRouter.PathPrefix("/admin/").Handler(uiRouter)

	// API routes - /api/* paths go to UI server without modification
	mainRouter.PathPrefix("/api/").Handler(uiRouter)

	// Static routes - /static/* paths go to UI server
	mainRouter.PathPrefix("/static/").Handler(uiRouter)

	// Redirect root to admin UI
	mainRouter.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/admin/", http.StatusMovedPermanently)
	})

	return &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      mainRouter,
		ReadTimeout:  60 * time.Second,  // Time to read request
		WriteTimeout: 60 * time.Second,  // Time to write response
		IdleTimeout:  120 * time.Second, // Time to keep connections alive
	}
}
