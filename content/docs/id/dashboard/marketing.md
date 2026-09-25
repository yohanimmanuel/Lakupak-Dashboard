---
title: Pemasaran
description: Hub pemasaran, tim penjualan, agen, dan kampanye WhatsApp.
section: Dashboard
module: dashboard
order: 16
---

Hub **Marketing** menghubungkan alat outreach: tim penjualan, kampanye WhatsApp, dan pintasan ke klien serta penawaran.

Jalur: **Marketing** (`/sales`).

## Hub pemasaran

Kartu **Tips** (bisa ditutup):

| Tip | Tindakan | Tujuan |
|-----|----------|--------|
| **Invite New Customers** | **Invite customers** | Clients |
| **Create Promotions** | **Create promotion** | Offers |
| **Cart Abandonment** | **View campaigns** | Campaigns |

Pintasan **Tools:**

| Alat | Deskripsi |
|------|-----------|
| **Teams** | Kelola anggota tim pemasaran |
| **Campaigns** | Buat dan kirim kampanye pesan |
| **Automation** | Alur otomatis (placeholder hingga rilis) |

Sidebar biasanya **Team** dan **Campaigns**; **Automations** bisa disembunyikan.

## Tim (Teams)

Jalur: `/sales/team`.

### Tindakan daftar tim

| Tindakan | Fungsi |
|----------|--------|
| **Refresh** | Muat ulang agen dan tim |
| **Export Data** | XLSX agen |
| **Add Agent** | Buat agen penjualan |

### Agen dan filter

**Tab:** **Individuals**, **Teams**.

**Pencarian:** **Search agents...**

**Filter:** **All Roles**, **All Status**, **Active**, **Inactive**.

**Peran:** Sales Manager, Sales Rep, Sales Support, Lead Gen, Account Manager.

**Massal:** **Remove Agent** / **Remove Selected**.

Modal: **Create New Team**, **Edit Team**.

### Profil agen

Jalur: `/sales/team/create`, `details`, `edit`.

Tab buat/ubah: **Basic Profile**, **Favourite Products**, **Sales Reporting**, **Sales Target**.

Konfirmasi **Delete Agent** / **Delete Agents**.

## Kampanye (Campaigns)

Jalur: `/sales/campaigns`.

### Daftar kampanye

| Tindakan | Fungsi |
|----------|--------|
| **Create campaign** | Wizard kampanye baru |

**Tab status:** All, Draft, Scheduled, Completed.

**Pencarian:** **Search campaigns...**

**Filter:** **All Recipients** + label penerima per kampanye.

Baris: nama, deskripsi, **Recipients**, **Opened**, **Clicked**, status, **Send Date** / **Not sent**.

**Massal (satu terpilih):** **Send Campaign** / **Resend Campaign**, **Remove Campaign**.

Kosong: **No campaigns found**.

### Buat dan kirim

Jalur: `/sales/campaigns/create`, `details?id=…&mode=edit|view`.

Field: Campaign ID otomatis, nama, deskripsi, **Campaign Completion**.

Setelah kirim: **Campaign Performance** (Opens, Clicks, revenue, orders).

**SendCampaignModal** untuk WhatsApp. Konfirmasi **Delete Campaign**.

## Otomatisasi

`/sales/automation` bisa berupa placeholder hingga fitur dirilis.

## Tautan terkait

| Tujuan | Ke |
|--------|-----|
| Pembeli | [Klien](/id/docs/dashboard/clients) |
| Promosi produk | [Penawaran](/id/docs/dashboard/offers) |
| Pesanan | [Pesanan](/id/docs/dashboard/orders) |
| Widget pemasaran | [Beranda](/id/docs/dashboard/home) |
