---
title: Realtime
description: WebSocket server.
section: Services
module: services
order: 52
---

# Realtime

Run the WebSocket server alongside Next.js:

```bash
npm run dev:all
```

Clients connect for product, order, offer, and fleet events. Issue short-lived tokens via `/api/auth/ws-token` (dashboard) or mobile equivalent.