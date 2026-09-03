/** Shared CS welcome message shape for test runs and live WhatsApp inbound. */
export function buildBuyerCsWelcomeShape(replyInIndonesian: boolean): string {
  return replyInIndonesian
    ? [
        'Bentuk pesan sambutan CS (ikuti pola ini, pakai baris baru nyata, jangan gabungkan jadi satu paragraf):',
        '1) Sapaan singkat + nama perusahaan dari konteks + siap membantu sebagai CS pembeli. Lalu baris kosong.',
        '2) Satu baris pembuka topik, baris kosong, lalu bullet kategori (satu bullet per baris, topik saja, bukan dump data):',
        '   - Produk: stok, harga, MOQ, jaminan (halal/BPOM/original/kebijakan retur)',
        '   - Pesanan: cara cek status (pipeline umum saja; jangan ID pesanan nyata)',
        '   - Pembayaran: Bank Transfer / COD dan tenor hari dari konteks',
        '   - Pengiriman: metode, slot, hari, tracking, ETA (ringkas)',
        '   - Retur & pembatalan: bantuan proses',
        '   - Informasi umum: pickup, cara order lewat marketplace Lakupak, kontak publik',
        '   - Chat ke CS atau sales agent manusia: sebutkan bahwa pembeli bisa meminta chat dengan staf (jangan janjikan langsung tersambung)',
        '3) Baris kosong, lalu bagian contoh cara bertanya (tepat 5 contoh singkat, masing-masing di baris baru), mis. cek stok produk, status pesanan (minta ID pesanan), ajukan retur, info pengiriman, dan "saya ingin chat dengan CS / sales agent".',
        '4) Baris kosong, tutup dengan ajakan membantu hari ini, lalu satu emoji ramah (mis. 😊).',
      ].join('\n')
    : [
        'CS welcome message shape (follow this pattern; use real line breaks, never one merged paragraph):',
        '1) Short greeting + company name from context + ready to help as buyer CS. Then a blank line.',
        '2) One intro line, a blank line, then category bullets (one bullet per line, topics only, not data dumps):',
        '   - Products: stock, price, MOQ, assurance (halal/BPOM/original/return policy)',
        '   - Orders: how to check status (general pipeline only; no real order IDs)',
        '   - Payment: Bank Transfer / COD and term days from context',
        '   - Delivery: methods, slots, days, tracking, ETA (brief)',
        '   - Returns & cancellations: process help',
        '   - General info: pickup, how to order on Lakupak marketplace, public contact',
        '   - Chat with a human CS or sales agent: mention buyers can request a staff chat (do not promise an immediate connection)',
        '3) Blank line, then example asks section (exactly 5 short examples, each on its own line), e.g. check product stock, order status (ask for order ID), request a return, delivery info, and "I want to chat with CS / a sales agent".',
        '4) Blank line, then close by asking how you can help today, then one friendly emoji (e.g. 😊).',
      ].join('\n');
}

export function buildBuyerCsWelcomeUserInstruction(
  replyInIndonesian: boolean,
  workflowName: string,
): string {
  return replyInIndonesian
    ? [
        `Alur kerja: ${workflowName || 'Tanpa judul'}`,
        '',
        'Ini pesan pertama pembeli di jendela CS 24 jam.',
        'Tulis pesan sambutan mengikuti bentuk sistem di atas: sapaan, daftar topik bantuan, 5 contoh cara bertanya (termasuk chat ke CS/sales agent), penutup. Sisipkan baris baru di antara bagian dan setiap bullet/nomor.',
        'Pakai nama perusahaan dan deskripsi bisnis dari konteks jika ada.',
        'Jangan dump katalog penuh, jadwal panjang, atau pesanan nyata.',
        'Jangan tulis panduan operator / checklist staf.',
      ].join('\n')
    : [
        `Workflow: ${workflowName || 'Untitled'}`,
        '',
        'This is the buyer’s first message in the 24h CS window.',
        'Write a welcome message following the system shape above: greeting, help topics, 5 example asks (including chat with CS/sales agent), closing. Put a newline between sections and between each bullet or numbered item.',
        'Use company name and business description from context when available.',
        'Do not dump full catalogs, long schedules, or real orders.',
        'Do not write operator guides / staff checklists.',
      ].join('\n');
}
