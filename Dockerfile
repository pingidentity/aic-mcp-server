# syntax=docker/dockerfile:1

# ============================================================================
# Stage 1: Builder - Compile TypeScript
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install ALL dependencies (including devDependencies for TypeScript build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript to JavaScript
RUN npm run build

# Remove devDependencies to reduce size
RUN npm prune --production

# ============================================================================
# Stage 2: Runtime - Minimal production image
# ============================================================================
FROM node:20-alpine

WORKDIR /app

# Copy compiled application from builder
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Create tokens directory
# Tokens are deleted when container stops
RUN mkdir -p /app/tokens && \
    chown node:node /app/tokens

# Set environment variables
# DOCKER_CONTAINER=true triggers container mode
ENV DOCKER_CONTAINER=true \
    NODE_ENV=production

USER node

ENTRYPOINT ["node", "dist/index.js"]