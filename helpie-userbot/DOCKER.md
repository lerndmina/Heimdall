# Helpie Userbot - Docker Deployment

## Quick Start with Docker

### Using Docker Compose (Recommended)

1. **Copy the example environment file:**

   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your configuration:**

   ```bash
   # Required
   BOT_TOKEN=your_discord_bot_token
   OWNER_IDS=your_discord_user_id
   OPENAI_API_KEY=your_openai_api_key

   # Optional (defaults provided)
   MONGODB_URI=mongodb://mongo:27017
   MONGODB_DATABASE=helpie
   REDIS_URL=redis://redis:6379
   DEBUG_LOG=false
   ```

3. **Start all services:**

   ```bash
   docker-compose up -d
   ```

4. **View logs:**

   ```bash
   docker-compose logs -f helpie
   ```

5. **Stop services:**
   ```bash
   docker-compose down
   ```

### Using Pre-built Image from GitHub Container Registry

Pull the latest image:

```bash
docker pull ghcr.io/lerndmina/helpie:latest
```

Or use the nightly build:

```bash
docker pull ghcr.io/lerndmina/helpie:nightly
```

Run with external MongoDB and Redis:

```bash
docker run -d \
  --name helpie \
  -e BOT_TOKEN="your_token" \
  -e OWNER_IDS="your_id" \
  -e OPENAI_API_KEY="your_key" \
  -e MONGODB_URI="mongodb://your-mongo:27017" \
  -e REDIS_URL="redis://your-redis:6379" \
  ghcr.io/lerndmina/helpie:latest
```

### Building Locally

Build the image:

```bash
# From the repository root
docker build -f helpie-userbot/Dockerfile -t helpie:local .
```

Run the locally built image:

```bash
docker run -d \
  --name helpie \
  --env-file helpie-userbot/.env \
  helpie:local
```

## Environment Variables

| Variable           | Required | Default        | Description                                    |
| ------------------ | -------- | -------------- | ---------------------------------------------- |
| `BOT_TOKEN`        | Yes      | -              | Discord bot token                              |
| `OWNER_IDS`        | Yes      | -              | Comma-separated Discord user IDs of bot owners |
| `OPENAI_API_KEY`   | Yes      | -              | OpenAI API key for AI features                 |
| `SYSTEM_PROMPT`    | No       | Default prompt | System prompt for AI responses                 |
| `MONGODB_URI`      | Yes      | -              | MongoDB connection string                      |
| `MONGODB_DATABASE` | No       | `helpie`       | MongoDB database name                          |
| `REDIS_URL`        | Yes      | -              | Redis connection string                        |
| `DEBUG_LOG`        | No       | `false`        | Enable debug logging                           |

## Docker Compose Services

The `docker-compose.yml` includes:

- **helpie**: The Helpie bot application
- **redis**: Redis 7 (for caching contexts)
- **mongo**: MongoDB 7 (for persistent storage)

All data is persisted in Docker volumes:

- `redis-data`: Redis persistence
- `mongo-data`: MongoDB data

## Health Checks

The Helpie container includes a health check that verifies the bot process is running:

- Interval: 60 seconds
- Timeout: 30 seconds
- Start period: 60 seconds
- Retries: 5

Check health status:

```bash
docker ps
# Look for "healthy" in the STATUS column
```

## GitHub Actions

### Automatic Builds

The repository includes GitHub Actions that automatically build and push Docker images:

1. **helpie-docker-build.yml**: Builds on every push to `main` or changes to helpie/shared packages

   - Creates `ghcr.io/lerndmina/helpie:nightly`
   - Creates `ghcr.io/lerndmina/helpie:sha-<commit>`

2. **helpie-docker-promote.yml**: Manual promotion workflow
   - Promotes `nightly` → `latest`
   - Run manually via GitHub Actions UI

### Multi-platform Support

Images are built for both:

- `linux/amd64` (x86_64)
- `linux/arm64` (ARM 64-bit, e.g., Raspberry Pi 4+, Apple Silicon)

## Troubleshooting

### Container won't start

Check logs:

```bash
docker-compose logs helpie
```

Common issues:

- Missing required environment variables
- Invalid Discord bot token
- Cannot connect to MongoDB/Redis

### Bot not responding to commands

1. Check if bot is running:

   ```bash
   docker-compose ps
   ```

2. Verify bot logged in successfully:

   ```bash
   docker-compose logs helpie | grep "Helpie Userbot is ready"
   ```

3. Ensure bot has proper permissions in Discord

### Database connection issues

Test MongoDB connection:

```bash
docker-compose exec mongo mongosh
```

Test Redis connection:

```bash
docker-compose exec redis redis-cli ping
# Should return: PONG
```

### Rebuild after code changes

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Production Deployment

For production, consider:

1. **Use environment-specific compose file:**

   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

2. **Enable Redis persistence:**
   Already configured with `appendonly yes`

3. **Backup MongoDB data:**

   ```bash
   docker-compose exec mongo mongodump --out /backup
   ```

4. **Monitor logs with external service:**

   - Integrate with your logging solution
   - Set up alerts for errors

5. **Use secrets management:**
   - Don't commit `.env` file
   - Use Docker secrets or external secret management

## Updating

### Using Docker Compose

```bash
docker-compose pull
docker-compose up -d
```

### Using GitHub Container Registry

```bash
docker pull ghcr.io/lerndmina/helpie:latest
docker stop helpie
docker rm helpie
docker run -d --name helpie --env-file .env ghcr.io/lerndmina/helpie:latest
```

## Support

For issues or questions:

- Check the main [Heimdall repository](https://github.com/lerndmina/Heimdall)
- Review `CONTEXT_IMPLEMENTATION.md` for context system usage
- Check logs for error messages
