---
title: Login dan akses
description: Welcome, login, request access, dan sesi.
section: Driver
module: driver
order: 41
---

Driver masuk dengan kredensial dari distributor. Layar welcome juga menawarkan **Request access** jika belum punya akun.

## Layar welcome

Jalur: `/useraccounts/welcome`.

Slide carousel:

| Slide | Topik |
|-------|--------|
| 1 | **Deliver with your fleet** |
| 2 | **Live tracking** |
| 3 | **Proof of delivery** |

Tombol:

- **Login** → modal login
- **Register** → modal request access (bukan buat akun instan)

## Login

Jalur: `/useraccounts/loginsignup/loginmodal`.

| Field / aksi | Label |
|--------------|--------|
| Judul | **Welcome back** |
| Petunjuk | Username dan password dari distributor |
| **Username** | |
| **Password** | |
| Kirim | **Login** / **Logging in…** |
| Footer | **Don't have an account? Request access** |

**API:** `POST /api/driver/auth/login`.

### Error login

| Situasi | Pesan |
|---------|--------|
| Field kosong | **Missing information** |
| Salah kredensial | **Invalid Credentials** |
| Terlalu banyak percobaan | **Too many attempts** (~15 menit) |
| Lainnya | **Login Failed** |

Sukses ke **Home**.

Token disimpan aman dan divalidasi lewat `GET /api/driver/me`.

## Request access

Jalur: `/useraccounts/loginsignup/signupmodal`.

Dua langkah (distributor meninjau manual):

### Langkah 1 — Data Anda

**Full name**, **Phone number** → **Continue**

### Langkah 2 — Data distributor

**Distributor email**, **Message (optional)** → **Send request**

**API:** `POST /api/driver/request`.

Selesai: **Request sent!** → **Go to Login**.

## Sesi dan status akun

- Token tidak valid: dibersihkan saat startup; aksi pesanan bisa **Session expired — Please log in again.**
- Akun nonaktif: **Invalid Credentials** atau **Login Failed**
- Tidak ada layar **suspended** terpisah
- **Delete Account** di Settings: hubungi distributor

## Dokumentasi terkait

- [Ringkasan Driver](/id/docs/driver/overview)
- [Logistik Dashboard](/id/docs/dashboard/logistics)
