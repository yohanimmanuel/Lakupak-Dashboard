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
| **Market Segments** | Open the market segment directory (`/clients/buyers/market-segments`), where main channels, sub-channels, and outlet specifics are kept for segment pricing |
| **Match Buyers** | Open buyer matching (`/clients/buyers/buyer-matching`) to review a prospect against a marketplace order. A blue count shows pending matches |
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

- Store name, owner, phone, email, address
- **Business type (main channel)**, chosen from the market segment directory. This is the price key for product segment prices
- **Sub-channel** and **Outlet specifics** (optional labels; they do not change the price)
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
- Deleting a buyer does not delete product segment prices. Those prices stay while the main channel remains in the market segment directory.

### Import format (buyers)

Import accepts spreadsheet rows with flexible column names. The download template includes an example row for each column. An older **Business Type** column is read as the main channel.

| Column | Use |
|--------|-----|
| Store Name, Owner, Email, Phone, Address, Status | Buyer profile |
| Main Channel, Sub-channel, Outlet Specifics | Channel labels; also create a market segment directory row that remains if the buyer is later deleted. An identical main, sub, and outlet combination is stored once |
| Last Order Date, Last Visit Date | Dates only |
| Shipment Success | Logistics rate |
| Last shipment | Date only |

Unmapped columns can be stored in logistics or notes. Each row creates a buyer via GraphQL. Export uses the same channel and date fields.

## Buyer matching

Buyer matching checks whether a buyer you already keep in Clients is the same shop as a buyer who registered or ordered in Marketplace. Open it from **Clients → Buyers → Match Buyers** (`/clients/buyers/buyer-matching`).

The blue count on **Match Buyers** is the number of pairs still in **Pending**.

### Functions

| Function | What it does |
|----------|----------------|
| **Confidence and signals** | Score from phone, store name, owner, and street address. An exact field adds more than a similar one, and the badges name the fields that lined up. **75 or more** is high. **50 to 74** is medium. Below 50 is not queued. A shared phone is preferred when more than one buyer could match. |
| **Cards** | The left card is **Prospect buyer**, the buyer already in your list. The right card is **Existing buyer**, the Marketplace account, with the order id when there is one. |
| **Queues** | **Pending** is still open. **Needs more info**, **Not a match**, and **Recently merged** (last 30 days) are the other tabs. |
| **Merge** | Keeps the Marketplace buyer and absorbs the CRM buyer into it. Orders, sales jobs, offers, and order lines move to the Marketplace buyer. The CRM buyer record is removed. Marketplace name, phone, store, and address win; the CRM record only fills blanks. The main channel keeps the CRM segment when the Marketplace channel is blank. Merge does not approve storefront access. The pair then shows under **Recently merged**. |
| **Not a match** | Dismisses the pair into the **Not a match** tab. The two buyers stay separate. |
| **Needs more info** | Moves the pair into the **Needs more info** tab so you can check it later. |
| **Undo** | On a dismissed pair, returns it to **Pending**. On a merged pair, restores the CRM buyer and moves orders, jobs, and offers back. Undo does not write a default segment and does not delete product segment prices. |
| **Auto matching** | Off by default. When it is on, only a high-confidence pair (75 or more) merges by itself. Medium pairs still wait in **Pending**. |
| **Search** | Filters the open tab by buyer, store, address, or phone. |

Deleting a buyer also removes every open match that uses that buyer on either side. The Match Buyers badge recounts after the buyers list refreshes.

Each action shows a spinner on its button until the request finishes.

### How to review a pair

1. Open **Clients → Buyers → Match Buyers**.
2. Leave **Auto matching** off until you trust high-confidence pairs.
3. Open **Pending**. Read the score and the signal badges.
4. Compare **Prospect buyer** on the left with **Existing buyer** and the order on the right.
5. Click **Merge** when they are the same shop. Click **Not a match** when they are different. Click **Needs more info** when you need to check first.
6. Use the tabs and search to find a pair later. **Undo** a merge or a dismissal from that card.

### What the buyer sees

1. The shop is already a Prospect, or another buyer, in your Clients list.
2. The same shop registers or orders in Marketplace. The new membership starts with a blank main channel.
3. If the phone, store, owner, or address reaches a score of 50 or more, a card appears in Pending. A score of 75 or more merges on its own only when **Auto matching** is on.
4. After you merge, history sits on the Marketplace buyer. Access stays pending.
5. Open that buyer, set **Business type (main channel)** if it is still blank, then **Approve access**. Marketplace then uses that channel’s segment price. See [Market segment pricing](#market-segment-pricing).

## Market segment pricing

Market segment pricing is the selling price a variant uses for a buyer’s **main channel**. Open it from **Clients → Buyers → Market Segments**.

A private client rate in **Offers** is a separate discount on top of that price. Segment pricing decides which catalog selling price the buyer starts from.

### Functions

| Function | What it does |
|----------|----------------|
| **Main channel** | Required. This is the buyer’s business type and the key for product segment prices. `General Trade` and `general trade` are the same key. |
| **Sub-channel** | Optional label, for example Retail. It does not select a different price. |
| **Outlet specifics** | Optional label, for example the kind of shop. It does not select a different price. |
| **Market segment directory** | The list of channels you sell through. Product price choices come from the distinct main channels here. |
| **Add segment** | Creates one directory row. Main channel is required. The “Main channel is required” notice clears after 5 seconds. |
| **Record from buyers** | Copies each existing buyer’s main channel, sub-channel, and outlet specifics into the directory. The same combination is stored once. The success notice clears after 5 seconds. Running it again adds only new combinations. |
| **Drag to reorder** | Saves the directory order. |
| **Edit** | Opens a popup for that row. It does not replace the add-segment bar. |
| **Delete / Delete selected** | Removes directory rows. Prices for a main channel are removed only when the last row for that channel is deleted and no buyer still uses it. |
| **Buyer profile badge** | Shows the main channel. Hover shows main channel, sub-channel, and outlet specifics. |

The same main channel and sub-channel may appear on more than one row when the outlet specifics differ. A row is blocked only when all three values are the same, ignoring capital letters.

### Configure buyers, then product prices

1. Open **Clients → Buyers → Market Segments**.
2. Enter the **Main channel**. Add **Sub-channel** and **Outlet specifics** when you use them. Click **Add segment**.
3. Drag rows into the order you want. The order is saved.
4. When buyers already exist, click **Record from buyers**. Matching combinations are combined into one row.
5. On **Add Buyer** or **Edit Details**, set **Business type (main channel)** from that directory. Sub-channel and outlet specifics stay optional.
6. Open the product and set **Market Segment Pricing** for the channels this product sells to. See [Products](/en/docs/dashboard/products).
7. Publish the product so Marketplace can show that price.

A buyer who registers in Marketplace starts with a blank main channel. They see the default selling price until you choose their main channel and approve access. After approval, Marketplace uses that channel’s segment price. Changing the main channel later updates the prices that buyer sees.

Buyer import and export columns for channels and logistics dates are listed under [Import format (buyers)](#import-format-buyers).

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

Bulk import maps flexible columns (Name, Contact, Email, Phone, Business Type, Address, Status, and more). The download template includes an example row. Extra fields can go into logistics or notes.

### Import and archive supply history

On the supplier profile, **Import supplies** maps the spreadsheet, then shows a preview. Received quantity and stock type appear as separate plain-text columns. Only the rows you leave selected are imported. Deselect a row that has no unique match in this supplier’s catalog, or that belongs to another supplier, before you confirm.

A saved receipt shows an **Archive** action when its SKU tooltip says it is not linked to this supplier’s catalog, or the product moved to another supplier. Archive only hides the receipt from active history. If the receipt already applied stock on a live variant, untick **Update Current Stock** and save before you archive.

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

## Supply history, snapshots, and stock

Supplier records and the product catalog are **separate but linkable**. Catalog edits do not create receipts, rewrite history, or move a receipt to another variant. Receipts are created or imported explicitly.

- **Supply history** stores each receipt: date, product/variant snapshot, entered quantity and unit, value, and whether **Update Current Stock** was applied.
- **Snapshots** keep older product and variant labels. Legacy `AUTO-` rows are historical snapshots; `HIST-` rows are supply history. Do not count a snapshot as an extra receipt.
- Inventory links use the live product ID and variant option ID. Recreating a deleted variant with the same name or SKU creates a new identity. A missing live option is not replaced silently.
- Received quantity and stock type stay as entered (for example cartons). Inventory stores the base-piece equivalent. Those are two views of one quantity.
- Stock changes only when **Update Current Stock** succeeds. Saving or importing a row does not add stock by itself.

For stock on hand, use the product variant inventory view. Orders and other adjustments also change stock.

### Archive, restore, and delete

| Action | Result |
|--------|--------|
| **Archive** / **Archive selected** | Moves an eligible receipt to **Archived Supplies**. Does not reverse stock. |
| **Restore** / **Restore selected** | Returns the receipt to active history without creating another stock movement. |
| **Delete** | Removes an eligible receipt after confirmation. Reversing previously applied stock is a separate choice and only works when the original live variant still exists. |
| Untick **Update Current Stock** on an applied receipt | Reverses that stock movement when the original variant is still available; the receipt stays in history. |

Historical receipts tied to a live catalog variant of this supplier are protected from permanent delete. A disabled delete is not a reason to delete the product variant. For future stock on an unlinked or deleted-variant receipt, select a live variant, or archive or delete the obsolete row.

## CRUD actions and system results

| Action | System result |
|---|---|
| Delete buyer | Removes the buyer from the active CRM; historical orders may still refer to that buyer. Segment prices stay with the market segment directory. Linked private rates without a valid client cannot remain Active. |
| Create/edit/import supplier receipt | Records Supply History with entered quantity/unit and a product/variant snapshot. Inventory changes only when **Update Current Stock** succeeds. Import writes only the selected preview rows. |
| Archive / restore / delete receipt | Archive and restore move visibility; delete is permanent for eligible rows only. Stock reverses only when chosen and possible. |
