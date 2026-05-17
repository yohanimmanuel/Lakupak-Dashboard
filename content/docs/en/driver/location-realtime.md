---
title: Location and realtime
description: GPS and WebSocket events.
section: Driver
module: driver
order: 44
---

# Location and realtime

## GPS sync

While logged in, the app periodically sends location to `POST /api/driver/location` for live tracking in the Dashboard.

## WebSocket

Connects to the shared marketplace WebSocket for `order_updated`, `fleet_assigned`, and announcement events.