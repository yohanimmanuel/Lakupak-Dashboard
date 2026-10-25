---
title: Sales
description: Sales hub, conversion opportunities, teams, jobs, and buyer prospects.
section: Dashboard
module: dashboard
order: 16
---

The **Sales** area turns product–retailer opportunities into field work: prioritise follow-ups, manage agents and teams, assign jobs, and capture new outlet prospects.

Path: **Sales** (`/sales`).

Product framing: use Sales so visits go beyond the same bestsellers, and so purchase history, quotations, and buyer interest become actionable jobs.

## Sales hub (`/sales`)

### Tips

Dismissible tip cards with detail modals:

| Tip | Primary action | Goes to |
|-----|----------------|---------|
| **Invite New Customers** | **Invite customers** | Clients |
| **Create Promotions** | **Create promotion** | Offers |
| **Sales jobs** | **View jobs** | Jobs |

### Tools

| Tool | Route | Purpose |
|------|-------|---------|
| **Team** | `/sales/team` | Agents, roles, and teams |
| **Jobs** | `/sales/jobs` | Field jobs for the sales team |
| **Prospect** | `/sales/prospects` | Buyer prospects / new outlets |

### Sales Conversion table

Below Tips, **Sales Conversion** lists open jobs and opportunities analysed across Sales, Orders, and Clients, sorted by priority.

**Summary chips:** Open opportunities, Overdue buyers, Quotes follow-up, Orders attributed.

**Type tabs:** All | Reorder | Quotation | Buyer interest | Sales task

**Filters:**

- Search: **Search buyer, product, or sales rep…**
- **Timing:** All timing | 30+ days | 14 to 29 days | 7 to 13 days | Under 7 days | No timing
- **Value:** All values | Above / below currency thresholds | No value

**Columns:** Rank | Buyer | Type | Urgency | Why it matters | Sales rep | Timing | Value | Action

**Actions** deep-link to buyer detail, order detail, or **Jobs**. Pagination: **8 rows per page**.

The same conversion insight family powers the optional **Sales Conversion Engine** widget on [Home](/en/docs/dashboard/home).

## Teams (`/sales/team`)

### List actions

| Action | Purpose |
|--------|---------|
| **Refresh** | Reload agents and teams |
| **Export Data** | XLSX export of agents |
| **Add Agent** | Create a sales agent |

### Individuals and Teams tabs

**Tabs:** **Individuals** | **Teams**

**Search:** **Search agents…**

**Filters:** **All Roles** (Sales Manager, Sales Rep, Sales Support, Lead Gen, Account Manager, and others) | **All Status** | Active | Inactive

**Individuals columns:** NAME | PHONE | EMAIL | ROLE | STATUS | ACTIONS

**Bulk:** select rows, then **Remove Selected**.

**Teams:** expandable regions; **Create New Team** / **Edit Team** (team or region name, member multi-select).

### Agent create, edit, and details

Routes: `/sales/team/create`, `/sales/team/details?id=…`, `/sales/team/edit?id=…`.

Create/edit tabs:

| Tab | Contents |
|-----|----------|
| **Basic Profile** | Identity and contact |
| **Favourite Products** | Products the agent prioritises |
| **Daily Field Reports** | Field reporting setup |
| **Sales Target** | Targets and progress |

Details show targets, favourite products, field reports, and biography. Confirm before **Delete Agent**.

## Jobs (`/sales/jobs`)

**Actions:** **Export Data**, **Create new job** (`/sales/jobs/new`), edit (`/sales/jobs/edit`), delete (single or bulk).

**Stat cards:** Total jobs | Pending | Open | Completed

**Status tabs:** All | Pending | Complete

**Search:** **Search client or rep**

**Filters:** **All types** | **All reps**

**Table highlights:** clients, job type badges, rep, status, dates, reasons, **Created by** (**AI** or **Manager**), suggested products. Pagination groups jobs (5 groups per page).

### Job types (create form)

| Type | Purpose |
|------|---------|
| **Take order** | Capture an order at the outlet |
| **Collect payment** | Collect payment from the buyer |
| **Promote product** | Present specific products |
| **Stock check** | Count stock **at the buyer's shop shelves** (not warehouse stock) |
| **Pick up return** | Collect returns |
| **Competitor check** | Record competitor intel |

Additional type labels may appear from existing jobs (for example prospecting or activation). New outlets are added from **Prospect**, not as a substitute for the Prospect board.

### Job statuses

Pending, Suggested, Approved, Dispatched, In progress, Completed, Skipped. Older **approved** / **suggested** values display under Pending where the UI rolls them up.

### Create or edit a job

Form (`Create new job` / **Edit job**):

- One or more job rows on the page
- Sales rep assignment
- Schedules and **Dates and WhatsApp reminders**
- Clients and products (depending on type)

**Stock check:** choose clients and the products to count at each buyer's shop. On completion, mark **Checked** and enter **Counted stock** per product (`stock_counts`). Multi-buyer stock jobs complete when every buyer row is done. An overdue or low-count signal is a reason to investigate, not automatic proof of demand.

## Buyer Prospect (`/sales/prospects`)

**Actions:** **Export Data**, **Create new prospect**, **Edit**, **Delete**, bulk delete.

**Search:** **Search prospects**

**Filter:** **All regions** plus region list

**Columns:** Customer number | Name | Store name | Phone | Address | Region | Buyer type | Notes

**Buyer types:** Warung, Kiosk, Minimarket, Restaurant, Hotel, Canteen, Other.

**Create / edit** (`/sales/prospects/new`, `/sales/prospects/edit/[id]`): required prospect fields, plus **Ask AI** to open Lakupak AI for assisted fill (including map-oriented suggestions when available).

## Related areas

| Goal | Go to |
|------|--------|
| Buyer records | [Clients](/en/docs/dashboard/clients) |
| Product promotions | [Offers](/en/docs/dashboard/offers) |
| Orders | [Orders](/en/docs/dashboard/orders) |
| Home widgets | [Home](/en/docs/dashboard/home) |
