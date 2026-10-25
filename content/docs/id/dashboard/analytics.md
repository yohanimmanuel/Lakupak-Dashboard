---
title: Analitik
description: Analitik keuangan, pelanggan dan penjualan, serta operasional dengan rentang waktu dan ekspor.
section: Dashboard
module: dashboard
order: 17
---

**Analytics** menampilkan pandangan keuangan, pelanggan/penjualan, dan operasional bisnis distributor. Gunakan rentang waktu yang sama saat membandingkan grafik. Perlakukan pola sebagai sinyal untuk diselidiki (penetrasi, pembelian, pemenuhan), bukan bukti penyebab otomatis.

Jalur:

| Rute | Halaman |
|-------|------|
| `/analytics` | Analytics Dashboard (ringkasan) |
| `/analytics/financial` | Financial Analytics |
| `/analytics/sales` | Customer & Sales Analytics |
| `/analytics/performance` | Operational Performance |

Struktur sidebar saat diaktifkan: **Analytics** → Financial, Sales, Operational.

## Kontrol bersama

**Rentang waktu** (ringkasan dan semua subhalaman): **Per Month** | **Per Quarter** | **Per 6 Months** | **Per Year**

Status kosong mengarahkan ke **Add Products** atau **Manage Orders** jika data katalog atau pesanan belum cukup.

Metrik dan grafik dihitung dari pesanan dan produk akun Anda (kueri dibatasi; katalog sangat besar mungkin tidak memuat setiap baris historis dalam satu muat).

## Ringkasan (`/analytics`)

**Judul:** Analytics Dashboard

**Kartu metrik:** Order Volume | Pieces Sold | Order Completion Rate | Average Order Value (dengan perbandingan antarreiode).

**Grafik:**

- **Revenue Trend** — volume pesanan dan profit
- **Sales Trend** — pesanan dan unit (**See More** → Customer & Sales Analytics)
- **Order Status Distribution** — pie status
- **Processing Time Trend** — waktu proses rata-rata dan jumlah pesanan

**Tabel Top Performing Products** (lima teratas; **See More** → Financial Analytics).

## Financial Analytics (`/analytics/financial`)

**Aksi:** rentang waktu; **Export** (laporan HTML yang bisa dibuka di Word sebagai `.doc`).

**Kartu metrik:** Order Volume | Total Profit | Profit Margin | Average Order Value

**Bagian:**

- **Revenue Trend**
- **Revenue by Category**
- **Revenue Forecast** (butuh riwayat bulanan cukup, biasanya dua bulan atau lebih)
- **Cash Flow Trend** — inflow, outflow, net flow
- **Top Performing Products** — peringkat, produk, kategori, pieces, item gratis, volume, margin, profit; buka produk untuk detail varian

## Customer & Sales Analytics (`/analytics/sales`)

**Aksi:** rentang waktu; **Export** (laporan penjualan `.doc`).

**Kartu metrik:** Total Orders | Pieces Sold | Avg Pieces / Order | Avg Order Value

**Bagian:**

- **Sales Trend** — pesanan dan unit
- **Units by Product Category** — filter **Product Category** atau **Product Type**
- **Sales Trend Forecast** — bar historis plus forecast jika riwayat cukup
- **Customer Acquisition** — relasi baru, churn, pertumbuhan bersih
- **Top Customers** — avatar, Buyer ID (tautan), Name, Business Type, Orders, Order Volume

## Operational Performance (`/analytics/performance`)

**Aksi:** rentang waktu (tanpa tombol ekspor di halaman ini).

**Kartu metrik:** Order Completion Rate | Avg Processing Time | Tracking Coverage | Stock Health

**Bagian:**

- **Order Status Distribution**
- **Processing Time Trend**
- **Inventory Health by Category**
- **Operational Quality Metrics** — Order Acceptance Rate, Tracking Coverage, Data Completeness, Stock Health (dibanding target)
- **Delivery Methods Distribution**

## Tautan terkait

| Tujuan | Ke |
|------|--------|
| Sumber pesanan dan katalog | [Pesanan](/id/docs/dashboard/orders), [Produk](/id/docs/dashboard/products) |
| KPI dan widget Beranda | [Beranda](/id/docs/dashboard/home) |
| Performa storefront | [Marketplace (admin)](/id/docs/dashboard/marketplace-admin) |
