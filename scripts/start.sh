#!/bin/bash

echo "=== Container Debug Info ==="
echo "Container hostname: $(hostname)"
echo "Memory info:"
free -m
echo "Environment variables (filtered):"
env | grep -E "(NODE_ENV|PORT|BOT_API_URL|NEXTAUTH|DATABASE_URL)" | sort
echo ""

echo "=== Database Setup (Optional) ==="
echo "Dashboard now uses JWT sessions - database is optional"
cd /app/dashboard

# Only attempt database setup if DATABASE_URL is provided
if [ -n "$DATABASE_URL" ]; then
  echo "DATABASE_URL found - attempting database connection..."
  for i in {1..10}; do
    if timeout 5 bunx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1; then
      echo "✅ Database connection established"
      echo "ℹ️  Database is available but not required for dashboard functionality"
      break
    fi
    if [ $i -eq 10 ]; then
      echo "⚠️  Database connection failed after 10 attempts"
      echo "ℹ️  Dashboard will continue without database (JWT sessions only)"
      break
    fi
    echo "Checking database... (attempt $i/10)"
    sleep 1
  done
else
  echo "ℹ️  No DATABASE_URL provided - running with JWT-only sessions"
fi

cd /app
echo "Database setup completed"
echo ""

echo "=== Starting Services ==="
echo "Starting services with concurrently..."
exec bun run start
