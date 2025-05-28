#!/bin/bash

# Docker Build and Push Script for Cloudflare DNS Manager
# Usage: ./docker-build-push.sh

set -e  # Exit on any error

# Configuration
DOCKER_USERNAME="rickicode"
IMAGE_NAME="cloudflare-dns-manager"
TAG="latest"
FULL_IMAGE_NAME="${DOCKER_USERNAME}/${IMAGE_NAME}:${TAG}"

echo "🐳 Docker Build and Push Script"
echo "================================"
echo "Image: ${FULL_IMAGE_NAME}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if user is logged in to Docker Hub
echo "🔐 Checking Docker Hub authentication..."
if ! docker info | grep -q "Username"; then
    echo "⚠️  You are not logged in to Docker Hub."
    echo "Please login first:"
    echo "docker login"
    exit 1
fi

echo "✅ Docker Hub authentication confirmed"
echo ""

# Build the Docker image
echo "🔨 Building Docker image..."
echo "Command: docker build -t ${FULL_IMAGE_NAME} ."
docker build -t ${FULL_IMAGE_NAME} .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully!"
else
    echo "❌ Docker build failed!"
    exit 1
fi

echo ""

# Tag with additional tags if needed
echo "🏷️  Tagging image..."
docker tag ${FULL_IMAGE_NAME} ${DOCKER_USERNAME}/${IMAGE_NAME}:v1.0
docker tag ${FULL_IMAGE_NAME} ${DOCKER_USERNAME}/${IMAGE_NAME}:$(date +%Y%m%d)

echo "✅ Image tagged with multiple versions"
echo ""

# Push to Docker Hub
echo "🚀 Pushing to Docker Hub..."
echo "Command: docker push ${FULL_IMAGE_NAME}"
docker push ${FULL_IMAGE_NAME}

if [ $? -eq 0 ]; then
    echo "✅ Image pushed successfully!"
else
    echo "❌ Docker push failed!"
    exit 1
fi

# Push additional tags
echo "🚀 Pushing additional tags..."
docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:v1.0
docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:$(date +%Y%m%d)

echo ""
echo "🎉 Build and push completed successfully!"
echo ""
echo "📋 Summary:"
echo "   - Image: ${FULL_IMAGE_NAME}"
echo "   - Additional tags:"
echo "     • ${DOCKER_USERNAME}/${IMAGE_NAME}:v1.0"
echo "     • ${DOCKER_USERNAME}/${IMAGE_NAME}:$(date +%Y%m%d)"
echo ""
echo "🔗 Docker Hub URL:"
echo "   https://hub.docker.com/r/${DOCKER_USERNAME}/${IMAGE_NAME}"
echo ""
echo "📥 To pull this image:"
echo "   docker pull ${FULL_IMAGE_NAME}"
echo ""
echo "🚀 To run this image:"
echo "   docker run -d -p 3000:3000 --name cloudflare-dns-manager ${FULL_IMAGE_NAME}"