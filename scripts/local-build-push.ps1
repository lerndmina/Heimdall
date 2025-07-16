# Heimdall Full System - Local Build and Push to GitHub Container Registry
# PowerShell Version
# Usage: .\scripts\local-build-push.ps1 [OPTIONS]

param(
  [string]$Platform = "linux/amd64,linux/arm64",
  [string]$Tag = "",
  [switch]$NoCache,
  [switch]$PushOnly,
  [switch]$DryRun,
  [switch]$Fast,
  [switch]$Help
)

# Default configuration
$Registry = "ghcr.io"
$Repo = "lerndmina/heimdall-full"
$DefaultTag = "local-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

function Write-Header {
  Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
  Write-Host "║                   Heimdall Local Build & Push                   ║" -ForegroundColor Cyan
  Write-Host "║                GitHub Container Registry (ghcr.io)              ║" -ForegroundColor Cyan
  Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
  Write-Host ""
}

function Write-Status {
  param([string]$Message)
  Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
  param([string]$Message)
  Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
  param([string]$Message)
  Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
  param([string]$Message)
  Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Show-Help {
  $helpText = @"
Heimdall Full System - Local Build and Push Script (PowerShell)

USAGE:
    .\scripts\local-build-push.ps1 [OPTIONS]

OPTIONS:
    -Platform [platforms]   Build for specific platforms (default: linux/amd64,linux/arm64)
                           Examples: 
                             -Platform "linux/amd64"
                             -Platform "linux/arm64"
                             -Platform "linux/amd64,linux/arm64"
    
    -Tag [tag]             Custom tag (default: local-YYYYMMDD-HHMMSS)
                           Examples:
                             -Tag "latest"
                             -Tag "v1.0.0"
                             -Tag "nightly"
    
    -NoCache               Build without Docker cache (clean build)
    -PushOnly              Skip build, only push existing local image
    -DryRun                Show commands that would be executed without running them
    -Fast                  Build only for current platform (much faster for testing)
    -Help                  Show this help message

EXAMPLES:
    # Quick local build and push (current platform only)
    .\scripts\local-build-push.ps1 -Fast -Tag "testing"

    # Full multi-platform build
    .\scripts\local-build-push.ps1 -Tag "v1.2.3"

    # Build only for ARM64
    .\scripts\local-build-push.ps1 -Platform "linux/arm64" -Tag "arm64-test"

    # Clean build without cache
    .\scripts\local-build-push.ps1 -NoCache -Tag "clean-build"

    # See what would be done without executing
    .\scripts\local-build-push.ps1 -DryRun -Tag "test"

NOTES:
    * You must be logged in to GitHub Container Registry (docker login ghcr.io)
    * Multi-platform builds require Docker Buildx
    * Use -Fast for development/testing (builds much faster)
    * ARM64 builds may be slower due to emulation on x86 systems
"@
  Write-Host $helpText
}

function Test-Prerequisites {
  Write-Status "Checking prerequisites..."
    
  # Check if Docker is installed and running
  try {
    $null = docker --version
  }
  catch {
    Write-Error "Docker is not installed or not in PATH"
    exit 1
  }
    
  try {
    $null = docker info 2>$null
  }
  catch {
    Write-Error "Docker daemon is not running"
    exit 1
  }
    
  # Check if Docker Buildx is available (for multi-platform builds)
  if ($Platform -contains "," -and -not $DryRun) {
    try {
      $null = docker buildx version 2>$null
    }
    catch {
      Write-Error "Docker Buildx is required for multi-platform builds"
      Write-Status "Install with: docker buildx install"
      exit 1
    }
  }
    
  Write-Success "Prerequisites check passed"
}

function Get-CurrentPlatform {
  $arch = $env:PROCESSOR_ARCHITECTURE
  switch ($arch) {
    "AMD64" { return "linux/amd64" }
    "ARM64" { return "linux/arm64" }
    default { return "linux/amd64" }
  }
}

function Initialize-Buildx {
  if ($Platform -contains ",") {
    Write-Status "Setting up Docker Buildx for multi-platform build..."
        
    if ($DryRun) {
      Write-Host "DRY RUN: docker buildx create --use --name heimdall-builder --platform $Platform"
    }
    else {
      try {
        docker buildx inspect heimdall-builder 2>$null | Out-Null
        docker buildx use heimdall-builder
      }
      catch {
        docker buildx create --use --name heimdall-builder --platform $Platform
      }
    }
        
    Write-Success "Buildx setup complete"
  }
}

function Build-Image {
  $FullImage = "$Registry/$Repo`:$Tag"
    
  Write-Status "Building Docker image..."
  Write-Status "Image: $FullImage"
  Write-Status "Platforms: $Platform"
    
  # Build command construction
  $BuildArgs = @()
    
  if ($Platform -contains ",") {
    $BuildCmd = "docker buildx build"
    $BuildArgs += "--platform", $Platform, "--push"
  }
  else {
    $BuildCmd = "docker build"
  }
    
  # Add cache options
  if ($NoCache) {
    $BuildArgs += "--no-cache"
  }
    
  # Add tags and context
  $BuildArgs += "-t", $FullImage, "."
    
  $FullCommand = "$BuildCmd $($BuildArgs -join ' ')"
    
  if ($DryRun) {
    Write-Host "DRY RUN: $FullCommand"
    return
  }
    
  Write-Status "Executing: $FullCommand"
  Write-Host ""
    
  # Execute build
  $BuildArgs = $BuildArgs | Where-Object { $_ -ne "" }
    
  if ($Platform -contains ",") {
    & docker buildx build @BuildArgs
  }
  else {
    & docker build @BuildArgs
  }
    
  if ($LASTEXITCODE -eq 0) {
    Write-Success "Build completed successfully"
  }
  else {
    Write-Error "Build failed"
    exit 1
  }
}

function Push-Image {
  if ($Platform -contains ",") {
    Write-Status "Multi-platform build automatically pushes to registry"
    return
  }
    
  $FullImage = "$Registry/$Repo`:$Tag"
    
  Write-Status "Pushing image to GitHub Container Registry..."
  Write-Status "Image: $FullImage"
    
  if ($DryRun) {
    Write-Host "DRY RUN: docker push $FullImage"
    return
  }
    
  docker push $FullImage
    
  if ($LASTEXITCODE -eq 0) {
    Write-Success "Push completed successfully"
  }
  else {
    Write-Error "Push failed"
    exit 1
  }
}

function Show-Summary {
  $FullImage = "$Registry/$Repo`:$Tag"
    
  Write-Host ""
  Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
  Write-Host "║                          Build Summary                           ║" -ForegroundColor Green
  Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
  Write-Host ""
    
  Write-Host "Image:     " -ForegroundColor Cyan -NoNewline
  Write-Host $FullImage
  Write-Host "Platforms: " -ForegroundColor Cyan -NoNewline
  Write-Host $Platform
  Write-Host "Registry:  " -ForegroundColor Cyan -NoNewline
  Write-Host $Registry
  Write-Host ""
    
  Write-Host "Pull Command:" -ForegroundColor Yellow
  Write-Host "  docker pull $FullImage"
  Write-Host ""
    
  Write-Host "Run Command:" -ForegroundColor Yellow
  Write-Host "  docker run -d ``"
  Write-Host "    --name heimdall-full ``"
  Write-Host "    -p 3000:3000 ``"
  Write-Host "    -p 3001:3001 ``"
  Write-Host "    -e NODE_ENV=production ``"
  Write-Host "    -e DATABASE_URL=`"your-database-url`" ``"
  Write-Host "    -e NEXTAUTH_SECRET=`"your-nextauth-secret`" ``"
  Write-Host "    -e NEXTAUTH_URL=`"your-dashboard-url`" ``"
  Write-Host "    -e BOT_API_URL=`"your-bot-api-url`" ``"
  Write-Host "    $FullImage"
  Write-Host ""
    
  Write-Host "GitHub Container Registry:" -ForegroundColor Yellow
  Write-Host "  https://github.com/lerndmina/Heimdall/pkgs/container/heimdall-full"
  Write-Host ""
}

# Main execution
function Main {
  # Handle help
  if ($Help) {
    Show-Help
    exit 0
  }
    
  # Set default tag if not provided
  if (-not $Tag) {
    $Tag = $DefaultTag
  }
    
  # Handle fast build
  if ($Fast) {
    $Platform = Get-CurrentPlatform
    Write-Status "Fast build mode enabled - building for current platform only"
  }
    
  Write-Header
    
  if ($DryRun) {
    Write-Warning "DRY RUN MODE - No commands will be executed"
    Write-Host ""
  }
    
  Test-Prerequisites
    
  if (-not $PushOnly) {
    Initialize-Buildx
    Build-Image
  }
    
  if ($Platform -notcontains ",") {
    Push-Image
  }
    
  if (-not $DryRun) {
    Show-Summary
  }
    
  Write-Success "All operations completed successfully!"
}

# Run main function
Main
