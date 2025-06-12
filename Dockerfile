ARG TARGETPLATFORM=linux/amd64
FROM oven/bun:latest

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
COPY package.json bun.lock ./

# Install dependencies with bun, leveraging its speed
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
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Set the command to start the app
CMD [ "bun", "run", "start" ]