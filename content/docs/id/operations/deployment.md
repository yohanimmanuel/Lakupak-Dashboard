---
title: Deployment
description: Docker and production run.
section: Operations
module: operations
order: 60
---

> **Bahasa Indonesia:** Halaman ini menyediakan panduan yang sama dengan versi Inggris. Konten lengkap dalam Bahasa Indonesia akan dilengkapi secara bertahap.

---

# Deployment

See the project **README** for Docker Compose instructions.

## Typical steps

1. Configure environment file (database, `AUTH_SECRET`, Meilisearch, Cloudinary, Mapbox).
2. Build image: `docker compose build`.
3. Run migrations against Postgres.
4. Start services and reverse proxy TLS in production.
5. Run `npm run meili:reindex:marketplace` and `npm run docs:index` after deploy.