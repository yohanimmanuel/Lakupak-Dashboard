#!/bin/sh
set -e
# Run migrations
npx prisma migrate deploy
# Start WebSocket server in background (port 3001) so real-time notifications work
npx tsx src/server/websocket.ts &
exec "$@"
