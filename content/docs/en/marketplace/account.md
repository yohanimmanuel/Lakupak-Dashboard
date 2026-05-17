---
title: Account
description: Signup, login, profile, purchases, and networks.
section: Marketplace
module: marketplace
order: 31
---

The **Account** tab and auth flows manage your buyer identity, purchase shortcuts, and distributor relationships.

## Welcome and registration

Path: `/useraccounts/welcome`.

**Login** opens **Welcome Back** with **Your Email**, **Password**, **Forgot password?**, and **Create Account**.

**Register** opens a three-step **Create Account** wizard:

1. **Full Name**, **Email Address** → **Continue**
2. **Store Name**, **Bio (Optional)** → **Continue**
3. **Username**, **Password**, **Confirm Password** → **Create Account**

Footer: **By registration, you agree to our Security and Privacy.**

Phone OTP strings exist in the app; the dedicated phone step may be disabled in some builds. Registration still completes through the backend verify flow.

### Login issues

Alerts you may see:

- **Missing Information**
- **Account Suspended**
- **Account Not Found**
- **Invalid Credentials**
- **Too many attempts**

Overflow menu: **Security & Privacy**, **Help Center**, **Close**.

### Forgot password

**Forgot Password** → email step **Reset your password** → **Create new password** with **Verification Code**, **New Password**, **Confirm Password**, **Reset password**.

## Account tab

Path: `/(tabs)/account`.

**Logged out:** **Create an account to win first-order benefits!** with **Login** / **Sign Up**.

**Logged in:** profile row → **Profile** (`/useraccounts/userprofile/editprofile`) with username and address.

Header badge **Start Distributing!** links to distributor onboarding (**Welcome to Laku!**, **Get Started**, **Maybe later**).

### My Purchases shortcuts

| Shortcut | Opens tab |
|----------|-----------|
| **To Pay** | Unpaid orders |
| **To Ship** | Awaiting shipment |
| **To Receive** | In transit |
| **To Rate** | Awaiting review |

**View Purchases History** → **My Purchases** with full tab set.

### My Networks

Shows recent distributors by order activity or **No networks yet**.

- **View All Networks** → **My Networks**
- **View All Followings** → **Followings**

### More services

**Favourites**, **Recently Viewed**, **Buy Again**, **Get Vouchers**.

**My Wallet** may be hidden until the wallet feature is released.

## Profile and addresses

Edit screens include **Edit Username**, **Edit Name**, **Edit Bio**, **Edit Phone**, **Edit Email**, **Edit Store Name**, **Edit Country**, and **Edit Address**.

**My Addresses** lists delivery addresses; **New Address** creates one.

**Followers** and **Following** social lists are available from profile routes.

## Suspended accounts

Suspended buyers see a blocking modal (**Account suspended**) and cannot shop until the distributor or platform restores access.

## Related documentation

- [Account settings](/en/docs/marketplace/account-settings) for language and notifications
- [Orders](/en/docs/marketplace/orders) for purchase tabs
- [Offers and following](/en/docs/marketplace/offers-following) for networks
