---
title: Tasks
description: Task calendar, fleet cards, filters, and navigation to routes.
section: Driver
module: driver
order: 42
---

The **Tasks** tab is your daily schedule of fleet assignments and delivery stops.

Path: `/(tabs)/tasks`.

## Task calendar

- Horizontal calendar: **7 days before today** through **30 days ahead**
- Subtitle: `{count} task(s) · {formatted date}`
- Today is labeled **Today**
- Dot under a date when tasks exist

**Task date** uses `fleet.assignedDate`, else order `preferredDeliveryDate`, else `orderDate`.

## Task cards

Each card represents a fleet group for the selected day:

| Label | Meaning |
|-------|---------|
| **{completed}/{total} stops completed** | Progress on route |
| **No stops** | Empty fleet for that day |
| **Must be completed by: {date}** | Deadline hint |
| Status badge | **In Transit**, **Available**, **Unavailable**, **Checking** |

Shows vehicle, plate, and route summary from fleet data.

Tap a card → **Logistics details** map (`/logisticstasks/logisticsdetails?fleetId=&orderId=` with first order in group).

## Task filters

Open from the header **filter** icon. Badge shows active filter count.

Path: `/logisticstasks/filtermodal`.

| Section | Filters |
|---------|---------|
| **Order Status** | Pending, Confirmed, Packed, Shipped, Delivered, Received, Failed, Cancelled, Returned |
| **Fleets** | Fleet codes |
| **Customers** | Store names |

**Clear all**, **Apply**.

Data loads from `GET /api/driver/fleets` and is cached in the task filter store.

## Empty and error states

| State | Message |
|-------|---------|
| Loading | **Loading tasks…** |
| No tasks | **No tasks for this day** — try another date or clear filters |
| Error | **Could not load tasks. Pull down to retry.** with **Retry** |

## Related documentation

- [Deliveries](/en/docs/driver/deliveries) for map and order actions
- [Driver overview](/en/docs/driver/overview)
