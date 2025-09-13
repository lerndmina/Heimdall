# Multi-platform build arguments
ARG TARGETPLATFORM
ARG BUILDPLATFORM
FROM --platform=$TARGETPLATFORM oven/bun:1.1.34

# Install FFmpeg, Node.js, and wget for health checks
RUN apt-get update && \
  apt-get install -y ffmpeg curl wget && \
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
  apt-get install -y nodejs && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy local dependencies first (command-handler and logger)
COPY command-handler/ ./command-handler/
COPY logger/ ./logger/

# Copy bot package files
COPY package.json ./
COPY bun.lock ./

# Verify bun installation and show version
RUN bun --version

# Build dependencies in correct order (following install:all pattern)
# 1. Install and build logger (lowest level dependency)
WORKDIR /app/logger
RUN bun install && bun run build

# 2. Install and build command-handler (depends on logger)
WORKDIR /app/command-handler
RUN bun install && bun run build

# 3. Back to bot directory and install bot dependencies
WORKDIR /app
COPY bot/package.json bot/bun.lock ./

# Temporarily modify package.json to use absolute paths for local packages
RUN sed -i 's|"@heimdall/command-handler": "../command-handler"|"@heimdall/command-handler": "./command-handler"|g' package.json && \
  sed -i 's|"@heimdall/logger": "../logger"|"@heimdall/logger": "./logger"|g' package.json

RUN bun install --frozen-lockfile

# Copy TypeScript config for build
COPY bot/tsconfig.json ./

# Copy source files
COPY bot/src/ ./src/

# Copy additional bot files
COPY bot/declarations.d.ts ./

# Install tsx
RUN npm install -g tsx

# Expose port for health check
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Set the command to start the app
CMD [ "bun", "run", "start" ]