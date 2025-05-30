# Use official Node.js image
FROM node:18-slim

# Install Chromium and required libs
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxss1 \
    libgtk-3-0 \
    libxshmfence1 \
    libglu1-mesa && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package.json pnpm-lock.yaml ./

# Debug: Show pnpm and node versions, and print lockfile before install
RUN npm install -g pnpm \
    && node -v \
    && pnpm -v \
    && echo "==== pnpm-lock.yaml ====" \
    && cat pnpm-lock.yaml \
    && pnpm install --frozen-lockfile || (cat pnpm-debug.log || true)

# Copy the rest of the code
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD ["pnpm", "start"]
