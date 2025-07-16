#!/bin/bash
# fast-build.sh - Quick single platform build

echo "🚀 Building Heimdall Full System (Single Platform - Fast)"

# Build for current platform only (much faster)
docker buildx build \
  --platform linux/amd64 \
  --tag heimdall-full:local \
  --load \
  .

echo "✅ Build complete! Image: heimdall-full:local"
echo "🔧 To run: docker run -p 3000:3000 -p 3001:3001 heimdall-full:local"
