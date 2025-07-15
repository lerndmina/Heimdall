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

# Copy package files first
COPY package.json ./
COPY bun.lock ./

# Verify bun installation and show version
RUN bun --version

# Install dependencies with bun
RUN bun install --frozen-lockfile

# Copy TypeScript config for build
COPY tsconfig.json ./

# Copy source files
COPY src/ ./src/

# Copy the rest of the application files
COPY . .

# Install tsx
RUN npm install -g tsx

# Expose port for health check
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Set the command to start the app
CMD [ "bun", "run", "start" ]