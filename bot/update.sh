#!/bin/bash

# Stop the existing container
docker-compose down

# Pull the latest image from GitHub Container Registry
docker pull ghcr.io/$GITHUB_REPOSITORY:latest

# Start the container with the new image
docker-compose up -d
