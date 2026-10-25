---
title: Penawaran
description: Tarif per retailer, Buy X Get Y, aturan draf, dan kapan pembeli melihat harga.
section: Dashboard
module: dashboard
order: 15
---

**Client Rates & Offers** menetapkan tarif produk privat untuk satu retailer. Pakai ini saat memperkenalkan SKU yang kurang termanfaatkan atau melindungi syarat yang dinegosiasikan: setiap toko bisa punya persen, nominal tetap, atau Buy X Get Y sendiri tanpa mengubah harga dasar katalog yang dilihat toko lain.

Tarif berlaku di pesanan pembelian retailer tersebut. Tarif penawaran produk per retailer dikelola dalam satu tabel: klien, produk atau varian, diskon, status, dan durasi.

Jalur: `/offers`, `/offers/new`, `/offers/details?id={offerId}`.

## Kartu ringkasan

| Kartu | Arti |
|------|------|
| **Total Offers** | Semua penawaran |
| **Active Offers** | Status active |
| **Conversion Rate** | Persentase penawaran pernah dipakai |
| **Total Redemptions** | Total penggunaan |

## Daftar penawaran

### Tindakan halaman

| Tindakan | Fungsi |
|----------|--------|
| **Export Data** | Ekspor XLSX |
| **Create Rate** | Wizard buat tarif |

### Tab dan filter

**Tab halaman:** All Rates, Discounts, Promotions.

**Tab status tabel:** All, Active, Draft, Inactive, Expired.

**Pencarian:** klien, produk, atau catatan.

**Filter tanggal:** All Time, Last 7 Days, Last 30 Days, Last 3 Months, This Year.

**Kolom:** Name, Client, Product / Variant, Type, Discount, Status, Duration, Usage Status, Actions.

**Tipe:** **Discount** atau **Promotion**. Penggunaan: **Used** / **Not Used**.

### Aksi massal

- **Activate** / **Deactivate** (Activate dinonaktifkan jika rentang tanggal sudah kedaluwarsa)
- **Remove**

**Activate** membutuhkan ID klien. Tarif tanpa klien tetap **Draft**. Pemberitahuan menyebut tidak ada ID klien dan hilang setelah 5 detik.

Menghapus pembeli, atau mengosongkan klien pada tarif, mengembalikan tarif itu ke **Draft**. Tarif tidak bisa tetap **Active** tanpa klien.

## Apa yang bisa dilakukan tarif

Tarif terikat ke satu klien dan ke produk atau varian yang mereka beli. SKU yang sama bisa punya tarif berbeda untuk tiap retailer. Toko lain tetap melihat harga dasar katalog.

| Tipe | Efek di pesanan pembelian |
|------|---------------------------|
| **Percentage** | Memotong baris sebesar persen dari harga dasar katalog |
| **Fixed Amount Off** | Mengurangi nominal tetap |
| **Buy X Get Y** | Menambah kuantitas gratis saat aturan beli terpenuhi |

Diskon harga dan Buy X Get Y bisa digabung pada tarif yang sama.

### Buy X Get Y dan MOQ

**Start counting free pieces** punya pilihan **Before MOQ** atau **After MOQ**.

- **Before MOQ** menghitung kuantitas gratis dari paket pertama.
- **After MOQ** menghitung kuantitas gratis hanya pada kuantitas di atas minimum produk. Pesanan yang sama dengan MOQ tidak mendapat kuantitas gratis.

MOQ produk adalah minimum order quantity pada varian.

## Buat dan ubah tarif

### Tab wizard

1. **Discount**: persen, nominal tetap, Buy X Get Y, dan status
2. **Timing**: tanggal mulai dan tanggal akhir opsional
3. **Product**: satu atau lebih produk, semua varian atau varian tertentu
4. **Client**: pembeli yang menerima tarif privat ini

**Create Rate** membuat tarif aktif jika klien sudah dipilih. **Save Draft** menyimpan progres saat klien atau produk belum siap.

### Detail tarif

Edit memakai tab yang sama. **Save Changes** dan **Cancel**.

Status: **Active**, **Draft**, **Inactive**, dan **Expired** jika rentang tanggal sudah lewat.

## Kapan pembeli melihat tarif

Katalog tidak pernah menampilkan tarif klien. Pada pesanan pembelian baru, pembeli tetap melihat harga dasar katalog, termasuk jika mereka sudah berbelanja dari Anda.

Dua kontrol yang membuka harga itu:

- **Send pricing to buyer** pada pesanan (atau **Send pricing update** setelah Anda mengubah baris). Langkah ini menampilkan total diskon dan kuantitas gratis, lalu memberi tahu pembeli.
- Pengaturan perusahaan **Show discounted price when buyers submit a PO** (Settings → Distributor Operations). Jika aktif, pesanan pembelian menampilkan tarif klien begitu pembeli mengirim. Jika mati, pesanan tetap pada harga dasar katalog sampai Anda mengirim harga.

## Hapus dan ekspor

**Delete Rate** / **Delete Rates** meminta konfirmasi.

**Export:** Offer ID, Name, Type, Status, Products Count, Total Usage, Total Discount Given, Discount Types, Created At.

## Tautan terkait

| Tujuan | Ke |
|--------|-----|
| Produk | [Produk](/id/docs/dashboard/products) |
| Harga di pesanan pembelian | [Pesanan](/id/docs/dashboard/orders) |
| Sakelar harga pembeli | [Pengaturan](/id/docs/dashboard/settings) |
| Marketplace pembeli | [Ringkasan Marketplace](/id/docs/marketplace/overview) |
