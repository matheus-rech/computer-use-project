#!/bin/bash

# Claude Workspace Quick Start Script
# This script automates the setup process

set -e  # Exit on error

echo "🚀 Claude Workspace Quick Start"
echo "================================"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "   Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required (you have v$NODE_VERSION)"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "   Please install Docker Desktop from https://www.docker.com/products/docker-desktop"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker is not running"
    echo "   Please start Docker Desktop and try again"
    exit 1
fi
echo "✅ Docker $(docker --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi
echo "✅ npm $(npm -v)"

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "⚙️  Setting up environment..."

if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env and add your Anthropic API key!"
    echo "   Get your API key from: https://console.anthropic.com/"
    echo ""
    read -p "Press Enter to open .env in your default editor..."
    open -e .env
    echo ""
    read -p "Press Enter after you've saved your API key..."
else
    echo "✅ .env already exists"
fi

echo ""
echo "🐳 Building Docker image..."
echo "   This may take 5-10 minutes on first run..."

cd docker
docker build -t claude-workspace:latest . --quiet
cd ..

echo "✅ Docker image built successfully"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start Claude Workspace:"
echo "  npm run dev      # Development mode with hot reload"
echo "  npm start        # Production mode"
echo "  npm run package  # Build Mac application"
echo ""
echo "For detailed usage instructions, see SETUP.md"
echo ""
echo "Happy coding with Claude! 🚀"
