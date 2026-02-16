# Heimdall Discord Bot - Production Dockerfile
# Multi-stage build for optimized production image using Bun
# Supports multi-platform (amd64 + arm64) via native cross-compilation

# ──────────────────────────────────────────────────────────────────────
# Stage 0: Cross-compilation toolkit (tiny, cached)
# ──────────────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM tonistiigi/xx AS xx

# ──────────────────────────────────────────────────────────────────────
# Stage 1: Cross-compile whisper.cpp (runs NATIVELY on build host)
# This avoids painfully slow QEMU emulation when targeting arm64.
# ──────────────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS whisper-cross
COPY --from=xx / /
ARG TARGETPLATFORM

WORKDIR /build

# Native build tools + cross-compilation support for the target arch
RUN apk add --no-cache clang lld cmake make git wget
RUN xx-apk add --no-cache gcc g++ musl-dev

# Get whisper.cpp source via bun install (runs natively — fast)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Cross-compile whisper.cpp for the TARGET platform
# GGML_NATIVE=OFF: disable host-specific SIMD (AVX2/FMA/etc.) so the binary
# runs on any CPU of the target architecture (prevents SIGILL on servers
# whose CPU lacks instructions the build host supports).
RUN cd node_modules/nodejs-whisper/cpp/whisper.cpp && \
  cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DGGML_NATIVE=OFF \
  -DCMAKE_C_COMPILER=$(which xx-cc) \
  -DCMAKE_CXX_COMPILER=$(which xx-c++) && \
  cmake --build build --config Release -j$(nproc)

# ──────────────────────────────────────────────────────────────────────
# Stage 2: Dependencies (runs on target platform)
# ──────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++ cmake git

# Copy package files
COPY package.json bun.lock ./

# Install production dependencies
RUN bun install --frozen-lockfile --production && \
  # Copy production deps to temp location
  cp -R node_modules /tmp/node_modules && \
  # Install all deps (including dev) for build stage
  bun install --frozen-lockfile

# Overlay cross-compiled whisper.cpp binary
# (replaces the slow QEMU-emulated build that used to happen here)
COPY --from=whisper-cross /build/node_modules/nodejs-whisper/cpp/whisper.cpp/ /tmp/node_modules/nodejs-whisper/cpp/whisper.cpp/

# ──────────────────────────────────────────────────────────────────────
# Stage 3: Build Dashboard (runs NATIVELY on build host)
# Next.js outputs platform-independent JS, no need for QEMU.
# ──────────────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS dashboard-builder

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
# Stage 4: Build Bot (Optional - TypeScript compilation)
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
# Stage 5: Production Runtime
# ──────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runner

# Install runtime dependencies
# - ffmpeg: audio format conversion for voice transcription
# - wget: GNU wget (replaces BusyBox wget which lacks --no-config for nodejs-whisper model downloads)
# - libstdc++: required by compiled whisper.cpp binary
# - nginx: reverse proxy for single-port PaaS deployments (only used when SINGLE_PORT_PROXY=true)
# - gettext: provides envsubst for nginx config templating
RUN apk add --no-cache ffmpeg wget libstdc++ nginx gettext

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

# Copy nginx config template and entrypoint script
COPY --chown=heimdall:nodejs nginx/single-port.conf.template ./nginx/single-port.conf.template
COPY --chown=heimdall:nodejs scripts/entrypoint.sh ./scripts/entrypoint.sh
RUN chmod +x ./scripts/entrypoint.sh

# Prepare writable directories for non-root nginx
RUN mkdir -p /tmp/nginx && chown -R heimdall:nodejs /tmp/nginx

# Pre-create whisper model directory so the non-root user can write to it
# (supports Railway / Docker volume mounts at /app/models/whisper)
RUN mkdir -p /app/models/whisper && chown -R heimdall:nodejs /app/models

# Switch to non-root user
USER heimdall

# Expose ports
# API_PORT (default 3001), DASHBOARD_PORT (default 3000), WS_PORT (default 3002)
# PORT (default 8080) is the single-port proxy when SINGLE_PORT_PROXY=true
EXPOSE 3000 3001 3002 8080

# Health check — always checks the dashboard directly on port 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Entrypoint: optionally starts nginx proxy, then launches the bot
ENTRYPOINT ["./scripts/entrypoint.sh"]
