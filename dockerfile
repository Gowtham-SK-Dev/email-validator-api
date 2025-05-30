# # Use official Node.js image
# FROM node:18-slim

# # Install Chromium and required libs
# RUN apt-get update && \
#     apt-get install -y --no-install-recommends \
#     chromium \
#     libnss3 \
#     libatk1.0-0 \
#     libatk-bridge2.0-0 \
#     libcups2 \
#     libgbm1 \
#     libasound2 \
#     libpangocairo-1.0-0 \
#     libxss1 \
#     libgtk-3-0 \
#     libxshmfence1 \
#     libglu1-mesa && \
#     apt-get clean && \
#     rm -rf /var/lib/apt/lists/*

# # Set working directory
# WORKDIR /app

# # Copy dependency files
# COPY package.json pnpm-lock.yaml ./

# # Install pnpm and dependencies
# RUN npm install -g pnpm && pnpm install --frozen-lockfile

# # Copy the rest of the code
# COPY . .

# # Expose port
# EXPOSE 3000

# # Start the app
# CMD ["pnpm", "start"]
