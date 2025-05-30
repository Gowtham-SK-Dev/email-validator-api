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

# Fix: Ensure pnpm-lock.yaml exists before install, and add troubleshooting for pnpm install errors
RUN if [ ! -f pnpm-lock.yaml ]; then echo '{}' > pnpm-lock.yaml; fi \
    && npm install -g pnpm \
    && pnpm install --frozen-lockfile || (cat pnpm-debug.log || true)

# Copy the rest of the code
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD ["pnpm", "start"]
