# Use official Node.js image based on Debian
FROM node:18-bullseye

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy app source code
COPY . .

# Install Chromium and its dependencies
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
    libglu1-mesa \
 && rm -rf /var/lib/apt/lists/*

# Expose app port (change if needed)
EXPOSE 3000

# Run your app (change this according to your start script)
CMD ["npm", "start"]
