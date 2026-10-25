---
title: Orders
description: B2B order list, per-retailer pricing, buyer price safety, fulfillment, and export.
section: Dashboard
module: dashboard
order: 14
---

**Orders Management** is where you track B2B and manual orders from confirmation through delivery and payment. Order lines are also the evidence base for assortment penetration: which products already reach which retailers, and where gaps remain.

Path: **Orders** (`/orders`). Detail pages: `/orders/details/{orderId}`.

On create or edit, **Customer Information** includes a client search (search by store or owner) so you can attach the correct retailer quickly.

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

### Price on the purchase order

Each line keeps the catalog base price from checkout. A later catalog change does not rewrite that order.

The client rate (percentage, fixed amount, or Buy X Get Y) is calculated for that retailer on the purchase order. You see it on the detail page. The buyer does not, until you release it.

**Buyer safety price**

- Product cards in Marketplace always show the catalog base price.
- After the buyer submits, their order still shows that base price. An existing relationship does not reveal the client discount or free quantity.
- **Send pricing to buyer** writes the purchase-order price, shows the discount and any free quantity, and notifies the buyer. **Send pricing update** does the same after you change a line. Every line needs a price before you can send.
- If a line has no price yet, the total shows **Pending price**. A zero line total is a real fully discounted line only after pricing has been sent.
- Company setting **Show discounted price when buyers submit a PO** (Settings → Distributor Operations) is the exception. When it is on, the buyer sees the client rate as soon as they submit. When it is off, they stay on the catalog base price until you send pricing.

Offer badges on lines may show **Discount** or **Promotion** (Buy X Get Y). Free quantity is counted **Before MOQ** or **After MOQ**, using the rule saved on the rate. **After MOQ** gives no free quantity when the ordered quantity equals the product minimum.

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
| Client rates | [Offers](/en/docs/dashboard/offers) |
| Buyer price toggle | [Settings](/en/docs/dashboard/settings) |
| Buyer Marketplace | [Marketplace overview](/en/docs/marketplace/overview) |
