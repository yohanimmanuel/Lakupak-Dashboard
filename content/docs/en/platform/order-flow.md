---
title: How orders flow
description: End-to-end B2B order journey from listing to fulfillment.
section: Platform
module: platform
order: 51
---

This page describes the **business flow** of a typical Lakupak order across Dashboard and Marketplace.

## 1. Catalog and publish

The distributor maintains products in **Dashboard → Products**:

- Draft SKUs with variants, stock, and images
- **Publish** when ready so buyers can see them on Marketplace
- Set a **client rate** for a retailer in **Offers**. The catalog keeps the base price. The rate applies on that retailer's purchase order.

Unpublished items stay internal and never appear to buyers.

## 2. Buyer discovery and purchase

Buyers use **Marketplace** to:

- Browse **Home**, **Categories**, or **Search**
- Open a distributor store or product detail
- Add to cart or **Buy Now**, respecting minimum order quantities
- **Checkout** with delivery address, payment method (bank transfer or COD), and shipping option

The order is created in the distributor's workspace immediately after checkout. The buyer still sees the catalog base price. The distributor releases the client rate with **Send pricing**, unless **Show discounted price when buyers submit a PO** is on.

## 3. Distributor fulfillment

In **Dashboard → Orders**, the team:

- Reviews new orders (status often starts at **Pending** or **Confirmed**)
- Confirms stock, payment, and delivery method
- Moves status through **Packed**, **Shipped**, and **Delivered**
- Uses the map view for active deliveries when addresses are available

Buyers receive notifications as status changes.

## 4. Payment and completion

Payment rules depend on how the distributor works with each buyer:

- **Bank transfer** after order placement
- **Cash on delivery** on receipt
- Buyer may use **Pay Order** in Marketplace while status is unpaid

When the order reaches **Delivered** (or **Received**), relationship history updates in **Clients**.

## 5. Exceptions

| Situation | Typical handling |
|-----------|------------------|
| Buyer cancels | Allowed while policy permits; stock may be restored |
| Delivery issues | Distributor contacts buyer and updates order status |
| Return or refund | Buyer submits request; distributor resolves per policy |
| Suspended buyer | Cannot place new orders until access is restored |

## Related documentation

- [Dashboard Orders](/en/docs/dashboard/orders)
- [Marketplace cart and checkout](/en/docs/marketplace/cart-checkout)
- [Marketplace orders](/en/docs/marketplace/orders)
