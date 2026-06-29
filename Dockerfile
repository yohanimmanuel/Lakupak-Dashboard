# Multi-stage: build and run in Docker. No need to run npm install or npm run build on the host.
# Prerequisites: Docker, and a .env file (see README).
# Run: docker compose up --build
# Prisma: schema uses prisma-client-js; generate creates node_modules/.prisma/client for @prisma/client at runtime.

# -----------------------------------------------------------------------------
# Stage 1: build
# Use node:20-alpine (pull latest before build to reduce base-image CVEs).
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Next.js expects NODE_ENV to be one of: production | development | test.
# The builder stage runs `next build`, so keep this as production to avoid
# non-standard NODE_ENV warnings and ensure consistent optimizations.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install all deps (including devDependencies for build)
COPY package.json package-lock.json* ./
# With NODE_ENV=production, npm may omit devDependencies by default.
# We need devDependencies (Tailwind/PostCSS, TS tooling) to run `next build`.
RUN npm install --include=dev

COPY . .

# No URLs or tokens in Dockerfile. Prisma generate uses a fallback in prisma.config.ts when DIRECT_URL is unset.
# Mapbox token is served at runtime via /api/mapbox-token (env MAPBOX_ACCESS_TOKEN in env_file).
RUN npx prisma generate && npm run build

# -----------------------------------------------------------------------------
# Stage 2: run (same base as builder for consistency)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Production deps only; install prisma CLI (devDep) at same version as @prisma/client to avoid CLI/client mismatch; tsx to run WebSocket server
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm install prisma@7.3.0 tsx --no-save --ignore-scripts && npm cache clean --force

# Copy built app and runtime assets from builder
COPY --from=builder /app/.next          ./.next
COPY --from=builder /app/public        ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/middleware.ts  ./middleware.ts
COPY --from=builder /app/next-env.d.ts  ./next-env.d.ts
COPY --from=builder /app/tsconfig.json  ./tsconfig.json
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder /app/prisma.config.ts  ./prisma.config.ts
COPY --from=builder /app/prisma        ./prisma
# Documentation markdown (read at runtime by src/lib/docs/load.ts)
COPY --from=builder /app/content/docs  ./content/docs
# WebSocket server and its dependencies (standalone process on port 3001)
COPY --from=builder /app/src           ./src

# Generate Prisma client (DIRECT_URL not needed here; fallback in prisma.config.ts. Real DIRECT_URL from env_file at runtime for migrate deploy.)
RUN npx prisma generate
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
