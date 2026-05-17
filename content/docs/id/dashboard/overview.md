---
title: Ringkasan Dashboard
description: Masuk, navigasi, tata letak, tur, dan peta modul Dashboard distributor.
section: Dashboard
module: dashboard
order: 10
---

**Laku Dashboard** adalah pusat kendali web untuk distributor. Kelola katalog, klien B2B, pesanan, promosi, analitik, storefront marketplace, logistik, dan pengaturan akun dalam satu workspace setelah masuk.

Jalur: route di bawah `/home`, `/clients`, `/products`, dan modul lain di sidebar.

## Masuk dan registrasi

| Langkah | Tindakan |
|---------|----------|
| Distributor baru | Daftar di situs Laku lewat **Get Started**, lalu masuk |
| Pengguna lama | **Login** dengan email dan kata sandi |
| Setelah masuk | Diarahkan ke **Beranda** jika sesi valid |

Jika sesi habis, Anda diarahkan ke halaman login. Jaga **Pengaturan → Security & Password** untuk tim Anda.

## Tata letak dan navigasi

Dashboard memakai **sidebar** persisten (bisa dilipat di desktop, drawer di mobile) dan **navbar** atas dengan pencarian dan akun.

### Menu utama

| Item | Route | Fungsi |
|------|-------|--------|
| **Home** | `/home` | KPI, widget kustom, ringkasan bisnis |
| **Clients** | `/clients` | Hub **Buyers** dan **Suppliers** |
| **Products** | `/products` | Katalog, stok, publish ke Marketplace |
| **Orders** | `/orders` | Daftar pesanan B2B, peta, pemenuhan |
| **Offers** | `/offers` | Diskon dan promosi |
| **Marketing** | `/marketing` | Hub **Team** dan **Campaigns** |
| **Analytics** | `/analytics` | Hub **Financial**, **Sales**, **Operational** |

### Menu sekunder

| Item | Route | Fungsi |
|------|-------|--------|
| **Marketplace** | `/marketplace` | Performa storefront (bukan aplikasi pembeli) |
| **Logistics** | `/logistics` | Armada, driver, pelacakan |
| **Settings** | `/settings` | Profil, perusahaan, penagihan, keamanan, tur |

Submenu di **Clients**, **Marketing**, dan **Analytics** untuk halaman di atas.

## Setup minggu pertama (disarankan)

### Perusahaan dan storefront

1. **Settings → Distributor Operations** — nama, logo, alamat, opsi pengiriman (terlihat pembeli di Marketplace).
2. **Settings → General Info** — profil pengguna.

### Katalog dan pembeli

3. **Products** — tambah SKU, varian, gambar; **Publish** saat siap.
4. **Clients → Buyers** — tinjau pembeli marketplace atau impor data.
5. **Marketplace** — cek jumlah published dan metrik storefront.

### Pemenuhan

6. **Orders** — proses pesanan masuk; perbarui status hingga terkirim.
7. **Logistics** — buat akun driver dan **Add Fleet & Driver**.
8. Bagikan kredensial **Laku Driver** (driver tidak daftar sendiri).

### Pertumbuhan (opsional)

9. **Offers** — kampanye pada produk.
10. **Marketing → Campaigns** — outreach WhatsApp ke retailer.
11. **Analytics** — laporan setelah ada riwayat pesanan.

## Tur produk dan onboarding

**Settings → Features & Tours** memutar ulang panduan untuk: Dashboard overview, Products, Orders, Offers, Marketplace, Logistics.

Prompt tur selamat datang bisa muncul saat login pertama. Pakai tur saat onboarding staf baru.

## Hubungan dengan aplikasi lain

| Tindakan Dashboard | Pembeli (Marketplace) | Driver (Driver) |
|--------------------|------------------------|-----------------|
| Publish produk | Listing di toko Anda | — |
| Konfirmasi / kirim pesanan | Status dan notifikasi | Tugas di peta rute |
| Tugaskan armada | Pelacakan jika dikonfigurasi | **Tasks** harian |
| Ubah pengiriman perusahaan | Opsi checkout | — |

Lihat [Alur pesanan](/id/docs/platform/order-flow).

## Dokumentasi modul

| Topik | Panduan |
|-------|---------|
| Widget beranda | [Beranda](/id/docs/dashboard/home) |
| Pembeli dan pemasok | [Klien](/id/docs/dashboard/clients) |
| Katalog | [Produk](/id/docs/dashboard/products) |
| Pemenuhan | [Pesanan](/id/docs/dashboard/orders), [Logistik](/id/docs/dashboard/logistics) |
| Promosi | [Penawaran](/id/docs/dashboard/offers) |
| Metrik storefront | [Marketplace (admin)](/id/docs/dashboard/marketplace-admin) |
| Akun | [Pengaturan](/id/docs/dashboard/settings) |

## Dokumentasi terkait

- [Memulai](/id/docs/getting-started)
- [Ekosistem Laku](/id/docs/platform/ecosystem)
