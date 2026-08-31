---
title: Lokasi dan realtime
description: GPS, sinkron lokasi, WebSocket, dan push.
section: Driver
module: driver
order: 44
---

Lakupak Driver membagikan posisi saat bertugas dan menerima pembaruan pesanan/armada secara live.

## GPS di perangkat

Aplikasi meminta izin lokasi **foreground**.

- Fix akurasi tinggi, lalu pembaruan ~**3 detik** atau **5 meter** pergerakan
- Untuk marker di peta, heading, kecepatan

Jika ditolak: **Location permission denied — enable it in Settings…** dan sinkron server berhenti.

## Sinkron lokasi ke server

Saat login:

- `POST /api/driver/location` dengan `{ lat, lng }` ~setiap **10 detik**
- Pembeli dan distributor melihat posisi live di peta logistik

Error sinkron diabaikan agar mengemudi tidak terganggu.

## Pembaruan WebSocket

Koneksi live ke Lakupak agar pembaruan pesanan dan armada masuk tanpa refresh manual.

| Pesan | Efek |
|-------|------|
| `order_updated` | Refresh armada; notifikasi OS opsional |
| `fleet_assigned` | Refresh tugas; alert armada baru |
| `app_update` | Pengumuman pembaruan aplikasi |

Reconnect otomatis (hingga 5 kali).

### Contoh judul push

- **New Delivery Ready**
- **Delivery In Progress**
- **Delivery Confirmed**
- **Order Cancelled**, **Delivery Failed**

Toggle **Delivery alerts** di Settings mengatur banner.

## Push notifications

Token Expo push didaftarkan saat login; bahasa disimpan di profil driver.

## Antrean status offline

Jika jaringan gagal saat **Start Delivery** / **Complete Delivery**, pembaruan bisa masuk **outbox** lokal dan dikirim ulang saat online.

## Telemetri sesi

Sampel sesi foreground ~**60 detik** ke `POST /api/driver/telemetry/session`.

## Dokumentasi terkait

- [Pengiriman](/id/docs/driver/deliveries)
- [Pemecahan masalah](/id/docs/driver/troubleshooting)
- [Pesanan Marketplace](/id/docs/marketplace/orders)
