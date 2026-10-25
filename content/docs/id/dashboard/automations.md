---
title: Otomasi
description: Daftar workflow, canvas builder, status, Ask AI, dan riwayat run.
section: Dashboard
module: dashboard
order: 21
---

**Automations** memungkinkan Anda membangun workflow berbasis trigger untuk katalog, penawaran, klien, pesanan, dan penjualan agar follow-up tidak hanya mengandalkan ingatan.

Jalur: `/automation`, `/automation/new`, `/automation/details?id={workflowId}`.

## Daftar workflow (`/automation`)

**Aksi:** **Refresh**, **New Workflow**

**Kartu statistik:** Total Workflows | Active | Paused | Draft

**Tab status:** All | Active | Paused | Draft

**Pencarian:** **Search workflows…**

**Filter tipe:** All Types | Product & Offers | Lead Management | Order & Logistics | Sales

**Kolom:** Workflow | Type | Trigger | Status | Last Run (**Never** jika belum pernah dijalankan)

**Aksi baris:** buka/ubah, hapus. **Massal:** Activate, Pause, Remove.

### Status workflow

| Status | Arti |
|--------|---------|
| **active** | Berjalan menurut aturan trigger |
| **paused** | Tersimpan tetapi tidak dieksekusi |
| **draft** | Belum lengkap atau belum diaktifkan |

### Tipe workflow

| Kunci tipe | Label UI |
|----------|----------|
| `product_offers` | Product & Offers |
| `lead_management` | Lead Management |
| `order_logistics` | Order & Logistics |
| `sales` | Sales |

## Builder (`/automation/new` dan `/automation/details`)

Canvas builder dengan inspector.

**Aksi toolbar (kanan):** **Ask AI**, plus aksi workflow seperti **Save** (draft), **Activate**, **Pause**, **Test run** (jika diaktifkan), dan **Undo**.

### Ask AI

**Ask AI** membuka panel Lakupak AI untuk workflow ini (**Draft a workflow**). Anda bisa mendeskripsikan otomasi di chat, lalu **Apply to this workflow** untuk memperbarui canvas. Perubahan berlaku setelah Anda menyimpan.

Gunakan Ask AI untuk menyusun dan menyempurnakan langkah. Itu tidak menggantikan aktivasi workflow.

### Detail dan riwayat run

`/automation/details?id=…` mengubah workflow yang ada dan menampilkan **automation runs** terbaru (success, failed, skipped, in progress bila tersedia).

## Tautan terkait

| Tujuan | Ke |
|------|--------|
| Katalog dan penawaran | [Produk](/id/docs/dashboard/products), [Penawaran](/id/docs/dashboard/offers) |
| Pesanan | [Pesanan](/id/docs/dashboard/orders) |
| Pekerjaan Sales | [Penjualan](/id/docs/dashboard/sales) |
