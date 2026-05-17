---
title: Search service
description: Meilisearch indexes.
section: Services
module: services
order: 53
---

# Search service

## Marketplace products

Index: `marketplace_products`. Reindex:

```bash
npm run meili:reindex:marketplace
```

## Documentation

Index: `laku_docs`. Reindex after content changes:

```bash
npm run docs:index
```

Requires `MEILI_HOST` and API key in environment.