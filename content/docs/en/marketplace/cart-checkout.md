---
title: Cart and checkout
description: Shopping cart, MOQ, checkout, payment, and shipping.
section: Marketplace
module: marketplace
order: 33
---

Add products from detail pages or **Buy Now**, review the cart, then complete **Checkout** to create orders in the distributor Dashboard.

## Shopping cart

Path: `/cart`.

Title: **Shopping Cart**.

Empty state: **Oops, Your Shopping Cart is Empty** / **Browse our awesome deals now!**

### Selection and MOQ

- **All** selects every line in the cart
- **Saved {amount}** when discounts apply
- Footer: **Check Out (count)** or **MOQ Not Met** when minimum quantity is not met
- Alert: **Minimum Order Quantity Required**

Guests see the same login prompt as Account.

Checkout opens `/components/productcatalog/checkout` with selected lines or buy-now parameters.

## Checkout

Title: **Checkout**.

### Delivery address

**Delivery Address** section with **Default Address** and fields for name, company, phone, and full address (from **My Addresses**).

### Payment methods

**Payment** section:

- **Bank Transfer** (manual transfer to distributor bank details)
- **Cash on Delivery (COD)**

Post-order payment may also use **Pay Order** from order detail.

### Shipping options

Per distributor when the cart spans multiple sellers:

- **Self Pickup**
- **Seller/Distributor Delivery**
- **Buyer-arranged Courier**

Note shown in app: **Shipping cost is agreed between buyer and distributor — not charged at checkout.**

Also: **Business Information**, **Products from {distributor name}**.

### Place order

**Order Confirmation** ? **Place Order** / **Placing…**

Supports single-product buy now and multi-distributor cart checkout.

## After checkout

**Payment Success** screen:

- **Payment Successful!**, **You paid {amount}**
- **Home**, **My Orders**
- **What's Next?** steps
- **Need Help?** / **Contact Support**

Unpaid orders: open **Pay Order** from order detail with bank transfer or COD options.

## Related documentation

- [Orders](/en/docs/marketplace/orders) for payment and tracking
- [Account settings](/en/docs/marketplace/account-settings) for saved addresses
- [Browse and search](/en/docs/marketplace/browse-search) for MOQ on product pages
