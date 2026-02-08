# Multi-stage: build and run in Docker. No need to run npm install or npm run build on the host.
# Prerequisites: Docker, and a .env file (see README).
# Run: docker compose up --build
# Prisma: schema uses prisma-client-js; generate creates node_modules/.prisma/client for @prisma/client at runtime.

# -----------------------------------------------------------------------------
# Stage 1: build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# Install all deps (including devDependencies for build)
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# DIRECT_URL at build time (e.g. from docker-compose build args); required for prisma generate.
ARG DIRECT_URL
ENV DIRECT_URL=${DIRECT_URL}
# NEXT_PUBLIC_* are inlined at build time; pass Mapbox token so the client bundle has it (optional but required for map).
ARG NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
ENV NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=${NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
# AUTH_SECRET only at runtime (env_file). NextAuth route lazy-loads so build does not need it.
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

# Production deps only; install prisma CLI (devDep) at same version as @prisma/client to avoid CLI/client mismatch
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm install prisma@7.3.0 --no-save --ignore-scripts && npm cache clean --force

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

# Generate Prisma client (prisma-client-js) into node_modules/.prisma/client
ARG DIRECT_URL
RUN npx prisma generate

# Prisma needs DIRECT_URL at runtime for migrate deploy; value from env_file at run time
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
