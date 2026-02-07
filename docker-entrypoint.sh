#!/bin/sh
set -e
# Wait for Postgres to be ready (handled by depends_on + healthcheck)
# Run migrations
npx prisma migrate deploy
exec "$@"
