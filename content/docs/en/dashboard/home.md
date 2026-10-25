---
title: Home
description: Customizable dashboard with KPIs, draggable widgets, and live business snapshots.
section: Dashboard
module: dashboard
order: 11
---

The **Home** page is your command center after login. It loads a snapshot of orders, products, buyers, and suppliers, then presents that data through a KPI strip and a set of widgets you can rearrange to match how you work.

## Top KPI cards

Four summary cards sit above the widget grid (values come from your full order history, not only what is visible in a widget):

| Card | What it shows |
|------|----------------|
| **Total Sales** | Total revenue from all orders |
| **Revenue Collected** | Revenue from paid orders (total sales minus pending) |
| **Total Orders** | Count of orders in the system |
| **Pieces Sold** | Total units sold across orders |

Use these for a quick read on sales volume and collection before diving into individual widgets.

## Customize your layout

Click **Drag widgets to rearrange** to open the **Widget Library**. From there you can:

- **Drag** widgets on the dashboard to change order (two-column grid on larger screens).
- **Add** or **Remove** widgets with the button on each library card.
- **Drag from the library** onto the grid to insert a module you have hidden.

Your layout is saved per user in the browser, so the Home page remembers your choices on the next visit.

Default widgets in the library today: Orders Pipeline, Product Performance, Inventory Alerts, Buyer Engagement, and Supplier Network.

The **Sales Conversion Engine** widget (full-width opportunity cards) and analytics-oriented widgets are implemented in the product; they reappear in the Widget Library when those modules are enabled in the product menu. The full conversion table also lives on [Sales](/en/docs/dashboard/sales).

## Widget reference

### Orders Pipeline

Shows the **four most recent orders** with store name, contact person, order date, status badge (Pending, Confirmed, Packed, Shipped, Delivered, and others), order total, and a **Details** link to the order page. Use **View all orders** for the full list, filters, map, and export.

### Product Performance

Ranks your **top three products by revenue** with product image, category, revenue, pieces sold, margin percentage, and a revenue progress bar. Use **Manage catalog** to edit products or publish to the marketplace.

### Inventory Alerts

Inventory snapshot across the catalog:

- **Total products** (with active published count and total pieces in stock)
- **Low stock** count and **critical** items (well below threshold or out of stock)
- **Average stock level** per product

Lists up to three **top low-stock products** with current stock, threshold, and a link to the product in the catalog. Use **Manage products** to restock or adjust thresholds.

### Buyer Engagement

Buyer and order metrics in one place:

- Total and **active** buyers
- **Average order value** across all orders
- **Pieces sold** and **units sold**

**Top buyers by revenue** (up to three) show store name, status, order count, revenue, and pieces. Use **Manage buyers** under Clients.

### Supplier Network

Supplier health and purchasing:

- Total and **active** suppliers
- **On-time delivery** rate (goal shown as 90% or higher)
- **Top supplier value** from supply and purchase data

**Priority suppliers** lists up to three suppliers by fulfillment value. Use **Manage suppliers** under Clients.

### Sales Conversion Engine

Full-width widget (spans two columns on large screens) showing the **top urgent opportunities** as cards, drawn from the same Sales Conversion insights as the table on [Sales](/en/docs/dashboard/sales).

Cards summarise buyer, opportunity type, urgency, why it matters, and a recommended action. Use it for a daily priority queue; open **Sales** for the full searchable table with timing and value filters.

When this widget is enabled in the Widget Library, it can be added, removed, and reordered like other Home modules.

## When data looks empty

Widgets show friendly empty states until you have orders, products, or buyers. After your first orders and catalog items are in place, Home fills in automatically on refresh.

## Related areas

| Goal | Go to |
|------|--------|
| Full order list and fulfillment | [Orders](/en/docs/dashboard/orders) |
| Catalog and stock | [Products](/en/docs/dashboard/products) |
| Buyer Marketplace | [Marketplace overview](/en/docs/marketplace/overview) |
