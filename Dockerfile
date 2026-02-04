# Stage 1: Build frontend (React)
FROM node:18-alpine AS frontend-builder

WORKDIR /app/web

# Copy package files first for better caching
COPY web/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source code
COPY web/ ./

# Build frontend (outputs to ../internal/managementasset/management.html)
RUN npm run build

# Stage 2: Build backend (Go)
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

# Copy go module files first for better caching
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Copy frontend build artifact from frontend-builder
COPY --from=frontend-builder /app/internal/managementasset/management.html ./internal/managementasset/management.html

# Build arguments for versioning
ARG VERSION=dev
ARG COMMIT=none
ARG BUILD_DATE=unknown

# Build the binary with embedded frontend
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X 'main.Version=${VERSION}' -X 'main.Commit=${COMMIT}' -X 'main.BuildDate=${BUILD_DATE}'" -o ./one-proxy ./cmd/server/

# Stage 3: Final minimal image
FROM alpine:3.22.0

# Install timezone data
RUN apk add --no-cache tzdata

# Create application directory
RUN mkdir /one-proxy

# Copy binary from builder
COPY --from=backend-builder /app/one-proxy /one-proxy/one-proxy

# Copy example config
COPY config.example.yaml /one-proxy/config.example.yaml

WORKDIR /one-proxy

# Expose default port
EXPOSE 8317

# Set timezone
ENV TZ=Asia/Shanghai
RUN cp /usr/share/zoneinfo/${TZ} /etc/localtime && echo "${TZ}" > /etc/timezone

# Run the application
CMD ["./one-proxy"]

