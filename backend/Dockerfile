FROM node:18-slim

WORKDIR /app

# Install system dependencies for canvas and sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy the rest of the application
COPY . .

# Environment variables 
ENV PORT=5000
ENV NODE_ENV=production

# Expose port 5000
EXPOSE 5000

# Start the application
CMD ["npm", "start"] 