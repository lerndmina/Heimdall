# Multi-platform build arguments
ARG TARGETPLATFORM
ARG BUILDPLATFORM
FROM oven/bun:1.1.34

# Install system dependencies (FFmpeg for bot, Node.js for compatibility, curl/wget for health checks, procps for PM2, iproute2 for networking)
# Use DEBIAN_FRONTEND=noninteractive to avoid issues with ARM64 emulation
ENV DEBIAN_FRONTEND=noninteractive

# Update package lists
RUN apt-get update

# Install basic utilities first
RUN apt-get install -y --no-install-recommends \
  ffmpeg \
  curl \
  wget \
  procps \
  iproute2 \
  ca-certificates \
  gnupg \
  lsb-release \
  xz-utils

# Install Node.js 18.x - use a more reliable method for ARM64 builds
# Try direct binary installation first, fall back to package manager
RUN if [ "$TARGETPLATFORM" = "linux/arm64" ]; then \
  echo "Installing Node.js for ARM64 using direct binary method..." && \
  curl -fsSL https://nodejs.org/dist/v18.20.4/node-v18.20.4-linux-arm64.tar.xz | tar -xJ -C /usr/local --strip-components=1; \
  else \
  echo "Installing Node.js using NodeSource repository..." && \
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
  apt-get install -y --no-install-recommends nodejs; \
  fi

# Clean up and reset DEBIAN_FRONTEND
RUN apt-get clean && \
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
ENV DEBIAN_FRONTEND=

# Set the working directory
WORKDIR /app

# Copy root package files
COPY package.json ./
COPY bun.lock ./

# Copy bot package files
COPY bot/package.json ./bot/
COPY bot/bun.lock ./bot/

# Copy dashboard package files
COPY dashboard/package.json ./dashboard/
COPY dashboard/bun.lock ./dashboard/

# Verify bun installation and show version
RUN bun --version

# Install root dependencies
RUN bun install --frozen-lockfile

# Install bot dependencies
WORKDIR /app/bot
RUN bun install --frozen-lockfile

# Install dashboard dependencies
WORKDIR /app/dashboard
RUN bun install --frozen-lockfile

# Go back to root
WORKDIR /app

# Copy TypeScript configs
COPY bot/tsconfig.json ./bot/
COPY dashboard/tsconfig.json ./dashboard/
COPY dashboard/next.config.js ./dashboard/
COPY dashboard/tailwind.config.js ./dashboard/
COPY dashboard/postcss.config.js ./dashboard/

# Copy source files for bot
COPY bot/src/ ./bot/src/
COPY bot/declarations.d.ts ./bot/

# Copy source files for dashboard
COPY dashboard/app/ ./dashboard/app/
COPY dashboard/components/ ./dashboard/components/
COPY dashboard/hooks/ ./dashboard/hooks/
COPY dashboard/lib/ ./dashboard/lib/
COPY dashboard/types/ ./dashboard/types/
COPY dashboard/prisma/ ./dashboard/prisma/
COPY dashboard/scripts/ ./dashboard/scripts/

# Copy additional required files (specific files only, not entire directories)
COPY bot/FixCommandKit.ts ./bot/
COPY bot/fixedcommandkit.js ./bot/

# Install tsx globally for bot execution
RUN npm install -g tsx

# Build dashboard preparation - generate Prisma client and build Next.js
WORKDIR /app/dashboard
# Generate Prisma client (this doesn't need env vars)
RUN bunx prisma generate
# Clean any existing build
RUN rm -rf .next
# Build Next.js app (no longer needs environment variables at build time)
RUN bun run build

# Go back to root
WORKDIR /app

# Install concurrently for process management (much simpler than PM2)
RUN bun add concurrently

# Copy startup script
COPY scripts/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expose ports (3000 for dashboard, 3001 for bot API)
EXPOSE 3000 3001

# Add health check for both services
HEALTHCHECK --interval=60s --timeout=15s --start-period=90s --retries=3 \
  CMD (wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1) && \
  (wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1)

# Start both services with concurrently
CMD ["/app/start.sh"]
