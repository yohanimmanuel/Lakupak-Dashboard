---
title: Pesanan
description: Daftar pesanan B2B, peta pelacakan, pemenuhan, arsip, dan ekspor.
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

Badge **Discount** atau **Promotion** bisa muncul di baris pesanan.

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
| Promosi | [Penawaran](/id/docs/dashboard/offers) |
| Armada | [Logistik](/id/docs/dashboard/logistics) |
| Laporan pendapatan | [Analitik](/id/docs/dashboard/analytics) |
