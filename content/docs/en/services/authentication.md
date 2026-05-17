---
title: Authentication
description: Auth models per client.
section: Services
module: services
order: 51
---

# Authentication

## Dashboard

NextAuth session (credentials or Google). Requires `AUTH_SECRET` in environment.

## Marketplace

JWT in secure storage after `/api/mobile/auth/login` or OTP verify.

## Driver

JWT after `/api/driver/auth/login`.

## Platform admin

Separate admin JWT cookie for `/admin` routes.