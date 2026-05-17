---
title: Beranda
description: Dashboard yang dapat disesuaikan dengan KPI, widget seret, dan ringkasan bisnis langsung.
section: Dashboard
module: dashboard
order: 11
---

Halaman **Beranda** adalah pusat kendali setelah Anda masuk. Halaman ini memuat snapshot pesanan, produk, pembeli, pemasok, dan kampanye, lalu menampilkannya melalui strip KPI dan kumpulan widget yang bisa Anda atur sesuai cara kerja tim.

## Kartu KPI di atas

Empat kartu ringkasan berada di atas grid widget (nilai dihitung dari seluruh riwayat pesanan, bukan hanya data yang terlihat di satu widget):

| Kartu | Isi |
|------|-----|
| **Total Penjualan** | Total pendapatan dari semua pesanan |
| **Pendapatan Tertagih** | Pendapatan dari pesanan yang sudah dibayar |
| **Total Pesanan** | Jumlah pesanan di sistem |
| **Pieces Terjual** | Total unit terjual dari pesanan |

Gunakan kartu ini untuk membaca volume penjualan dan penagihan sebelum membuka widget detail.

## Sesuaikan tata letak

Klik **Drag widgets to rearrange** (atau kontrol serupa di antarmuka) untuk membuka **Widget Library**. Dari sana Anda dapat:

- **Menyeret** widget di dashboard untuk mengubah urutan (grid dua kolom di layar lebar).
- **Menambah** atau **Menghapus** widget lewat tombol di setiap kartu perpustakaan.
- **Menyeret dari perpustakaan** ke grid untuk menambah modul yang sempat disembunyikan.

Tata letak disimpan per pengguna di browser, sehingga pilihan Anda tetap ada saat login berikutnya.

Widget bawaan: Analytics Overview, Orders Pipeline, Product Performance, Inventory Alerts, Buyer Engagement, dan Supplier Network. **Logistics Tracking** dan **Marketing Performance** tersedia di perpustakaan tetapi tidak aktif secara default.

## Referensi widget

### Analytics Overview (Ringkasan analitik)

Kinerja pendapatan dari waktu ke waktu untuk tahun berjalan, termasuk grafik tren dan total pendapatan. Gunakan **Open analytics hub** untuk laporan keuangan, penjualan, dan operasional lengkap.

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

### Logistics Tracking (opsional)

Operasional pengiriman:

- **Total shipments** (metode seller atau distributor delivery)
- Jumlah yang **Delivered**
- Persentase **on-time delivery** (jika tanggal estimasi diisi)
- **Rata-rata waktu pengiriman** dalam hari

**Active shipments map** menampilkan pesanan berjalan (Pending, Confirmed, Packed, Shipped) berdasarkan alamat kirim. Klik penanda untuk membuka detail pesanan. Gunakan **View logistics** atau area Pesanan untuk alur pemenuhan lengkap.

### Marketing Performance (opsional)

Dua panel berdampingan:

**Teams and people (Tim dan orang)**

- Jumlah tim, total agen, dan agen aktif
- Jumlah anggota per tim (tim teratas ditampilkan)

**Campaigns (Kampanye)**

- Total kampanye, draft atau terjadwal, dan yang sudah terkirim
- Untuk kampanye terkirim: pendapatan, penerima, tanggal terakhir dikirim, pesanan, saluran (misalnya WhatsApp), dan tingkat konversi

Gunakan **View marketing** untuk mengelola tim dan kampanye.

## Jika data masih kosong

Widget menampilkan status kosong hingga ada pesanan, produk, pembeli, atau kampanye. Setelah data pertama masuk, Beranda terisi otomatis saat halaman dimuat ulang.

## Tautan terkait

| Tujuan | Buka |
|--------|------|
| Daftar pesanan dan pemenuhan | [Pesanan](/id/docs/dashboard/orders) |
| Katalog dan stok | [Produk](/id/docs/dashboard/products) |
| Laporan mendalam | [Analitik](/id/docs/dashboard/analytics) |
| Armada dan pengemudi | [Logistik](/id/docs/dashboard/logistics) |
