---
title: Realtime
description: WebSocket server.
section: Services
module: services
order: 52
---

> **Bahasa Indonesia:** Halaman ini menyediakan panduan yang sama dengan versi Inggris. Konten lengkap dalam Bahasa Indonesia akan dilengkapi secara bertahap.

---

# Realtime

Run the WebSocket server alongside Next.js:

```bash
npm run dev:all
```

Clients connect for product, order, offer, and fleet events. Issue short-lived tokens via `/api/auth/ws-token` (dashboard) or mobile equivalent.