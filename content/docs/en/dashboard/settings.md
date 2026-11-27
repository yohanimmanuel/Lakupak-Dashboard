---
title: Settings
description: Profile, distributor operations, team, billing, security, and tours.
section: Dashboard
module: dashboard
order: 20
---

**Account Settings** (`/settings`) centralizes your profile, company storefront data, team, locale, billing, and security.

## Settings tabs

| Tab | Purpose |
|-----|---------|
| **General Info** | Personal profile |
| **Distributor Operations** | Company, shipping, storefront-facing data, referral code when configured |
| **Features & Tours** | Replay guided walkthroughs for active modules |
| **Team & Sales** | Sales teams and territories |
| **Language & Region** | Language, region, currency |
| **Billing & Payment** | Bank and billing address |
| **Security & Password** | Email and password |

## General Info

**Personal Information:** profile photo, name, email, phone, bio, location.

**Edit**, **Save**, **Cancel** to update your user profile.

## Distributor Operations

**Company Information:** logo, banner, company name, registration, tax ID, description.

Contact: **Business Address**, **Business Phone**, **Business Email**.

**Shipping & Delivery Configurations:**

- **Shipping Options:** Self Pickup, Seller/Distributor Delivery, Buyer-arranged Courier
- **Pickup Address**
- **Preferred Delivery Time Slots** and **Preferred Delivery Days**
- Default delivery lead time

These values appear on storefront and checkout surfaces when private marketplace ordering is enabled for your account.

**Marketplace referral code:** set a unique code buyers use at Marketplace login or register to join your storefront. The code must be unique across distributors; validation runs when you save.

**Show discounted price when buyers submit a PO**

Product cards show the market segment price for the buyer’s main channel, or the variant’s default selling price when that channel has no segment price. When this switch is on, a new purchase order also shows that client’s private rate as soon as they submit. When it is off, the order stays on the segment or default price until you use **Send pricing to buyer**. An existing buyer relationship does not turn the private rate on by itself.

See [Offers](/en/docs/dashboard/offers) and [Orders](/en/docs/dashboard/orders).

## Features and Tours

Replay product tours for active modules, for example:

- Dashboard overview, Products, Orders, Offers

Statuses: **Completed**, **Skipped / closed**, **Not started**.

**Start tour**, **Reset** per module.

## Team and Sales

**Sales Team Overview** with targets and progress.

**Sales Team Directory:** search, **Filter by role** (All Roles, Sales Manager, Sales Rep, and others).

**Territory Management** for coverage areas.

**Add Sales Team Member** / **Edit Sales Team Member** modals.

Related to **Sales → Teams** but focused on account-level sales configuration.

## Language and Region

**Language & Regional Settings:** **Language**, **Region**, **Currency** (currency may be read-only based on region).

## Billing and Payment

**Billing Account:** bank name, account holder, account number — **Edit Account**.

**Billing Address** — **Edit Address**.

Subscription, invoices, and upgrade plan sections may be hidden until billing features are enabled in your build.

## Security and Password

**Account Security:**

- **Email Address**
- **Password** — **Create Password** or **Change Password**

Keep billing and company data current to avoid payout or compliance issues.

## Related areas

| Goal | Go to |
|------|--------|
| Buyer Marketplace | [Marketplace overview](/en/docs/marketplace/overview) |
| Publish products | [Products](/en/docs/dashboard/products) |
| Per-retailer rates | [Offers](/en/docs/dashboard/offers) |

## Save actions and downstream results

| Action | System result |
|---|---|
| Edit / Save / Cancel profile | Saves or discards personal profile changes; does not edit buyer or supplier records. |
| Save company identity and delivery options | Updates storefront-facing logo, contacts, pickup, shipping methods and lead time where marketplace features are enabled. |
| Save referral code | Validates uniqueness before buyers can use the code to join the storefront. |
| Toggle buyer discounted-price display | Controls whether new submitted POs show applicable client rates immediately or wait for **Send pricing to buyer**. Product cards still show the segment or default selling price. |
| Change language / region / currency | Changes supported interface and regional settings; currency availability can be restricted by region. |
| Edit billing account / address | Updates saved billing details; does not itself record a payment or payout. |
| Create/change password | Updates credentials through the security flow. |
| Start/reset a tour | Replays or resets onboarding progress without changing operational data. |

Use **Save** to persist edits and **Cancel** to discard pending changes. Hidden features may depend on account configuration.
