#!/bin/bash
# Production build and deploy script for Heimdall

set -e  # Exit on error

echo "🔨 Building Heimdall for production..."
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "   Create .env with your production configuration before starting."
    echo ""
fi

# Step 1: Build TypeScript
echo "📦 Step 1/3: Compiling TypeScript..."
npm run build

# Step 2: Build Next.js Dashboard
echo "📦 Step 2/3: Building Next.js dashboard..."
npm run build:dashboard

# Step 3: Report success
echo "📦 Step 3/3: Build complete!"
echo ""
echo "✅ Production build successful!"
echo ""
echo "To start the application:"
echo "  npm run start:prod"
echo ""
echo "Or with PM2 (recommended for production):"
echo "  pm2 start npm --name heimdall -- run start:prod"
echo "  pm2 save"
echo ""
