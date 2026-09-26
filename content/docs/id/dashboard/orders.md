---
title: Pesanan
description: Daftar pesanan B2B, harga per retailer, harga aman pembeli, pemenuhan, dan ekspor.
section: Dashboard
module: dashboard
order: 14
---

**Orders Management** melacak pesanan marketplace B2B dan manual dari konfirmasi hingga pengiriman dan pembayaran.

Jalur: **Orders** (`/orders`). Detail: `/orders/details/{orderId}`.

## Kartu ringkasan

| Kartu | Arti |
|------|------|
| **Total Orders** | Jumlah pesanan + tren bulan |
| **Total Sales** | Pendapatan (mata uang akun) |
| **Revenue Collected** | Pendapatan pesanan lunas |
| **Pending Revenue** | Total belum dibayar |
| **Delivery Success** | Persentase status Delivered |

## Daftar pesanan

### Tindakan halaman

| Tindakan | Fungsi |
|----------|--------|
| **Refresh** | Muat ulang data pesanan |
| **Archived Orders** | Lihat dan batalkan arsip |
| **Export Data** | Unduh pesanan ke XLSX |

### Peta pengiriman

**Live Delivery Tracking** menampilkan pengiriman aktif dengan **In Transit**, **Delivered**, **Pending**. Klik marker untuk detail. Kosong: **No active deliveries**.

### Filter tabel

- **Tab status:** All, Pending, Confirmed, Packed, Shipped, Delivered, Failed, Cancelled, Returned
- **Pencarian:** ID pesanan, pembeli, nomor resi
- **Payment:** All, Unpaid, Paid
- **Delivery method:** All Methods, Self Pickup, Seller/Distributor Delivery, Buyer-arranged Courier

**Kolom:** Order, Date, Buyer, Status, Total, Items, Delivery, Tracking, Payment, Actions.

**Paginasi:** 8 baris per halaman. Kosong: **No orders recorded**.

### Aksi massal

- **Archive Orders** untuk baris terpilih
- **Delete Cancelled** (hanya status **Cancelled**)

## Detail pesanan

### Status dan pembayaran

Ubah **order status:** Pending, Confirmed, Packed, Shipped, Delivered, Failed, Cancelled, Returned.

**Payment status:** Unpaid atau Paid.

### Harga di pesanan pembelian

Setiap baris menyimpan harga dasar katalog dari checkout. Perubahan katalog kemudian tidak menulis ulang pesanan itu.

Tarif klien (persen, nominal tetap, atau Buy X Get Y) dihitung untuk retailer itu di pesanan pembelian. Anda melihatnya di halaman detail. Pembeli belum melihatnya sampai Anda membukanya.

**Harga aman pembeli**

- Kartu produk di Marketplace selalu menampilkan harga dasar katalog.
- Setelah pembeli mengirim pesanan, pesanan mereka tetap menampilkan harga dasar itu. Hubungan yang sudah ada tidak membuka diskon klien atau kuantitas gratis.
- **Send pricing to buyer** menulis harga pesanan pembelian, menampilkan diskon dan kuantitas gratis, lalu memberi tahu pembeli. **Send pricing update** melakukan hal yang sama setelah Anda mengubah baris. Setiap baris harus punya harga sebelum dikirim.
- Jika suatu baris belum punya harga, total menampilkan **Pending price**. Total baris nol adalah baris yang benar-benar gratis hanya setelah harga dikirim.
- Pengaturan perusahaan **Show discounted price when buyers submit a PO** (Settings → Distributor Operations) adalah pengecualian. Jika aktif, pembeli melihat tarif klien begitu mereka mengirim. Jika mati, mereka tetap pada harga dasar katalog sampai Anda mengirim harga.

Badge **Discount** atau **Promotion** (Buy X Get Y) bisa muncul di baris. Kuantitas gratis dihitung **Before MOQ** atau **After MOQ**, sesuai aturan yang tersimpan pada tarif. **After MOQ** tidak memberi kuantitas gratis jika kuantitas pesanan sama dengan minimum produk.

### Pemenuhan

Modal **Edit Order:** alamat, kontak, **Delivery Method**, nomor resi, POD untuk **Delivered**, **Received**, atau **Returned**.

**Metode pengiriman:** Self Pickup, Seller/Distributor Delivery, Buyer-arranged Courier.

### Tautan pembeli

Nama pembeli menuju profil **Clients → Buyers**, atau halaman pembeli terhapus jika sudah dihapus.

## Arsip dan ekspor

Modal **Archived Orders:** **View**, **Unarchive**, **Close**.

**Export:** Order ID, Buyer, Order Date, Status, Payment Status, Items, Total Amount, Delivery Method, Tracking Number.

Tidak ada impor pesanan dari layar ini.

## Tautan terkait

| Tujuan | Ke |
|--------|-----|
| Profil pembeli | [Klien](/id/docs/dashboard/clients) |
| Tarif klien | [Penawaran](/id/docs/dashboard/offers) |
| Sakelar harga pembeli | [Pengaturan](/id/docs/dashboard/settings) |
| Armada | [Logistik](/id/docs/dashboard/logistics) |
| Laporan pendapatan | [Analitik](/id/docs/dashboard/analytics) |
