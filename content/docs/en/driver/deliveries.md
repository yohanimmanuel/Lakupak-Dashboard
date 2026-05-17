---
title: Deliveries
description: Status updates and POD.
section: Driver
module: driver
order: 43
---

# Deliveries

## Per-stop updates

For each order stop, update status:

- **Shipped**
- **Delivered** — attach POD photos when required
- **Failed** — provide reason and evidence via **Report failure**

## Offline behavior

Failed or delayed syncs may queue in an offline outbox and retry when connectivity returns.