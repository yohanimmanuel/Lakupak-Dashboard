---
title: Architecture
description: Three client apps and one shared backend.
section: Overview
module: overview
order: 2
---

# Architecture

All three Laku applications share a single backend hosted in **Laku-Dashboard** (Next.js).

## Components

1. **Laku-Dashboard** — Next.js App Router, GraphQL + REST APIs, Prisma/PostgreSQL, WebSocket server.
2. **Laku-Marketplace** — Expo/React Native buyer app.
3. **Laku-Driver** — Expo/React Native driver app.

## Data flow

- Distributors manage master data (products, offers, fleets) in the Dashboard.
- Buyers place orders via Marketplace; orders appear in Dashboard **Orders**.
- Drivers receive fleet assignments in the Driver app; status updates sync back to orders.

## Integrations

- **Meilisearch** — marketplace product search and documentation search.
- **Cloudinary** — image and document uploads.
- **Mapbox** — maps and geocoding.
- **WebSockets** — realtime product, order, and notification updates.