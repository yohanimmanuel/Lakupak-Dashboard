---
title: Orders
description: Order list, catalog price until the distributor sends pricing, pay, cancel, and tracking.
section: Marketplace
module: marketplace
order: 34
---

Track B2B orders from placement through delivery, payment, reviews, and returns.

## Price you see

Product cards, cart, and checkout show the distributor's **catalog base price**. Your private rate is not on those cards.

After you submit a purchase order:

- You still see the catalog base price, and you do not see a client discount or free quantity, even if you already buy from that distributor.
- The distributor releases the purchase-order price with **Send pricing**. After that, the order shows the discounted total and any free quantity beside the ordered quantity.
- If that distributor turned on **Show discounted price when buyers submit a PO**, the order shows their rate as soon as you submit.
- A total that is not confirmed yet shows as **Pending price**.

A catalog price change after checkout does not rewrite an order you already placed.

## Orders tab

Path: `/(tabs)/orders`.

Lists orders with ID, distributor name, product count, amount, **Order Date**, and status pill.

Empty: **No Orders Yet** with tips to browse products.

Guests: **Create an account to win first-order benefits!**

Tap a row → **Order Details** (`/components/ordersshipment/OrderDetails?orderId=…`).

## My Purchases

Path: `/useraccounts/purchases/mypurchases`.

Title: **My Purchases**. Search: **Search orders**.

### Purchase tabs

| Tab | Typical use |
|-----|-------------|
| **To Pay** | Unpaid orders; **Pay** action |
| **To Ship** | Awaiting fulfillment |
| **To Receive** | Shipped / in transit |
| **To Rate** | Delivered, awaiting review |
| **Completed** | Finished orders |
| **Return/Refund** | Return requests |
| **Cancelled** | Cancelled orders |

Account shortcuts on the Account tab jump directly into the first four tabs.

## Order details

Title: **Order Details**.

Status headlines include **Your Order is Shipped**, **Your Order is Delivered**, and others by pipeline stage.

### Order actions

| Action | When |
|--------|------|
| **Pay Order** | Payment pending |
| **Cancel Order** | Allowed before fulfillment rules block cancel |
| **Return/Refund** | After delivery per policy |
| **Order Received** | Confirm receipt |
| **Rate** / **Edit review** | After delivery |
| **Back to Orders** | Return to list |

### Cancel and return

**Cancel Order:** pick a reason (**Changed my mind**, **Found a better price**, **Other reason**, and more) → **Cancel order**.

**Return / Refund:** reasons such as **Wrong item received**, **Defective or damaged**; optional evidence photos → **Submit request**.

**Return & Refund Info** explains policy before submitting.

### Invoice and delivery

**Order ID Information:** **Invoice** → **View & download** (PDF modal).

**Delivery Information:** **Delivery Progress**, **Delivery Timeline**, map **Distributor Location**.

**Support Center:** **Contact Seller**, **Help Center**.

Full order notification history: **Order updates** (`/order-notifications`).

## Related documentation

- [Cart and checkout](/en/docs/marketplace/cart-checkout)
- [Notifications](/en/docs/marketplace/notifications) for push updates, including pricing sent by the distributor
- Distributor view: [Dashboard Orders](/en/docs/dashboard/orders)
- How rates are set: [Dashboard Offers](/en/docs/dashboard/offers)
