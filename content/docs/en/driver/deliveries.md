---
title: Deliveries
description: Home overview, map routes, order actions, POD, and failure reports.
section: Driver
module: driver
order: 43
---

Execute deliveries from **Home**, the route **map**, and **Order Details** screens.

## Home overview

Path: `/(tabs)/home`.

| Section | Content |
|---------|---------|
| Greeting | **Hi, {name}** |
| Subtitle | **Your assigned deliveries will appear here.** |
| Stats | **Active**, **Orders**, **Delivered** |
| **Latest Orders This Week** | Up to 3 recent orders; **View more** → Tasks |
| **My Assigned Fleets** | Fleet cards; **View** → fleet details |

Tap an order → **Order Details**. Fleet status badges: **In Transit**, **Available**, **Unavailable**, **Checking**.

Load error: **Could not load deliveries. Pull down to retry.**

## Fleet details

Path: `/logisticstasks/fleetdetails?fleetId=`.

**Fleet Details** (read-only): vehicle specs, **Current load**, **Route** (start/destination), **Fleet summary** (deliveries completed, orders in fleet).

## Route map

Path: `/logisticstasks/logisticsdetails?fleetId=&orderId=`.

Full-screen **Mapbox** map (requires dev build or production; limited in Expo Go).

| Feature | Behavior |
|---------|----------|
| Driver marker | Live GPS |
| Route line | Directions between stops |
| Stop pins | Numbered; completed stops show ✓ |
| Bottom sheet | Store, address, dates |
| **Route details** | **{done} / {total} deliveries done** |
| Per stop | **Check** → order details |
| Fleet status | Tap bar to set **Available**, **Unavailable**, **Checking**, **In Transit** (`PATCH` fleet) |

Map fallbacks include permission denied and missing Mapbox token messages.

## Order details

Path: `/logisticstasks/orderdetails?fleetId=&orderId=`.

Shows store, contact, phone, address, dates, **Items in this order**, and status badge.

### Delivery actions by status

| Order status | UI | Driver action |
|--------------|-----|----------------|
| **Packed** | **Report failure** + **Start Delivery** | → **Shipped** |
| **Shipped** | **Report failure** + **Complete Delivery** | POD → **Delivered** |
| **Delivered** / **Received** | **Delivery Completed** | Read-only |
| **Failed** | **Delivery Failed** | Read-only |
| **Cancelled** | **Order Cancelled** | Read-only |
| **Returned** | **Order Returned** | Read-only |
| Other (e.g. Pending) | **Awaiting preparation** | No actions |

Status updates call the dashboard order API with optimistic local refresh.

### Proof of delivery (POD)

Modal:

- **Proof of Delivery**
- **Attach a photo confirming the delivery was completed.**
- **Take Photo** / **Choose from Library**, **Replace**
- **Cancel** / **Complete Delivery**

Success: **Delivery completed!** — **Proof of delivery has been submitted.**

Photo uploads through Cloudinary with the status update.

## Report delivery failure

Path: `/logisticstasks/reportfailure?fleetId=&orderId=`.

**Report delivery failure** — distributor is notified.

| Element | Detail |
|---------|--------|
| **Why did the delivery fail?** | Reason list (required) |
| **Photo evidence (max 3)** | At least one photo |
| Submit | **Order failed** |

**Reasons:** Customer unavailable, Incorrect address, Customer refused delivery, Vehicle breakdown, Access blocked, Goods damaged in transit, **Other reason** (free text).

**Camera** / **Gallery** (max 3 photos). Sets order to **Failed**.

Success: **Reported** — **Order marked as delivery failed.**

## Related documentation

- [Tasks](/en/docs/driver/tasks)
- [Location and realtime](/en/docs/driver/location-realtime)
- Dashboard: [Orders](/en/docs/dashboard/orders), [Logistics](/en/docs/dashboard/logistics)
