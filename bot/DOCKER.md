# Docker Deployment Guide

Complete guide for deploying Heimdall using Docker and Docker Compose.

## Quick Start

### 1. Copy Environment Template

```bash
cp .env.docker.example .env
nano .env  # Edit with your values
```

### 2. Build and Start

```bash
# Build and start all services (bot, MongoDB, Redis)
docker-compose up -d

# View logs
docker-compose logs -f bot

# Stop all services
docker-compose down
```

## Docker Commands Reference

### Building

```bash
# Build the image
docker build -t heimdall-bot .

# Build with specific tag
docker build -t heimdall-bot:v1.0.0 .

# Build without cache (force rebuild)
docker build --no-cache -t heimdall-bot .
```

### Using Docker Compose

```bash
# Start all services in background
docker-compose up -d

# Start and rebuild if needed
docker-compose up -d --build

# View logs
docker-compose logs -f              # All services
docker-compose logs -f bot          # Bot only
docker-compose logs -f mongodb      # MongoDB only

# Stop services
docker-compose stop                 # Stop without removing
docker-compose down                 # Stop and remove containers
docker-compose down -v              # Stop and remove volumes (⚠️ deletes data!)

# Restart a specific service
docker-compose restart bot

# View running containers
docker-compose ps

# Execute commands in container
docker-compose exec bot sh          # Open shell in bot container
docker-compose exec mongodb mongosh # MongoDB shell
```

### Container Management

```bash
# List running containers
docker ps

# List all containers
docker ps -a

# View container logs
docker logs heimdall-bot
docker logs -f heimdall-bot         # Follow logs

# Execute command in running container
docker exec -it heimdall-bot sh

# Restart container
docker restart heimdall-bot

# Stop container
docker stop heimdall-bot

# Remove container
docker rm heimdall-bot
```

### Image Management

```bash
# List images
docker images

# Remove image
docker rmi heimdall-bot

# Remove unused images
docker image prune

# Remove all unused data
docker system prune -a
```

## Architecture

The Docker Compose setup includes 3 services:

```
┌─────────────────────────────────────────┐
│  Bot Container (heimdall-bot)          │
│  ├─ Discord Bot (src/index.ts)         │
│  ├─ Bot API (Express on port 3001)     │
│  └─ Dashboard (Next.js on port 3000)   │
└─────────────────────────────────────────┘
                  ▼
       ┌──────────────────────┐
       │   Docker Network     │
       │  heimdall-network    │
       └──────────────────────┘
                  ▼
    ┌─────────────────────────────┐
    │  MongoDB        │   Redis   │
    │  (Port 27017)   │ (Port 6379)│
    │  Volume: db     │ Volume: cache│
    └─────────────────────────────┘
```

## Environment Configuration

### Required Variables

| Variable                | Description             | Example                              |
| ----------------------- | ----------------------- | ------------------------------------ |
| `BOT_TOKEN`             | Discord bot token       | `MTM0Nz...`                          |
| `OWNER_IDS`             | Bot owner user IDs      | `123,456`                            |
| `ENCRYPTION_KEY`        | Data encryption key     | Generate with `openssl rand -hex 32` |
| `INTERNAL_API_KEY`      | Bot API security key    | Generate with `openssl rand -hex 32` |
| `NEXTAUTH_SECRET`       | NextAuth session secret | Generate with `openssl rand -hex 32` |
| `DISCORD_CLIENT_ID`     | OAuth2 client ID        | `848254...`                          |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret    | `OWDVao...`                          |

### Database URLs

Docker Compose automatically configures:

- MongoDB: `mongodb://admin:password@mongodb:27017/?authSource=admin`
- Redis: `redis://default:password@redis:6379`

**Note:** Service names (`mongodb`, `redis`) are DNS names within the Docker network.

## Production Deployment

### Using Docker Compose (Recommended)

1. **Prepare server:**

   ```bash
   # Install Docker and Docker Compose
   curl -fsSL https://get.docker.com | sh
   sudo systemctl enable docker
   sudo systemctl start docker
   ```

2. **Clone and configure:**

   ```bash
   git clone https://github.com/yourusername/heimdall.git
   cd heimdall/bot
   cp .env.docker.example .env
   nano .env  # Edit values
   ```

3. **Start services:**

   ```bash
   docker-compose up -d
   ```

4. **Set up SSL (with Nginx):**

   ```bash
   # Install Nginx
   sudo apt install nginx certbot python3-certbot-nginx

   # Configure reverse proxy (see Nginx config below)
   sudo nano /etc/nginx/sites-available/heimdall

   # Get SSL certificate
   sudo certbot --nginx -d dashboard.yourdomain.com
   ```

### Manual Docker Run

```bash
# Start MongoDB
docker run -d \
  --name heimdall-mongodb \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=changeme \
  -v mongodb_data:/data/db \
  mongo:7

# Start Redis
docker run -d \
  --name heimdall-redis \
  --network container:heimdall-mongodb \
  redis:7-alpine redis-server --requirepass changeme

# Start Bot
docker run -d \
  --name heimdall-bot \
  --network container:heimdall-mongodb \
  -p 3000:3000 \
  -p 3001:3001 \
  --env-file .env \
  heimdall-bot
```

## Nginx Reverse Proxy Config

Template config is provided at `nginx/heimdall-host-proxy.conf` and includes:

- `dashboard.example.com` -> `127.0.0.1:3000`
- `api.example.com` -> `127.0.0.1:3001`
- `ws.example.com` -> `127.0.0.1:3002` (WebSocket/WSS upgrade headers)

Install it on your host:

```bash
sudo cp nginx/heimdall-host-proxy.conf /etc/nginx/sites-available/heimdall
sudo nano /etc/nginx/sites-available/heimdall
```

Update the three domain names and certificate paths in that file, then enable and test:

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/heimdall /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Volume Management

### Backup Data

```bash
# Backup MongoDB
docker-compose exec -T mongodb mongodump --archive | gzip > backup-$(date +%Y%m%d).gz

# Backup Redis
docker-compose exec redis redis-cli --rdb /data/dump.rdb SAVE
docker cp heimdall-redis:/data/dump.rdb ./redis-backup.rdb

# Backup volumes (filesystem level)
docker run --rm \
  -v heimdall_mongodb_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/mongodb-backup.tar.gz -C /data .
```

### Restore Data

```bash
# Restore MongoDB
gunzip < backup-20260208.gz | docker-compose exec -T mongodb mongorestore --archive

# Restore Redis
docker cp ./redis-backup.rdb heimdall-redis:/data/dump.rdb
docker-compose restart redis
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs bot

# Common issues:
# 1. Port already in use
sudo lsof -i :3000
sudo kill -9 <PID>

# 2. Environment variables missing
docker-compose config  # Validates docker-compose.yml

# 3. Database connection fails
docker-compose exec bot ping mongodb  # Test network
```

### High memory usage

```bash
# Check resource usage
docker stats

# Limit memory for bot
# Add to docker-compose.yml under bot service:
#   mem_limit: 1g
#   mem_reservation: 512m
```

### Dashboard not accessible

```bash
# Check if container is running
docker-compose ps

# Check dashboard logs
docker-compose logs -f bot | grep -i dashboard

# Test internally
docker-compose exec bot wget -O- http://localhost:3000
```

### Database connection errors

```bash
# Check MongoDB is running
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"

# Check Redis
docker-compose exec redis redis-cli ping

# Verify network
docker network inspect heimdall_heimdall-network
```

## Updating

### Update to new version

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Or rebuild specific service
docker-compose up -d --build bot
```

### Database migrations

```bash
# If needed, run migrations
docker-compose exec bot tsx scripts/migrate.ts
```

## Performance Tuning

### MongoDB

Add to `docker-compose.yml`:

```yaml
mongodb:
  command: mongod --wiredTigerCacheSizeGB 1.5
  deploy:
    resources:
      limits:
        memory: 2G
```

### Redis

```yaml
redis:
  command: >
    redis-server 
    --maxmemory 256mb 
    --maxmemory-policy allkeys-lru
```

## Security Checklist

- [ ] Change all default passwords in `.env`
- [ ] Use strong random keys (32+ characters)
- [ ] Set `NEXTAUTH_URL` to your actual domain
- [ ] Configure firewall to block direct API port (3001)
- [ ] Use HTTPS (SSL certificate via certbot)
- [ ] Keep MongoDB and Redis internal (no external ports)
- [ ] Regular backups of volumes
- [ ] Update base images regularly: `docker-compose pull`
- [ ] Monitor logs for suspicious activity

## Monitoring

### Setup health checks

Already included in Dockerfile! Docker will automatically restart unhealthy containers.

### View health status

```bash
docker-compose ps  # Shows health status
docker inspect heimdall-bot | grep -A 10 Health
```

### External monitoring

Integrate with monitoring services:

- Uptime Robot (free tier available)
- Better Stack (formerly Logtail)
- Prometheus + Grafana (self-hosted)

## Support

Check logs first:

```bash
docker-compose logs -f bot --tail=100
```

Common log locations in container:

- Bot logs: stdout/stderr (captured by Docker)
- Dashboard logs: stdout/stderr
- Next.js: `/app/plugins/dashboard/app/.next/`
