---
title: Location and realtime
description: GPS, location sync, WebSocket, and push alerts.
section: Driver
module: driver
order: 44
---

Lakupak Driver shares your position while on duty and receives live order and fleet updates.

## GPS on device

The app requests **foreground location** permission.

- High-accuracy initial fix, then updates about every **3 seconds** or **5 meters** of movement
- Used for the map driver marker, heading, and speed

If permission is denied, the map shows **Location permission denied — enable it in Settings…** and server sync stops.

## Location sync to server

While logged in, the app posts location to the API:

- `POST /api/driver/location` with `{ lat, lng }` about every **10 seconds**
- Buyers and distributors can see live driver position on logistics maps in Marketplace and Dashboard

Errors during sync are ignored so driving is not interrupted.

## WebSocket updates

When authenticated, the app maintains a live connection to Lakupak so order and fleet updates arrive without manual refresh.

| Message | Effect |
|---------|--------|
| `order_updated` | Refresh fleets; optional OS notification |
| `fleet_assigned` | Refresh tasks; **New fleet assigned** style alert |
| `app_update` | Platform update notice |

Ping keeps the connection alive; automatic reconnect (up to 5 attempts).

### Example push titles

- **New Delivery Ready** (Packed)
- **Delivery In Progress** (Shipped)
- **Delivery Confirmed** (Delivered)
- **Order Cancelled**, **Delivery Failed**

**Delivery alerts** in Settings controls foreground banners and WebSocket-driven notifications.

## Push notifications

- Expo push token registered on login
- Token and language preference saved for the driver profile
- Tap opens the relevant order or task when configured

## Offline status queue

If the network fails during **Start Delivery** or **Complete Delivery**, updates may be queued in local storage (**outbox**) and retried when back online while you remain logged in.

## Session telemetry

Foreground usage may send session samples about every **60 seconds** to `POST /api/driver/telemetry/session` for reliability monitoring.

## Related documentation

- [Deliveries](/en/docs/driver/deliveries)
- [Troubleshooting](/en/docs/driver/troubleshooting)
- Marketplace: [Orders](/en/docs/marketplace/orders) for buyer tracking
