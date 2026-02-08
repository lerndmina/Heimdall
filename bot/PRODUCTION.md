# Production Deployment Guide

This guide explains how to build and deploy Heimdall in production mode.

## Quick Start

### 1. Build for Production

```bash
npm run build:prod
```

This will:

- Compile TypeScript to JavaScript
- Build Next.js dashboard in standalone mode
- Output optimized production assets

### 2. Start in Production

```bash
npm run start:prod
```

Or with Bun:

```bash
npm run start:prod:bun
```

## What Happens in Production Mode?

### Bot (TypeScript)

- `npm run build` compiles TypeScript files (optional - tsx can run .ts directly)
- Bot starts normally with `NODE_ENV=production`

### Dashboard (Next.js)

- `next build` creates optimized production build in `plugins/dashboard/app/.next/`
- **Standalone mode** produces minimal self-contained files in `.next/standalone/`
- Production build includes:
  - Optimized and minified JavaScript bundles
  - Static assets (CSS, images)
  - Server-side rendering optimizations
  - Build cache for faster subsequent builds

### How Plugin Loader Works

The dashboard plugin detects production mode and:

1. Loads Next.js with `dev: false`
2. Next.js automatically uses the standalone build
3. Runs in the **same process** as the bot (not separate container)
4. Full access to all bot libs, plugins, and database connections

## Environment Variables

Ensure these are set in your `.env` file:

```env
# Required for production
NODE_ENV=production

# Bot configuration
BOT_TOKEN=your_bot_token_here
MONGODB_URI=mongodb://...
INTERNAL_API_KEY=your_secure_api_key

# Dashboard configuration
DASHBOARD_PORT=3000
NEXTAUTH_SECRET=your_secure_secret_here
NEXTAUTH_URL=https://yourdomain.com  # Your public URL
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
```

## Build Scripts Reference

| Command                   | Description                                |
| ------------------------- | ------------------------------------------ |
| `npm run build`           | Compile TypeScript (bot only)              |
| `npm run build:dashboard` | Build Next.js dashboard only               |
| `npm run build:prod`      | Build everything (bot + dashboard)         |
| `npm run start:prod`      | Start both bot and dashboard in production |
| `npm run start:prod:bun`  | Start with Bun runtime (faster)            |

## First-Time Production Build

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
nano .env  # Edit with your production values

# 3. Build for production
npm run build:prod

# 4. Start
npm run start:prod
```

## Deployment Options

### Option 1: Direct on Server (PM2)

```bash
npm install -g pm2

# Start with PM2
pm2 start npm --name "heimdall" -- run start:prod

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Option 2: Docker (Future)

The `next.config.mjs` is already configured for Docker standalone builds.
See `DOCKER.md` for containerization guide (coming soon).

### Option 3: Systemd Service

```bash
# Create /etc/systemd/system/heimdall.service
[Unit]
Description=Heimdall Discord Bot
After=network.target mongodb.service

[Service]
Type=simple
User=heimdall
WorkingDirectory=/opt/heimdall/bot
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start:prod
Restart=always

[Install]
WantedBy=multi-user.target
```

## Performance Notes

### Build Time

- **First build**: 30-60 seconds (Next.js optimization)
- **Subsequent builds**: 10-20 seconds (uses cache)

### Startup Time

- **Development mode**: 5-10 seconds (Next.js compiles on demand)
- **Production mode**: 2-3 seconds (precompiled assets)

### Memory Usage

- **Development**: ~400-600 MB (HMR + dev server)
- **Production**: ~200-300 MB (optimized bundles)

## Troubleshooting

### Build Fails

```bash
# Clear Next.js cache
rm -rf plugins/dashboard/app/.next

# Rebuild
npm run build:dashboard
```

### Dashboard Shows Dev Mode Warning

Make sure `NODE_ENV=production` is set before starting:

```bash
NODE_ENV=production npm run start:prod
```

### Port Already in Use

Change `DASHBOARD_PORT` in `.env` or kill the process:

```bash
# Find process
lsof -i :3000

# Kill it
kill -9 <PID>
```

### Static Files Not Loading

Ensure your public URL is configured:

- Set `NEXTAUTH_URL` to your public domain
- Configure reverse proxy (nginx/caddy) to forward to dashboard port

## Updating After Code Changes

```bash
# 1. Pull latest changes
git pull

# 2. Install new dependencies (if any)
npm install

# 3. Rebuild
npm run build:prod

# 4. Restart (PM2 example)
pm2 restart heimdall
```

## Advanced: Build Optimization

### Analyze Bundle Size

```bash
cd plugins/dashboard/app
ANALYZE=true next build
```

### Custom Build Cache

```bash
# Set build cache directory
NEXT_BUILD_CACHE=/tmp/next-cache npm run build:dashboard
```

## Security Checklist

Before deploying to production:

- [ ] Change `INTERNAL_API_KEY` to a secure random string
- [ ] Change `NEXTAUTH_SECRET` to a secure random string
- [ ] Set `NEXTAUTH_URL` to your actual domain (not localhost)
- [ ] Use environment variables (never commit secrets to git)
- [ ] Configure firewall to block direct API_PORT access (only dashboard should reach it)
- [ ] Enable HTTPS via reverse proxy (nginx, caddy, cloudflare)
- [ ] Set up MongoDB authentication
- [ ] Review `.env` file permissions (chmod 600)

## Support

For issues or questions:

- Check logs: `pm2 logs heimdall` (if using PM2)
- Enable debug: `DEBUG_LOG=true` in `.env`
- Review bot logs in Discord (if logging plugin enabled)
