syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1A: Production-only dependencies (kept separate for small final image)
# ==============================================================================
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --ignore-scripts; else npm install --omit=dev --ignore-scripts; fi

# ==============================================================================
# Stage 1B: Full dependencies (includes TypeScript, Tailwind, Prisma CLI)
# ==============================================================================
FROM node:20-alpine AS deps-all
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts; else npm install --ignore-scripts; fi

# ==============================================================================
# Stage 2: Builder (generates Prisma client + compiles Next.js standalone bundle)
# ==============================================================================
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY --from=deps-all /app/node_modules ./node_modules
COPY . .

# Build script runs: prisma generate && next build
RUN npm run build

# ==============================================================================
# Stage 3: Minimal production runner executing as a non-root user
# ==============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create a least-privilege system user/group so the container never runs as root
RUN apk add --no-cache libc6-compat && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy standalone Next.js output and static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
# Include Prisma's generated query engine & schema client produced during Stage 2
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

# Automated container health probe hitting GET /api/health
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) process.exit(1)})"

EXPOSE 3000

CMD ["node", "server.js"]

