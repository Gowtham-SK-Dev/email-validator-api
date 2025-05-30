# Use official Node.js image
FROM node:18-slim

# Install necessary dependencies for Puppeteer Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy and install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# Copy the rest of the app
COPY . .

# Set environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Build the project
RUN pnpm build

# Expose port
EXPOSE 3000

# Run the app
CMD ["pnpm", "start"]
