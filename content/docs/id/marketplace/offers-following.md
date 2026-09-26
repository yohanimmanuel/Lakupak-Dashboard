---
title: Penawaran dan following
description: Harga dasar katalog, tarif privat retailer, following, dan laporan.
section: Marketplace
module: marketplace
order: 35
---

Jelajahi harga dasar katalog, lalu bangun **jaringan** toko yang sering Anda beli. Tarif privat retailer bukan harga publik di katalog.

## Harga katalog dan tarif Anda

Kartu produk, pencarian, dan toko distributor selalu menampilkan **harga dasar katalog**. Tarif toko lain tidak ditampilkan di kartu itu.

Tarif Anda diatur distributor di **Client Rates & Offers** dan hanya berlaku di pesanan pembelian Anda:

- Sampai distributor mengirim harga, pesanan tetap pada harga dasar katalog. Anda tidak melihat diskon atau kuantitas gratis Buy X Get Y.
- Setelah **Send pricing**, pesanan menampilkan tarif itu.
- Jika distributor mengaktifkan **Show discounted price when buyers submit a PO**, tarif muncul di pesanan begitu Anda mengirim.

Kuantitas gratis Buy X Get Y mengikuti aturan pada tarif: **Before MOQ** dihitung dari paket pertama, **After MOQ** hanya di atas minimum produk.

### Daftar penawaran

Jalur: `/offers/`.

Judul: **Special Offers**. Daftar ini bukan papan harga publik untuk tarif klien. Kosong: **No special offers right now.** Tamu: **Sign in to view offers.**

**Special Offers** di Home memakai **See All** untuk membuka daftar ini. Banner membuka `/offers/[id]`.

### Detail penawaran

Jalur: `/offers/[id]`.

Error: **Invalid offer**, **This offer is no longer available.**

## Mengikuti distributor

### My Networks

Jalur: `/useraccounts/buyernetworks/mynetworks`.

Judul: **My Networks**.

Distributor pernah dipesan, dengan jumlah pesanan. Kosong: **No Networks Yet**.

Tab Account menampilkan dua distributor teratas.

### Followings

Jalur: `/useraccounts/buyernetworks/followings`.

Judul: **Followings**.

Distributor yang Anda ikuti. Kosong: **No followings yet**. Status baris: **Followed**.

### Halaman toko distributor

| Layar | Fungsi |
|-------|--------|
| **Distributor Details** | Ringkasan |
| **Distributor Store** | Katalog satu distributor; sort Popular, Latest, Top Sales, Price |
| **Seller Information** | Profil toko |

Di toko: **+ Follow** / **Following**.

## Laporkan distributor

Modal **Report Distributor** dari profil distributor untuk melaporkan konten atau perilaku tidak pantas.

## Dokumentasi terkait

- [Jelajah dan cari](/id/docs/marketplace/browse-search) untuk harga dasar katalog
- [Pesanan](/id/docs/marketplace/orders) untuk kapan tarif Anda muncul
- [Akun](/id/docs/marketplace/account)
- [Penawaran Dashboard](/id/docs/dashboard/offers)
