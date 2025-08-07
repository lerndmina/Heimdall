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

# Set production environment
ENV NODE_ENV=production

# Copy root package files
COPY package.json ./
COPY bun.lock ./

# Copy command-handler package files
COPY command-handler/package.json ./command-handler/
COPY command-handler/bun.lock ./command-handler/

# Copy logger package files
COPY logger/package.json ./logger/
COPY logger/bun.lock ./logger/

# Copy bot package files
COPY bot/package.json ./bot/
COPY bot/bun.lock ./bot/

# Copy dashboard package files
COPY dashboard/package.json ./dashboard/
COPY dashboard/bun.lock ./dashboard/

# Verify bun installation and show version
RUN bun --version

# Install all dependencies from root (this will handle local file dependencies properly)
RUN bun install --frozen-lockfile

# Copy TypeScript configs
COPY command-handler/tsconfig.json ./command-handler/
COPY logger/tsconfig.json ./logger/
COPY bot/tsconfig.json ./bot/
COPY dashboard/tsconfig.json ./dashboard/
COPY dashboard/next.config.js ./dashboard/
COPY dashboard/tailwind.config.js ./dashboard/
COPY dashboard/postcss.config.js ./dashboard/

# Copy source files for command-handler
COPY command-handler/src/ ./command-handler/src/

# Copy source files for logger
COPY logger/src/ ./logger/src/

# Copy source files for bot
COPY bot/src/ ./bot/src/
COPY bot/declarations.d.ts ./bot/

# Copy source files for dashboard
COPY dashboard/app/ ./dashboard/app/
COPY dashboard/components/ ./dashboard/components/
COPY dashboard/hooks/ ./dashboard/hooks/
COPY dashboard/lib/ ./dashboard/lib/
COPY dashboard/types/ ./dashboard/types/
# Prisma files not needed (using JWT-only sessions)
# COPY dashboard/prisma/ ./dashboard/prisma/
# COPY dashboard/scripts/ ./dashboard/scripts/

# Copy additional required files (specific files only, not entire directories)
COPY bot/FixCommandKit.ts ./bot/
COPY bot/fixedcommandkit.js ./bot/

# Install tsx globally for bot execution
RUN npm install -g tsx

# Install TypeScript globally for building packages
RUN npm install -g typescript

# Build logger first (required by command-handler)
WORKDIR /app/logger
# Ensure logger dependencies are installed (including @types/node)
RUN bun install --frozen-lockfile
RUN bun run build

# Manually create symlink for logger in command-handler node_modules
WORKDIR /app/command-handler
RUN mkdir -p node_modules/@heimdall
RUN ln -sf /app/logger node_modules/@heimdall/logger

# Install command-handler dependencies
RUN bun install --frozen-lockfile

# Debug: Check if logger package is properly linked
RUN ls -la node_modules/@heimdall/ || echo "No @heimdall directory found"
RUN ls -la node_modules/@heimdall/logger/dist/ || echo "No logger dist directory found"

# Build command-handler (depends on logger and required by bot)
RUN bun run build

# Ensure bot dependencies are installed (including dotenv)
WORKDIR /app/bot
RUN bun install --frozen-lockfile

# Build dashboard preparation - build Next.js
WORKDIR /app/dashboard
# Ensure dashboard dependencies are installed (including Next.js)
RUN bun install --frozen-lockfile
# Clean any existing build
RUN rm -rf .next
# Build Next.js app (no longer needs environment variables at build time)
RUN bun run build

# Go back to root
WORKDIR /app

# Install concurrently for process management (much simpler than PM2)
RUN bun add concurrently

# Copy startup and health check scripts
COPY scripts/start.sh /app/start.sh
COPY scripts/health-check.sh /app/health-check.sh
RUN chmod +x /app/start.sh /app/health-check.sh

# Expose ports (3000 for dashboard, 3001 for bot API)
EXPOSE 3000 3001

# Add health check for both services with more lenient timing
HEALTHCHECK --interval=60s --timeout=30s --start-period=120s --retries=5 \
  CMD /app/health-check.sh

# Start both services with concurrently
CMD ["/app/start.sh"]
