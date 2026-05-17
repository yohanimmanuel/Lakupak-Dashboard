---
title: Akun
description: Daftar, login, profil, pembelian, dan jaringan.
section: Marketplace
module: marketplace
order: 31
---

Tab **Account** dan alur autentikasi mengelola identitas pembeli, pintasan pembelian, dan hubungan dengan distributor.

## Welcome dan pendaftaran

Jalur: `/useraccounts/welcome`.

**Login** membuka **Welcome Back** dengan **Your Email**, **Password**, **Forgot password?**, **Create Account**.

**Register** membuka wizard **Create Account** tiga langkah:

1. **Full Name**, **Email Address** → **Continue**
2. **Store Name**, **Bio (Optional)** → **Continue**
3. **Username**, **Password**, **Confirm Password** → **Create Account**

Footer: persetujuan **Security and Privacy**.

Langkah OTP telepon bisa dinonaktifkan di beberapa build; pendaftaran tetap lewat verify backend.

### Masalah login

Alert yang mungkin muncul:

- **Missing Information**
- **Account Suspended**
- **Account Not Found**
- **Invalid Credentials**
- **Too many attempts**

Menu overflow: **Security & Privacy**, **Help Center**, **Close**.

### Lupa kata sandi

**Forgot Password** → email → **Create new password** dengan **Verification Code**, **New Password**, **Confirm Password**, **Reset password**.

## Tab Account

Jalur: `/(tabs)/account`.

**Belum login:** **Create an account to win first-order benefits!** dengan **Login** / **Sign Up**.

**Sudah login:** baris profil → **Profile** dengan username dan alamat.

Badge **Start Distributing!** ke onboarding distributor.

### Pintasan My Purchases

| Pintasan | Tab |
|----------|-----|
| **To Pay** | Belum dibayar |
| **To Ship** | Menunggu kirim |
| **To Receive** | Dalam pengiriman |
| **To Rate** | Menunggu ulasan |

**View Purchases History** → **My Purchases** lengkap.

### My Networks

Distributor terbaru menurut aktivitas pesanan atau **No networks yet**.

- **View All Networks**
- **View All Followings**

### Layanan lain

**Favourites**, **Recently Viewed**, **Buy Again**, **Get Vouchers**.

**My Wallet** bisa disembunyikan hingga fitur dirilis.

## Profil dan alamat

Layar edit: username, nama, bio, telepon, email, nama toko, negara, alamat.

**My Addresses** dan **New Address**.

Daftar **Followers** / **Following**.

## Akun ditangguhkan

Modal **Account suspended** memblokir belanja hingga akses dipulihkan.

## Dokumentasi terkait

- [Pengaturan akun](/id/docs/marketplace/account-settings)
- [Pesanan](/id/docs/marketplace/orders)
- [Penawaran dan following](/id/docs/marketplace/offers-following)
