---
title: Offers
description: Per-retailer rates, Buy X Get Y, draft rules, and when the buyer sees the price.
section: Dashboard
module: dashboard
order: 15
---

**Client Rates & Offers** sets a private product rate for one retailer. Use this when introducing underused SKUs or protecting negotiated terms: each shop can have its own percentage, fixed amount, or Buy X Get Y terms without rewriting the segment or default selling price other shops see.

The rate applies on that retailer's purchase order. Product offer rates per retailer are listed in one table so you can manage client, product or variant, discount, status, and duration together.

Paths: `/offers`, `/offers/new`, `/offers/details?id={offerId}`.

## Summary cards

| Card | Meaning |
|------|---------|
| **Total Offers** | All offer records |
| **Active Offers** | Status active |
| **Conversion Rate** | Share of offers with at least one redemption |
| **Total Redemptions** | Sum of usage counts |

## Offers list

### Page actions

| Action | Purpose |
|--------|---------|
| **Export Data** | XLSX export of offers |
| **Create Rate** | Open the create wizard |

### Tabs and filters

**Page tabs:** All Rates, Discounts, Promotions (with counts).

**Table status tabs:** All, Active, Draft, Inactive, Expired.

**Search:** client, product, or notes.

**Date filter:** All Time, Last 7 Days, Last 30 Days, Last 3 Months, This Year.

**Columns:** Name, Client, Product / Variant, Type, Discount, Status, Duration, Usage Status, Actions.

**Type badges:** **Discount** or **Promotion**. Usage: **Used** / **Not Used**. Duration may show a date range or **Unlimited**.

### Bulk actions

When rates are selected:

- **Activate** / **Deactivate** (activate disabled if the date range has expired)
- **Remove**

**Activate** needs a client ID. A rate with no client stays **Draft**. The notice names the missing client ID and disappears after 5 seconds.

Deleting the buyer, or clearing the client on the rate, sets that rate back to **Draft**. It cannot stay **Active** without a client.

## What a rate can do

A rate is tied to one client and to the products or variants they buy. The same SKU can have a different rate for each retailer. Other shops keep their own segment or default selling price.

| Type | What it does on the purchase order |
|------|-------------------------------------|
| **Percentage** | Cuts the line by a percent of the segment or default selling price that started the line |
| **Fixed Amount Off** | Subtracts a fixed amount |
| **Buy X Get Y** | Adds free quantity when the buy rule is met |

You can combine a price discount and Buy X Get Y on the same rate.

### Buy X Get Y and MOQ

**Start counting free pieces** is **Before MOQ** or **After MOQ**.

- **Before MOQ** counts free quantity from the first package.
- **After MOQ** counts free quantity only on quantity above the product minimum. An order that equals the MOQ gets no free quantity.

Product MOQ is the minimum order quantity on the variant.

## Create and edit rates

### Wizard tabs

1. **Discount**: percentage, fixed amount, Buy X Get Y, and status
2. **Timing**: start date and optional end date
3. **Product**: one or more products, all variants or specific variants
4. **Client**: the buyer who receives this private rate

**Create Rate** publishes an active rate when a client is selected. **Save Draft** keeps progress when the client or products are not ready yet.

### Rate details

Edit uses the same tabs. **Save Changes** and **Cancel**.

Statuses: **Active**, **Draft**, **Inactive**, and **Expired** when the date range has passed.

## When the buyer sees the rate

Product cards never show the client rate. On a new purchase order the buyer still sees the segment or default selling price from checkout, including when they already buy from you.

Two controls release the private rate:

- **Send pricing to buyer** on the order (or **Send pricing update** after you change a line). This is the step that shows the discounted total and any free quantity, and notifies the buyer.
- Company setting **Show discounted price when buyers submit a PO** (Settings → Distributor Operations). When this is on, the purchase order shows the client rate as soon as the buyer submits. When it is off, the order stays on the segment or default price until you send pricing.

## Delete and export

**Delete Rate** / **Delete Rates** asks for confirmation.

**Export** columns: Offer ID, Name, Type, Status, Products Count, Total Usage, Total Discount Given, Discount Types, Created At.

## Related areas

| Goal | Go to |
|------|--------|
| Attach products | [Products](/en/docs/dashboard/products) |
| Price on the purchase order | [Orders](/en/docs/dashboard/orders) |
| Buyer price toggle | [Settings](/en/docs/dashboard/settings) |
| Buyer Marketplace | [Marketplace overview](/en/docs/marketplace/overview) |

## CRUD actions and system results

| Action | System result |
|---|---|
| Create / save draft | Saves percentage, fixed-amount and/or Buy X Get Y terms, product/variant scope, timing and client; incomplete targeting stays Draft. |
| Edit | Updates the rate rules for applicable future pricing; it does not rewrite previously captured order prices automatically. |
| Activate / deactivate (single or bulk) | Controls eligibility for new purchase-order pricing; expired dates or a missing client prevent activation. |
| Delete (single or bulk) | Removes selected rate records after confirmation, not the underlying product or buyer. |
| Export | Downloads offer records and usage metrics. |

**Visibility:** Rates are private to the linked retailer. Product cards keep the segment or default selling price; the order’s pricing-send action or the distributor Settings toggle determines when the buyer sees the negotiated price.
