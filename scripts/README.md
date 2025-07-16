# Heimdall Local Build & Push Scripts

This directory contains scripts to build and push the Heimdall full system locally to GitHub Container Registry.

## 🚀 Quick Start

### For Windows (PowerShell)

```powershell
# Quick development build (current platform only - fastest)
.\scripts\local-build-push.ps1 -Fast -Tag "dev-test"

# Full multi-platform build and push
.\scripts\local-build-push.ps1 -Tag "v1.0.0"
```

### For Linux/macOS (Bash)

```bash
# Quick development build (current platform only - fastest)
./scripts/local-build-push.sh --fast --tag dev-test

# Full multi-platform build and push
./scripts/local-build-push.sh --tag v1.0.0
```

## 📋 Prerequisites

1. **Docker**: Installed and running
2. **Docker Buildx**: For multi-platform builds
3. **GitHub Container Registry Login**:
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
   # OR
   docker login ghcr.io
   ```

## ⚡ Speed Optimization Options

### Fastest (Recommended for Development)

```bash
# Build only for your current platform
./scripts/local-build-push.sh --fast --tag testing
```

### Platform-Specific Builds

```bash
# AMD64 only (most common)
./scripts/local-build-push.sh --platform linux/amd64 --tag amd64-only

# ARM64 only (Apple Silicon, ARM servers)
./scripts/local-build-push.sh --platform linux/arm64 --tag arm64-only
```

### Multi-Platform (Slower but Complete)

```bash
# Build for both AMD64 and ARM64
./scripts/local-build-push.sh --platform linux/amd64,linux/arm64 --tag multi-platform
```

## 🛠️ Common Use Cases

### Development Workflow

```bash
# Fast iteration during development
./scripts/local-build-push.sh --fast --tag dev-$(date +%s)

# Test on different platform
./scripts/local-build-push.sh --platform linux/arm64 --tag arm-test
```

### Release Workflow

```bash
# Clean build for release
./scripts/local-build-push.sh --no-cache --tag v1.2.3

# Multi-platform release
./scripts/local-build-push.sh --no-cache --tag latest
```

### Debugging

```bash
# See what would happen without executing
./scripts/local-build-push.sh --dry-run --tag debug-test

# Push existing image without rebuilding
./scripts/local-build-push.sh --push-only --tag existing-image
```

## 📦 Image Information

- **Registry**: `ghcr.io`
- **Repository**: `lerndmina/heimdall-full`
- **Full Image**: `ghcr.io/lerndmina/heimdall-full:your-tag`

## 🎯 Performance Tips

1. **Use `--fast` for development**: Builds only for your current platform
2. **Cache optimization**: Don't use `--no-cache` unless necessary
3. **Platform-specific**: Build for specific platforms when you know your target
4. **Parallel builds**: The scripts automatically use BuildKit for faster builds
5. **Environment Variables**: The new image builds the dashboard at runtime, respecting Docker environment variables

## 🔧 Environment Variables

The Heimdall full system now properly respects Docker environment variables at runtime. See `ENVIRONMENT_VARIABLES.md` for complete documentation.

**Quick Example:**

```bash
docker run -d \
  --name heimdall-full \
  -p 3000:3000 -p 3001:3001 \
  -e NEXTAUTH_SECRET="your-secret" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  -e BOT_API_URL="http://localhost:3001" \
  ghcr.io/lerndmina/heimdall-full:your-tag
```

## 📊 Build Time Estimates

| Build Type               | Platforms      | Estimated Time |
| ------------------------ | -------------- | -------------- |
| Fast (--fast)            | Current only   | 2-5 minutes    |
| Single platform          | linux/amd64    | 3-7 minutes    |
| Multi-platform           | amd64,arm64    | 8-15 minutes   |
| Clean build (--no-cache) | Multi-platform | 15-25 minutes  |

_Times vary based on system specs and network speed_

## 🔍 Troubleshooting

### ARM64 Build Issues

If ARM64 builds are slow or fail:

```bash
# Build only AMD64 first
./scripts/local-build-push.sh --platform linux/amd64 --tag amd64-test

# Then try ARM64 separately
./scripts/local-build-push.sh --platform linux/arm64 --tag arm64-test
```

### Login Issues

```bash
# Check if logged in
docker system info | grep -i registry

# Login with token
echo $GITHUB_TOKEN | docker login ghcr.io -u your-username --password-stdin

# Login interactively
docker login ghcr.io
```

### Build Cache Issues

```bash
# Clear build cache
docker buildx prune

# Clean build
./scripts/local-build-push.sh --no-cache --tag clean
```
