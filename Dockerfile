# ─── Stage 1: Dependencies ───────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files only (layer caching)
COPY package*.json ./
COPY prisma ./prisma/

# Install all deps (including dev for Prisma generate)
RUN npm ci --frozen-lockfile

# Generate Prisma client
RUN npx prisma generate

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodeuser -u 1001

# Copy generated Prisma client and node_modules
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY --chown=nodeuser:nodejs . .

# Remove dev-only files
RUN rm -rf tests .env.example

USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
