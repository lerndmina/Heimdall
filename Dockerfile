# Multi-platform build arguments
ARG TARGETPLATFORM
ARG BUILDPLATFORM
FROM --platform=$TARGETPLATFORM oven/bun:1.1.34

# Install system dependencies (FFmpeg for bot, Node.js for compatibility, curl/wget for health checks, procps for PM2, iproute2 for networking)
RUN apt-get update && \
  apt-get install -y ffmpeg curl wget procps iproute2 && \
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
# Remove duplicate lockfile to avoid warnings
RUN rm -f bun.lock
# Generate Prisma client before building
RUN bunx prisma generate
# Clean any existing build
RUN rm -rf .next
RUN bun run build

# Go back to root
WORKDIR /app

# Install concurrently for process management (much simpler than PM2)
RUN bun add concurrently

# Create startup script with concurrently
RUN echo '#!/bin/bash\n\
  echo "=== Container Debug Info ==="\n\
  echo "Container hostname: $(hostname)"\n\
  echo "Memory info:"\n\
  free -m\n\
  echo "Environment variables (filtered):"\n\
  env | grep -E "(NODE_ENV|PORT|BOT_API_URL|NEXTAUTH)" | sort\n\
  echo "Starting services with concurrently..."\n\
  exec bun run start' > /app/start.sh && chmod +x /app/start.sh

# Expose ports (3000 for dashboard, 3001 for bot API)
EXPOSE 3000 3001

# Add health check for both services
HEALTHCHECK --interval=60s --timeout=15s --start-period=90s --retries=3 \
  CMD (wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1) && \
  (wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1)

# Start both services with concurrently
CMD ["/app/start.sh"]
