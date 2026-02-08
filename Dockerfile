# Multi-stage: build and run in Docker. No need to run npm install or npm run build on the host.
# Prerequisites: Docker, and a .env file (see README).
# Run: docker compose up --build

# -----------------------------------------------------------------------------
# Stage 1: build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# Install all deps (including devDependencies for build)
# npm install tolerates out-of-sync lock file; run `npm install` locally and commit package-lock.json for reproducible builds.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# DIRECT_URL passed at build time via build-arg (e.g. from .env in docker-compose); not stored in this file.
ARG DIRECT_URL
ENV DIRECT_URL=${DIRECT_URL}
RUN npx prisma generate && npm run build

# -----------------------------------------------------------------------------
# Stage 2: run
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Production deps only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

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

# Generate Prisma client into node_modules/.prisma/client (DIRECT_URL from build-arg; runtime uses env_file)
ARG DIRECT_URL
ENV DIRECT_URL=${DIRECT_URL}
RUN npx prisma generate

# Prisma needs DIRECT_URL at runtime for migrate deploy; value from env_file at run time
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
