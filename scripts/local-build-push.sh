#!/bin/bash

# Heimdall Full System - Local Build and Push to GitHub Container Registry
# Usage: ./scripts/local-build-push.sh [OPTIONS]
# 
# Options:
#   --platform <platform>   Build for specific platform (default: linux/amd64,linux/arm64)
#   --tag <tag>            Custom tag (default: local-$(date +%Y%m%d-%H%M%S))
#   --no-cache             Build without cache
#   --push-only            Skip build, only push existing image
#   --dry-run              Show what would be done without executing
#   --fast                 Build only for current platform (much faster)
#   --help                 Show this help message

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default configuration
REGISTRY="ghcr.io"
REPO="lerndmina/heimdall-full"
PLATFORMS="linux/amd64,linux/arm64"
DEFAULT_TAG="local-$(date +%Y%m%d-%H%M%S)"
TAG=""
NO_CACHE=""
PUSH_ONLY=false
DRY_RUN=false
FAST_BUILD=false

# Functions
print_header() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                   Heimdall Local Build & Push                   ║"
    echo "║                GitHub Container Registry (ghcr.io)              ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    cat << EOF
Heimdall Full System - Local Build and Push Script

USAGE:
    ./scripts/local-build-push.sh [OPTIONS]

OPTIONS:
    --platform <platforms>  Build for specific platforms (default: linux/amd64,linux/arm64)
                           Examples: 
                             --platform linux/amd64
                             --platform linux/arm64
                             --platform linux/amd64,linux/arm64
    
    --tag <tag>            Custom tag (default: local-YYYYMMDD-HHMMSS)
                           Examples:
                             --tag latest
                             --tag v1.0.0
                             --tag nightly
                             --tag feature-auth
    
    --no-cache             Build without Docker cache (clean build)
    --push-only            Skip build, only push existing local image
    --dry-run              Show commands that would be executed without running them
    --fast                 Build only for current platform (much faster for testing)
    --help                 Show this help message

EXAMPLES:
    # Quick local build and push (current platform only)
    ./scripts/local-build-push.sh --fast --tag testing

    # Full multi-platform build
    ./scripts/local-build-push.sh --tag v1.2.3

    # Build only for ARM64
    ./scripts/local-build-push.sh --platform linux/arm64 --tag arm64-test

    # Clean build without cache
    ./scripts/local-build-push.sh --no-cache --tag clean-build

    # See what would be done without executing
    ./scripts/local-build-push.sh --dry-run --tag test

NOTES:
    - You must be logged in to GitHub Container Registry (docker login ghcr.io)
    - Multi-platform builds require Docker Buildx
    - Use --fast for development/testing (builds much faster)
    - ARM64 builds may be slower due to emulation on x86 systems

EOF
}

check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! docker --version >/dev/null 2>&1; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if Docker Buildx is available (for multi-platform builds)
    if [[ "$PLATFORMS" == *","* ]] && ! docker buildx version >/dev/null 2>&1; then
        print_error "Docker Buildx is required for multi-platform builds"
        print_status "Install with: docker buildx install"
        exit 1
    fi
    
    # Check if logged in to GitHub Container Registry
    if ! docker info 2>/dev/null | grep -q "ghcr.io" && ! $DRY_RUN; then
        print_warning "You may not be logged in to GitHub Container Registry"
        print_status "Login with: echo \$GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin"
        print_status "Or: docker login ghcr.io"
        echo
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    print_success "Prerequisites check passed"
}

detect_platform() {
    local arch=$(uname -m)
    case $arch in
        x86_64)
            echo "linux/amd64"
            ;;
        aarch64|arm64)
            echo "linux/arm64"
            ;;
        *)
            echo "linux/amd64"  # fallback
            ;;
    esac
}

setup_buildx() {
    if [[ "$PLATFORMS" == *","* ]]; then
        print_status "Setting up Docker Buildx for multi-platform build..."
        
        if $DRY_RUN; then
            echo "DRY RUN: docker buildx create --use --name heimdall-builder --platform $PLATFORMS"
        else
            # Create or use existing buildx builder
            if ! docker buildx inspect heimdall-builder >/dev/null 2>&1; then
                docker buildx create --use --name heimdall-builder --platform "$PLATFORMS"
            else
                docker buildx use heimdall-builder
            fi
        fi
        
        print_success "Buildx setup complete"
    fi
}

build_image() {
    local full_image="$REGISTRY/$REPO:$TAG"
    
    print_status "Building Docker image..."
    print_status "Image: $full_image"
    print_status "Platforms: $PLATFORMS"
    
    # Build command construction
    local build_cmd="docker"
    local build_args=""
    
    if [[ "$PLATFORMS" == *","* ]]; then
        build_cmd="docker buildx build"
        build_args="--platform $PLATFORMS --push"
    else
        build_cmd="docker build"
        build_args=""
    fi
    
    # Add cache options
    if [[ -n "$NO_CACHE" ]]; then
        build_args="$build_args --no-cache"
    fi
    
    # Add tags
    build_args="$build_args -t $full_image"
    
    # Add context
    build_args="$build_args ."
    
    local full_command="$build_cmd $build_args"
    
    if $DRY_RUN; then
        echo "DRY RUN: $full_command"
        return 0
    fi
    
    print_status "Executing: $full_command"
    echo
    
    # Execute build
    if eval "$full_command"; then
        print_success "Build completed successfully"
    else
        print_error "Build failed"
        exit 1
    fi
}

push_image() {
    if [[ "$PLATFORMS" == *","* ]]; then
        print_status "Multi-platform build automatically pushes to registry"
        return 0
    fi
    
    local full_image="$REGISTRY/$REPO:$TAG"
    
    print_status "Pushing image to GitHub Container Registry..."
    print_status "Image: $full_image"
    
    if $DRY_RUN; then
        echo "DRY RUN: docker push $full_image"
        return 0
    fi
    
    if docker push "$full_image"; then
        print_success "Push completed successfully"
    else
        print_error "Push failed"
        exit 1
    fi
}

show_summary() {
    local full_image="$REGISTRY/$REPO:$TAG"
    
    echo
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                          Build Summary                           ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo -e "${CYAN}Image:${NC}     $full_image"
    echo -e "${CYAN}Platforms:${NC} $PLATFORMS"
    echo -e "${CYAN}Registry:${NC}  $REGISTRY"
    echo
    echo -e "${YELLOW}Pull Command:${NC}"
    echo "  docker pull $full_image"
    echo
    echo -e "${YELLOW}Run Command:${NC}"
    echo "  docker run -d \\"
    echo "    --name heimdall-full \\"
    echo "    -p 3000:3000 \\"
    echo "    -p 3001:3001 \\"
    echo "    -e NODE_ENV=production \\"
    echo "    -e DATABASE_URL=\"your-database-url\" \\"
    echo "    -e NEXTAUTH_SECRET=\"your-nextauth-secret\" \\"
    echo "    -e NEXTAUTH_URL=\"your-dashboard-url\" \\"
    echo "    -e BOT_API_URL=\"your-bot-api-url\" \\"
    echo "    $full_image"
    echo
    echo -e "${YELLOW}GitHub Container Registry:${NC}"
    echo "  https://github.com/lerndmina/Heimdall/pkgs/container/heimdall-full"
    echo
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --platform)
            PLATFORMS="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --push-only)
            PUSH_ONLY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --fast)
            FAST_BUILD=true
            PLATFORMS=$(detect_platform)
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Set default tag if not provided
if [[ -z "$TAG" ]]; then
    TAG="$DEFAULT_TAG"
fi

# Main execution
main() {
    print_header
    
    if $DRY_RUN; then
        print_warning "DRY RUN MODE - No commands will be executed"
        echo
    fi
    
    if $FAST_BUILD; then
        print_status "Fast build mode enabled - building for current platform only"
    fi
    
    check_prerequisites
    
    if ! $PUSH_ONLY; then
        setup_buildx
        build_image
    fi
    
    if [[ "$PLATFORMS" != *","* ]]; then
        push_image
    fi
    
    if ! $DRY_RUN; then
        show_summary
    fi
    
    print_success "All operations completed successfully!"
}

# Run main function
main
