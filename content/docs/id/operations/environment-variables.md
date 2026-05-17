---
title: Environment variables
description: Required configuration.
section: Operations
module: operations
order: 61
---

> **Bahasa Indonesia:** Halaman ini menyediakan panduan yang sama dengan versi Inggris. Konten lengkap dalam Bahasa Indonesia akan dilengkapi secara bertahap.

---

# Environment variables

| Variable | Purpose |
|----------|--------|
| `DATABASE_URL` / `DIRECT_URL` | Postgres (Prisma) |
| `AUTH_SECRET` | NextAuth signing |
| `MEILI_HOST`, `MEILI_MASTER_KEY` | Meilisearch |
| Cloudinary vars | Uploads |
| `MAPBOX_ACCESS_TOKEN` | Maps |

Never commit secrets to git; use `.env` locally and secure injection in production.