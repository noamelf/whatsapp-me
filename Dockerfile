FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Create directory for session data
RUN mkdir -p /app/.baileys_auth

# Run the bot
CMD ["node", "dist/index.js"]
