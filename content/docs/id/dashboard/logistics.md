---
title: Logistik
description: Armada, pengemudi, rute, dan pelacakan pengiriman di peta.
section: Dashboard
module: dashboard
order: 19
---

**Logistics Management** membantu menjalankan armada, menugaskan pengemudi, memasang pesanan ke trip, dan melacak pengiriman di peta.

Jalur: `/logistics`, `/logistics/create`, `/logistics/details?id={fleetId}`, `/logistics/details/edit?id={fleetId}`.

## Ringkasan logistik (`/logistics`)

**Judul:** Logistics Management

| Aksi | Tujuan |
|--------|---------|
| **Refresh** | Muat ulang data armada dan pengemudi |
| **Export Data** | XLSX armada (Fleet ID, Fleet Code, Route, Status, Delivery Type, ETA, dan field terkait) |
| **Add Fleet & Driver** | Buat armada di `/logistics/create` |

Tata letak: **daftar armada / pengemudi** di kiri, panel **detail** di kanan (termasuk peta rute).

## Tab Active Fleets dan Drivers

**Tab:** **Active Fleets** | **Drivers**

### Active Fleets

**Pencarian:** **Search for shipments**

**Filter status:** All statuses | Available | Unavailable | In Transit | Checking

**Filter tipe:** All types, plus tipe pengiriman dari preferensi shipping distributor (misalnya Standard Shipping, Express Shipping, Same-day Delivery, Next-day Delivery, Scheduled Delivery, Pickup Available).

**Massal:** pilih armada, **Remove**; hapus per baris.

### Drivers

**Pencarian:** **Search drivers by name, username or phone**

**Massal:** pilih pengemudi, **Remove**.

## Panel detail armada

Pilih armada untuk pratinjau:

- **Open Details** → `/logistics/details?id=…`
- Ringkasan trip, kendaraan, pengemudi, dan pelanggan
- **Peta rute logistik** (Mapbox) dengan stop dari alamat pesanan dan posisi pengemudi live saat app driver menyinkronkan GPS

Halaman detail penuh mencakup detail pesanan, kendaraan, informasi pengemudi, dan pelanggan. **Full screen map** memperluas tampilan rute.

## Buat dan ubah armada

Tab wizard:

1. **Basic Info** — rute, status, ETA
2. **Vehicle** — tipe kendaraan dan muatan
3. **Driver** — pengemudi yang ditugaskan
4. **Order Selection** — pasang pesanan ke trip

**Back to Fleet List**, lalu **Create Fleet** / **Save Changes** lewat modal **Trip Summary**. Validasi meminta **Complete required fields** jika data kurang.

Ubah lewat `/logistics/details/edit?id=…` atau **Edit details** di halaman detail penuh.

## Akses pengemudi

Pengemudi dibuat oleh distributor (bukan self-signup produksi). Mereka masuk ke aplikasi mobile **Lakupak Driver** dengan kredensial yang Anda terbitkan. Pembaruan armada dan stop dari app driver muncul di peta logistik saat sync lokasi aktif.

## Tautan terkait

| Tujuan | Ke |
|------|--------|
| Alamat dan status pesanan | [Pesanan](/id/docs/dashboard/orders) |
| Opsi pengiriman | [Pengaturan](/id/docs/dashboard/settings) |
