---
title: Products
description: Catalog, variants, stock, marketplace publish, and export.
section: Dashboard
module: dashboard
order: 13
---

The **Products** area is your B2B catalog control room. You create products with variant-level SKUs and images, track stock per variant, and keep underused products visible, priced, and stocked so they can be introduced to suitable retailers.

Assortment gap detection (for example heatmap views of under-penetration across eligible retailers) builds on this catalog foundation. Low penetration is a signal to investigate, not proof of unmet demand.

Path: **Products** (`/products`).

## Summary cards

Three KPI cards at the top:

| Card | Meaning |
|------|---------|
| **Total Products** | All products in your workspace |
| **Published Products** | Products with status Published |
| **Products with Offers** | Products linked to an active discount or promotion |

Dismissible alerts may appear for **low stock** and **out of stock** products based on variant thresholds.

## Catalog list

### List actions

| Action | Purpose |
|--------|---------|
| **Refresh** | Reload catalog from the server |
| **Export Data** | Download the filtered catalog to XLSX |
| **+ Add Product** | Open the create form (`/products/add`) |

Import is supported in the product import modal (column mapping for XLSX/CSV). The main toolbar import button may be hidden in some builds; new imports always create **Draft** products with auto-generated `LKP-` IDs.

### Status and filters

- **Status tabs:** All, Draft, Published
- **Search:** by product name
- **Stock:** All Stock, High Stock, Low Stock, Out of Stock
- **Type** and **Category** filters (dynamic from your catalog)
- **Offers:** All Products, With Offers, Without Offers

**Data completion** banner flags rows missing required fields or images (highlighted in amber).

### Grid, list, and pagination

- **Grid View** (default on desktop) and **List View**
- Mobile uses card layout
- **8** products per page; empty state: **No products recorded**

**List columns:** Product ID / variant SKU, Product Name, Type, Category, Brand, Stock, Selling Price, Status, Last Updated, Actions.

**Row actions:** **View Product** (Published) or **Edit Product** (Draft), **Delete Product**.

**Selection:** checkboxes plus **Select All** for the current filtered set.

### Bulk actions

When products are selected, a bulk bar appears:

- **Publish** (Draft only) opens **Marketplace Preview** or **Bulk Publish**
- **Unpublish** (Published only) moves items back to Draft
- **Remove** deletes selected products

Mixed Draft and Published selections allow **Remove** only.

## Product form

Routes: `/products/add`, `/products/edit/{id}`, `/products/catalog/{id}` (view).

### General information

Fields include **Product ID** (auto `LKP-`), **Brand**, **Type** (category dropdown), **Product Name**, **Supplier**, **Product Description**, and assurance checkboxes (**Halal Certified**, **BPOM Approved**, **Original Product**) plus **Return Policy (days)**.

**Product Catalog Completion** shows percent complete and missing fields (name, description, category, brand, supplier, images, variants, stock, and variant-level SKU where required).

### Variants, stock, and images

- **Upload Images:** drag and drop, up to **10** images (JPG, PNG, GIF, max 5MB each)
- **Product Settings:** Product Type, **Product Category (by Channel)**, **Catalog Name**
- **Product Variants:** define variant types and options (e.g. Size: S, M, L)
- **Variation Lists:** table of every combination with **SKU**, **Selling Price**, **Purchase Price**, **MOQ**, **Stock Qty**, **Low Threshold**, and per-row status (**In Stock**, **Low Stock**, **Out of Stock**)
- **Quick Action: Apply To All** copies applicable prices, MOQ, and stock values across rows; each variant retains its own SKU identity
- **Product Stock Summary:** total pieces, threshold, overall status

#### Setting up variants correctly

Follow this order when creating or editing a product:

1. Define all **variant types and options** in **Product Variants** first.
2. Click **Refresh** in **Variation Lists** to rebuild the table rows from those variants.
3. Fill **SKU**, prices, **MOQ**, and stock for each row.
4. Click **Save Draft** or **Save and Publish** only when the table is complete and matches your variants.

> **Important:** After you add, remove, or rename any variant type or option, click **Refresh** again before saving or publishing. If you skip this step, the variation table can be out of sync and **Save** or **Publish** may fail with an error even when the form looks complete.

Variants and prices may be **locked** when the product has an active offer. Otherwise, catalog variants can be renamed or removed independently of orders. Past order items retain their original product, SKU, variant name, and attribute snapshots.

### Save, draft, and unpublish

| Mode | Actions |
|------|---------|
| Add / Edit (Draft) | **Cancel**, **Save Draft**, **Save and Publish** |
| View (Published) | **Unpublish** (delists from marketplace) |

**Published** products open in read-only view. To edit fields, unpublish first.

Leaving edit with unsaved changes triggers a browser confirmation.

## Publishing readiness

From the list (**Publish**) or form (**Save and Publish**):

1. Open **Marketplace Preview** (single) or **Bulk Publish (N products)** when storefront publishing is available on your plan
2. Review readiness: variant SKU where required, name, description, type, brand, supplier, variant pricing, stock &gt; 0, at least one image
3. Confirm **Publish** only when readiness checks pass

Incomplete products are listed under **Cannot Publish** with missing fields called out.

## Import and export

**Export** columns include Product ID, variant SKU (where applicable), Product Name, Type, Brand, Supplier, stock, purchase and selling price, status, and last updated.

**Import** maps spreadsheet columns to catalog fields; status is always set to **Draft** on import.

## Deleted products

Opening a link to a removed product shows **Product has been deleted** with **Go Back** and **Add Products**. Historical orders may still reference the original product and variant SKU snapshots.

## Related areas

| Goal | Go to |
|------|--------|
| Discounts on catalog items | [Offers](/en/docs/dashboard/offers) |
| Orders using SKUs | [Orders](/en/docs/dashboard/orders) |
| Low-stock widgets | [Home](/en/docs/dashboard/home) |

## Variant SKU and inventory rules (November 2026)

**There is no longer a top-level product SKU field.** A product has a stable Product ID (`LKP-`); SKUs belong to its individual variant options. Marketplace publishing and integrations must read variant SKUs, not request `Product.sku` from the product root. The variation table remains the place to review each variant's SKU, pricing, MOQ, and stock.

### One inventory across flexible stock levels

Stock levels such as pieces, cartons, and boxes are **units of the same variant inventory**, not independent stock pools. Configure conversion ratios for the variant and normalize transactions to the base quantity; the interface can display an equivalent breakdown in larger and smaller units. Entering a carton receipt must preserve the user's carton quantity and unit in the receipt, even when inventory uses pieces internally. Do not add both representations as separate stock.

### Catalog changes versus supplier history

- Creating a product or variant establishes its catalog and initial stock information; it does **not** generate a supplier purchase receipt or automatically synchronize a supplier ledger.
- Supply history and snapshots remain preserved when a product or variant is renamed or deleted. Deleting and recreating an option with the same label/SKU does not restore its previous variant option ID.
- Existing historical supplier rows may display a frozen variant label when the live variant no longer exists. Users must select a valid live variant for future stock-affecting receipts; never match solely by name or SKU.
- Stock increases from supplier receipts occur only when the explicit stock-update action succeeds. Inventory also changes through order fulfillment and other supported stock operations; supplier history alone is not the live stock balance.

For the distinction between supply history and snapshots, see [Clients](/en/docs/dashboard/clients).

### What happens when a variant is deleted?

Deleting a catalog variant removes its live inventory identity and makes it unavailable for future variant selection. **It does not automatically delete or archive supplier Supply History or Snapshots.** Existing receipts keep their historical labels and variant identifiers. Recreating an option with the same name or SKU produces a new identity and does not reconnect old stock movements.

If an old receipt references the deleted variant, its original stock movement cannot be reversed against a missing catalog row. Users must choose a current valid variant for new stock-affecting receipts; do not silently transfer historical stock or receipts to the replacement variant. To manage obsolete receipt entries, use the Supplier profile's archive or delete actions and review any stock-reversal choice. See [Clients](/en/docs/dashboard/clients).

### Imports and historical inventory links

- Imported products are created as **Draft**. Check mapped variant options, their SKUs, conversion levels, quantities, and prices before publishing; the product itself has no top-level SKU.
- A receipt can reference a deleted variant through its historical snapshot, but it cannot update that removed variant's inventory. A newly created same-name variant is a different ID.
- Orders and supplier receipts can both affect the same variant stock. They do not create separate carton, box, and piece inventories; conversions are alternative units of the same quantity.
