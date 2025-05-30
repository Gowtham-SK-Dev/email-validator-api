FROM node:18

# Install packages (e.g., apt-get update and install)
RUN apt-get update && apt-get install -y curl

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy rest of the code
COPY . .

# Expose port and start app
EXPOSE 3000
CMD ["npm", "start"]
