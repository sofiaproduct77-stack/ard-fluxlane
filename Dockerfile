# Lightweight production image for the CODD app
FROM node:18-alpine AS base

WORKDIR /usr/src/app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy app sources
COPY . .

# Ensure runtime dirs exist
RUN mkdir -p uploads && \
    touch database.sqlite

# Environment
ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

# Start the server
CMD ["node", "server.js"]


