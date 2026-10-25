---
title: Penjualan
description: Hub penjualan, peluang konversi, tim, pekerjaan, dan prospek pembeli.
section: Dashboard
module: dashboard
order: 16
---

Area **Penjualan (Sales)** mengubah peluang produk–retailer menjadi pekerjaan lapangan: prioritaskan follow-up, kelola agen dan tim, tugaskan pekerjaan, dan catat prospek outlet baru.

Jalur: **Sales** (`/sales`).

Framing produk: pakai Sales agar kunjungan tidak hanya mengulang produk laris yang sama, dan agar riwayat pembelian, quotation, serta minat pembeli menjadi pekerjaan yang bisa ditindaklanjuti.

## Hub penjualan (`/sales`)

### Tips

Kartu tip yang bisa ditutup dengan modal detail:

| Tip | Aksi utama | Menuju |
|-----|----------------|---------|
| **Invite New Customers** | **Invite customers** | Clients |
| **Create Promotions** | **Create promotion** | Offers |
| **Sales jobs** | **View jobs** | Jobs |

### Tools

| Tool | Rute | Tujuan |
|------|-------|---------|
| **Team** | `/sales/team` | Agen, peran, dan tim |
| **Jobs** | `/sales/jobs` | Pekerjaan lapangan untuk tim penjualan |
| **Prospect** | `/sales/prospects` | Prospek pembeli / outlet baru |

### Tabel Sales Conversion

Di bawah Tips, **Sales Conversion** menampilkan pekerjaan dan peluang terbuka yang dianalisis dari Sales, Orders, dan Clients, diurutkan berdasarkan prioritas.

**Chip ringkasan:** Open opportunities, Overdue buyers, Quotes follow-up, Orders attributed.

**Tab tipe:** All | Reorder | Quotation | Buyer interest | Sales task

**Filter:**

- Pencarian: **Search buyer, product, or sales rep…**
- **Timing:** All timing | 30+ days | 14 to 29 days | 7 to 13 days | Under 7 days | No timing
- **Value:** All values | Ambang mata uang di atas/bawah | No value

**Kolom:** Rank | Buyer | Type | Urgency | Why it matters | Sales rep | Timing | Value | Action

**Aksi** menaut ke detail pembeli, detail pesanan, atau **Jobs**. Paginasi: **8 baris per halaman**.

Keluarga insight yang sama mendukung widget opsional **Sales Conversion Engine** di [Beranda](/id/docs/dashboard/home).

## Tim (`/sales/team`)

### Aksi daftar

| Aksi | Tujuan |
|--------|---------|
| **Refresh** | Muat ulang agen dan tim |
| **Export Data** | Ekspor XLSX agen |
| **Add Agent** | Buat agen penjualan |

### Tab Individuals dan Teams

**Tab:** **Individuals** | **Teams**

**Pencarian:** **Search agents…**

**Filter:** **All Roles** (Sales Manager, Sales Rep, Sales Support, Lead Gen, Account Manager, dan lainnya) | **All Status** | Active | Inactive

**Kolom Individuals:** NAME | PHONE | EMAIL | ROLE | STATUS | ACTIONS

**Massal:** pilih baris, lalu **Remove Selected**.

**Teams:** wilayah yang bisa diperluas; **Create New Team** / **Edit Team** (nama tim atau wilayah, multi-pilih anggota).

### Buat, ubah, dan detail agen

Rute: `/sales/team/create`, `/sales/team/details?id=…`, `/sales/team/edit?id=…`.

Tab buat/ubah:

| Tab | Isi |
|-----|----------|
| **Basic Profile** | Identitas dan kontak |
| **Favourite Products** | Produk yang diprioritaskan agen |
| **Daily Field Reports** | Pengaturan laporan lapangan |
| **Sales Target** | Target dan progres |

Detail menampilkan target, produk favorit, laporan lapangan, dan biografi. Konfirmasi sebelum **Delete Agent**.

## Pekerjaan (`/sales/jobs`)

**Aksi:** **Export Data**, **Create new job** (`/sales/jobs/new`), edit (`/sales/jobs/edit`), hapus (tunggal atau massal).

**Kartu statistik:** Total jobs | Pending | Open | Completed

**Tab status:** All | Pending | Complete

**Pencarian:** **Search client or rep**

**Filter:** **All types** | **All reps**

**Sorotan tabel:** klien, badge tipe pekerjaan, rep, status, tanggal, alasan, **Created by** (**AI** atau **Manager**), produk yang disarankan. Paginasi mengelompokkan pekerjaan (5 grup per halaman).

### Tipe pekerjaan (form buat)

| Tipe | Tujuan |
|------|---------|
| **Take order** | Ambil pesanan di outlet |
| **Collect payment** | Tagih pembayaran dari pembeli |
| **Promote product** | Presentasikan produk tertentu |
| **Stock check** | Hitung stok **di rak toko pembeli** (bukan stok gudang) |
| **Pick up return** | Ambil retur |
| **Competitor check** | Catat intel kompetitor |

Label tipe tambahan bisa muncul dari pekerjaan yang sudah ada. Outlet baru ditambahkan dari **Prospect**, bukan sebagai pengganti board Prospect.

### Status pekerjaan

Pending, Suggested, Approved, Dispatched, In progress, Completed, Skipped. Nilai lama **approved** / **suggested** ditampilkan di bawah Pending jika UI menggabungkannya.

### Buat atau ubah pekerjaan

Form (**Create new job** / **Edit job**):

- Satu atau lebih baris pekerjaan di halaman
- Penugasan sales rep
- Jadwal dan **Dates and WhatsApp reminders**
- Klien dan produk (bergantung tipe)

**Stock check:** pilih klien dan produk yang dihitung di toko pembeli. Saat selesai, tandai **Checked** dan isi **Counted stock** per produk (`stock_counts`). Pekerjaan stok multi-pembeli selesai jika setiap baris pembeli selesai. Sinyal overdue atau hitungan rendah adalah alasan untuk diselidiki, bukan bukti permintaan otomatis.

## Prospek pembeli (`/sales/prospects`)

**Aksi:** **Export Data**, **Create new prospect**, **Edit**, **Delete**, hapus massal.

**Pencarian:** **Search prospects**

**Filter:** **All regions** plus daftar wilayah

**Kolom:** Customer number | Name | Store name | Phone | Address | Region | Buyer type | Notes

**Tipe pembeli:** Warung, Kiosk, Minimarket, Restaurant, Hotel, Canteen, Other.

**Buat / ubah** (`/sales/prospects/new`, `/sales/prospects/edit/[id]`): field wajib prospek, plus **Ask AI** untuk membuka Lakupak AI membantu pengisian.

## Tautan terkait

| Tujuan | Ke |
|------|--------|
| Catatan pembeli | [Klien](/id/docs/dashboard/clients) |
| Promosi produk | [Penawaran](/id/docs/dashboard/offers) |
| Pesanan | [Pesanan](/id/docs/dashboard/orders) |
| Widget Beranda | [Beranda](/id/docs/dashboard/home) |
