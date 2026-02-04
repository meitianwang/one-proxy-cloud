.PHONY: all build build-frontend build-backend clean dev docker help

# Default target
all: build

# Display help information
help:
	@echo "CLIProxyAPI Build System"
	@echo ""
	@echo "Usage:"
	@echo "  make build           Build frontend and backend"
	@echo "  make build-frontend  Build frontend only"
	@echo "  make build-backend   Build backend only"
	@echo "  make dev             Start development mode"
	@echo "  make clean           Clean build artifacts"
	@echo "  make docker          Build Docker image"
	@echo ""

# Full build: frontend + backend
build: build-frontend build-backend
	@echo "Build complete! Binary located at: bin/cli-proxy-api"

# Build frontend (React)
build-frontend:
	@echo "Building frontend..."
	cd web && npm ci && npm run build
	@echo "Frontend build complete!"

# Build backend (Go)
build-backend:
	@echo "Building backend..."
	@mkdir -p bin
	go build -o bin/cli-proxy-api ./cmd/server/
	@echo "Backend build complete!"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf bin/
	rm -rf web/node_modules
	rm -rf web/dist
	rm -f internal/managementasset/management.html
	@echo "Clean complete!"

# Development mode: run frontend dev server and backend
dev:
	@echo "Starting development mode..."
	@echo "Frontend: http://localhost:5173"
	@echo "Backend:  http://localhost:8317"
	cd web && npm run dev &
	go run ./cmd/server/ run

# Development mode: frontend only
dev-frontend:
	cd web && npm run dev

# Development mode: backend only (requires frontend to be built first)
dev-backend:
	go run ./cmd/server/ run

# Build Docker image
docker:
	docker build -t cli-proxy-api .

# Run tests
test:
	go test ./...

# Format code
fmt:
	go fmt ./...
	cd web && npm run format

# Lint code
lint:
	cd web && npm run lint
