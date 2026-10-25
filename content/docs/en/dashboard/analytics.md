---
title: Analytics
description: Financial, customer and sales, and operational analytics with time ranges and export.
section: Dashboard
module: dashboard
order: 17
---

**Analytics** gives financial, customer/sales, and operational views of your distributor business. Use the same time range when comparing charts. Treat patterns as signals to investigate (penetration, purchasing, fulfillment), not automatic proof of causation.

Paths:

| Route | Page |
|-------|------|
| `/analytics` | Analytics Dashboard (overview) |
| `/analytics/financial` | Financial Analytics |
| `/analytics/sales` | Customer & Sales Analytics |
| `/analytics/performance` | Operational Performance |

Sidebar structure when enabled: **Analytics** → Financial, Sales, Operational.

## Shared controls

**Time range** (overview and all subpages): **Per Month** | **Per Quarter** | **Per 6 Months** | **Per Year**

Empty states guide you to **Add Products** or **Manage Orders** when there is not enough catalog or order data.

Metrics and charts are computed from your account orders and products (queries are capped; very large catalogs may not include every historical row in one load).

## Overview (`/analytics`)

**Title:** Analytics Dashboard

**Metric cards:** Order Volume | Pieces Sold | Order Completion Rate | Average Order Value (with period-over-period comparison).

**Charts:**

- **Revenue Trend** — order volume and profit over time
- **Sales Trend** — orders and units (**See More** → Customer & Sales Analytics)
- **Order Status Distribution** — pie of statuses
- **Processing Time Trend** — average processing time and order counts

**Top Performing Products** table (top five; **See More** → Financial Analytics).

## Financial Analytics (`/analytics/financial`)

**Actions:** time range; **Export** (HTML report you can open in Word as `.doc`).

**Metric cards:** Order Volume | Total Profit | Profit Margin | Average Order Value

**Sections:**

- **Revenue Trend**
- **Revenue by Category**
- **Revenue Forecast** (needs enough monthly history, typically two or more months)
- **Cash Flow Trend** — inflows, outflows, net flow
- **Top Performing Products** — rank, product, category, pieces, free items, order volume, margin, profit; open a product for variant-level detail

## Customer & Sales Analytics (`/analytics/sales`)

**Actions:** time range; **Export** (sales report `.doc`).

**Metric cards:** Total Orders | Pieces Sold | Avg Pieces / Order | Avg Order Value

**Sections:**

- **Sales Trend** — orders and units
- **Units by Product Category** — filter **Product Category** or **Product Type**
- **Sales Trend Forecast** — historical bars plus forecast when history is sufficient
- **Customer Acquisition** — new relations, churned, net growth
- **Top Customers** — avatar, Buyer ID (link), Name, Business Type, Orders, Order Volume

## Operational Performance (`/analytics/performance`)

**Actions:** time range (no export button on this page).

**Metric cards:** Order Completion Rate | Avg Processing Time | Tracking Coverage | Stock Health

**Sections:**

- **Order Status Distribution**
- **Processing Time Trend**
- **Inventory Health by Category**
- **Operational Quality Metrics** — Order Acceptance Rate, Tracking Coverage, Data Completeness, Stock Health (shown against targets)
- **Delivery Methods Distribution**

## Related areas

| Goal | Go to |
|------|--------|
| Source orders and catalog | [Orders](/en/docs/dashboard/orders), [Products](/en/docs/dashboard/products) |
| Home KPIs and widgets | [Home](/en/docs/dashboard/home) |
| Storefront performance | [Marketplace (admin)](/en/docs/dashboard/marketplace-admin) |
