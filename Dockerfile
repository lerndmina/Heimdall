# Multi-platform build arguments
ARG TARGETPLATFORM
ARG BUILDPLATFORM
FROM --platform=$TARGETPLATFORM oven/bun:1.1.34

# Install system dependencies (FFmpeg for bot, Node.js for compatibility, curl/wget for health checks)
RUN apt-get update && \
  apt-get install -y ffmpeg curl wget && \
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
  apt-get install -y nodejs && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

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

# Copy any remaining files
COPY bot/ ./bot/
COPY dashboard/ ./dashboard/

# Install tsx globally for bot execution
RUN npm install -g tsx

# Build dashboard (Next.js requires build for production)
WORKDIR /app/dashboard
# Generate Prisma client before building
RUN bunx prisma generate
RUN bun run build

# Go back to root
WORKDIR /app

# Install PM2 for process management
RUN npm install -g pm2

# Create ecosystem file for PM2
RUN echo '{\n\
  "apps": [\n\
  {\n\
  "name": "heimdall-bot",\n\
  "cwd": "/app/bot",\n\
  "script": "bun",\n\
  "args": "run start",\n\
  "env": {\n\
  "NODE_ENV": "production"\n\
  }\n\
  },\n\
  {\n\
  "name": "heimdall-dashboard",\n\
  "cwd": "/app/dashboard",\n\
  "script": "bun",\n\
  "args": "run start",\n\
  "env": {\n\
  "NODE_ENV": "production",\n\
  "PORT": "3001"\n\
  }\n\
  }\n\
  ]\n\
  }' > ecosystem.config.json

# Expose ports (3000 for bot API, 3001 for dashboard)
EXPOSE 3000 3001

# Add health check for both services
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD (wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1) && \
  (wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1)

# Start both services with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.json"]
