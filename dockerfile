# Use official Node.js image
FROM node:18

# Install pnpm globally
RUN npm install -g pnpm@8.6.1

# Set working directory
WORKDIR /app

# Copy dependency files first to leverage Docker cache
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the code
COPY . .

# Expose the port your app uses
EXPOSE 3000

# Start the app
CMD ["pnpm", "start"]
