---
title: Automations
description: Workflow list, builder canvas, statuses, Ask AI, and run history.
section: Dashboard
module: dashboard
order: 21
---

**Automations** lets you build trigger-based workflows for catalog, offers, clients, orders, and sales so follow-up does not rely on memory alone.

Paths: `/automation`, `/automation/new`, `/automation/details?id={workflowId}`.

## Workflow list (`/automation`)

**Actions:** **Refresh**, **New Workflow**

**Stat cards:** Total Workflows | Active | Paused | Draft

**Status tabs:** All | Active | Paused | Draft

**Search:** **Search workflows…**

**Type filter:** All Types | Product & Offers | Lead Management | Order & Logistics | Sales

**Columns:** Workflow | Type | Trigger | Status | Last Run (**Never** when no runs yet)

**Row actions:** open/edit, delete. **Bulk:** Activate, Pause, Remove.

### Workflow statuses

| Status | Meaning |
|--------|---------|
| **active** | Running against its trigger rules |
| **paused** | Saved but not executing |
| **draft** | Incomplete or not activated |

### Workflow types

| Type key | UI label |
|----------|----------|
| `product_offers` | Product & Offers |
| `lead_management` | Lead Management |
| `order_logistics` | Order & Logistics |
| `sales` | Sales |

## Builder (`/automation/new` and `/automation/details`)

Canvas builder with inspector.

**Toolbar actions (right side):** **Ask AI**, plus workflow actions such as **Save** (draft), **Activate**, **Pause**, **Test run** (when enabled), and **Undo**.

### Ask AI

**Ask AI** opens the docked Lakupak AI panel for this workflow (**Draft a workflow**). You can describe the automation in chat, then **Apply to this workflow** to update the canvas. Changes apply only after you save.

Use Ask AI for drafting and refining steps. It does not replace activating the workflow.

### Details and run history

`/automation/details?id=…` edits an existing workflow and shows recent **automation runs** (success, failed, skipped, in progress when available).

## Related areas

| Goal | Go to |
|------|--------|
| Catalog and offers | [Products](/en/docs/dashboard/products), [Offers](/en/docs/dashboard/offers) |
| Orders | [Orders](/en/docs/dashboard/orders) |
| Sales jobs | [Sales](/en/docs/dashboard/sales) |
