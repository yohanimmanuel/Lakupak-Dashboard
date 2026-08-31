---
title: Products
description: Catalog, variants, stock, marketplace publish, and export.
section: Dashboard
module: dashboard
order: 13
---

The **Products** area is your B2B catalog. You create SKUs with variants and images, track stock per variant, and publish items to the buyer **Lakupak Marketplace** when they are ready.

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

**List columns:** ID/SKU, Product Name, Type, Category, Brand, Stock, Selling Price, Status, Last Updated, Actions.

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

Fields include **Product ID** (auto `LKP-`), **SKU Number**, **Brand**, **Type** (category dropdown), **Product Name**, **Supplier**, **Product Description**, and assurance checkboxes (**Halal Certified**, **BPOM Approved**, **Original Product**) plus **Return Policy (days)**.

**Product Catalog Completion** shows percent complete and missing fields (SKU, name, description, category, brand, supplier, images, variants, stock).

### Variants, stock, and images

- **Upload Images:** drag and drop, up to **10** images (JPG, PNG, GIF, max 5MB each)
- **Product Settings:** Product Type, **Product Category (by Channel)**, **Catalog Name**
- **Product Variants:** define variant types and options (e.g. Size: S, M, L)
- **Variation Lists:** table of every combination with **SKU**, **Selling Price**, **Purchase Price**, **MOQ**, **Stock Qty**, **Low Threshold**, and per-row status (**In Stock**, **Low Stock**, **Out of Stock**)
- **Quick Action: Apply To All** copies SKU, prices, MOQ, and stock values across all rows
- **Product Stock Summary:** total pieces, threshold, overall status

#### Setting up variants correctly

Follow this order when creating or editing a product:

1. Define all **variant types and options** in **Product Variants** first.
2. Click **Refresh** in **Variation Lists** to rebuild the table rows from those variants.
3. Fill **SKU**, prices, **MOQ**, and stock for each row.
4. Click **Save Draft** or **Save and Publish** only when the table is complete and matches your variants.

> **Important:** After you add, remove, or rename any variant type or option, click **Refresh** again before saving or publishing. If you skip this step, the variation table can be out of sync and **Save** or **Publish** may fail with an error even when the form looks complete.

Variants and prices may be **locked** when the product has an active offer. Renaming or deleting variants used in past orders is blocked with an explanatory modal; create new options instead to protect order history.

### Save, draft, and unpublish

| Mode | Actions |
|------|---------|
| Add / Edit (Draft) | **Cancel**, **Save Draft**, **Save and Publish** |
| View (Published) | **Unpublish** (delists from marketplace) |

**Published** products open in read-only view. To edit fields, unpublish first.

Leaving edit with unsaved changes triggers a browser confirmation.

## Marketplace publishing

From the list (**Publish**) or form (**Save and Publish**):

1. Open **Marketplace Preview** (single) or **Bulk Publish (N products)**
2. Review readiness: SKU, name, description, type, brand, supplier, variant pricing, stock &gt; 0, at least one image
3. Preview shows how the listing appears in the **Lakupak Marketplace App**
4. Confirm **Publish**

Incomplete products are listed under **Cannot Publish** with missing fields called out.

## Import and export

**Export** columns include Product ID, SKU, Product Name, Type, Brand, Supplier, stock, purchase and selling price, status, and last updated.

**Import** maps spreadsheet columns to catalog fields; status is always set to **Draft** on import.

## Deleted products

Opening a link to a removed product shows **Product has been deleted** with **Go Back** and **Add Products**. Historical orders may still reference that SKU.

## Related areas

| Goal | Go to |
|------|--------|
| Discounts on catalog items | [Offers](/en/docs/dashboard/offers) |
| Orders using SKUs | [Orders](/en/docs/dashboard/orders) |
| Storefront performance | [Marketplace (admin)](/en/docs/dashboard/marketplace-admin) |
| Low-stock widgets | [Home](/en/docs/dashboard/home) |
