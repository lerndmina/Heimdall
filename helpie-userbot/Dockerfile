# Multi-platform build arguments
ARG TARGETPLATFORM
ARG BUILDPLATFORM
FROM oven/bun:1.1.34

# Install system dependencies
ENV DEBIAN_FRONTEND=noninteractive

# Update package lists
RUN apt-get update

# Install basic utilities
RUN apt-get install -y --no-install-recommends \
  curl \
  wget \
  ca-certificates \
  gnupg \
  lsb-release \
  xz-utils

# Install Node.js 18.x - use a more reliable method for ARM64 builds
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

# Copy shared logger package
COPY logger/package.json ./logger/
COPY logger/bun.lock ./logger/
COPY logger/tsconfig.json ./logger/
COPY logger/src/ ./logger/src/

# Copy helpie package files
COPY helpie-userbot/package.json ./helpie-userbot/
COPY helpie-userbot/bun.lock ./helpie-userbot/
COPY helpie-userbot/tsconfig.json ./helpie-userbot/

# Verify bun installation and show version
RUN bun --version

# Install tsx globally for execution
RUN npm install -g tsx

# Install TypeScript globally for building packages
RUN npm install -g typescript

# Build logger first (required by helpie)
WORKDIR /app/logger
RUN bun install --frozen-lockfile
RUN bun run build

# Install helpie dependencies
WORKDIR /app/helpie-userbot
RUN mkdir -p node_modules/@heimdall
RUN ln -sf /app/logger node_modules/@heimdall/logger
RUN bun install --frozen-lockfile

# Copy helpie source files
COPY helpie-userbot/src/ ./src/

# Go back to root
WORKDIR /app

# Set working directory to helpie
WORKDIR /app/helpie-userbot

# Start helpie
CMD ["npx", "tsx", "src/index.ts"]
