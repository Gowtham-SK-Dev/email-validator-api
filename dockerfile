# Use official lightweight Node.js image
FROM node:18-slim

# Install Chromium and required dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
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
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy only dependency files first for optimized Docker caching
COPY package.json pnpm-lock.yaml ./

# Install specific version of PNPM (match your local version if possible)
RUN npm install -g pnpm@8.15.4

# Install dependencies using lockfile (modify if lockfile is causing issues)
RUN pnpm install --frozen-lockfile || (cat pnpm-debug.log || true)

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]
