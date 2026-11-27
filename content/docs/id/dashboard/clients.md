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
| **Market Segments** (Segmen Pasar) | Buka direktori segmen pasar (`/clients/buyers/market-segments`), tempat saluran utama, sub-saluran, dan rincian outlet disimpan untuk harga segmen |
| **Match Buyers** (Cocokkan Pembeli) | Buka pencocokan pembeli (`/clients/buyers/buyer-matching`) untuk meninjau prospek terhadap pesanan Marketplace. Angka biru menunjukkan pencocokan yang menunggu |
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

- Nama toko, pemilik, telepon, email, alamat
- **Tipe bisnis (saluran utama)**, dipilih dari direktori segmen pasar. Ini kunci harga untuk harga segmen produk
- **Sub-saluran** dan **Rincian outlet** (label opsional; tidak mengubah harga)
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
- Menghapus pembeli tidak menghapus harga segmen produk. Harga itu tetap ada selama saluran utama masih ada di direktori segmen pasar.

### Format impor (pembeli)

Impor menerima baris spreadsheet dengan nama kolom fleksibel. Template unduhan memuat satu baris contoh untuk setiap kolom. Kolom **Business Type** yang lama dibaca sebagai saluran utama.

| Kolom | Penggunaan |
|-------|------------|
| Store Name, Owner, Email, Phone, Address, Status | Profil pembeli |
| Main Channel, Sub-channel, Outlet Specifics | Label saluran; juga membuat baris direktori segmen pasar yang tetap ada jika pembeli nanti dihapus. Kombinasi saluran utama, sub-saluran, dan rincian outlet yang sama disimpan sekali |
| Last Order Date, Last Visit Date | Tanggal saja |
| Shipment Success | Tingkat keberhasilan logistik |
| Last shipment | Tanggal saja |

Kolom tambahan bisa masuk logistik atau catatan. Setiap baris membuat pembeli via GraphQL. Ekspor memakai kolom saluran dan tanggal yang sama.

## Pencocokan pembeli

Pencocokan pembeli memeriksa apakah pembeli yang sudah ada di Klien adalah toko yang sama dengan pembeli yang mendaftar atau memesan di Marketplace. Buka dari **Clients → Buyers → Match Buyers** (`/clients/buyers/buyer-matching`).

Angka biru pada **Match Buyers** adalah jumlah pasangan yang masih di **Pending**.

### Fungsi

| Fungsi | Kegunaannya |
|--------|-------------|
| **Keyakinan dan sinyal** | Skor dari telepon, nama toko, pemilik, dan alamat jalan. Kecocokan persis menambah lebih banyak daripada yang mirip, dan lencana menyebut kolom yang cocok. **75 atau lebih** tinggi. **50 sampai 74** sedang. Di bawah 50 tidak masuk antrean. Nomor yang sama diutamakan jika lebih dari satu pembeli mungkin cocok. |
| **Kartu** | Kartu kiri adalah **Prospect buyer**, pembeli yang sudah ada di daftar Anda. Kartu kanan adalah **Existing buyer**, akun Marketplace, beserta nomor pesanan jika ada. |
| **Antrean** | **Pending** masih terbuka. **Needs more info**, **Not a match**, dan **Recently merged** (30 hari terakhir) adalah tab lainnya. |
| **Merge** | Mempertahankan pembeli Marketplace dan menyerap pembeli CRM ke dalamnya. Pesanan, pekerjaan sales, penawaran, dan baris pesanan pindah ke pembeli Marketplace. Catatan pembeli CRM dihapus. Nama, telepon, toko, dan alamat Marketplace yang dipakai; catatan CRM hanya mengisi yang kosong. Saluran utama mempertahankan segmen CRM jika saluran Marketplace masih kosong. Penggabungan tidak menyetujui akses etalase. Pasangan itu kemudian tampil di **Recently merged**. |
| **Not a match** | Menolak pasangan ke tab **Not a match**. Kedua pembeli tetap terpisah. |
| **Needs more info** | Memindahkan pasangan ke tab **Needs more info** agar bisa diperiksa nanti. |
| **Undo** | Pada pasangan yang ditolak, mengembalikannya ke **Pending**. Pada pasangan yang sudah digabung, memulihkan pembeli CRM dan mengembalikan pesanan, pekerjaan, serta penawaran. Undo tidak menulis segmen bawaan dan tidak menghapus harga segmen produk. |
| **Auto matching** | Mati secara bawaan. Jika menyala, hanya pasangan berkeyakinan tinggi (75 atau lebih) yang tergabung sendiri. Pasangan sedang tetap menunggu di **Pending**. |
| **Search** | Menyaring tab yang terbuka menurut pembeli, toko, alamat, atau telepon. |

Setiap aksi menampilkan putaran pada tombolnya sampai permintaan selesai.

### Cara meninjau pasangan

1. Buka **Clients → Buyers → Match Buyers**.
2. Biarkan **Auto matching** mati sampai Anda yakin pada pasangan berkeyakinan tinggi.
3. Buka **Pending**. Baca skor dan lencana sinyal.
4. Bandingkan **Prospect buyer** di kiri dengan **Existing buyer** dan pesanan di kanan.
5. Klik **Merge** jika mereka toko yang sama. Klik **Not a match** jika berbeda. Klik **Needs more info** jika perlu dicek dulu.
6. Pakai tab dan pencarian untuk menemukan pasangan nanti. **Undo** penggabungan atau penolakan dari kartu itu.

### Yang dilihat pembeli

1. Toko itu sudah menjadi Prospect, atau pembeli lain, di daftar Klien Anda.
2. Toko yang sama mendaftar atau memesan di Marketplace. Keanggotaan baru mulai tanpa saluran utama.
3. Jika telepon, toko, pemilik, atau alamat mencapai skor 50 atau lebih, kartu muncul di Pending. Skor 75 atau lebih tergabung sendiri hanya jika **Auto matching** menyala.
4. Setelah Anda menggabungkan, riwayat berada pada pembeli Marketplace. Akses tetap menunggu.
5. Buka pembeli itu, isi **Business type (main channel)** jika masih kosong, lalu **Approve access**. Marketplace kemudian memakai harga segmen saluran itu. Lihat [Harga segmen pasar](#harga-segmen-pasar).

## Harga segmen pasar

Harga segmen pasar adalah harga jual varian untuk **saluran utama** pembeli. Buka dari **Clients → Buyers → Market Segments**.

Tarif klien pribadi di **Offers** adalah diskon terpisah di atas harga itu. Harga segmen menentukan harga jual katalog yang dipakai pembeli sebagai titik awal.

### Fungsi

| Fungsi | Kegunaannya |
|--------|-------------|
| **Saluran utama** | Wajib. Ini tipe bisnis pembeli dan kunci harga segmen produk. `General Trade` dan `general trade` adalah kunci yang sama. |
| **Sub-saluran** | Label opsional, misalnya Retail. Tidak memilih harga lain. |
| **Rincian outlet** | Label opsional, misalnya jenis toko. Tidak memilih harga lain. |
| **Direktori segmen pasar** | Daftar saluran tempat Anda berjualan. Pilihan harga produk berasal dari saluran utama yang berbeda di sini. |
| **Add segment** | Membuat satu baris direktori. Saluran utama wajib. Pemberitahuan “Main channel is required” hilang setelah 5 detik. |
| **Record from buyers** | Menyalin saluran utama, sub-saluran, dan rincian outlet setiap pembeli yang ada ke direktori. Kombinasi yang sama disimpan sekali. Pemberitahuan sukses hilang setelah 5 detik. Menjalankannya lagi hanya menambah kombinasi baru. |
| **Seret untuk mengurutkan** | Menyimpan urutan direktori. |
| **Edit** | Membuka popup untuk baris itu. Tidak menggantikan bilah tambah segmen. |
| **Delete / Delete selected** | Menghapus baris direktori. Harga suatu saluran utama dihapus hanya ketika baris terakhir saluran itu dihapus dan tidak ada pembeli yang masih memakainya. |
| **Lencana profil pembeli** | Menampilkan saluran utama. Arahkan kursor untuk melihat saluran utama, sub-saluran, dan rincian outlet. |

Saluran utama dan sub-saluran yang sama boleh muncul di lebih dari satu baris jika rincian outlet berbeda. Baris ditolak hanya ketika ketiga nilai sama, tanpa membedakan huruf besar.

### Mengatur pembeli, lalu harga produk

1. Buka **Clients → Buyers → Market Segments**.
2. Isi **Main channel**. Tambahkan **Sub-channel** dan **Outlet specifics** bila dipakai. Klik **Add segment**.
3. Seret baris ke urutan yang diinginkan. Urutan tersimpan.
4. Jika pembeli sudah ada, klik **Record from buyers**. Kombinasi yang sama digabung menjadi satu baris.
5. Di **Add Buyer** atau **Edit Details**, pilih **Business type (main channel)** dari direktori itu. Sub-saluran dan rincian outlet tetap opsional.
6. Buka produk dan atur **Market Segment Pricing** untuk saluran yang dijual produk itu. Lihat [Produk](/id/docs/dashboard/products).
7. Terbitkan produk agar Marketplace menampilkan harga itu.

Pembeli yang mendaftar di Marketplace mulai tanpa saluran utama. Mereka melihat harga jual bawaan sampai Anda memilih saluran utama dan menyetujui akses. Setelah disetujui, Marketplace memakai harga segmen saluran itu. Mengubah saluran utama kemudian memperbarui harga yang dilihat pembeli itu.

Kolom impor dan ekspor untuk saluran serta tanggal logistik ada di [Format impor (pembeli)](#format-impor-pembeli).

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

Impor massal memetakan kolom fleksibel (Name, Contact, Email, Phone, Business Type, Address, Status, dan lainnya). Template unduhan memuat satu baris contoh. Field ekstra bisa masuk logistik atau catatan.

### Impor dan arsip riwayat suplai

Di profil pemasok, **Import supplies** memetakan spreadsheet lalu menampilkan pratinjau. Jumlah diterima dan tipe stok tampil sebagai kolom teks terpisah. Hanya baris yang tetap dipilih yang diimpor. Batalkan pilihan baris yang tidak punya kecocokan unik di katalog pemasok ini, atau yang milik pemasok lain, sebelum mengonfirmasi.

Penerimaan tersimpan menampilkan aksi **Archive** ketika tooltip SKU-nya mengatakan penerimaan tidak tertaut ke katalog pemasok ini, atau produk pindah ke pemasok lain. Arsip hanya menyembunyikan penerimaan dari riwayat aktif. Jika penerimaan sudah menerapkan stok pada varian aktif, nonaktifkan **Update Current Stock** dan simpan sebelum mengarsipkan.

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

## Riwayat suplai, snapshot, dan stok

Catatan pemasok dan katalog produk **terpisah tetapi dapat ditautkan**. Perubahan katalog tidak membuat penerimaan, menulis ulang riwayat, atau memindahkan penerimaan ke varian lain. Penerimaan dibuat atau diimpor secara eksplisit.

- **Riwayat suplai** menyimpan setiap penerimaan: tanggal, snapshot produk/varian, jumlah dan satuan yang dimasukkan, nilai, serta apakah **Update Current Stock** diterapkan.
- **Snapshot** mempertahankan label produk dan varian lama. Baris `AUTO-` adalah snapshot historis; baris `HIST-` adalah riwayat suplai. Jangan menghitung snapshot sebagai penerimaan tambahan.
- Hubungan inventaris memakai ID produk dan ID opsi varian aktif. Varian yang dihapus lalu dibuat ulang dengan nama atau SKU yang sama memiliki identitas baru. Opsi aktif yang hilang tidak diganti diam-diam.
- Jumlah diterima dan tipe stok tetap seperti yang dimasukkan (misalnya karton). Inventaris menyimpan setara pieces dasar. Itu dua tampilan dari satu jumlah.
- Stok berubah hanya jika **Update Current Stock** berhasil. Menyimpan atau mengimpor baris tidak menambah stok dengan sendirinya.

Untuk stok saat ini, gunakan tampilan inventaris varian di katalog. Pesanan dan penyesuaian lain juga mengubah stok.

### Arsip, pulihkan, dan hapus

| Tindakan | Hasil |
|----------|-------|
| **Archive** / **Archive selected** | Memindahkan penerimaan yang memenuhi syarat ke **Archived Supplies**. Tidak membalik stok. |
| **Restore** / **Restore selected** | Mengembalikan penerimaan ke riwayat aktif tanpa membuat pergerakan stok baru. |
| **Delete** | Menghapus penerimaan yang memenuhi syarat setelah konfirmasi. Membalik stok yang pernah diterapkan adalah pilihan terpisah dan hanya berhasil jika varian aktif asal masih ada. |
| Nonaktifkan **Update Current Stock** pada penerimaan yang sudah diterapkan | Membalik pergerakan stok itu jika varian asal masih tersedia; penerimaan tetap di riwayat. |

Penerimaan historis yang tertaut ke varian katalog aktif pemasok ini dilindungi dari hapus permanen. Tombol hapus yang dinonaktifkan bukan alasan untuk menghapus varian produk. Untuk stok berikutnya pada penerimaan yang tidak tertaut atau variannya sudah dihapus, pilih varian aktif, atau arsipkan atau hapus baris yang usang.

## Tindakan CRUD dan hasil sistem

| Tindakan | Hasil sistem |
|---|---|
| Hapus pembeli | Menghapus dari CRM aktif; pesanan historis masih dapat merujuk pembeli. Harga segmen tetap di direktori segmen pasar. Tarif privat tanpa klien valid tidak bisa tetap Active. |
| Tambah/ubah/impor penerimaan | Menyimpan Riwayat Suplai, jumlah/satuan asli, dan snapshot produk/varian. Stok berubah hanya jika **Update Current Stock** berhasil. Impor hanya menulis baris pratinjau yang dipilih. |
| Archive / restore / delete penerimaan | Archive dan restore mengubah tampilan; delete permanen hanya untuk baris yang memenuhi syarat. Stok dibalik hanya jika dipilih dan memungkinkan. |
