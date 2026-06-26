---
title: Pemecahan masalah
description: Konektivitas, login, peta, izin, dan perbaikan umum.
section: Driver
module: driver
order: 45
---

Perbaikan cepat untuk masalah umum Laku Driver.

## Konektivitas dan pemuatan

| Gejala | Pesan | Langkah |
|---------|--------|---------|
| Armada kosong di Home | **Could not load deliveries. Pull down to retry.** | Tarik refresh; cek jaringan; URL API |
| Tugas kosong | **Could not load tasks. Pull down to retry.** | Sama; **Retry** |
| Status tidak tersimpan | **Update failed** | Cek koneksi; tunggu outbox |
| Masalah umum | FAQ di Help | Perbarui app; **support@laku.com** |

Konfirmasi ke distributor bahwa Anda memakai lingkungan Laku yang benar untuk perusahaan Anda.

## Masalah login

| Masalah | Pesan / solusi |
|---------|----------------|
| Password salah | **Invalid Credentials** |
| Terlalu sering | **Too many attempts** (~15 menit) |
| Belum punya akun | **Request access** atau hubungi distributor |
| Sesi habis | Login lagi; outbox sinkron setelah online |

**Register** di welcome = **request access**, bukan daftar instan.

## Izin

| Izin | Untuk | Jika ditolak |
|------|-------|--------------|
| **Location** | Peta + pelacakan | Aktifkan di Settings sistem |
| **Camera** | POD, foto gagal | Alert **Permission required** |
| **Notifications** | Push | Daftar in-app WebSocket bisa tetap jalan |

## Peta

| Masalah | Solusi |
|---------|--------|
| Peta kosong di Expo Go | Pakai **development build** atau produksi |
| Peta tidak muncul | Pakai build produksi/dev dari distributor; peta bisa tidak jalan di Expo Go |
| Tidak ada titik driver | Izin lokasi; tunggu fix GPS |

## Notifikasi

| Masalah | Perilaku |
|---------|----------|
| Pesanan dihapus dari armada | **Order not found** |
| Tidak ada banner | Nyalakan **Delivery alerts** |
| Duplikat | Dedup ~8 detik |

## Akun

| Tindakan | Hasil |
|----------|--------|
| **Log Out** | Ke welcome |
| **Delete Account** | Hubungi distributor |
| Ubah password | Distributor mengelola |

## Pembaruan offline

Selesaikan pengiriman tanpa sinyal: status bisa antre lokal. Tetap login dan buka app saat online agar outbox terkirim.

## Dokumentasi terkait

- [Login dan akses](/id/docs/driver/login-access)
- [Lokasi dan realtime](/id/docs/driver/location-realtime)
- [Bantuan dan dukungan](/id/docs/platform/help-and-support)
