---
title: Offers and following
description: Catalog base price, private retailer rates, following, and reports.
section: Marketplace
module: marketplace
order: 35
---

Browse the catalog base price, then build a **network** of stores you buy from regularly. A retailer's private rate is not a public price on the catalog.

## Catalog price and your rate

Product cards, search, and a distributor store always show the **catalog base price**. Another shop's rate is not shown on those cards.

Your rate is set by the distributor in **Client Rates & Offers** and applies only on your purchase order:

- Until the distributor sends pricing, the order stays at the catalog base price. You do not see the discount or Buy X Get Y free quantity.
- After **Send pricing**, the order shows that rate.
- If the distributor enabled **Show discounted price when buyers submit a PO**, the rate appears on the order as soon as you submit.

Buy X Get Y free quantity follows the rule on that rate: **Before MOQ** counts from the first package, **After MOQ** counts only above the product minimum.

### Offers list

Path: `/offers/`.

Title: **Special Offers**. This list is not a public price board for client rates. Empty: **No special offers right now.** Guests: **Sign in to view offers.**

Home **Special Offers** uses **See All** to open this list. A banner opens `/offers/[id]`.

### Offer detail

Path: `/offers/[id]`.

Errors: **Invalid offer**, **This offer is no longer available.**

## Following distributors

### My Networks

Path: `/useraccounts/buyernetworks/mynetworks`.

Title: **My Networks**.

Lists distributors you have ordered from, with order counts. Empty: **No Networks Yet**.

Account tab shows the top two distributors by order volume.

### Followings

Path: `/useraccounts/buyernetworks/followings`.

Title: **Followings**.

Distributors you follow for quick access. Empty: **No followings yet**. Row status: **Followed**.

### Distributor store pages

| Screen | Purpose |
|--------|---------|
| **Distributor Details** | Summary before entering store |
| **Distributor Store** | Product catalog for one distributor; sort Popular, Latest, Top Sales, Price |
| **Seller Information** | Store profile and policies |

On the store page: **+ Follow** / **Following** toggles follow state.

## Report distributor

**Report Distributor** modal is available from distributor profile flows when you need to flag inappropriate content or behavior.

## Related documentation

- [Browse and search](/en/docs/marketplace/browse-search) for the catalog base price
- [Orders](/en/docs/marketplace/orders) for when your rate appears
- [Account](/en/docs/marketplace/account) for **My Networks** shortcuts
- Dashboard: [Offers](/en/docs/dashboard/offers) for how distributors set a per-retailer rate
