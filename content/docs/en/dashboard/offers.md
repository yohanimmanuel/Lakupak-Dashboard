---
title: Offers
description: Discounts, promotions, product targeting, and usage analytics.
section: Dashboard
module: dashboard
order: 15
---

**Offers & Incentives** lets you create discounts and buy-X-get-Y promotions, attach them to catalog products, and track usage.

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
| **Create Offer** | Open the create wizard |

### Tabs and filters

**Page tabs:** All Offers, Discounts, Promotions (with counts).

**Table status tabs:** All, Active, Inactive.

**Search:** **Search offers...**

**Date filter:** All Time, Last 7 Days, Last 30 Days, Last 3 Months, This Year.

**Columns:** Name, Type, Discount, Status, Duration, Usage Status, Actions.

**Type badges:** **Discount** or **Promotion**. Usage: **Used** / **Not Used**. Duration may show a date range or **Unlimited**.

### Bulk actions

When offers are selected:

- **Activate** / **Deactivate** (activate disabled if date range expired)
- **Remove**

## Create and edit offers

### Wizard steps

1. **Offer Type** — discount rules (percentage, fixed amount, buy X get Y)
2. **Date Range** — schedules and validity windows
3. **Products** — select eligible SKUs (Product Integration)
4. **Analytics** — preview performance fields

**Actions:** **Preview**, **Create Offer**, **Save as Inactive**.

**Offer Preview** modal shows how buyers will see the offer.

### Offer details page

Same four tabs on edit. **Save Changes**, **Cancel**, unsaved-changes warning.

Statuses: **Active**, **Inactive**, and **Expired** when past the date range (banner: **This offer has expired from the date range**).

Success toast: **Changes Saved Successfully!**

## Delete and export

**Delete Offer** / **Delete Offers** confirmation before removal.

**Export** columns: Offer ID, Name, Type, Status, Products Count, Total Usage, Total Discount Given, Discount Types, Created At.

Active offers appear on the buyer Marketplace when products are published and the offer is active.

## Related areas

| Goal | Go to |
|------|--------|
| Attach products | [Products](/en/docs/dashboard/products) |
| Redemptions on orders | [Orders](/en/docs/dashboard/orders) |
| Campaigns hub | [Marketing](/en/docs/dashboard/marketing) |
