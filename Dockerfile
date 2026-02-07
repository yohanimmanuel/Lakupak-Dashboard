# Single-stage: run the app using a build produced on the host.
# Build on the host first:  npm run build
# Then:  docker compose up --build

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev && npm cache clean --force

# Pre-built output and app (must run `npm run build` on host first so .next and src/generated exist)
COPY . .

# Prisma config requires DIRECT_URL; dummy value for generate (does not connect)
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
