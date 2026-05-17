---
title: Database
description: Prisma migrations.
section: Operations
module: operations
order: 62
---

# Database

Schema is managed with **Prisma**. Apply migrations:

```bash
npx prisma migrate deploy
```

Generate client after schema changes:

```bash
npx prisma generate
```