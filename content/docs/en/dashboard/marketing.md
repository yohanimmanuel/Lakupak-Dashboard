---
title: Marketing
description: Marketing hub, sales teams, agents, and WhatsApp campaigns.
section: Dashboard
module: dashboard
order: 16
---

The **Marketing** hub connects customer outreach tools: sales teams, WhatsApp campaigns, and shortcuts to clients and offers.

Path: **Marketing** (`/sales`).

## Marketing hub

**Tips** cards (dismissible) with detail modals:

| Tip | Action | Link |
|-----|--------|------|
| **Invite New Customers** | **Invite customers** | Clients |
| **Create Promotions** | **Create promotion** | Offers |
| **Cart Abandonment** | **View campaigns** | Campaigns |

**Tools** shortcuts:

| Tool | Description |
|------|-------------|
| **Teams** | Manage marketing team members and roles |
| **Campaigns** | Create and send rich message campaigns |
| **Automation** | Automated workflows (page may be a stub until released) |

Sidebar may show **Team** and **Campaigns**; **Automations** can be hidden until the feature ships.

## Teams

Path: `/sales/team`.

### Team list actions

| Action | Purpose |
|--------|---------|
| **Refresh** | Reload agents and teams |
| **Export Data** | XLSX: Name, Email, Phone, Role, Status, Territory, Team |
| **Add Agent** | Create a sales agent |

### Agents and filters

**Tabs:** **Individuals**, **Teams**.

**Search:** **Search agents...**

**Filters:** **All Roles** plus dynamic roles; **All Status**, **Active**, **Inactive**.

**Roles** include Sales Manager, Sales Rep, Sales Support, Lead Gen, Account Manager.

**Bulk:** **Remove Agent** / **Remove Selected** when rows are checked.

**Team modals:** **Create New Team**, **Edit Team** with **Create Team** / **Update Team**.

### Agent profile

Routes: `/sales/team/create`, `/sales/team/details?id=…`, `/sales/team/edit?id=…`.

Create/edit tabs:

- **Basic Profile**
- **Favourite Products**
- **Sales Reporting**
- **Sales Target**

**Delete Agent** / **Delete Agents** confirmation modals.

## Campaigns

Path: `/sales/campaigns`.

### Campaign list

| Action | Purpose |
|--------|---------|
| **Create campaign** | New campaign wizard |

**Status tabs:** All, Draft, Scheduled, Completed (includes Sent).

**Search:** **Search campaigns...**

**Filter:** **All Recipients** plus per-campaign recipient labels.

Rows show name, description, **Recipients**, **Opened**, **Clicked**, status, and **Send Date** or **Not sent**.

**Bulk (one selected):** **Send Campaign** / **Resend Campaign** (WhatsApp), **Remove Campaign**.

Empty: **No campaigns found**.

### Create and send

Routes: `/sales/campaigns/create`, `/sales/campaigns/details?id=…&mode=edit|view`.

Fields include auto **Campaign ID**, name, description, and **Campaign Completion** progress.

After send, **Campaign Performance** shows Opens, Clicks, revenue, and orders.

**SendCampaignModal** handles WhatsApp delivery. **Delete Campaign** confirmation before removal.

## Automations

`/sales/automation` may show a placeholder (**Automations** — *Manage your marketing automation workflows*) until workflows are released.

## Related areas

| Goal | Go to |
|------|--------|
| Buyer records | [Clients](/en/docs/dashboard/clients) |
| Product promotions | [Offers](/en/docs/dashboard/offers) |
| Campaign metrics vs orders | [Orders](/en/docs/dashboard/orders) |
| Home marketing widget | [Home](/en/docs/dashboard/home) |
