---
title: Produk
description: Katalog, varian, stok, publikasi marketplace, dan ekspor.
section: Dashboard
module: dashboard
order: 13
---

Area **Products** adalah ruang kontrol katalog B2B. Buat SKU dengan varian dan gambar, lacak stok per varian, dan jaga produk yang kurang termanfaatkan tetap terlihat, berharga, dan berstok agar bisa diperkenalkan ke retailer yang cocok.

Deteksi celah asortimen (misalnya heatmap under-penetration di retailer yang layak) berdiri di atas fondasi katalog ini. Penetrasi rendah adalah sinyal untuk diselidiki, bukan bukti permintaan yang belum terpenuhi.

Jalur: **Products** (`/products`).

## Kartu ringkasan

Tiga KPI di bagian atas:

| Kartu | Arti |
|------|------|
| **Total Products** | Semua produk di workspace |
| **Published Products** | Produk berstatus Published |
| **Products with Offers** | Produk terhubung diskon atau promosi aktif |

Peringatan bisa muncul untuk produk **low stock** dan **out of stock** menurut ambang varian.

## Daftar katalog

### Tindakan daftar

| Tindakan | Fungsi |
|----------|--------|
| **Refresh** | Muat ulang katalog dari server |
| **Export Data** | Unduh katalog terfilter ke XLSX |
| **+ Add Product** | Form tambah (`/products/add`) |

Impor didukung lewat modal impor (pemetaan kolom XLSX/CSV). Tombol impor di toolbar bisa disembunyikan; impor baru selalu membuat produk **Draft** dengan ID `LKP-` otomatis.

### Status dan filter

- **Tab status:** All, Draft, Published
- **Pencarian:** nama produk
- **Stok:** All Stock, High Stock, Low Stock, Out of Stock
- Filter **Type** dan **Category** (dinamis)
- **Offers:** All Products, With Offers, Without Offers

Banner **Data completion** menandai baris yang belum lengkap (latar amber).

### Grid, daftar, dan paginasi

- **Grid View** (default desktop) dan **List View**
- Mobile memakai kartu
- **8** produk per halaman; kosong: **No products recorded**

**Kolom daftar:** ID/SKU, Product Name, Type, Category, Brand, Stock, Selling Price, Status, Last Updated, Actions.

**Aksi baris:** **View Product** (Published) atau **Edit Product** (Draft), **Delete Product**.

**Pilihan:** checkbox dan **Select All** untuk filter aktif.

### Aksi massal

Saat produk dipilih:

- **Publish** (Draft) membuka **Marketplace Preview** atau **Bulk Publish**
- **Unpublish** (Published) mengembalikan ke Draft
- **Remove** menghapus produk terpilih

Campuran Draft dan Published hanya mengizinkan **Remove**.

## Form produk

Jalur: `/products/add`, `/products/edit/{id}`, `/products/catalog/{id}` (lihat).

### Informasi umum

Field: **Product ID** (otomatis `LKP-`), **Brand**, **Type**, **Product Name**, **Supplier**, **Product Description**, checkbox jaminan (**Halal Certified**, **BPOM Approved**, **Original Product**), **Return Policy (days)**.

**Product Catalog Completion** menampilkan persen lengkap dan field yang kosong.

### Varian, stok, dan gambar

- **Upload Images:** drag and drop, hingga **10** gambar
- **Product Settings:** Product Type, **Product Category (by Channel)**, **Catalog Name**
- **Product Variants:** tentukan tipe dan opsi varian (mis. Ukuran: S, M, L)
- **Variation Lists:** tabel setiap kombinasi dengan **SKU**, harga jual/beli, **MOQ**, **Stock Qty**, **Low Threshold**, dan status per baris
- **Quick Action: Apply To All** menyalin SKU, harga, MOQ, dan stok ke semua baris
- **Product Stock Summary:** total pieces, threshold, status keseluruhan

#### Menyiapkan varian dengan benar

Ikuti urutan ini saat membuat atau mengedit produk:

1. Tentukan semua **tipe dan opsi varian** di **Product Variants** terlebih dahulu.
2. Klik **Refresh** di **Variation Lists** agar baris tabel dibuat ulang dari varian tersebut.
3. Isi **SKU**, harga, **MOQ**, dan stok untuk setiap baris.
4. Klik **Save Draft** atau **Save and Publish** hanya setelah tabel lengkap dan sesuai varian Anda.

> **Penting:** Setelah menambah, menghapus, atau mengganti nama tipe/opsi varian, klik **Refresh** lagi sebelum menyimpan atau mempublikasikan. Jika langkah ini dilewati, tabel varian bisa tidak sinkron dan **Save** atau **Publish** bisa gagal meskipun form terlihat sudah lengkap.

Varian dan harga bisa **terkunci** jika produk memiliki penawaran aktif. Selain itu, varian katalog dapat diubah namanya atau dihapus secara terpisah dari pesanan. Item pesanan lama tetap menyimpan snapshot produk, SKU, nama varian, dan atribut saat pemesanan.

### Simpan, draf, dan unpublish

| Mode | Tindakan |
|------|----------|
| Add / Edit (Draft) | **Cancel**, **Save Draft**, **Save and Publish** |
| View (Published) | **Unpublish** |

Produk **Published** hanya bisa dilihat. Untuk mengedit, unpublish dulu.

## Publikasi marketplace

Dari daftar (**Publish**) atau form (**Save and Publish**):

1. Buka **Marketplace Preview** atau **Bulk Publish**
2. Cek kelengkapan: SKU varian bila diperlukan, nama, deskripsi, tipe, brand, supplier, harga varian, stok &gt; 0, minimal satu gambar
3. Lihat tampilan di **Lakupak Marketplace App**
4. Konfirmasi **Publish**

Produk tidak lengkap tercantum di **Cannot Publish**.

## Impor dan ekspor

**Export** mencakup Product ID, SKU varian (jika ada), nama, tipe, brand, supplier, stok, harga, status, last updated.

**Import** memetakan kolom spreadsheet; status selalu **Draft**.

## Produk terhapus

Tautan produk yang dihapus menampilkan **Product has been deleted** dengan **Go Back** dan **Add Products**.

## Tautan terkait

| Tujuan | Ke |
|--------|-----|
| Diskon katalog | [Penawaran](/id/docs/dashboard/offers) |
| Pesanan | [Pesanan](/id/docs/dashboard/orders) |
| Marketplace pembeli | [Ringkasan Marketplace](/id/docs/marketplace/overview) |
| Widget stok rendah | [Beranda](/id/docs/dashboard/home) |

## SKU varian dan sinkronisasi inventaris terkini (November 2026)

**SKU pada level produk utama sudah dihapus.** Produk menggunakan Product ID (`LKP-`), sedangkan SKU disimpan pada setiap opsi varian. Publikasi marketplace dan integrasi tidak boleh meminta `Product.sku` dari level produk utama. SKU, harga, MOQ, dan stok varian dikelola pada tabel variasi.

### Satu inventaris untuk berbagai satuan stok

Pieces, karton, dan box adalah **satuan dari stok varian yang sama**, bukan stok terpisah. Rasio konversi mengubah transaksi ke satuan dasar dan antarmuka dapat menampilkan pecahan ke satuan yang lebih besar. Jika pengguna memasukkan karton, jumlah dan satuan karton tetap disimpan pada penerimaan walaupun inventaris menghitung pieces. Jangan menjumlahkan kedua representasi sebagai stok berbeda.

### Perubahan katalog dan riwayat pemasok

- Membuat produk atau varian menetapkan data katalog dan stok awal, **bukan** otomatis membuat penerimaan pembelian pemasok.
- Riwayat penerimaan, ringkasan, dan snapshot saldo awal pemasok tetap disimpan saat produk/varian diganti nama atau dihapus.
- Varian baru dengan nama atau SKU yang sama tetap memiliki ID opsi varian berbeda. Catatan historis yang tidak lagi cocok tetap menampilkan label lama dan tidak boleh otomatis dialihkan.
- Penambahan stok dari penerimaan hanya terjadi jika tindakan pembaruan stok berhasil. Pesanan dan penyesuaian stok lain juga dapat mengubah stok saat ini.

Lihat [Klien](/id/docs/dashboard/clients) untuk penjelasan riwayat dan ringkasan pemasok.
