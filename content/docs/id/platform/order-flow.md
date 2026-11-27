---
title: Alur pesanan
description: Perjalanan pesanan B2B dari listing hingga pemenuhan.
section: Platform
module: platform
order: 51
---

Halaman ini menjelaskan **alur bisnis** pesanan tipikal di Lakupak di Dashboard dan Marketplace.

## 1. Katalog dan publikasi

Distributor mengelola produk di **Dashboard → Products**:

- SKU draf dengan varian, stok, gambar
- **Market Segment Pricing** opsional per saluran utama dari direktori Klien
- **Publish** agar pembeli melihat di Marketplace
- **Offers** untuk tarif klien per retailer. Tarif adalah diskon privat di atas harga segmen atau harga jual bawaan dan berlaku di pesanan pembelian retailer itu

Item tidak dipublikasikan tetap internal.

## 2. Penemuan dan pembelian

Pembeli memakai **Marketplace** untuk:

- **Home**, **Categories**, atau **Search**
- Buka toko distributor atau detail produk pada **harga segmen** untuk saluran utama mereka, atau **harga jual bawaan** jika tidak ada harga segmen
- Keranjang atau **Buy Now** dengan MOQ
- **Checkout** dengan alamat, pembayaran (transfer atau COD), opsi pengiriman

Pesanan dibuat di workspace distributor setelah checkout. Baris menyimpan harga segmen atau harga bawaan pada saat itu. Distributor membuka tarif klien dengan **Send pricing**, kecuali **Show discounted price when buyers submit a PO** aktif.

## 3. Pemenuhan distributor

Di **Dashboard → Orders**:

- Tinjau pesanan baru (**Pending**, **Confirmed**, dll.)
- Konfirmasi stok, pembayaran, metode pengiriman
- Status **Packed**, **Shipped**, **Delivered**
- Peta untuk pengiriman aktif

Pembeli menerima notifikasi saat status berubah.

## 4. Pembayaran dan penyelesaian

Aturan pembayaran mengikuti cara kerja distributor dengan tiap pembeli:

- **Transfer bank** setelah pesanan
- **COD** saat diterima
- Pembeli bisa **Pay Order** di Marketplace selama belum dibayar

Saat pesanan mencapai **Delivered** (atau **Received**), riwayat hubungan diperbarui di **Clients**.

## 5. Pengecualian

| Situasi | Penanganan tipikal |
|-----------|------------------|
| Pembeli batalkan | Diizinkan selama kebijakan mengizinkan; stok bisa dikembalikan |
| Masalah pengiriman | Distributor hubungi pembeli dan perbarui status |
| Retur atau refund | Pembeli ajukan; distributor selesaikan per kebijakan |
| Pembeli ditangguhkan | Tidak bisa pesan baru sampai akses dipulihkan |

## Dokumentasi terkait

- [Pesanan Dashboard](/id/docs/dashboard/orders)
- [Keranjang dan checkout Marketplace](/id/docs/marketplace/cart-checkout)
- [Pesanan Marketplace](/id/docs/marketplace/orders)
