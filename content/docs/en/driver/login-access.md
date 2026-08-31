---
title: Login and access
description: Welcome, login, request access, and session handling.
section: Driver
module: driver
order: 41
---

Drivers sign in with credentials from their distributor. The welcome screen also offers **Request access** when you do not have an account yet.

## Welcome screen

Path: `/useraccounts/welcome`.

Carousel slides:

| Slide | Topic |
|-------|--------|
| 1 | **Deliver with your fleet** — assigned deliveries, navigate, update status |
| 2 | **Live tracking** — location shared with buyer until delivery |
| 3 | **Proof of delivery** — capture POD in one tap |

Buttons:

- **Login** → login modal
- **Register** → request-access modal (not instant account creation)

## Login

Path: `/useraccounts/loginsignup/loginmodal`.

| Field / action | Label |
|----------------|--------|
| Title | **Welcome back** |
| Hint | Use username and password from your distributor |
| **Username** | e.g. `budi.santoso` |
| **Password** | |
| Submit | **Login** / **Logging in…** |
| Footer | **Don't have an account? Request access** |

**API:** `POST /api/driver/auth/login`.

### Login errors

| Situation | Message |
|-----------|---------|
| Empty fields | **Missing information** |
| Wrong credentials | **Invalid Credentials** |
| Rate limited | **Too many attempts** (try again in about 15 minutes) |
| Other | **Login Failed** |

Success redirects to **Home** (`/(tabs)/home`).

Token is stored in secure storage and validated on launch via `GET /api/driver/me`.

## Request access

Path: `/useraccounts/loginsignup/signupmodal`.

Two-step **request access** flow (distributor reviews manually):

### Step 1 — Your details

**Full name**, **Phone number** → **Continue**

### Step 2 — Distributor details

**Distributor email** (Dashboard login email), **Message (optional)** → **Send request** / **Sending…**

**API:** `POST /api/driver/request`.

Done screen: **Request sent!** — distributor sends credentials → **Go to Login**.

## Session and account status

- Invalid or expired token: cleared on startup; order actions may show **Session expired — Please log in again.**
- Deactivated drivers may see **Invalid Credentials** or **Login Failed** depending on API response.
- There is no separate in-app **suspended** screen; terms note that distributors or Lakupak may suspend access.
- **Delete Account** in Settings only instructs you to contact your distributor.

## Related documentation

- [Driver overview](/en/docs/driver/overview)
- Dashboard: [Logistics](/en/docs/dashboard/logistics) for creating drivers and fleets
