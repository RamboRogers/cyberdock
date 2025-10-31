package storage

import (
	"fmt"
	"log"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	// Root directory for all registry data
	RegistryRoot = "data/registry"

	// Repository data structure
	RepositoriesDir = "repositories"
	ManifestsDir    = "manifests"
	BlobsDir        = "blobs"

	// Temporary storage
	TempDir      = "temp"
	UploadPrefix = "upload-"
)

var (
	// Allowed patterns for repository names
	// This pattern allows:
	// - Single level names (alpine)
	// - Two level names (test/alpine)
	// - Multi level names (org/team/project)
	// - Names with dots, dashes, and underscores
	repoNameRegexp = regexp.MustCompile(`^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$`)
)

// PathManager handles all path operations for the registry
type PathManager struct {
	rootDir string
}

// NewPathManager creates a new path manager instance
func NewPathManager(rootDir string) *PathManager {
	return &PathManager{
		rootDir: filepath.Join(rootDir, "registry"),
	}
}

// ValidateRepository checks if a repository name is valid
func (pm *PathManager) ValidateRepository(repository string) error {
	log.Printf("DEBUG: Validating repository name: '%s'", repository)
	if !repoNameRegexp.MatchString(repository) {
		log.Printf("DEBUG: Repository name validation failed for: '%s'", repository)
		return fmt.Errorf("invalid repository name: %s", repository)
	}
	log.Printf("DEBUG: Repository name validation passed for: '%s'", repository)
	return nil
}

// GetManifestPath returns the filesystem path for a manifest
func (pm *PathManager) GetManifestPath(repository, reference string) (string, error) {
	if err := pm.ValidateRepository(repository); err != nil {
		return "", err
	}
	return filepath.Join(pm.rootDir, RepositoriesDir, repository, ManifestsDir, reference), nil
}

// GetBlobPath returns the filesystem path for a blob
func (pm *PathManager) GetBlobPath(repository, digest string) (string, error) {
	if err := pm.ValidateRepository(repository); err != nil {
		return "", err
	}
	return filepath.Join(pm.rootDir, RepositoriesDir, repository, BlobsDir, digest), nil
}

// GetUploadPath returns the filesystem path for an upload
func (pm *PathManager) GetUploadPath(uuid string) string {
	return filepath.Join(pm.rootDir, TempDir, "uploads", uuid)
}

// GetRepositoryManifestsDir returns the manifests directory for a repository
func (pm *PathManager) GetRepositoryManifestsDir(repository string) (string, error) {
	if err := pm.ValidateRepository(repository); err != nil {
		return "", err
	}
	return filepath.Join(pm.rootDir, RepositoriesDir, repository, ManifestsDir), nil
}

// GetRepositoryBlobsDir returns the blobs directory for a repository
func (pm *PathManager) GetRepositoryBlobsDir(repository string) (string, error) {
	if err := pm.ValidateRepository(repository); err != nil {
		return "", err
	}
	return filepath.Join(pm.rootDir, RepositoriesDir, repository, BlobsDir), nil
}

// GetAPIPath returns the API path for a repository resource
func (pm *PathManager) GetAPIPath(repository, resource string) (string, error) {
	if err := pm.ValidateRepository(repository); err != nil {
		return "", err
	}
	return path.Join("/v2", repository, resource), nil
}

// EnsureDirectories creates all necessary directories for a repository
func (pm *PathManager) EnsureDirectories(repository string) error {
	// For initial setup, create base directories without repository validation
	if repository == "" {
		baseDirs := []string{
			filepath.Join(pm.rootDir, RepositoriesDir),
			filepath.Join(pm.rootDir, TempDir, "uploads"),
		}
		for _, dir := range baseDirs {
			if err := os.MkdirAll(dir, 0755); err != nil {
				return fmt.Errorf("failed to create directory %s: %v", dir, err)
			}
		}
		return nil
	}

	// For specific repository setup, validate and create repository directories
	if err := pm.ValidateRepository(repository); err != nil {
		return err
	}

	dirs := []string{
		filepath.Join(pm.rootDir, RepositoriesDir, repository, ManifestsDir),
		filepath.Join(pm.rootDir, RepositoriesDir, repository, BlobsDir),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %v", dir, err)
		}
	}

	return nil
}

// SplitRepository splits a repository path into namespace and name
func (pm *PathManager) SplitRepository(repository string) (namespace, name string) {
	parts := strings.Split(repository, "/")
	if len(parts) == 1 {
		return "library", parts[0]
	}
	return strings.Join(parts[:len(parts)-1], "/"), parts[len(parts)-1]
}

// JoinRepository joins namespace and name into a repository path
func (pm *PathManager) JoinRepository(namespace, name string) string {
	if namespace == "library" {
		return name
	}
	return path.Join(namespace, name)
}

// GetRootDir returns the root directory path for the registry
func (pm *PathManager) GetRootDir() string {
	return pm.rootDir
}
