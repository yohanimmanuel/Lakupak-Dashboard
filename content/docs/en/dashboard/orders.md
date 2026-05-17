---
title: Orders
description: B2B order list, map tracking, fulfillment, archive, and export.
section: Dashboard
module: dashboard
order: 14
---

**Orders Management** is where you track B2B marketplace and manual orders from confirmation through delivery and payment.

Path: **Orders** (`/orders`). Detail pages: `/orders/details/{orderId}`.

## Summary cards

| Card | Meaning |
|------|---------|
| **Total Orders** | Order count with month trend |
| **Total Sales** | Revenue in your account currency |
| **Revenue Collected** | Paid order revenue |
| **Pending Revenue** | Unpaid order totals |
| **Delivery Success** | Share of orders marked Delivered |

## Orders list

### Page actions

| Action | Purpose |
|--------|---------|
| **Refresh** | Reload order data |
| **Archived Orders** | Review and unarchive archived rows |
| **Export Data** | Download orders to XLSX |

### Live delivery map

**Live Delivery Tracking** shows active deliveries on a map with counts for **In Transit**, **Delivered**, and **Pending**. Click a marker to open order details. Empty state: **No active deliveries**.

### Table filters

- **Status tabs:** All, Pending, Confirmed, Packed, Shipped, Delivered, Failed, Cancelled, Returned
- **Search:** order ID, buyer, tracking number
- **Payment:** All, Unpaid, Paid
- **Delivery method:** All Methods, Self Pickup, Seller/Distributor Delivery, Buyer-arranged Courier

**Columns:** Order, Date, Buyer, Status, Total, Items, Delivery, Tracking, Payment, Actions.

**Pagination:** 8 rows per page. Empty: **No orders recorded**.

### Bulk actions

- **Archive Orders** for selected rows
- **Delete Cancelled** (only orders in **Cancelled** status)

## Order details

Open a row or use **Edit** to go to the detail page.

### Status and payment

Update **order status** inline: Pending, Confirmed, Packed, Shipped, Delivered, Failed, Cancelled, Returned.

**Payment status:** Unpaid or Paid.

Offer badges on lines may show **Discount** or **Promotion** (Buy X Get Y).

### Fulfillment fields

**Edit Order** modal includes delivery address, contact, **Delivery Method**, tracking number, and proof of delivery (POD) when status is **Delivered**, **Received**, or **Returned**.

**Delivery methods:**

- Self Pickup
- Seller/Distributor Delivery
- Buyer-arranged Courier

Map fullscreen is available for route context where configured.

### Buyer link

Buyer name links to **Clients → Buyers** profile, or a deleted-buyer reference page if the buyer was removed.

## Archive and export

**Archived Orders** modal lists archived IDs with **View**, **Unarchive**, and **Close**.

**Export** includes Order ID, Buyer, Order Date, Status, Payment Status, Items, Total Amount, Delivery Method, and Tracking Number.

There is no order import from this screen.

## Related areas

| Goal | Go to |
|------|--------|
| Buyer profiles | [Clients](/en/docs/dashboard/clients) |
| Promotions on lines | [Offers](/en/docs/dashboard/offers) |
| Fleet assignment | [Logistics](/en/docs/dashboard/logistics) |
| Revenue reports | [Analytics](/en/docs/dashboard/analytics) |
