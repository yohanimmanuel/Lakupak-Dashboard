---
title: Database
description: Prisma migrations.
section: Operations
module: operations
order: 62
---

> **Bahasa Indonesia:** Halaman ini menyediakan panduan yang sama dengan versi Inggris. Konten lengkap dalam Bahasa Indonesia akan dilengkapi secara bertahap.

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