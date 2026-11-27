---
title: Marketplace overview
description: Buyer mobile app tabs, navigation, and getting started.
section: Marketplace
module: marketplace
order: 30
---

**Lakupak Marketplace** is the buyer-facing mobile app (Expo/React Native) for discovering a distributor's private catalog, placing B2B orders, and tracking fulfillment. It connects to the same Lakupak API environment as the distributor Dashboard.

Access is **authorised and closed**: buyers sign in with a valid distributor **referral / membership code** (or an existing membership). Guests do not browse an open multi-distributor catalog. Each session is scoped to that distributor's storefront.

Distributors set or update their referral code under **Dashboard → Settings → Distributor Operations**.

## Main navigation

Five bottom tabs:

| Tab | Purpose |
|-----|---------|
| **Home** | Store header, search entry, special offers, categories, featured products |
| **Categories** | Browse by category and new products |
| **Orders** | Order history and status |
| **Notifications** | Alerts, order updates, platform announcements |
| **Account** | Profile, purchases, networks, settings shortcuts |

**Home** and **Categories** require login. Guests are redirected to the welcome screen.

### Header shortcuts

From several tabs you can open:

- **Messages** (`/messages`) for WhatsApp chats started from product pages
- **Cart** (`/cart`) with a badge for item count
- **Settings** (gear on Account)

## Getting started

1. Open the app → **Welcome** carousel (**Connect with Distributors**, **Fast & Reliable Delivery**, **Trusted Marketplace**)
2. **Login** or **Register**, and enter the distributor **referral code** when prompted (required to join or open that storefront)
3. After sign-in, land on **Home** with your store name and delivery address for that distributor

## Market segment price

The price on a product is the distributor’s price for your **main channel**.

Registration does not assign a channel. The distributor sets your main channel on the buyer record and approves access. Until then, product cards use each variant’s default selling price.

After a main channel is set:

- A variant with a price for that channel shows that price.
- A variant without a price for that channel shows its default selling price.
- Sub-channel and outlet specifics do not change the price.
- If the distributor changes your main channel, the catalog prices you see update for your account.

Checkout stores the price you saw. A later change to the catalog does not rewrite an order you already placed. A private discount, when the distributor has one for your shop, is released on the order separately from this segment price.

See [Browse and search](/en/docs/marketplace/browse-search) and [Cart and checkout](/en/docs/marketplace/cart-checkout).

Suspended accounts see **Account suspended** with a countdown and **Go to login**.

## How it fits Lakupak

| Role | App |
|------|-----|
| Distributor | Lakupak Dashboard (web) |
| Buyer / retailer | Lakupak Marketplace (mobile) |

Orders you place in Marketplace appear in the distributor **Orders** module. Published products come from distributor **Products**.

## Related documentation

- [Account](/en/docs/marketplace/account) for signup and profile
- [Browse and search](/en/docs/marketplace/browse-search) for catalog discovery
- [Cart and checkout](/en/docs/marketplace/cart-checkout) for placing orders
- [Orders](/en/docs/marketplace/orders) for tracking and returns
