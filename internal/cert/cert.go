package cert

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"net"
	"os"
	"time"
)

const (
	CertFile = "cert.pem"
	KeyFile  = "key.pem"
)

// InitCertificates ensures valid certificates exist or generates new ones
func InitCertificates() (cert, key []byte, err error) {
	// Check for custom certificates first
	customCertFile := "custom_cert.pem"
	customKeyFile := "custom_key.pem"
	
	if cert, key, err = loadCertificatesFromFiles(customCertFile, customKeyFile); err == nil {
		log.Println("Using custom SSL/TLS certificates")
		return cert, key, nil
	}
	
	// Check if default certificates already exist
	if cert, key, err = loadCertificates(); err == nil {
		return cert, key, nil
	}

	// Generate new certificates
	log.Println("Generating new self-signed certificates")
	return generateCertificates()
}

func loadCertificates() ([]byte, []byte, error) {
	return loadCertificatesFromFiles(CertFile, KeyFile)
}

func loadCertificatesFromFiles(certFile, keyFile string) ([]byte, []byte, error) {
	cert, err := os.ReadFile(certFile)
	if err != nil {
		return nil, nil, err
	}

	key, err := os.ReadFile(keyFile)
	if err != nil {
		return nil, nil, err
	}

	return cert, key, nil
}

func generateCertificates() ([]byte, []byte, error) {
	// Generate private key with increased size for better security
	privateKey, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return nil, nil, err
	}

	// Get system hostname
	hostname, err := os.Hostname()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get hostname: %v", err)
	}

	// Get local IP addresses
	var ipAddresses []net.IP
	ipAddresses = append(ipAddresses, net.ParseIP("127.0.0.1"))
	ipAddresses = append(ipAddresses, net.ParseIP("::1"))
	
	// Get all network interfaces
	addrs, err := net.InterfaceAddrs()
	if err == nil {
		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
				if ipnet.IP.To4() != nil || ipnet.IP.To16() != nil {
					ipAddresses = append(ipAddresses, ipnet.IP)
				}
			}
		}
	}

	// Create certificate template with improved settings
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization:  []string{"CyberDock"},
			Country:       []string{"US"},
			CommonName:    hostname,
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().AddDate(5, 0, 0), // Valid for 5 years
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
		IPAddresses:           ipAddresses,
		DNSNames: []string{
			"localhost",
			hostname,
			"*.localhost",
			"*.local",
			"docker.local",
			"registry.local",
			"cyberdock.local",
			"*.docker.local",
			"*.registry.local",
		},
	}

	// Create certificate
	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &privateKey.PublicKey, privateKey)
	if err != nil {
		return nil, nil, err
	}

	// Encode certificate
	certBuf := pem.EncodeToMemory(&pem.Block{
		Type:  "CERTIFICATE",
		Bytes: derBytes,
	})

	// Encode private key
	keyBuf := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	})

	// Save to files
	if err := os.WriteFile(CertFile, certBuf, 0644); err != nil {
		return nil, nil, err
	}
	if err := os.WriteFile(KeyFile, keyBuf, 0600); err != nil {
		return nil, nil, err
	}

	return certBuf, keyBuf, nil
}
