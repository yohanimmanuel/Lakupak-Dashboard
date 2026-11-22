---
title: Clients
description: Buyer and supplier CRM with lists, profiles, import or export, and relationship analytics.
section: Dashboard
module: dashboard
order: 12
---

The **Clients** area is your distributor CRM for retail buyers and upstream suppliers. It is also the relationship foundation for portfolio intelligence: purchase history and retailer profiles help you judge which shops are suitable for which products. Use the same Buyers list for **buyer prospecting** (status **Prospect**) — there is no separate Sales Prospect module.

It has a hub page plus two tools: **Buyers** and **Suppliers**.

## Why Clients matter for portfolio utilisation

- Retailer records and order history show who already buys what
- Status (Active, Prospect, Inactive, Blocked) keeps matching and outreach focused on the right shops
- Product lines and spend patterns support next-best product–retailer matching as that intelligence ships

Low penetration for a product across eligible buyers is a signal to investigate, not automatic demand.

## Clients hub

Open **Clients** in the sidebar to see:

- **Tips** cards (dismissible) for adding buyers and managing suppliers, with optional detail modals.
- **Tools** shortcuts to **Buyers** and **Suppliers**.

Add buyers manually or import them in bulk. When private marketplace ordering is enabled for your account, authorised retailer orders can also create or update buyer records automatically.

## Buyers

Path: **Clients → Buyers** (`/clients/buyers`).

### Buyer summary cards

Four KPI cards at the top:

| Card | Meaning |
|------|---------|
| Total Buyers | All buyer records in your workspace |
| Active Buyers | Buyers with status Active |
| Monthly Buyer Spend | Average monthly spend across buyers with order history |
| Avg. Order Frequency | Average orders per month (shown as `/mo`) |

Values use your account currency from Settings.

### Buyer list actions

| Action | Purpose |
|--------|---------|
| **Refresh** | Reload buyer data from the server |
| **Import Data** | Bulk create buyers from spreadsheet (XLSX) |
| **Export Data** | Download the filtered table to XLSX |
| **Add Buyer** | Open `/clients/buyers/add` |

After refresh, a short status toast shows how many buyers loaded.

### Buyer table and filters

The buyer table supports:

- **Search** by store name
- **Status tabs**: All, Active, Prospect, Inactive, Blocked
- **Business type** filter (dynamic from your data)
- **Period** filter: All Months, This Month, Last Month (by record created date)
- **Pagination** through results
- **Row selection** for bulk delete
- **Desktop and mobile** layouts (card view on small screens)

**Columns (desktop):** ID, Name, Address, Business Type, Total Orders, Total Spend, Outstanding, Status, Actions.

**Row actions:** **Edit** opens the buyer details page (`/clients/buyers/details/{buyerId}`). From there, **Edit Details** opens `/clients/buyers/edit/{buyerId}`.

### Buyer prospecting

Use **Clients → Buyers** to capture outlets you have not sold to yet:

- Set status to **Prospect** when adding a buyer (or keep them Prospect until they place an order / become Active).
- Ask **Lakupak AI** to find retailers by area and outlet type (Google Places). Chat returns suggestions with **Fill form fields** / **View buyer**; nothing is saved until you confirm in the buyer form.
- Filter the buyer table by the **Prospect** tab to work only those leads.

### Add or edit buyer

The buyer form includes:

- Store name, owner, phone, email, address, business type
- Status: Active, Prospect, Inactive, or Blocked
- Created date
- Logistics: preferred delivery days, last shipment, shipment success rate
- Notes
- Optional **order line items** (product, total orders, total spend, last order date, outstanding)
- Avatar upload (Cloudinary) when configured

New buyers get an ID such as `LKB-########` if you do not supply one. Input is validated before save.

### Buyer details (profile)

The profile page shows:

- **Copy Data** (full profile and order lines to clipboard)
- **Edit Details** (opens `/clients/buyers/edit/{buyerId}`)
- **Data completion** progress bar (missing profile, logistics, or order fields)
- Contact and business summary (store, owner, email, phone, address, status)
- Truncated address in General Information with **View in Maps** (full address + map modal)
- **Analytics charts**: monthly orders and spending trends from order history
- **Order and product details** table with pagination
- **Import orders** and **export orders** (XLSX) for that buyer’s order lines

Totals include total orders, total spend, and outstanding balance.

### Deleting buyers

- Delete one buyer from the table actions, or select multiple rows for **bulk delete**.
- Deleted buyers are removed from the active list. If you open an old link, you may see a **Buyer data has been deleted** page; historical orders can still reference that buyer.

### Import format (buyers)

Import accepts spreadsheet rows with flexible column names (for example Store Name, Owner, Email, Phone, Business Type, Address, Status). Unmapped columns can be stored in logistics or notes. Each row creates a buyer via GraphQL.

## Suppliers

Path: **Clients → Suppliers** (`/clients/suppliers`).

### Supplier summary cards

| Card | Meaning |
|------|---------|
| Total Suppliers | All supplier records |
| Active Suppliers | Suppliers with status Active |
| Monthly Purchase Value | Average monthly purchase value across suppliers with supply data |
| On-time Delivery Rate | Average delivery success rate from logistics and supply records |

### Supplier list actions

Same pattern as buyers:

- **Refresh**, **Import Data**, **Export Data**, **Add Supplier** (`/clients/suppliers/add`)

### Supplier table and filters

- **Search** by supplier name
- **Status tabs**: All, Active, Inactive, Blocked
- **Business type** filter
- **Period**: All Months, This Month, Last Month
- **Pagination** (8 rows per page on desktop)
- **Bulk delete** with row selection

**Columns:** ID, Name, Business Type, Location, Total Supplies, Total Purchases, Created At, Status, Actions. Supply totals reflect supplier records, not the number of automatically synchronized catalog SKUs.

**Edit** opens the supplier details page (`/clients/suppliers/details/{supplierId}`). From there, **Edit Details** opens `/clients/suppliers/edit/{supplierId}`.

### Add or edit supplier

Pages: `/clients/suppliers/add`, `/clients/suppliers/edit/{supplierId}`.

Fields include:

- Supplier name, contact person, email, phone, address, business type
- Status: Active, Inactive, Blocked
- Logistics: preferred delivery days, last delivery, delivery success
- Notes
- **Supply lines**: receipt number, variant SKU, product and variant, quantity and received unit, total value, last supplied date, status
- System-generated supplier ID when not provided

### Supplier details (profile)

Similar to buyers:

- **Copy Data**, **Edit Details** (opens the edit page)
- **Data completion** for profile, logistics, and supply lines
- Monthly **analytics** (units supplied and purchase value)
- **Supplies and product data** table with pagination
- **Import supplies** and **export supplies** (XLSX)

Aggregates include total units supplied and total purchase value. **On-time delivery rate** on the supplier record feeds the list KPI card.

### Import format (suppliers)

Bulk import maps flexible columns (Name, Contact, Email, Phone, Business Type, Address, Status, supplies, and more). Extra fields can go into logistics or notes.

## How buyers and suppliers connect to the rest of Lakupak

| Data | Used in |
|------|---------|
| Buyers | Orders (store name, buyer ID), Marketplace accounts, Home **Buyer Engagement** widget |
| Suppliers | Product sourcing context, Home **Supplier Network** widget, procurement planning |

Keeping client records current improves order fulfillment, analytics, and dashboard widgets.

## Related documentation

- [Orders](/en/docs/dashboard/orders) for live B2B order flow
- [Products](/en/docs/dashboard/products) for catalog linked to supply lines
- [Home](/en/docs/dashboard/home) for buyer and supplier widgets

## Current supplier receipts, summaries, and inventory linkage (November 2026)

Supplier records and the product catalog are **separate but linkable**. Adding, editing, renaming, or deleting a catalog product or variant does **not** automatically create supplier receipt history, rewrite existing receipts, or move receipt records to another variant. Supplier receipts are created or imported explicitly. This replaces the older automatic product-to-supplier synchronization behavior.

- **Supply history** records individual supplier receipts, including the supplied date, product/variant snapshot, entered quantity and unit, value, and whether an inventory update was requested and applied.
- **Supply summary / opening-balance snapshots** are distinct from receipt history. Legacy `AUTO-` records are summaries; `HIST-` records are receipt history. Do not treat a summary as an additional receipt or double-count it alongside the history that contributes to a total.
- **Variant identity:** inventory links use the live product ID and variant option ID, not just a matching SKU or display name. Recreating a deleted variant with the same name or SKU creates a different identity.
- **Deleted or renamed catalog variants:** existing supplier summary and history rows retain their recorded product and variant labels as historical snapshots. A missing live option is not silently substituted with another variant.
- **Unmatched historical rows:** select a valid current catalog variant before applying a new stock update. If the variant was deleted, choose another live variant for a new receipt or archive/delete the obsolete supply record where the interface permits. An unselected new receipt needs no legacy warning.
- **Received units:** receipts preserve the entered quantity and stock level (such as cartons), while the canonical inventory quantity is calculated in base pieces using that variant's conversion rules. These are two representations of one quantity, not separate inventories.
- **Update Current Stock:** stock changes are an explicit receipt action; an imported or saved supplier row must not be assumed to have changed inventory unless its stock update was successfully applied. Avoid reapplying the same historical receipt.

Buyer order lines and supplier receipt lines are operational records; catalog edits should not retroactively rewrite their historical product and variant snapshots. For stock on hand, use the product variant inventory view rather than summing supplier receipts alone (orders and other adjustments can also affect stock).
