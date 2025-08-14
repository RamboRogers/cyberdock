package ui

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

// CertificateInfo contains information about the current certificate
type CertificateInfo struct {
	Subject    string    `json:"subject"`
	Issuer     string    `json:"issuer"`
	ValidFrom  time.Time `json:"validFrom"`
	ValidUntil time.Time `json:"validUntil"`
	DNSNames   []string  `json:"dnsNames"`
	IPAddresses []string `json:"ipAddresses"`
	IsCustom   bool      `json:"isCustom"`
}

// getCertificateInfo retrieves information about the current certificate
func (s *Server) getCertificateInfo() (*CertificateInfo, error) {
	// Check for custom certificate first
	customCertPath := filepath.Join(filepath.Dir(s.certFile), "custom_cert.pem")
	certPath := s.certFile
	isCustom := false
	
	if _, err := os.Stat(customCertPath); err == nil {
		certPath = customCertPath
		isCustom = true
	}
	
	// Read certificate file
	certPEM, err := ioutil.ReadFile(certPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read certificate: %v", err)
	}
	
	// Parse certificate
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, fmt.Errorf("failed to parse certificate PEM")
	}
	
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse certificate: %v", err)
	}
	
	// Convert IP addresses to strings
	ipAddresses := make([]string, len(cert.IPAddresses))
	for i, ip := range cert.IPAddresses {
		ipAddresses[i] = ip.String()
	}
	
	return &CertificateInfo{
		Subject:     cert.Subject.String(),
		Issuer:      cert.Issuer.String(),
		ValidFrom:   cert.NotBefore,
		ValidUntil:  cert.NotAfter,
		DNSNames:    cert.DNSNames,
		IPAddresses: ipAddresses,
		IsCustom:    isCustom,
	}, nil
}

// validateCertificateAndKey validates that the certificate and key match
func validateCertificateAndKey(certPEM, keyPEM []byte) error {
	// Parse certificate
	certBlock, _ := pem.Decode(certPEM)
	if certBlock == nil {
		return fmt.Errorf("failed to parse certificate PEM")
	}
	
	cert, err := x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse certificate: %v", err)
	}
	
	// Parse private key
	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		return fmt.Errorf("failed to parse key PEM")
	}
	
	// Try to load as TLS certificate to validate they match
	_, err = tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return fmt.Errorf("certificate and key do not match: %v", err)
	}
	
	// Check certificate validity
	now := time.Now()
	if now.Before(cert.NotBefore) {
		return fmt.Errorf("certificate is not yet valid")
	}
	if now.After(cert.NotAfter) {
		return fmt.Errorf("certificate has expired")
	}
	
	return nil
}

// generateNewCertificates generates new self-signed certificates with improved defaults
func generateNewCertificates() ([]byte, []byte, error) {
	// Generate private key
	privateKey, err := rsa.GenerateKey(rand.Reader, 4096) // Increased key size
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
			Province:      []string{""},
			Locality:      []string{""},
			StreetAddress: []string{""},
			PostalCode:    []string{""},
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
		},
	}
	
	// Add Subject Alternative Names
	template.Subject.CommonName = hostname
	
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
	
	return certBuf, keyBuf, nil
}