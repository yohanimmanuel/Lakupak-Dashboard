---
title: Beranda
description: Dashboard yang dapat disesuaikan dengan KPI, widget seret, dan ringkasan bisnis langsung.
section: Dashboard
module: dashboard
order: 11
---

Halaman **Beranda** adalah pusat kendali setelah Anda masuk. Halaman ini memuat snapshot pesanan, produk, pembeli, dan pemasok, lalu menampilkannya melalui strip KPI dan kumpulan widget yang bisa Anda atur sesuai cara kerja tim.

## Kartu KPI di atas

Empat kartu ringkasan berada di atas grid widget (nilai dihitung dari seluruh riwayat pesanan, bukan hanya data yang terlihat di satu widget):

| Kartu | Yang ditampilkan |
|------|----------------|
| **Total Sales** | Total pendapatan dari semua pesanan |
| **Revenue Collected** | Pendapatan dari pesanan berbayar (total sales dikurangi pending) |
| **Active Orders** | Pesanan yang belum selesai |
| **Total Clients** | Jumlah pembeli |

## Widget Library

Buka **Widget Library** untuk:

- **Menyeret** widget di dashboard untuk mengubah urutan (grid dua kolom di layar lebar).
- **Menambah** atau **Menghapus** widget lewat tombol di setiap kartu perpustakaan.
- **Menyeret dari perpustakaan** ke grid untuk menambah modul yang sempat disembunyikan.

Tata letak disimpan per pengguna di browser, sehingga pilihan Anda tetap ada saat login berikutnya.

Widget bawaan di perpustakaan hari ini: Orders Pipeline, Product Performance, Inventory Alerts, Buyer Engagement, dan Supplier Network.

Widget **Sales Conversion Engine** (kartu peluang lebar penuh) dan widget berorientasi analitik sudah diimplementasikan di produk; mereka muncul lagi di Widget Library saat modul terkait diaktifkan di menu produk. Tabel konversi penuh juga ada di [Penjualan](/id/docs/dashboard/sales).

## Referensi widget

### Orders Pipeline (Alur pesanan)

Menampilkan **empat pesanan terbaru** dengan nama toko, kontak, tanggal, badge status (Pending, Confirmed, Packed, Shipped, Delivered, dan lainnya), total pesanan, dan tautan **Details** ke halaman pesanan. Gunakan **View all orders** untuk daftar penuh, filter, peta, dan ekspor.

### Product Performance (Kinerja produk)

Peringkat **tiga produk teratas berdasarkan pendapatan** dengan gambar, kategori, pendapatan, pieces terjual, persentase margin, dan bar progres pendapatan. Gunakan **Manage catalog** untuk mengedit atau mempublikasikan produk.

### Inventory Alerts (Peringatan stok)

Ringkasan inventaris di seluruh katalog:

- **Total produk** (termasuk jumlah dipublikasi dan total pieces di stok)
- Jumlah **stok rendah** dan item **kritis** (jauh di bawah ambang atau habis)
- **Rata-rata level stok** per produk

Menampilkan hingga tiga **produk stok rendah teratas** dengan stok saat ini, ambang, dan tautan ke katalog. Gunakan **Manage products** untuk restok atau ubah ambang.

### Buyer Engagement (Keterlibatan pembeli)

Metrik pembeli dan pesanan:

- Total dan pembeli **aktif**
- **Nilai pesanan rata-rata**
- **Pieces terjual** dan **unit terjual**

**Top buyers by revenue** (hingga tiga) menampilkan toko, status, jumlah pesanan, pendapatan, dan pieces. Gunakan **Manage buyers** di menu Klien.

### Supplier Network (Jaringan pemasok)

Kesehatan pemasok dan pengadaan:

- Total dan pemasok **aktif**
- Persentase **pengiriman tepat waktu** (target ditampilkan 90% atau lebih)
- **Nilai pemasok teratas** dari data supply dan pembelian

**Priority suppliers** menampilkan hingga tiga pemasok berdasarkan nilai pemenuhan. Gunakan **Manage suppliers** di menu Klien.

### Sales Conversion Engine

Widget lebar penuh (dua kolom di layar lebar) menampilkan **peluang paling mendesak** sebagai kartu, dari insight Sales Conversion yang sama dengan tabel di [Penjualan](/id/docs/dashboard/sales).

Kartu merangkum pembeli, tipe peluang, urgensi, mengapa penting, dan aksi yang disarankan. Pakai sebagai antrean prioritas harian; buka **Sales** untuk tabel penuh dengan filter timing dan value.

Saat widget ini diaktifkan di Widget Library, Anda bisa menambah, menghapus, dan mengurutkannya seperti modul Beranda lain.

## Jika data masih kosong

Widget menampilkan status kosong hingga ada pesanan, produk, atau pembeli. Setelah data pertama masuk, Beranda terisi otomatis saat halaman dimuat ulang.

## Tautan terkait

| Tujuan | Buka |
|--------|------|
| Daftar pesanan dan pemenuhan | [Pesanan](/id/docs/dashboard/orders) |
| Katalog dan stok | [Produk](/id/docs/dashboard/products) |
| Marketplace pembeli | [Ringkasan Marketplace](/id/docs/marketplace/overview) |
