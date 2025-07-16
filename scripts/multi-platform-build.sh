#!/bin/bash
# multi-platform-build.sh - Optimized multi-platform build

echo "🏗️ Building Heimdall Full System (Multi-Platform - Optimized)"

# Ensure buildx is set up with advanced driver
docker buildx create --name multiplatform --driver docker-container --use 2>/dev/null || docker buildx use multiplatform

# Build both platforms in parallel with optimizations
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag heimdall-full:latest \
  --cache-from type=local,src=.docker-cache \
  --cache-to type=local,dest=.docker-cache,mode=max \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --progress=plain \
  --push=false \
  --output type=docker \
  .

echo "✅ Multi-platform build complete!"
echo "📦 Images built for: linux/amd64, linux/arm64"
