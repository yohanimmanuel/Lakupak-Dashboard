---
title: Klien
description: CRM pembeli dan pemasok dengan daftar, profil, impor/ekspor, dan analitik hubungan.
section: Dashboard
module: dashboard
order: 12
---

Area **Klien** adalah CRM distributor untuk pembeli ritel dan pemasok hulu. Ini juga fondasi hubungan untuk intelijen portofolio: riwayat pembelian dan profil retailer membantu menilai toko mana yang cocok untuk produk mana. Gunakan daftar **Pembeli** yang sama untuk **prospek pembeli** (status **Prospect**) — tidak ada modul Prospek terpisah di Sales.

Ada halaman hub plus dua alat: **Pembeli (Buyers)** dan **Pemasok (Suppliers)**.

## Mengapa Klien penting untuk pemanfaatan portofolio

- Catatan retailer dan riwayat pesanan menunjukkan siapa yang sudah membeli apa
- Status (Aktif, Prospek, Tidak Aktif, Diblokir) menjaga pencocokan dan outreach fokus pada toko yang tepat
- Pola produk dan belanja mendukung pencocokan next-best produk–retailer seiring intelijen itu diluncurkan

Penetrasi rendah untuk sebuah produk di pembeli yang layak adalah sinyal untuk diselidiki, bukan permintaan otomatis.

## Hub Klien

Buka **Clients** di sidebar untuk melihat:

- Kartu **Tips** (bisa ditutup) untuk menambah pembeli dan mengelola pemasok, dengan modal detail opsional.
- Pintasan **Tools** ke **Buyers** dan **Suppliers**.

Pembeli yang memesan lewat **Lakupak Marketplace** dapat tercatat otomatis di daftar pembeli saat bertransaksi di storefront Anda. Anda juga bisa menambah pembeli manual atau impor massal.

## Pembeli (Buyers)

Jalur: **Clients → Buyers** (`/clients/buyers`).

### Kartu ringkasan pembeli

Empat KPI di bagian atas:

| Kartu | Arti |
|------|------|
| Total Buyers | Semua record pembeli di workspace |
| Active Buyers | Pembeli berstatus Active |
| Monthly Buyer Spend | Rata-rata belanja bulanan pembeli yang punya riwayat pesanan |
| Avg. Order Frequency | Rata-rata frekuensi pesanan per bulan (ditampilkan `/mo`) |

Nilai memakai mata uang akun dari Pengaturan.

### Tindakan di daftar pembeli

| Tindakan | Fungsi |
|----------|--------|
| **Refresh** | Muat ulang data pembeli dari server |
| **Import Data** | Buat pembeli massal dari spreadsheet (XLSX) |
| **Export Data** | Unduh tabel terfilter ke XLSX |
| **Add Buyer** | Buka `/clients/buyers/add` |

Setelah refresh, toast singkat menampilkan jumlah pembeli yang dimuat.

### Tabel dan filter pembeli

Tabel pembeli mendukung:

- **Pencarian** menurut nama toko
- **Tab status**: All, Active, Prospect, Inactive, Blocked
- **Filter tipe bisnis** (dinamis dari data Anda)
- **Filter periode**: All Months, This Month, Last Month (tanggal pembuatan record)
- **Paginasi**
- **Pilih baris** untuk hapus massal
- **Tampilan desktop dan mobile** (kartu di layar kecil)

**Kolom (desktop):** ID, Name, Address, Business Type, Total Orders, Total Spend, Outstanding, Status, Actions.

**Aksi baris:** **Edit** membuka halaman detail pembeli (`/clients/buyers/details/{buyerId}`). Dari sana, **Edit Details** membuka `/clients/buyers/edit/{buyerId}`.

### Prospek pembeli

Gunakan **Clients → Buyers** untuk mencatat outlet yang belum Anda jual:

- Setel status **Prospect** saat menambah pembeli (atau biarkan Prospek sampai mereka memesan / menjadi Active).
- Minta **Lakupak AI** mencari retailer menurut wilayah dan tipe outlet (Google Places). Chat mengembalikan usulan dengan **Isi kolom formulir** / **Lihat pembeli**; belum ada yang disimpan sampai Anda konfirmasi di form pembeli.
- Filter tabel pembeli dengan tab **Prospect** untuk fokus pada lead tersebut.

### Tambah atau ubah pembeli

Form mencakup:

- Nama toko, pemilik, telepon, email, alamat, tipe bisnis
- Status: Active, Prospect, Inactive, atau Blocked
- Tanggal dibuat
- Logistik: hari pengiriman pilihan, pengiriman terakhir, tingkat keberhasilan pengiriman
- Catatan
- **Baris pesanan** opsional (produk, total pesanan, total belanja, tanggal pesanan terakhir, outstanding)
- Unggah avatar (Cloudinary) jika dikonfigurasi

Pembeli baru mendapat ID seperti `LKB-########` jika tidak diisi. Input divalidasi sebelum simpan.

### Detail pembeli (profil)

Halaman profil menampilkan:

- **Copy Data** (salin profil dan baris pesanan)
- **Edit Details** (membuka `/clients/buyers/edit/{buyerId}`)
- **Progress kelengkapan data** (field profil, logistik, atau pesanan yang kosong)
- Ringkasan kontak dan bisnis
- Alamat terpotong di Informasi Umum dengan **Lihat di Peta** (alamat lengkap + modal peta)
- **Grafik analitik**: tren pesanan dan belanja bulanan
- Tabel **Order and product details** dengan paginasi
- **Import orders** dan **export orders** (XLSX) untuk baris pesanan pembeli itu

Total mencakup jumlah pesanan, total belanja, dan saldo outstanding.

### Menghapus pembeli

- Hapus satu pembeli dari aksi tabel, atau pilih banyak baris untuk **bulk delete**.
- Pembeli terhapus hilang dari daftar aktif. Tautan lama dapat menampilkan halaman **Buyer data has been deleted**; pesanan lama tetap bisa mereferensikan pembeli tersebut.

### Format impor (pembeli)

Impor menerima baris spreadsheet dengan nama kolom fleksibel (misalnya Store Name, Owner, Email, Phone, Business Type, Address, Status). Kolom tambahan bisa masuk logistik atau catatan. Setiap baris membuat pembeli via GraphQL.

## Pemasok (Suppliers)

Jalur: **Clients → Suppliers** (`/clients/suppliers`).

### Kartu ringkasan pemasok

| Kartu | Arti |
|------|------|
| Total Suppliers | Semua record pemasok |
| Active Suppliers | Pemasok berstatus Active |
| Monthly Purchase Value | Rata-rata nilai belanja bulanan dari data supply |
| On-time Delivery Rate | Rata-rata tingkat keberhasilan pengiriman dari logistik dan supply |

### Tindakan di daftar pemasok

Pola sama dengan pembeli:

- **Refresh**, **Import Data**, **Export Data**, **Add Supplier**

### Tabel dan filter pemasok

- **Pencarian** menurut nama pemasok
- **Tab status**: All, Active, Inactive, Blocked
- **Filter tipe bisnis**
- **Periode**: All Months, This Month, Last Month
- **Paginasi** (8 baris per halaman di desktop)
- **Hapus massal** dengan pilihan baris

**Kolom:** ID, Name, Business Type, Location, Total Supplies, Total Purchases, Created At, Status, Actions.

Buka **Supplier details** di `/clients/suppliers/details/{supplierId}`.

### Tambah atau ubah pemasok

Field mencakup:

- Nama pemasok, kontak, email, telepon, alamat, tipe bisnis
- Status: Active, Inactive, Blocked
- Logistik: hari pengiriman, pengiriman terakhir, delivery success
- Catatan
- **Baris supply**: nomor supply, SKU, produk, total supplied, total value, last delivery, status
- ID pemasok digenerate sistem jika kosong

### Detail pemasok (profil)

Mirip pembeli:

- **Copy Data**, **Edit Details**
- **Kelengkapan data** untuk profil, logistik, dan baris supply
- **Analitik bulanan** (unit supplied dan nilai belanja)
- Tabel **Supplies and product data** dengan paginasi
- **Import supplies** dan **export supplies** (XLSX)

Agregat termasuk total unit supplied dan total nilai pembelian. **On-time delivery rate** pada record pemasok ikut mengisi KPI di daftar.

### Format impor (pemasok)

Impor massal memetakan kolom fleksibel (Name, Contact, Email, Phone, Business Type, Address, Status, supplies, dan lainnya). Field ekstra bisa masuk logistik atau catatan.

## Hubungan dengan modul Lakupak lain

| Data | Dipakai di |
|------|------------|
| Pembeli | Pesanan (nama toko, buyer ID), akun Marketplace, widget **Buyer Engagement** di Beranda |
| Pemasok | Konteks pengadaan produk, widget **Supplier Network** di Beranda, perencanaan stok |

Data klien yang mutakhir memperbaiki pemenuhan pesanan, analitik, dan widget dashboard.

## Dokumentasi terkait

- [Pesanan](/id/docs/dashboard/orders) untuk alur pesanan B2B
- [Produk](/id/docs/dashboard/products) untuk katalog terkait supply
- [Beranda](/id/docs/dashboard/home) untuk widget pembeli dan pemasok
