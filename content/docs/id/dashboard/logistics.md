---
title: Logistik
description: Armada, driver, rute, dan pelacakan pengiriman.
section: Dashboard
module: dashboard
order: 19
---

**Logistics Management** mengelola armada, menugaskan driver, menghubungkan pesanan ke trip, dan melacak pengiriman di peta.

Jalur: `/logistics`, `/logistics/create`, `/logistics/details?id={fleetId}`, `/logistics/details/edit?id={fleetId}`.

## Ringkasan logistik

**Subtitle:** Pantau armada, pengiriman, dan kinerja logistik di jaringan distribusi.

| Tindakan | Fungsi |
|----------|--------|
| **Refresh** | Muat ulang data armada dan driver |
| **Export Data** | XLSX armada |
| **Add Fleet & Driver** | Buat armada baru |

Layout: **daftar armada** (kiri) dan panel **fleet details** (kanan).

## Daftar armada

### Filter tab armada

**Tab:** **Active Fleets**, **Drivers**.

**Pencarian:** **Search for shipments**

**Status:** All statuses, Available, Unavailable, In Transit, Checking

**Tipe:** All types + opsi pengiriman dari pengaturan distributor.

**Massal:** pilih semua, **Remove**, **Delete fleet** per baris.

### Tab driver

**Pencarian:** **Search drivers by name, username or phone**

**Massal:** **Remove** driver terpilih.

## Panel detail armada

Pilih armada untuk melihat:

- **Open Details** → `/logistics/details?id=…`
- Tab: **Order details**, **Vehicle**, **Driver information**, **Customer information**
- Peta **Delivery route · {fleet code}**, **Full screen map**

## Buat dan ubah armada

Tab wizard:

1. **Basic Info**
2. **Vehicle**
3. **Driver**
4. **Order Selection**

**Back to Fleet List**, **Create Fleet** / **Save Changes** lewat modal **Trip Summary**.

Validasi: **Complete required fields**.

## Halaman detail penuh

**Trip Summary**, **Driver**, **Vehicle**, **Logistics Details**, peta rute, pelanggan.

**Back to fleet list**, **Edit details**.

## Aplikasi driver

Driver dibuat oleh distributor. Mereka masuk ke aplikasi **Lakupak Driver** dengan kredensial yang Anda berikan.

## Tautan terkait

| Tujuan | Ke |
|--------|-----|
| Alamat dan status pesanan | [Pesanan](/id/docs/dashboard/orders) |
| Opsi pengiriman | [Pengaturan](/id/docs/dashboard/settings) |
| Widget logistik | [Beranda](/id/docs/dashboard/home) |
