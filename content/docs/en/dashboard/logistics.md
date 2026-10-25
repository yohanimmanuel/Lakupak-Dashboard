---
title: Logistics
description: Fleets, drivers, routes, and delivery tracking on the map.
section: Dashboard
module: dashboard
order: 19
---

**Logistics Management** helps you run fleets, assign drivers, attach orders to trips, and track deliveries on a map.

Paths: `/logistics`, `/logistics/create`, `/logistics/details?id={fleetId}`, `/logistics/details/edit?id={fleetId}`.

## Logistics overview (`/logistics`)

**Title:** Logistics Management

| Action | Purpose |
|--------|---------|
| **Refresh** | Reload fleet and driver data |
| **Export Data** | XLSX of fleets (Fleet ID, Fleet Code, Route, Status, Delivery Type, ETA, and related fields) |
| **Add Fleet & Driver** | Create a fleet at `/logistics/create` |

Layout: **fleet / driver list** on the left, **details** panel on the right (including a route map).

## Active Fleets and Drivers tabs

**Tabs:** **Active Fleets** | **Drivers**

### Active Fleets

**Search:** **Search for shipments**

**Status filter:** All statuses | Available | Unavailable | In Transit | Checking

**Type filter:** All types, plus delivery types from your distributor shipping preferences (for example Standard Shipping, Express Shipping, Same-day Delivery, Next-day Delivery, Scheduled Delivery, Pickup Available).

**Bulk:** select fleets, **Remove**; per-row delete.

### Drivers

**Search:** **Search drivers by name, username or phone**

**Bulk:** select drivers, **Remove**.

## Fleet details panel

Select a fleet to preview:

- **Open Details** → `/logistics/details?id=…`
- Summary of trip, vehicle, driver, and customers
- **Logistics route map** (Mapbox) with stops from order addresses and live driver position when the driver app syncs GPS

Full detail page tabs include order details, vehicle, driver information, and customer information. **Full screen map** expands the route view.

## Create and edit fleet

Wizard tabs:

1. **Basic Info** — route, status, ETA
2. **Vehicle** — vehicle type and load
3. **Driver** — assigned driver
4. **Order Selection** — attach orders to the trip

**Back to Fleet List**, then **Create Fleet** / **Save Changes** through the **Trip Summary** modal. Validation prompts you to **Complete required fields** when data is missing.

Edit via `/logistics/details/edit?id=…` or **Edit details** on the full detail page.

## Driver access

Drivers are created by the distributor (not self-signup for production). They sign in to the **Lakupak Driver** mobile app with credentials you issue. Fleet and stop updates from the driver app appear on the logistics map when location sync is active.

## Related areas

| Goal | Go to |
|------|--------|
| Order addresses and status | [Orders](/en/docs/dashboard/orders) |
| Shipping options | [Settings](/en/docs/dashboard/settings) |
