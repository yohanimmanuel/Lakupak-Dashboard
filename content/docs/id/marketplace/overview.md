---
title: Ringkasan Marketplace
description: Tab aplikasi pembeli, navigasi, dan memulai.
section: Marketplace
module: marketplace
order: 30
---

**Laku Marketplace** adalah aplikasi mobile pembeli (Expo/React Native) untuk menemukan katalog distributor, memesan B2B, dan melacak pengiriman. Terhubung ke lingkungan API Laku yang sama dengan Dashboard distributor.

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
2. **Login** atau **Register**
3. Setelah masuk, tampil **Home** dengan nama toko dan alamat pengiriman

Akun ditangguhkan menampilkan **Account suspended** dan **Go to login**.

## Peran di ekosistem Laku

| Peran | Aplikasi |
|-------|----------|
| Distributor | Laku Dashboard (web) |
| Pembeli / retailer | Laku Marketplace (mobile) |
| Driver | Laku Driver (mobile) |

Pesanan di Marketplace muncul di modul **Orders** distributor. Produk berasal dari **Products** yang dipublikasikan.

## Dokumentasi terkait

- [Akun](/id/docs/marketplace/account)
- [Jelajah dan cari](/id/docs/marketplace/browse-search)
- [Keranjang dan checkout](/id/docs/marketplace/cart-checkout)
- [Pesanan](/id/docs/marketplace/orders)
