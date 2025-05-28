# 🐳 Docker Deployment Guide

This guide explains how to run the Cloudflare DNS Manager using Docker and Docker Compose.

## 📋 Prerequisites

- **Docker** installed (version 20.10+)
- **Docker Compose** installed (version 2.0+)
- **Git** to clone the repository

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/cloudflare-dns-manager.git
cd cloudflare-dns-manager
```

### 2. Build and Run with Docker Compose
```bash
# Build and start the application
docker-compose up -d

# Check if the container is running
docker-compose ps

# View logs
docker-compose logs -f cloudflare-dns-manager
```

### 3. Access the Application
Open your browser and go to:
```
http://localhost:3000
```

## 🔧 Docker Commands

### Using Docker Compose (Recommended)

```bash
# Build and start services
docker-compose up -d

# Stop services
docker-compose down

# Restart services
docker-compose restart

# View logs
docker-compose logs -f

# Build only (without starting)
docker-compose build

# Pull latest images
docker-compose pull

# Remove all containers and networks
docker-compose down --volumes --remove-orphans
```

### Using Docker Directly

```bash
# Build the image
docker build -t cloudflare-dns-manager .

# Run the container
docker run -d \
  --name cloudflare-dns-manager \
  -p 3000:3000 \
  --restart unless-stopped \
  cloudflare-dns-manager

# Stop the container
docker stop cloudflare-dns-manager

# Remove the container
docker rm cloudflare-dns-manager

# View logs
docker logs -f cloudflare-dns-manager
```

## ⚙️ Configuration Options

### Environment Variables

You can customize the application using environment variables in [`docker-compose.yml`](docker-compose.yml):

```yaml
environment:
  - TZ=Asia/Bangkok          # Set timezone
  - GIN_MODE=release         # Run in production mode
  - PORT=3000               # Application port (optional)
```

### Resource Limits

The docker-compose file includes resource limits:
- **Memory**: 256MB limit, 128MB reservation
- **CPU**: 0.5 cores limit, 0.25 cores reservation

Adjust these in [`docker-compose.yml`](docker-compose.yml) based on your needs.

### Custom Port

To run on a different port, modify the ports mapping in [`docker-compose.yml`](docker-compose.yml):

```yaml
ports:
  - "8080:3000"  # Access via http://localhost:8080
```

## 🔒 Security Considerations

### Non-Root User
The container runs as a non-root user (`appuser`) for security.

### Health Checks
Both Dockerfile and docker-compose include health checks to monitor application status.

### Security Options
```yaml
security_opt:
  - no-new-privileges:true
```

## 📊 Monitoring

### Health Check
Check application health:
```bash
# Using docker-compose
docker-compose ps

# Using docker directly
docker inspect --format='{{.State.Health.Status}}' cloudflare-dns-manager
```

### Resource Usage
Monitor resource consumption:
```bash
# Real-time stats
docker stats cloudflare-dns-manager

# Memory usage
docker exec cloudflare-dns-manager cat /proc/meminfo
```

## 🗄️ Data Persistence

The application stores credentials in browser localStorage, so no persistent volumes are needed by default.

If you want to add persistent storage for logs or future features:

```yaml
volumes:
  - ./data:/home/appuser/data
  - ./logs:/home/appuser/logs
```

## 🌐 Reverse Proxy Setup

For production deployments, consider using a reverse proxy. Uncomment the nginx service in [`docker-compose.yml`](docker-compose.yml):

### Nginx Configuration Example
Create `nginx.conf`:
```nginx
events {
    worker_connections 1024;
}

http {
    upstream app {
        server cloudflare-dns-manager:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;

        location / {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

## 🐛 Troubleshooting

### Container Won't Start
```bash
# Check logs for errors
docker-compose logs cloudflare-dns-manager

# Check if port is available
netstat -tulpn | grep 3000
```

### Application Not Accessible
```bash
# Verify container is running
docker-compose ps

# Check port mapping
docker port cloudflare-dns-manager

# Test internal connectivity
docker exec cloudflare-dns-manager wget -O- http://localhost:3000
```

### Build Issues
```bash
# Clean build (no cache)
docker-compose build --no-cache

# Check Dockerfile syntax
docker build --dry-run .
```

### Performance Issues
```bash
# Check resource usage
docker stats

# Increase resource limits in docker-compose.yml
# Monitor application logs for errors
```

## 🔄 Updates

### Updating the Application
```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Updating Base Images
```bash
# Pull latest base images
docker-compose pull

# Rebuild with latest Go version
docker-compose build --pull
```

## 📝 Best Practices

1. **Use docker-compose** for easier management
2. **Set resource limits** to prevent resource exhaustion
3. **Enable health checks** for monitoring
4. **Run as non-root** for security
5. **Use .dockerignore** to optimize build context
6. **Monitor logs** regularly for issues
7. **Backup configuration** before making changes

## 🔗 Related Files

- [`Dockerfile`](Dockerfile) - Container build instructions
- [`docker-compose.yml`](docker-compose.yml) - Multi-container setup
- [`.dockerignore`](.dockerignore) - Build context exclusions
- [`README.md`](README.md) - Main application documentation

---

**Happy containerizing! 🐳**