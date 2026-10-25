---
title: Ringkasan Marketplace
description: Tab aplikasi pembeli, navigasi, dan memulai.
section: Marketplace
module: marketplace
order: 30
---

**Lakupak Marketplace** adalah aplikasi mobile pembeli (Expo/React Native) untuk menemukan katalog privat satu distributor, memesan B2B, dan melacak pengiriman. Terhubung ke lingkungan API Lakupak yang sama dengan Dashboard distributor.

Akses **terotorisasi dan tertutup**: pembeli masuk dengan **kode referral / keanggotaan** distributor yang valid (atau keanggotaan yang sudah ada). Tamu tidak menjelajah katalog multi-distributor terbuka. Setiap sesi dibatasi pada storefront distributor itu.

Distributor mengatur kode referral di **Dashboard → Settings → Distributor Operations**.

## Navigasi utama

Lima tab bawah:

| Tab | Fungsi |
|-----|--------|
| **Home** | Header toko, pencarian, penawaran khusus, kategori, produk unggulan |
| **Categories** | Jelajah kategori dan produk baru |
| **Orders** | Riwayat dan status pesanan |
| **Notifications** | Alert, pembaruan pesanan, pengumuman platform |
| **Account** | Profil, pembelian, jaringan, pintasan pengaturan |

**Home** dan **Categories** memerlukan login. Tamu diarahkan ke layar welcome.

### Pintasan header

Dari beberapa tab:

- **Messages** (`/messages`) untuk chat WhatsApp dari halaman produk
- **Cart** (`/cart`) dengan badge jumlah item
- **Settings** (ikon di Account)

## Memulai

1. Buka aplikasi → carousel **Welcome**
2. **Login** atau **Register**, dan masukkan **kode referral** distributor saat diminta (wajib untuk bergabung atau membuka storefront itu)
3. Setelah masuk, tampil **Home** dengan nama toko dan alamat pengiriman untuk distributor tersebut

Akun ditangguhkan menampilkan **Account suspended** dan **Go to login**.

## Peran di ekosistem Lakupak

| Peran | Aplikasi |
|-------|----------|
| Distributor | Lakupak Dashboard (web) |
| Pembeli / retailer | Lakupak Marketplace (mobile) |

Pesanan di Marketplace muncul di modul **Orders** distributor. Produk berasal dari **Products** yang dipublikasikan.

## Dokumentasi terkait

- [Akun](/id/docs/marketplace/account)
- [Jelajah dan cari](/id/docs/marketplace/browse-search)
- [Keranjang dan checkout](/id/docs/marketplace/cart-checkout)
- [Pesanan](/id/docs/marketplace/orders)
