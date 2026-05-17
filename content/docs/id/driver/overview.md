---
title: Ringkasan Driver
description: Tab aplikasi Laku Driver, model akses, dan navigasi.
section: Driver
module: driver
order: 40
---

**Laku Driver** adalah aplikasi mobile (Expo/React Native) untuk driver armada distributor. Driver menjalankan rute yang ditugaskan, memperbarui status pesanan, membagikan lokasi live ke pembeli, dan mengirim bukti pengiriman (POD) atau laporan gagal.

Tersedia dalam **English** dan **Bahasa Indonesia**.

## Siapa pengguna aplikasi Driver

- Driver lapangan terhubung ke satu **distributor**
- Akun **dibuat di Laku Dashboard** (Logistik); tidak ada daftar mandiri instan
- Cakupan data: armada dan pesanan yang ditugaskan via `GET /api/driver/fleets`

## Navigasi utama

Empat tab bawah:

| Tab | Fungsi |
|-----|--------|
| **Home** | Sapaan, statistik aktif/terkirim, pesanan terbaru, armada |
| **Tasks** | Kalender dan tugas pengiriman harian |
| **Notifications** | Riwayat alert in-app |
| **Account** | Profil, pengaturan, bantuan, logout |

Header Home menampilkan **Laku Driver**.

### Rute lain

| Area | Contoh |
|------|--------|
| Auth | welcome, login, request access |
| Logistik | peta rute, detail pesanan, laporan gagal, filter, detail armada |
| Akun | profil, settings, bahasa, bantuan, privasi, syarat |

Setelah login: WebSocket, sinkron GPS, push, antrean status offline.

## Model akses

| Tindakan | Cara |
|----------|------|
| Dapat kredensial | Distributor buat driver di **Dashboard → Logistik** |
| Belum punya akun | **Register** di welcome = **Request access** |
| Masuk | **Login** dengan username dan password dari distributor |

## Peran di ekosistem Laku

| Peran | Aplikasi |
|-------|----------|
| Distributor rencanakan armada | Dashboard **Logistik** |
| Pembeli lacak pengiriman | Marketplace |
| Driver jalankan rute | **Laku Driver** |

## Dokumentasi terkait

- [Login dan akses](/id/docs/driver/login-access)
- [Tugas](/id/docs/driver/tasks)
- [Pengiriman](/id/docs/driver/deliveries)
- [Lokasi dan realtime](/id/docs/driver/location-realtime)
