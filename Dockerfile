# Multi-stage build for smaller final image
FROM golang:1.24-alpine AS builder

# Set working directory
WORKDIR /app

# Install git (needed for go mod download)
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o cloudflareDNSManager main.go

# Final stage - minimal runtime image
FROM alpine:latest

# Install ca-certificates for HTTPS requests to Cloudflare API
RUN apk --no-cache add ca-certificates tzdata

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /home/appuser

# Copy the binary from builder stage
COPY --from=builder /app/cloudflareDNSManager .

# Copy static files and templates (they are embedded in the binary, but good practice)
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static

# Change ownership to non-root user
RUN chown -R appuser:appgroup /home/appuser

# Switch to non-root user
USER appuser

# Expose port 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run the application
CMD ["./cloudflareDNSManager"]