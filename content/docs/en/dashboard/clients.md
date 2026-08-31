---
title: Clients
description: Buyer and supplier CRM with lists, profiles, import or export, and relationship analytics.
section: Dashboard
module: dashboard
order: 12
---

The **Clients** area is your distributor CRM for retail buyers and upstream suppliers. It has a hub page plus two tools: **Buyers** and **Suppliers**.

## Clients hub

Open **Clients** in the sidebar to see:

- **Tips** cards (dismissible) for adding buyers and managing suppliers, with optional detail modals.
- **Tools** shortcuts to **Buyers** and **Suppliers**.

Buyers who order from you on **Lakupak Marketplace** can be recorded automatically in the buyer list when they purchase from your storefront. You can also add buyers manually or import them in bulk.

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
| **Add Buyer** | Open the create-buyer form |

After refresh, a short status toast shows how many buyers loaded.

### Buyer table and filters

The buyer table supports:

- **Search** by store name
- **Status tabs**: All, Active, Inactive, Blocked
- **Business type** filter (dynamic from your data)
- **Period** filter: All Months, This Month, Last Month (by record created date)
- **Pagination** through results
- **Row selection** for bulk delete
- **Desktop and mobile** layouts (card view on small screens)

**Columns (desktop):** ID, Name, Address, Business Type, Total Orders, Total Spend, Outstanding, Status, Actions.

**Row actions:** open **Buyer details**, **Edit** (inline modal on list where supported).

Click a row or use **Details** to open `/clients/buyers/details/{buyerId}`.

### Add or edit buyer

The buyer form includes:

- Store name, owner, phone, email, address, business type
- Status: Active, Inactive, or Blocked
- Created date
- Logistics: preferred delivery days, last shipment, shipment success rate
- Notes
- Optional **order line items** (product, total orders, total spend, last order date, outstanding)
- Avatar upload (Cloudinary) when configured

New buyers get an ID such as `LKB-########` if you do not supply one. Input is validated before save.

### Buyer details (profile)

The profile page shows:

- **Copy Data** (full profile and order lines to clipboard)
- **Edit Details** (same fields as the modal)
- **Data completion** progress bar (missing profile, logistics, or order fields)
- Contact and business summary (store, owner, email, phone, address, status)
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

- **Refresh**, **Import Data**, **Export Data**, **Add Supplier**

### Supplier table and filters

- **Search** by supplier name
- **Status tabs**: All, Active, Inactive, Blocked
- **Business type** filter
- **Period**: All Months, This Month, Last Month
- **Pagination** (8 rows per page on desktop)
- **Bulk delete** with row selection

**Columns:** ID, Name, Business Type, Location, Total Supplies (SKU count), Total Purchases, Created At, Status, Actions.

Open **Supplier details** at `/clients/suppliers/details/{supplierId}`.

### Add or edit supplier

Fields include:

- Supplier name, contact person, email, phone, address, business type
- Status: Active, Inactive, Blocked
- Logistics: preferred delivery days, last delivery, delivery success
- Notes
- **Supply lines**: supplies number, SKU, product, total supplied, total value, last delivery, status
- System-generated supplier ID when not provided

### Supplier details (profile)

Similar to buyers:

- **Copy Data**, **Edit Details**
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
