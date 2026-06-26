---
title: Penawaran
description: Diskon, promosi, produk target, dan analitik penggunaan.
section: Dashboard
module: dashboard
order: 15
---

**Offers & Incentives** untuk membuat diskon dan promosi beli-X-dapat-Y, menghubungkannya ke produk katalog, dan melacak penggunaan.

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
| **Create Offer** | Wizard buat penawaran |

### Tab dan filter

**Tab halaman:** All Offers, Discounts, Promotions.

**Tab status tabel:** All, Active, Inactive.

**Pencarian:** **Search offers...**

**Filter tanggal:** All Time, Last 7 Days, Last 30 Days, Last 3 Months, This Year.

**Kolom:** Name, Type, Discount, Status, Duration, Usage Status, Actions.

**Tipe:** **Discount** atau **Promotion**. Penggunaan: **Used** / **Not Used**.

### Aksi massal

- **Activate** / **Deactivate**
- **Remove**

## Buat dan ubah penawaran

### Langkah wizard

1. **Offer Type** — aturan diskon
2. **Date Range** — jadwal berlaku
3. **Products** — pilih SKU
4. **Analytics** — lihat metrik

**Tindakan:** **Preview**, **Create Offer**, **Save as Inactive**.

Modal **Offer Preview** menampilkan tampilan untuk pembeli.

### Halaman detail

Empat tab sama saat edit. **Save Changes**, **Cancel**.

Status: **Active**, **Inactive**, **Expired** (banner kedaluwarsa).

## Hapus dan ekspor

Konfirmasi **Delete Offer** / **Delete Offers**.

**Export:** Offer ID, Name, Type, Status, Products Count, Total Usage, Total Discount Given, Discount Types, Created At.

Penawaran aktif tampil di Marketplace saat produk dipublikasikan.

## Tautan terkait

| Tujuan | Ke |
|--------|-----|
| Produk | [Produk](/id/docs/dashboard/products) |
| Pesanan | [Pesanan](/id/docs/dashboard/orders) |
| Pemasaran | [Pemasaran](/id/docs/dashboard/marketing) |
