# Heimdall Discord Bot - Production Dockerfile
# Multi-stage build for optimized production image using Bun

# ──────────────────────────────────────────────────────────────────────
# Stage 1: Dependencies
# ──────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package files
COPY package.json bun.lock ./

# Install production dependencies
RUN bun install --frozen-lockfile --production && \
  # Copy production deps to temp location
  cp -R node_modules /tmp/node_modules && \
  # Install all deps (including dev) for build stage
  bun install --frozen-lockfile

# ──────────────────────────────────────────────────────────────────────
# Stage 2: Build Dashboard
# ──────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS dashboard-builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./

# Copy dashboard source
COPY plugins/dashboard ./plugins/dashboard

# Build Next.js dashboard
WORKDIR /app/plugins/dashboard/app
RUN bun install --frozen-lockfile && \
  NODE_ENV=production bun run next build

# ──────────────────────────────────────────────────────────────────────
# Stage 3: Build Bot (Optional - TypeScript compilation)
# ──────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS bot-builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./

# Copy bot source
COPY src ./src
COPY plugins ./plugins

# Optional: Compile TypeScript (Bun can run .ts directly, so this is optional)
# Uncomment if you want compiled JS instead of running .ts files
# RUN bun run build

# ──────────────────────────────────────────────────────────────────────
# Stage 4: Production Runtime
# ──────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runner

# Install runtime dependencies
# - ffmpeg: audio format conversion for voice transcription
# - wget: GNU wget (replaces BusyBox wget which lacks --no-config for nodejs-whisper model downloads)
# - libstdc++: required by compiled whisper.cpp binary
RUN apk add --no-cache ffmpeg wget libstdc++

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 heimdall

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy production dependencies with correct ownership
COPY --chown=heimdall:nodejs --from=deps /tmp/node_modules ./node_modules
COPY --chown=heimdall:nodejs package.json bun.lock ./

# Copy bot source and plugins (TypeScript - Bun will run it)
COPY --chown=heimdall:nodejs --from=bot-builder /app/src ./src
COPY --chown=heimdall:nodejs --from=bot-builder /app/plugins ./plugins
COPY --chown=heimdall:nodejs --from=bot-builder /app/tsconfig.json ./

# Copy built dashboard AFTER plugins to overwrite with complete production build
COPY --chown=heimdall:nodejs --from=dashboard-builder /app/plugins/dashboard/app ./plugins/dashboard/app

# Switch to non-root user
USER heimdall

# Expose ports
# API_PORT (default 3001) and DASHBOARD_PORT (default 3000)
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the bot (which loads the dashboard plugin)
CMD ["bun", "run", "src/index.ts"]
