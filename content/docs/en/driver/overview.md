---
title: Driver overview
description: Lakupak Driver mobile app tabs, access model, and navigation.
section: Driver
module: driver
order: 40
---

**Lakupak Driver** is the mobile app (Expo/React Native) for distributor fleet drivers. Drivers run assigned routes, update order status, share live location with buyers, and submit proof of delivery (POD) or failure reports.

Available in **English** and **Bahasa Indonesia**.

## Who uses the Driver app

- Field drivers linked to one **distributor** (`distributorId` on the profile)
- Accounts are **created in Lakupak Dashboard** (Logistics); drivers do not get instant self-signup
- Data scope: fleets and orders assigned to that driver via `GET /api/driver/fleets`

## Main navigation

Four bottom tabs:

| Tab | Purpose |
|-----|---------|
| **Home** | Greeting, active/delivered stats, latest orders, assigned fleets |
| **Tasks** | Calendar and daily delivery tasks |
| **Notifications** | In-app alert history |
| **Account** | Profile, settings, help, logout |

Header on Home shows **Lakupak Driver**.

### Other routes

| Area | Examples |
|------|----------|
| Auth | `/useraccounts/welcome`, login modal, request-access modal |
| Logistics | Map route, order details, report failure, filter modal, fleet details |
| Account | Profile, settings, language, help, privacy, terms |

After login the app connects WebSocket, starts GPS sync, registers push, and processes any offline status queue.

## Access model

| Action | How |
|--------|-----|
| Get credentials | Distributor creates driver in **Dashboard → Logistics** |
| No account yet | **Register** on welcome = **Request access** (not instant signup) |
| Sign in | **Login** with username and password from distributor |

## How it fits Lakupak

| Role | App |
|------|-----|
| Distributor plans fleets | Lakupak Dashboard **Logistics** |
| Buyer tracks delivery | Lakupak Marketplace |
| Driver executes route | **Lakupak Driver** |

## Related documentation

- [Login and access](/en/docs/driver/login-access)
- [Tasks](/en/docs/driver/tasks)
- [Deliveries](/en/docs/driver/deliveries)
- [Location and realtime](/en/docs/driver/location-realtime)
