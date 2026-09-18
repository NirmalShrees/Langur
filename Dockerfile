# Production Node.js environment for Fly.io / Container deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci || npm install

# Copy application source code
COPY . .

# Build Vite frontend and bundled Express server (dist/server.cjs)
RUN npm run build

# Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package definitions and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production || npm install --production

# Copy compiled assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/public ./public

# Expose container port
EXPOSE 3000

# Start compiled server
CMD ["node", "dist/server.cjs"]
