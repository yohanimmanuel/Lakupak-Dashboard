---
title: Tugas
description: Kalender tugas, kartu armada, filter, navigasi ke rute.
section: Driver
module: driver
order: 42
---

Tab **Tasks** adalah jadwal harian penugasan armada dan stop pengiriman.

Jalur: `/(tabs)/tasks`.

## Kalender tugas

- Kalender horizontal: **7 hari sebelum hari ini** sampai **30 hari ke depan**
- Subjudul: `{count} task(s) · {tanggal}`
- Hari ini: **Today**
- Titik di bawah tanggal jika ada tugas

**Tanggal tugas** dari `assignedDate` armada, lalu `preferredDeliveryDate`, lalu `orderDate`.

## Kartu tugas

Setiap kartu = satu armada pada hari terpilih:

| Label | Arti |
|-------|------|
| **{completed}/{total} stops completed** | Progres rute |
| **No stops** | Armada kosong |
| **Must be completed by: {date}** | Batas waktu |
| Badge status | **In Transit**, **Available**, **Unavailable**, **Checking** |

Menampilkan kendaraan, plat, ringkasan rute.

Ketuk kartu → peta **Logistics details**.

## Filter tugas

Ikon **filter** di header; badge jumlah filter aktif.

Jalur: `/logisticstasks/filtermodal`.

| Bagian | Filter |
|--------|--------|
| **Order Status** | Pending, Confirmed, Packed, Shipped, Delivered, Received, Failed, Cancelled, Returned |
| **Fleets** | Kode armada |
| **Customers** | Nama toko |

**Clear all**, **Apply**.

Data dari `GET /api/driver/fleets`.

## Status kosong dan error

| Status | Pesan |
|--------|--------|
| Memuat | **Loading tasks…** |
| Tidak ada tugas | **No tasks for this day** |
| Error | **Could not load tasks. Pull down to retry.** + **Retry** |

## Dokumentasi terkait

- [Pengiriman](/id/docs/driver/deliveries)
- [Ringkasan Driver](/id/docs/driver/overview)
