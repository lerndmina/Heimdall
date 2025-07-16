# Environment Variables Configuration

The Heimdall full system properly respects Docker environment variables at runtime. The dashboard is pre-built during Docker image creation and reads environment variables when the container starts.

## How It Works

Next.js reads environment variables at **runtime** (not build time), which means:

- ✅ The same Docker image works for development, staging, and production
- ✅ No rebuild required when changing environment variables
- ✅ Fast startup on resource-constrained VPS servers
- ✅ Environment variables are read from the Docker container environment

## Required Environment Variables

### Dashboard (Next.js)

```bash
# Required for NextAuth.js
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="https://your-domain.com"  # or http://localhost:3000 for local

# Required for bot API communication
BOT_API_URL="http://localhost:3001"  # or your bot API URL

# Database (if using external database)
DATABASE_URL="postgresql://user:password@host:port/database"
# or for SQLite: "file:./dev.db"
```

### Bot

```bash
# Discord Bot Configuration
BOT_TOKEN="your-discord-bot-token"
MONGODB_URI="mongodb://your-mongodb-uri"
REDIS_URL="redis://your-redis-uri"

# Other bot-specific variables (see bot documentation)
```

## Docker Run Examples

### Local Development

```bash
docker run -d \
  --name heimdall-full \
  -p 3000:3000 \
  -p 3001:3001 \
  -e NODE_ENV=development \
  -e NEXTAUTH_SECRET="dev-secret-change-in-production" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  -e BOT_API_URL="http://localhost:3001" \
  -e DATABASE_URL="file:./dev.db" \
  -e BOT_TOKEN="your-bot-token" \
  -e MONGODB_URI="your-mongodb-uri" \
  -e REDIS_URL="your-redis-uri" \
  ghcr.io/lerndmina/heimdall-full:latest
```

### Production

```bash
docker run -d \
  --name heimdall-full \
  -p 3000:3000 \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e NEXTAUTH_SECRET="$(openssl rand -base64 32)" \
  -e NEXTAUTH_URL="https://your-domain.com" \
  -e BOT_API_URL="https://your-bot-api-domain.com" \
  -e DATABASE_URL="postgresql://user:password@host:port/database" \
  -e BOT_TOKEN="your-bot-token" \
  -e MONGODB_URI="your-mongodb-uri" \
  -e REDIS_URL="your-redis-uri" \
  ghcr.io/lerndmina/heimdall-full:latest
```

### Using Docker Compose

```yaml
version: "3.8"
services:
  heimdall:
    image: ghcr.io/lerndmina/heimdall-full:latest
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      NODE_ENV: production
      NEXTAUTH_SECRET: "your-secret-key"
      NEXTAUTH_URL: "https://your-domain.com"
      BOT_API_URL: "http://localhost:3001"
      DATABASE_URL: "file:./data/database.db"
      BOT_TOKEN: "your-bot-token"
      MONGODB_URI: "mongodb://mongo:27017/heimdall"
      REDIS_URL: "redis://redis:6379"
    volumes:
      - ./data:/app/data
    depends_on:
      - mongo
      - redis
    restart: unless-stopped

  mongo:
    image: mongo:latest
    volumes:
      - mongo_data:/data/db
    restart: unless-stopped

  redis:
    image: redis:alpine
    restart: unless-stopped

volumes:
  mongo_data:
```

### Using Environment File

Create a `.env` file:

```bash
NODE_ENV=production
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=https://your-domain.com
BOT_API_URL=http://localhost:3001
DATABASE_URL=file:./data/database.db
BOT_TOKEN=your-bot-token
MONGODB_URI=mongodb://localhost:27017/heimdall
REDIS_URL=redis://localhost:6379
```

Run with environment file:

```bash
docker run -d --name heimdall-full -p 3000:3000 -p 3001:3001 --env-file .env ghcr.io/lerndmina/heimdall-full:latest
```

## How It Works

1. **Container Startup**: When the container starts, it runs the `/app/start.sh` script
2. **Environment Check**: The script displays current environment variables for debugging
3. **Service Start**: Both bot and dashboard services start with `concurrently`
4. **Runtime Configuration**: Next.js reads environment variables from the container environment

## Build Time vs Runtime

- **Build Time**: Dashboard is built during Docker image creation (no environment variables needed)
- **Runtime**: Environment variables are read from Docker container environment
- **Benefits**:
  - Same image works for all environments
  - Fast startup (no build process during container start)
  - Perfect for resource-constrained VPS servers
  - Environment variables properly respected

## Startup Time

- **Startup Time**: ~30-60 seconds (no build process during startup)
- **Health Checks**: Standard timing (90 seconds start period)
- **Resource Usage**: Minimal CPU and memory during startup

## Troubleshooting

### Missing Environment Variables

- Check logs during startup for environment variable listing
- Ensure all required variables are set
- Use `docker logs <container-name>` to see startup process

### Slow Startup

- If startup is slow, check container logs for issues
- Ensure all required environment variables are properly set
- Verify network connectivity for external services (database, Redis, etc.)
