#!/bin/bash
VERSION="0.3.3d"
rm -rf bins/*
mkdir -p bins

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    exit 1
fi

# Source the .env file
source .env

# Common ldflags for all builds
LDFLAGS="-X main.telemetryToken=${CYBERDOCK_TELEMETRY_TOKEN} -X main.telemetryURL=${CYBERDOCK_TELEMETRY_URL}"

# Build for current platform
echo "Building for $(go env GOOS)/$(go env GOARCH)..."
go build -ldflags="${LDFLAGS}" -o bins/cyberdock-$(go env GOOS)-$(go env GOARCH) cmd/cyberdock/main.go

# Build for Alpine Linux (static build)
echo "Building for Alpine Linux (static)..."
GOOS=linux GOARCH=amd64 CGO_ENABLED=1 CC=x86_64-linux-musl-gcc \
  go build -ldflags="${LDFLAGS} -linkmode external -extldflags '-static'" \
  -o bins/cyberdock-linux-alpine-amd64-static cmd/cyberdock/main.go

# Build for Alpine Linux ARM64 (static build)
echo "Building for Alpine Linux ARM64 (static)..."
GOOS=linux GOARCH=arm64 CGO_ENABLED=1 CC=aarch64-linux-musl-gcc \
  go build -ldflags="${LDFLAGS} -linkmode external -extldflags '-static'" \
  -o bins/cyberdock-linux-alpine-arm64-static cmd/cyberdock/main.go

# Build for Linux ARM64
echo "Building for linux/arm64..."
GOOS=linux GOARCH=arm64 CGO_ENABLED=1 CC=aarch64-linux-musl-gcc \
  go build -ldflags="${LDFLAGS}" \
  -o bins/cyberdock-linux-arm64 cmd/cyberdock/main.go

# Generate combined checksums file
echo "Generating combined SHA256SUMS file..."
cd bins
shasum -a 256 cyberdock-* | grep -v '\.sha256' > SHA256SUMS
cd -

echo "Build complete!"

read -p "Push to Docker Hub? (y/n): " push
if [ "$push" = "y" ]; then
  # Building Docker Image
  echo "Building for Linux platform..."
  docker buildx build \
    --push \
    --platform linux/amd64,linux/arm64 \
    -t mattrogers/cyberdock:latest \
    -t mattrogers/cyberdock:${VERSION} \
    -f Dockerfile.multi .
fi

read -p "Push to Gitea? (y/n): " push
if [ "$push" = "y" ]; then
  # Building Docker Image
  echo "Building for Linux platform..."
  docker buildx build \
    --push \
    --platform linux/amd64,linux/arm64 \
    -t cyberpam:5000/matt/cyberdock:latest \
    -t cyberpam:5000/matt/cyberdock:${VERSION} \
    -f Dockerfile.multi .
fi