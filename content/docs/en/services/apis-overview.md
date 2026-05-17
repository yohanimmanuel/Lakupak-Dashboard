---
title: APIs overview
description: GraphQL and REST surfaces.
section: Services
module: services
order: 50
---

# APIs overview

Laku-Dashboard exposes:

## GraphQL — `/api/graphql`

Primary API for Dashboard UI and Marketplace (products, orders, contacts, offers, marketplace cart, logistics, etc.).

## REST namespaces

| Prefix | Used by |
|--------|--------|
| `/api/auth/*` | Dashboard NextAuth |
| `/api/mobile/*` | Marketplace app |
| `/api/driver/*` | Driver app |
| `/api/platform-admin/*` | Platform admin UI |
| `/api/marketplace/*` | Marketplace metrics and updates |
| `/api/docs/search` | Documentation search |