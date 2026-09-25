---
title: Dashboard overview
description: Sign in, navigation, layout, tours, and module map for the distributor Dashboard.
section: Dashboard
module: dashboard
order: 10
---

The **Lakupak Dashboard** is the web control center for distributors. You manage catalog, B2B clients, orders, promotions, analytics, your marketplace storefront, logistics, and account settings from one signed-in workspace.

Path: routes under `/home`, `/clients`, `/products`, and the other modules in the sidebar.

## Sign in and registration

| Step | Action |
|------|--------|
| New distributor | Register on the Lakupak website via **Get Started**, then sign in |
| Returning user | **Login** with email and password |
| After login | You land on **Home** when the session is valid |

If the session expires, you are redirected to the login page. Keep **Settings → Security & Password** up to date for your team.

## Layout and navigation

The Dashboard uses a persistent **sidebar** (collapsible on desktop, drawer on mobile) and a top **navbar** with search and account actions.

### Main menu

| Item | Route | What you do there |
|------|-------|-------------------|
| **Home** | `/home` | KPIs, customizable widgets, business snapshot |
| **Clients** | `/clients` | Hub for **Buyers** and **Suppliers** CRM |
| **Products** | `/products` | Catalog, stock, publish to Marketplace |
| **Orders** | `/orders` | B2B order list, map, fulfillment |
| **Offers** | `/offers` | Discounts and promotions |
| **Marketing** | `/sales` | Hub for **Team** and **Campaigns** |
| **Analytics** | `/analytics` | Hub for **Financial**, **Sales**, **Operational** reports |

### Secondary menu

| Item | Route | What you do there |
|------|-------|-------------------|
| **Marketplace** | `/marketplace` | Storefront performance (not the buyer app) |
| **Logistics** | `/logistics` | Fleets, drivers, delivery tracking |
| **Settings** | `/settings` | Profile, company, billing, security, tours |

Submenus open under **Clients**, **Marketing**, and **Analytics** for the pages listed above.

## Recommended first-week setup

### Company and storefront

1. **Settings → Distributor Operations** — company name, logo, address, shipping options, lead times (visible to buyers on Marketplace).
2. **Settings → General Info** — your user profile and contact details.

### Catalog and buyers

3. **Products** — add SKUs, variants, images; **Publish** when ready.
4. **Clients → Buyers** — review marketplace buyers or import buyer records.
5. **Marketplace** — confirm published count and storefront metrics.

### Fulfillment

6. **Orders** — process incoming marketplace and manual orders; update status through delivery.
7. **Logistics** — create driver accounts and **Add Fleet & Driver** for delivery runs.
8. Share **Lakupak Driver** credentials with drivers (they do not self-register).

### Growth (optional)

9. **Offers** — attach campaigns to products.
10. **Marketing → Campaigns** — WhatsApp outreach to retailers where you use it.
11. **Analytics** — review financial and operational reports after you have order history.

## Product tours and onboarding

**Settings → Features & Tours** replays guided walkthroughs for:

- Dashboard overview
- Products
- Orders
- Offers
- Marketplace
- Logistics

A welcome tour prompt may appear on first login. Use tours when onboarding new staff.

## How Dashboard connects to other apps

| Dashboard action | Buyer sees (Marketplace) | Driver sees (Driver) |
|------------------|--------------------------|----------------------|
| Publish product | Listing in your store | — |
| Confirm / ship order | Status and notifications | Task on route map |
| Assign fleet | Tracking when configured | **Tasks** for the day |
| Update company shipping | Checkout options | — |

See [How orders flow](/en/docs/platform/order-flow) for the full chain.

## Module documentation

| Topic | Guide |
|-------|--------|
| Home widgets | [Home](/en/docs/dashboard/home) |
| Buyers and suppliers | [Clients](/en/docs/dashboard/clients) |
| Catalog | [Products](/en/docs/dashboard/products) |
| Fulfillment | [Orders](/en/docs/dashboard/orders), [Logistics](/en/docs/dashboard/logistics) |
| Promotions | [Offers](/en/docs/dashboard/offers) |
| Storefront metrics | [Marketplace (admin)](/en/docs/dashboard/marketplace-admin) |
| Account | [Settings](/en/docs/dashboard/settings) |

## Related documentation

- [Getting started](/en/docs/getting-started) if you are new to Lakupak
- [Lakupak ecosystem](/en/docs/platform/ecosystem) for all three apps
