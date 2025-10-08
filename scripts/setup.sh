#!/bin/bash

# Biagram Development Setup Script

echo "🚀 Setting up Biagram development environment..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install pnpm first:"
    echo "npm install -g pnpm"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build shared packages
echo "🔨 Building shared packages..."
pnpm run build --filter=@biagram/shared
pnpm run build --filter=@biagram/dbml-parser
pnpm run build --filter=@biagram/diagram-engine

# Check if .env file exists in web app
if [ ! -f "apps/web/.env.local" ]; then
    echo "⚙️ Creating .env.local from example..."
    cp apps/web/.env.example apps/web/.env.local
    echo "📝 Please update apps/web/.env.local with your actual values"
fi

echo "✅ Setup complete!"
echo ""
echo "🏃‍♂️ To start development:"
echo "  pnpm dev"
echo ""
echo "🗄️ To set up the database:"
echo "  1. Create a PostgreSQL database"
echo "  2. Update DATABASE_URL in apps/web/.env.local"
echo "  3. Run: pnpm db:generate && pnpm db:migrate"
echo ""
echo "📖 For more information, see the README.md"