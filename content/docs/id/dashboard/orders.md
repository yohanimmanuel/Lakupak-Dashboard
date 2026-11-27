---
title: Pesanan
description: Daftar pesanan B2B, harga per retailer, harga aman pembeli, pemenuhan, dan ekspor.
section: Dashboard
module: dashboard
order: 14
---

**Orders Management** melacak pesanan B2B dan manual dari konfirmasi hingga pengiriman dan pembayaran. Baris pesanan juga menjadi bukti penetrasi asortimen: produk mana yang sudah menjangkau retailer mana, dan di mana masih ada celah.

Jalur: **Orders** (`/orders`). Detail: `/orders/details/{orderId}`.

Saat membuat atau mengedit, **Customer Information** menyertakan pencarian klien (cari toko atau pemilik) agar retailer yang tepat bisa dilampirkan dengan cepat.

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

Setiap baris menyimpan harga dari checkout. Perubahan katalog atau harga segmen kemudian tidak menulis ulang pesanan itu.

Saat checkout, baris dimulai dari harga segmen pasar pembeli: harga varian untuk **saluran utama** mereka. Jika mereka belum punya saluran utama, atau saluran itu tidak punya harga segmen, baris memakai harga jual bawaan varian. Sub-saluran dan rincian outlet tidak memilih harga lain.

Tarif klien (persen, nominal tetap, atau Buy X Get Y) dihitung untuk retailer itu di pesanan pembelian, di atas harga awal itu. Anda melihatnya di halaman detail. Pembeli belum melihatnya sampai Anda membukanya.

**Harga aman pembeli**

- **Send pricing to buyer** menulis harga pesanan pembelian, menampilkan diskon dan kuantitas gratis, lalu memberi tahu pembeli. **Send pricing update** melakukan hal yang sama setelah Anda mengubah baris. Setiap baris harus punya harga sebelum dikirim.
- Jika suatu baris belum punya harga, total menampilkan **Pending price**. Total baris nol adalah baris yang benar-benar gratis hanya setelah harga dikirim.
- Pengaturan perusahaan **Show discounted price when buyers submit a PO** (Settings → Distributor Operations) adalah pengecualian. Jika aktif, pembeli melihat tarif klien begitu mereka mengirim. Jika mati, mereka tetap pada harga segmen atau harga bawaan sampai Anda mengirim harga.

### Cara pembeli membeli dengan harga segmen

1. Pembeli mendaftar di Marketplace. Saluran utama mereka kosong, jadi kartu memakai harga jual bawaan, sampai Anda mengisi saluran dan menyetujui akses.
2. Anda mengisi **Business type (main channel)** pada pembeli. Marketplace memperbarui harga katalog pembeli itu.
3. Pembeli membuka produk yang diterbitkan. Varian menampilkan harga segmen untuk saluran utama itu, atau harga jual bawaan jika saluran tidak punya harga segmen.
4. Pembeli menambahkan varian ke keranjang dan membuat pesanan. Baris menyimpan harga pada saat itu.
5. Tarif klien pribadi, jika ada, tetap tersembunyi sampai **Send pricing to buyer**, kecuali **Show discounted price when buyers submit a PO** aktif.

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
| Marketplace pembeli | [Ringkasan Marketplace](/id/docs/marketplace/overview) |

## Tindakan CRUD dan hasil sistem

| Tindakan | Hasil sistem |
|---|---|
| Buat pesanan manual / terima PO marketplace | Menghubungkan pembeli dan baris varian; menyimpan detail produk, jumlah, dan harga saat pemesanan. |
| Ubah pesanan | Memperbarui baris, pengiriman, kontak, resi, dan status yang diizinkan; perubahan stok memakai ID varian terkait, bukan hanya nama. |
| Ubah status / pembayaran | Memperbarui pelaporan pemenuhan dan pembayaran secara terpisah. |
| Kirim harga / pembaruan harga | Membuka tarif klien pribadi dan kuantitas gratis bagi pembeli serta mengirim notifikasi. Sampai saat itu pembeli tetap pada harga segmen atau bawaan, kecuali sakelar Pengaturan menampilkan tarif saat pesanan dikirim. |
| Archive / Unarchive | Mengeluarkan atau mengembalikan pesanan dari daftar aktif tanpa menghapus informasi historis. |
| Delete Cancelled | Hanya pesanan Cancelled yang memenuhi syarat; arsip bukan penghapusan. |

**Cari pesanan:** ID, pembeli, resi, dan nama produk jika tersedia. Snapshot produk dan varian mempertahankan arti transaksi lama setelah katalog berubah.
