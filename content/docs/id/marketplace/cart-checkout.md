---
title: Keranjang dan checkout
description: Keranjang belanja, MOQ, checkout, pembayaran, dan pengiriman.
section: Marketplace
module: marketplace
order: 33
---

Tambah produk dari detail atau **Buy Now**, tinjau keranjang, lalu selesaikan **Checkout** untuk membuat pesanan di Dashboard distributor.

## Keranjang belanja

Jalur: `/cart`.

Judul: **Shopping Cart**.

Kosong: **Oops, Your Shopping Cart is Empty** / **Browse our awesome deals now!**

### Pilihan dan MOQ

- **All** memilih semua baris
- **Saved {amount}** saat ada diskon
- Footer: **Check Out (count)** atau **MOQ Not Met**
- Alert: **Minimum Order Quantity Required**

Tamu melihat prompt login seperti di Account.

Checkout ke `/components/productcatalog/checkout`.

## Checkout

Judul: **Checkout**.

### Alamat pengiriman

**Delivery Address**, **Default Address**, field nama, perusahaan, telepon, alamat lengkap.

### Metode pembayaran

**Payment:**

- **Bank Transfer** (transfer manual)
- **Cash on Delivery (COD)**

Setelah pesanan: **Pay Order** di detail pesanan.

### Opsi pengiriman

Per distributor jika keranjang multi-penjual:

- **Self Pickup**
- **Seller/Distributor Delivery**
- **Buyer-arranged Courier**

Catatan: **Shipping cost is agreed between buyer and distributor — not charged at checkout.**

**Business Information**, **Products from {nama distributor}**.

### Buat pesanan

**Order Confirmation** → **Place Order** / **Placing…**

Mendukung buy now satu produk dan checkout multi-distributor.

## Setelah checkout

Layar **Payment Success:**

- **Payment Successful!**, **You paid {amount}**
- **Home**, **My Orders**
- **What's Next?**
- **Need Help?** / **Contact Support**

Pesanan belum lunas: **Pay Order** dari detail.

## Dokumentasi terkait

- [Pesanan](/id/docs/marketplace/orders)
- [Pengaturan akun](/id/docs/marketplace/account-settings)
- [Jelajah dan cari](/id/docs/marketplace/browse-search)
