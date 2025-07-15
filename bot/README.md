# Heimdall Discord Bot

A feature-rich Discord bot with health monitoring, message management, and deployment controls.

Built for personal use, feel free to use in your own stuff. **No support will be provided**.

## Features

- **Health Monitoring**: Web interface to check bot status and components
- **Message Management**: Send, edit, delete and restore messages using Discohook
- **Auto Deployment**: Webhook-based deployment system with domain allowlist
- **Redis Integration**: Caching and cooldown management
- **MongoDB Support**: Persistent data storage
- **Docker Support**: Containerized deployment with health checks
- **FFmpeg Integration**: Audio processing capabilities
- **Owner Commands**: Special commands for bot owners
- **Test Server Support**: Dedicated test servers for development

## Dependencies

1. **Node.js**: Version 18 or higher required
2. **Bun**: Used as the package manager ([Install here](https://bun.sh/))
3. **Redis**: For caching and cooldown management
4. **MongoDB**: For persistent data storage
5. **FFmpeg**: For audio processing capabilities

## Installation Options

### Option 1: Using the Package Registry

Pull the Docker image directly from GitHub Container Registry:

```bash
docker pull ghcr.io/lerndmina/heimdall:latest
```

You can also use specific versions or the nightly build:

- Latest stable: `ghcr.io/lerndmina/heimdall:latest`
- Nightly build: `ghcr.io/lerndmina/heimdall:nightly`
- Specific version: `ghcr.io/lerndmina/heimdall:vX.Y.Z`

### Option 2: Quick Start (Docker Compose)

1. Create a `docker-compose.yml`:

```yaml
version: "3.8"
services:
  bot:
    image: ghcr.io/lerndmina/heimdall:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - .env:/app/.env
    depends_on:
      - redis
      - mongo

  redis:
    image: redis:alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

  mongo:
    image: mongo:latest
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db

volumes:
  redis_data:
  mongo_data:
```

2. Configure environment:

```bash
copy .env.example .env
```

3. Run with Docker Compose:

```bash
docker-compose up -d
```

### Option 3: Build from Source

1. Clone the repository:

```bash
git clone https://github.com/lerndmina/heimdall.git
cd heimdall
```

2. Follow either the Docker or Manual installation instructions below.

## Manual Installation

1. Install dependencies:

```bash
bun install
```

2. Configure environment variables in `.env`:

```env
# Required Bot Configuration
BOT_TOKEN=your_discord_bot_token
OWNER_IDS=comma,separated,user,ids
TEST_SERVERS=comma,separated,server,ids
PREFIX=!

# Database Configuration
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=your_database_name
REDIS_URL=redis://localhost:6379

# Health Monitoring
HEALTH_PORT=3000
HEALTH_CHECK_INTERVAL=30000

# Bot Customization
WAITING_EMOJI=⏳
DEBUG_LOG=false
DEFAULT_TIMEZONE=Europe/London

# Optional Features
STAFF_ROLE=optional_staff_role_id
OPENAI_API_KEY=optional_openai_api_key

# Deployment Configuration
ALLOWED_DEPLOY_DOMAINS=github.com,gitlab.com
ZIPLINE_BASEURL=https://your.zipline.instance # zipline.diced.sh
ZIPLINE_TOKEN=your_zipline_token
```

3. Start the bot:

```bash
# Development mode with hot reload
bun run dev

# Production mode
bun start
```

## Docker Configuration

The bot includes full Docker support with:

- Multi-stage builds for optimal image size
- **Multi-platform support**: Images are built for both AMD64 and ARM64 architectures
- Health checks for container orchestration
- FFmpeg and Node.js pre-installed
- Volume support for persistent data
- Available on GitHub Container Registry

### Multi-Platform Build Support

The Docker images are automatically built for both `linux/amd64` and `linux/arm64` platforms, ensuring compatibility with:

- Intel/AMD processors (x86_64)
- ARM processors (including Apple Silicon M1/M2, Raspberry Pi, AWS Graviton)

When you pull the image, Docker will automatically select the correct architecture for your system.

### Building Multi-Platform Images Locally

For local multi-platform builds, use the provided scripts:

**PowerShell (Windows):**

```powershell
# Build for current platform only
.\build-multiplatform.ps1

# Build and push multi-platform images
.\build-multiplatform.ps1 -Push

# Use optimized Dockerfile
.\build-multiplatform.ps1 -UseOptimized -Push

# Custom image name and tag
.\build-multiplatform.ps1 -ImageName "mybot" -Tag "v1.0" -Push
```

**Bash (Linux/macOS):**

```bash
# Build for current platform only
./build-multiplatform.sh

# Build and push multi-platform images
./build-multiplatform.sh --push

# Use optimized Dockerfile
./build-multiplatform.sh --optimized --push

# Custom image name and tag
./build-multiplatform.sh --name "mybot" --tag "v1.0" --push
```

**Manual Docker Buildx:**

```bash
# Create buildx builder
docker buildx create --name multiplatform --use

# Build for multiple platforms
docker buildx build --platform linux/amd64,linux/arm64 -t myimage:latest --push .

# Build locally (current platform only)
docker buildx build --load -t myimage:latest .
```

### Docker Compose Example:

```yaml
version: "3.8"
services:
  bot:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - .env:/app/.env
    depends_on:
      - redis
      - mongo

  redis:
    image: redis:alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

  mongo:
    image: mongo:latest
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db

volumes:
  redis_data:
  mongo_data:
```

## Development Scripts

- `bun run dev` - Start with hot reload for development
- `bun start` - Start in production mode
- `bun run test-build` - Test TypeScript compilation

## Health Monitoring

The bot includes a built-in health monitoring system:

- `GET /health` - JSON status endpoint for monitoring
- `GET /` - Interactive dashboard for bot management
- `GET /deploy` - Webhook endpoint for automated deployments

Health checks monitor:

- Discord connection status
- Database connectivity
- Redis availability
- Command loading status

## Message Management

Comprehensive message management via slash commands:

- `/message send` - Send messages with Discohook data
- `/message edit` - Edit existing bot messages
- `/message delete` - Delete bot messages
- `/message restore` - Convert messages to Discohook format

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
