---
title: Health and troubleshooting
description: Build and runtime issues.
section: Operations
module: operations
order: 65
---

> **Bahasa Indonesia:** Halaman ini menyediakan panduan yang sama dengan versi Inggris. Konten lengkap dalam Bahasa Indonesia akan dilengkapi secara bertahap.

---

# Health and troubleshooting

## Build fails on AUTH_SECRET

API routes must not import auth-options at module top level during next build. Use dynamic import in route handlers.

## WebSocket not connecting

Ensure npm run ws is running and firewall allows the WS port.

## Meilisearch empty results

Verify MEILI_HOST, run reindex scripts, and check index names marketplace_products and laku_docs.

## Docs search empty

Run npm run docs:index after adding markdown under content/docs.