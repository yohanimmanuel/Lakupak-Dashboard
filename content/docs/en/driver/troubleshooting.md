---
title: Troubleshooting
description: Connectivity, login, maps, permissions, and common fixes.
section: Driver
module: driver
order: 45
---

Quick fixes for common Laku Driver issues.

## Connectivity and loading

| Symptom | Message | What to try |
|---------|---------|-------------|
| Home fleets empty | **Could not load deliveries. Pull down to retry.** | Pull to refresh; check Wi‑Fi or mobile data; confirm API URL |
| Tasks empty | **Could not load tasks. Pull down to retry.** | Same; tap **Retry** |
| Status not saving | **Update failed** — Try again | Check connection; wait for offline queue to sync |
| General issues | Help → FAQ | Update app; email **support@laku.com** |

Confirm with your distributor that you are on the correct Laku environment for your company.

## Login problems

| Issue | Message / fix |
|-------|----------------|
| Wrong password | **Invalid Credentials** |
| Too many tries | **Too many attempts** — wait ~15 minutes |
| No account | Use **Request access** or ask your distributor |
| Session expired mid-route | Log in again; pending outbox syncs after reconnect |

Remember: **Register** on welcome is **request access**, not instant signup.

## Permissions

| Permission | Used for | If denied |
|------------|----------|-----------|
| **Location** | Map + live tracking | Enable in system Settings; map overlay warning |
| **Camera** | POD, failure photos, avatar | **Permission required** alert |
| **Notifications** | Push alerts | In-app WebSocket list may still work |

## Maps

| Issue | Fix |
|-------|-----|
| Blank map in Expo Go | Use **development build** or production app |
| Map not loading | Use the production or development build from your distributor; maps may not work in preview apps |
| No driver dot | Grant location; wait a few seconds for GPS fix |

## Notifications

| Issue | Behavior |
|-------|----------|
| Order removed from fleet | **Order not found** — no longer assigned |
| No banners | Turn on **Delivery alerts** in Settings |
| Duplicate alerts | App deduplicates within ~8 seconds |

## Account actions

| Action | Result |
|--------|--------|
| **Log Out** | Confirm → welcome screen |
| **Delete Account** | Contact distributor (no in-app delete) |
| Change password | Managed by distributor (not in Driver app) |

## Offline delivery updates

If you complete a delivery without signal, the app may queue the status locally. Stay logged in and reopen the app on connectivity so the outbox can flush.

## Related documentation

- [Login and access](/en/docs/driver/login-access)
- [Location and realtime](/en/docs/driver/location-realtime)
- [Account settings](/en/docs/driver/overview) (Settings under Account tab)
- [Help and support](/en/docs/platform/help-and-support)
