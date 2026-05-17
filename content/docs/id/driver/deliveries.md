---
title: Pengiriman
description: Ringkasan Home, peta rute, aksi pesanan, POD, laporan gagal.
section: Driver
module: driver
order: 43
---

Jalankan pengiriman dari **Home**, peta **rute**, dan **Order Details**.

## Ringkasan Home

Jalur: `/(tabs)/home`.

| Bagian | Isi |
|--------|-----|
| Sapaan | **Hi, {name}** |
| Subjudul | **Your assigned deliveries will appear here.** |
| Statistik | **Active**, **Orders**, **Delivered** |
| **Latest Orders This Week** | Hingga 3 pesanan; **View more** → Tasks |
| **My Assigned Fleets** | Kartu armada; **View** → detail armada |

Ketuk pesanan → **Order Details**. Status armada: **In Transit**, **Available**, **Unavailable**, **Checking**.

Error muat: **Could not load deliveries. Pull down to retry.**

## Detail armada

Jalur: `/logisticstasks/fleetdetails?fleetId=`.

**Fleet Details** (baca saja): spesifikasi kendaraan, **Current load**, **Route**, **Fleet summary**.

## Peta rute

Jalur: `/logisticstasks/logisticsdetails?fleetId=&orderId=`.

Peta **Mapbox** layar penuh (perlu dev build/produksi; terbatas di Expo Go).

| Fitur | Perilaku |
|-------|----------|
| Marker driver | GPS live |
| Garis rute | Arah antar stop |
| Pin stop | Bernomor; selesai ada ✓ |
| Bottom sheet | Toko, alamat, tanggal |
| **Route details** | **{done} / {total} deliveries done** |
| Per stop | **Check** → detail pesanan |
| Status armada | **Available**, **Unavailable**, **Checking**, **In Transit** |

## Detail pesanan

Jalur: `/logisticstasks/orderdetails?fleetId=&orderId=`.

Toko, kontak, telepon, alamat, tanggal, **Items in this order**, badge status.

### Aksi pengiriman menurut status

| Status | UI | Aksi |
|--------|-----|------|
| **Packed** | **Report failure** + **Start Delivery** | → **Shipped** |
| **Shipped** | **Report failure** + **Complete Delivery** | POD → **Delivered** |
| **Delivered** / **Received** | **Delivery Completed** | Baca saja |
| **Failed** | **Delivery Failed** | Baca saja |
| **Cancelled** | **Order Cancelled** | Baca saja |
| **Returned** | **Order Returned** | Baca saja |
| Lainnya | **Awaiting preparation** | Tidak ada aksi |

### Bukti pengiriman (POD)

Modal **Proof of Delivery**, foto wajib, **Take Photo** / **Choose from Library**, **Complete Delivery**.

Sukses: **Delivery completed!**

## Laporan pengiriman gagal

Jalur: `/logisticstasks/reportfailure?fleetId=&orderId=`.

**Report delivery failure** — distributor diberi tahu.

Alasan wajib + **Photo evidence (max 3)** (minimal 1 foto).

Alasan: Customer unavailable, Incorrect address, Customer refused delivery, Vehicle breakdown, Access blocked, Goods damaged in transit, **Other reason**.

Kirim → status **Failed**. Sukses: **Reported**.

## Dokumentasi terkait

- [Tugas](/id/docs/driver/tasks)
- [Lokasi dan realtime](/id/docs/driver/location-realtime)
- [Pesanan](/id/docs/dashboard/orders), [Logistik](/id/docs/dashboard/logistics)
