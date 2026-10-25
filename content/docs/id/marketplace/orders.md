---
title: Pesanan
description: Daftar pesanan, harga katalog sampai distributor mengirim harga, bayar, batal, dan pelacakan.
section: Marketplace
module: marketplace
order: 34
---

Lacak pesanan B2B dari pembuatan hingga pengiriman, pembayaran, ulasan, dan retur.

## Harga yang Anda lihat

Kartu produk, keranjang, dan checkout menampilkan **harga dasar katalog** distributor. Tarif privat Anda tidak ada di kartu itu.

Setelah Anda mengirim pesanan pembelian:

- Anda tetap melihat harga dasar katalog, dan tidak melihat diskon klien atau kuantitas gratis, meskipun Anda sudah berbelanja dari distributor itu.
- Distributor membuka harga pesanan pembelian dengan **Send pricing**. Setelah itu, pesanan menampilkan total diskon dan kuantitas gratis di samping kuantitas yang dipesan.
- Jika distributor mengaktifkan **Show discounted price when buyers submit a PO**, pesanan menampilkan tarif mereka begitu Anda mengirim.
- Total yang belum dikonfirmasi tampil sebagai **Pending price**.

Perubahan harga katalog setelah checkout tidak menulis ulang pesanan yang sudah dibuat.

## Tab Orders

Jalur: `/(tabs)/orders`.

Menampilkan ID, distributor, jumlah produk, nominal, **Order Date**, badge status.

Kosong: **No Orders Yet**.

Tamu: **Create an account to win first-order benefits!**

Ketuk baris ? **Order Details**.

## My Purchases

Jalur: `/useraccounts/purchases/mypurchases`.

Judul: **My Purchases**. Pencarian: **Search orders**.

### Tab pembelian

| Tab | Penggunaan |
|-----|------------|
| **To Pay** | Belum dibayar; **Pay** |
| **To Ship** | Menunggu kirim |
| **To Receive** | Dalam pengiriman |
| **To Rate** | Menunggu ulasan |
| **Completed** | Selesai |
| **Return/Refund** | Permintaan retur |
| **Cancelled** | Dibatalkan |

Pintasan di tab Account menuju empat tab pertama.

## Detail pesanan

Judul: **Order Details**.

Headline status misalnya **Your Order is Shipped**, **Your Order is Delivered**.

### Tindakan pesanan

| Tindakan | Kapan |
|----------|-------|
| **Pay Order** | Pembayaran tertunda |
| **Cancel Order** | Sesuai aturan pembatalan |
| **Return/Refund** | Setelah terkirim sesuai kebijakan |
| **Order Received** | Konfirmasi terima |
| **Rate** / **Edit review** | Setelah terkirim |
| **Back to Orders** | Kembali ke daftar |

### Batal dan retur

**Cancel Order:** alasan (**Changed my mind**, dll.) ? **Cancel order**.

**Return / Refund:** alasan (**Wrong item received**, dll.); foto bukti opsional ? **Submit request**.

**Return & Refund Info** menjelaskan kebijakan.

### Invoice dan pengiriman

**Invoice** ? **View & download**.

**Delivery Information:** **Delivery Progress**, **Delivery Timeline**, peta **Distributor Location**.

**Support Center:** **Contact Seller**, **Help Center**.

Riwayat lengkap: **Order updates**.

## Dokumentasi terkait

- [Keranjang dan checkout](/id/docs/marketplace/cart-checkout)
- [Notifikasi](/id/docs/marketplace/notifications) untuk pembaruan, termasuk harga yang dikirim distributor
- [Pesanan Dashboard](/id/docs/dashboard/orders)
- Cara tarif diatur: [Penawaran Dashboard](/id/docs/dashboard/offers)
