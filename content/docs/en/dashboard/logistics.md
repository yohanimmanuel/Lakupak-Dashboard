---
title: Logistics
description: Fleets, drivers, routes, and delivery tracking.
section: Dashboard
module: dashboard
order: 19
---

**Logistics Management** helps you run fleets, assign drivers, attach orders to trips, and track deliveries on a map.

Paths: `/logistics`, `/logistics/create`, `/logistics/details?id={fleetId}`, `/logistics/details/edit?id={fleetId}`.

## Logistics overview

**Subtitle:** Monitor fleets, deliveries, and logistics performance across your distribution network.

| Action | Purpose |
|--------|---------|
| **Refresh** | Reload fleet and driver data |
| **Export Data** | XLSX: Fleet ID, Fleet Code, Route, Status, Delivery Type, ETA, and related fields |
| **Add Fleet & Driver** | Create a new fleet (`/logistics/create`) |

The page splits into a **fleet list** (left) and **fleet details** panel (right).

## Fleet list

### Fleet tab filters

**Tabs:** **Active Fleets**, **Drivers** (with count).

**Search:** **Search for shipments**

**Status:** All statuses, Available, Unavailable, In Transit, Checking

**Type:** All types plus delivery types from your distributor settings (Standard Shipping, Express Shipping, Same-day Delivery, Next-day Delivery, Scheduled Delivery, Pickup Available, and others).

**Bulk:** select all, **Remove** fleets, per-row **Delete fleet**.

### Drivers tab

**Search:** **Search drivers by name, username or phone**

**Bulk:** select all, **Remove** drivers.

## Fleet details panel

Select a fleet to see:

- **Open Details** → full page `/logistics/details?id=…`
- Tabs: **Order details**, **Vehicle**, **Driver information**, **Customer information**
- **Delivery route · {fleet code}** map with **Full screen map**

Order details include assigned date, estimated completion, deliveries completed, total orders, and assigned logistics.

## Create and edit fleet

Wizard tabs on create/edit:

1. **Basic Info** — route, status, ETA
2. **Vehicle** — truck type and load
3. **Driver** — assigned driver
4. **Order Selection** — attach orders to the trip

**Back to Fleet List**, **Create Fleet** or **Save Changes** via **Trip Summary** modal.

Validation: **Complete required fields** when data is missing.

## Full fleet detail page

**Trip Summary**, **Driver**, **Vehicle**, **Logistics Details**, route map, and customers.

**Back to fleet list**, **Edit details** for changes.

## Driver mobile app

Drivers are created by the distributor (not self-signup). They sign in to the **Lakupak Driver** app with credentials you provide.

## Related areas

| Goal | Go to |
|------|--------|
| Order addresses and status | [Orders](/en/docs/dashboard/orders) |
| Shipping options | [Settings](/en/docs/dashboard/settings) |
| Home logistics widget | [Home](/en/docs/dashboard/home) |
