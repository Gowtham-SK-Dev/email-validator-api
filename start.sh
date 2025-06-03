#!/bin/bash
# Startup script for cPanel or VPS hosting

echo "🚀 Starting Email Validator API..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the project
echo "🔨 Building project..."
npm run build

# Start the server
echo "▶️ Starting server..."
npm start
