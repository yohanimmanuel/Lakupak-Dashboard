---
title: Notifications
description: In-app alerts, order updates, announcements, and push settings.
section: Marketplace
module: marketplace
order: 36
---

Stay informed about orders, promotions, and platform news from the **Notifications** tab and device push settings.

## Notifications tab

Path: `/(tabs)/notifications`.

The tab works for guests (latest updates) and logged-in buyers (order section).

### Stored alerts

Non-order notifications with types such as **discount**, **promotion**, and **update** (tag, gift, or bell icons).

### Order updates block

**Order updates** shows up to five recent order events with **View all** ? **Order updates** full list (`/order-notifications`).

Empty: **No orders available yet**.

Example titles: **Order Placed**, **Payment Required**, **Order Shipped**, **Return Request Submitted**, **Payment update**.

Push taps for `order` or `payment` open **Order Details** for that order.

### Latest updates

Platform announcements from Lakupak.

**Tabs:** All, Updates, Promotion, Maintenance, Policy.

**Read all** marks items read. Swipe to **Remove from list**.

Tap an item ? announcement detail screen.

Realtime refresh uses platform announcement channels so new posts appear without restarting the app.

## Push notification settings

Path: **Settings ? Notification Settings** (`/settings/notifications`).

| Toggle | Controls |
|--------|----------|
| **Push notifications** | Master switch for all app pushes |
| **Orders** | Status, payments, shipping |
| **Latest updates** | Platform announcements |
| **Promotions** | Vouchers and offers |

Note: **You may still receive notifications from your device system settings.**

Preferences are stored on device and synced with the push registration service.

## Related documentation

- [Orders](/en/docs/marketplace/orders) for order detail actions
- [Account settings](/en/docs/marketplace/account-settings) for the settings hub
- [Cart and checkout](/en/docs/marketplace/cart-checkout) when payment reminders fire
