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

Each line keeps the price from checkout. A later catalog or segment-price change does not rewrite that order.

At checkout, the line starts from the buyer’s market segment price: the variant price for their **main channel**. When they have no main channel, or that channel has no segment price, the line uses the variant’s default selling price. Sub-channel and outlet specifics do not pick a different price.

The client rate (percentage, fixed amount, or Buy X Get Y) is calculated for that retailer on the purchase order, on top of that starting price. You see it on the detail page. The buyer does not, until you release it.

**Buyer safety price**

- **Send pricing to buyer** writes the purchase-order price, shows the discount and any free quantity, and notifies the buyer. **Send pricing update** does the same after you change a line. Every line needs a price before you can send.
- If a line has no price yet, the total shows **Pending price**. A zero line total is a real fully discounted line only after pricing has been sent.
- Company setting **Show discounted price when buyers submit a PO** (Settings → Distributor Operations) is the exception. When it is on, the buyer sees the client rate as soon as they submit. When it is off, they stay on the segment or default price until you send pricing.

### How a buyer purchases at a segment price

1. The buyer registers in Marketplace. Their main channel stays blank, so cards use the default selling price, until you set the channel and approve access.
2. You set **Business type (main channel)** on the buyer. Marketplace updates that buyer’s catalog prices.
3. The buyer opens a published product. The variant shows the segment price for that main channel, or the default selling price when the channel has none.
4. The buyer adds the variant to the cart and places the order. The line stores the price from that moment.
5. A private client rate, when one exists, stays hidden until **Send pricing to buyer**, unless **Show discounted price when buyers submit a PO** is on.

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

## CRUD actions and system results

| Action | System result |
|---|---|
| Create manual order / receive marketplace PO | Associates a buyer and product variant lines; captures order-time product, variant, quantity and price details. |
| Edit order | Updates permitted lines, delivery/contact details, tracking and status; inventory-affecting changes must reconcile against the linked variant, not a matching name alone. |
| Change status / payment | Updates fulfillment or payment reporting; delivery and payment are distinct statuses. |
| Send pricing / update | Releases the private client rate and free quantities to the buyer and sends a notification. Until then the buyer stays on the segment or default price, unless the Settings toggle shows the rate on submit. |
| Archive / unarchive | Removes or restores orders from the active list without erasing historical order information. |
| Delete cancelled orders | Restricted to eligible Cancelled orders; archive is not deletion. |

**Finding an order:** Search by order ID, buyer, tracking number, and product name where available. Product and variant snapshots protect past lines after catalog changes.
