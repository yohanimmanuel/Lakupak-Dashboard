#!/bin/sh
set -e
# Run migrations
npx prisma migrate deploy

# Index documentation into Meilisearch when configured (filesystem search still works without it)
if [ -n "$MEILI_HOST" ] && [ -d content/docs ]; then
  echo "Indexing documentation into Meilisearch..."
  npx tsx src/scripts/meiliIndexDocs.ts || echo "Warning: docs:index skipped (Meilisearch unavailable)"
fi

# Start WebSocket server in background (port 3001) so real-time notifications work
npx tsx src/server/websocket.ts &
exec "$@"
