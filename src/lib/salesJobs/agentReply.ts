import { prisma } from '@/lib/db';
import { RETURN_REASONS, type ReturnReason } from '@/lib/salesJobs/completion';
import { completeSalesJob } from '@/lib/salesJobs/service';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import {
  isWhatsAppCloudConfigured,
  resolveWhatsAppCloudCredentials,
  sendTextMessage,
  toWhatsAppCloudRecipient,
} from '@/lib/whatsapp/cloudApi';

export type CatalogProduct = { productId: string; name: string };

export type AgentFacts = {
  ready: boolean;
  completion?: Record<string, unknown>;
  question?: string;
};

const VAGUE = /^(ok|okay|oke|done|sudah|selesai|yes|ya|sip|beres|baik|noted)\.?!?$/i;

function isVague(text: string): boolean {
  return VAGUE.test(text.trim());
}

/** Explicit amounts only. Thousands separators and ribu/juta suffixes are kept. Phone-like numbers are ignored. */
export function parseSpokenAmount(text: string): number | null {
  const ribu = text.match(/(?<!\d)(\d+(?:[.,]\d+)?)\s*(rb|ribu)\b/i);
  if (ribu) {
    const n = Number(ribu[1].replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1000);
  }
  const juta = text.match(/(?<!\d)(\d+(?:[.,]\d+)?)\s*(jt|juta)\b/i);
  if (juta) {
    const n = Number(juta[1].replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1_000_000);
  }
  const grouped = text.match(/(?<!\d)(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+)(?!\d)/i);
  if (grouped) {
    const n = Number(grouped[1].replace(/[.,]/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const plain = text.match(/(?<!\d)(?:rp\.?\s*)?(\d{4,12})(?!\d)/);
  if (!plain) return null;
  const digits = plain[1];
  if (digits.length >= 10 && /^(62|0)/.test(digits)) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function matchCatalogProduct(text: string, products: CatalogProduct[]): CatalogProduct | null {
  const hay = text.toLowerCase();
  const hits = products.filter((product) => {
    const name = product.name.trim().toLowerCase();
    return name.length >= 4 && hay.includes(name);
  });
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.name.trim().length - a.name.trim().length);
  const best = hits[0];
  const bestName = best.name.trim().toLowerCase();
  const ambiguous = hits.some((product) => {
    if (product.productId === best.productId) return false;
    return !bestName.includes(product.name.trim().toLowerCase());
  });
  return ambiguous ? null : best;
}

function notesOf(text: string): string {
  return text.trim().slice(0, 1000);
}

function shared(text: string, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    order_placed: false,
    order_amount: null,
    payment_collected: false,
    payment_amount: null,
    stock_checked: false,
    products_demoed: 0,
    notes: notesOf(text),
    ...extra,
  };
}

function ask(question: string): AgentFacts {
  return { ready: false, question };
}

function orderSignal(text: string): boolean | null {
  const lower = text.toLowerCase();
  if (/\b(no order|tidak ada order|tidak order|tidak ada pesanan|gak order|nggak order|ga order|belum order)\b/.test(lower)) {
    return false;
  }
  if (/\b(ada order|order placed|order masuk|ada pesanan|ambil order|sudah order)\b/.test(lower)) {
    return true;
  }
  return null;
}

function paymentSignal(text: string): boolean | null {
  const lower = text.toLowerCase();
  if (/\b(belum bayar|tidak bayar|gak bayar|nggak bayar|ga bayar|belum lunas|not paid|no payment|belum terima (?:uang|duit|pembayaran|bayaran|payment))\b/.test(lower)) return false;
  if (/\b(bayar|lunas|paid|payment collected|terima uang|sudah bayar|uang masuk)\b/.test(lower)) return true;
  return null;
}

function returnReason(text: string): ReturnReason | null {
  const lower = text.toLowerCase();
  if (/kadaluarsa|kadaluwarsa|expired/.test(lower)) return 'expired';
  if (/rusak|damaged|pecah/.test(lower)) return 'damaged';
  if (/tidak laku|unsold|hampir expired|near expiry/.test(lower)) return 'unsold_near_expiry';
  if (/\b(other|lainnya)\b/.test(lower)) return 'other';
  return null;
}

function labeledQty(text: string): number | null {
  const labeled = text.match(/(\d{1,3})\s*(pcs|pc|dus|pack|unit|qty|buah|sample|sampel)\b/i);
  if (!labeled) return null;
  const n = Number(labeled[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function competitorName(text: string): string | null {
  const match = text.match(/(?:kompetitor|competitor|pesaing)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9 .&'-]{1,40})/i);
  if (!match) return null;
  const name = match[1].replace(/\b(harga|price|promo|rp)\b.*$/i, '').trim();
  return name.length >= 2 ? name : null;
}

/**
 * Turns one agent sentence into completion fields.
 * Missing required facts return a question. Amounts are never guessed.
 */
export function extractAgentFacts(
  jobType: string,
  text: string,
  products: CatalogProduct[] = [],
): AgentFacts {
  const body = text.trim();
  if (!body || isVague(body)) {
    return ask(questionFor(jobType));
  }

  if (jobType === 'take_order') {
    const placed = orderSignal(body);
    if (placed == null) return ask(questionFor(jobType));
    if (!placed) {
      return { ready: true, completion: shared(body, { order_placed: false }) };
    }
    const amount = parseSpokenAmount(body);
    if (amount == null) return ask('Send the order amount, or say no order. / Kirim nilai order, atau tulis tidak ada order.');
    return { ready: true, completion: shared(body, { order_placed: true, order_amount: amount }) };
  }

  if (jobType === 'collect_payment') {
    const paid = paymentSignal(body);
    if (paid == null) return ask(questionFor(jobType));
    if (!paid) return { ready: true, completion: shared(body, { payment_collected: false }) };
    const amount = parseSpokenAmount(body);
    if (amount == null) return ask('How much was collected? / Berapa yang tertagih?');
    return { ready: true, completion: shared(body, { payment_collected: true, payment_amount: amount }) };
  }

  if (jobType === 'stock_check') {
    if (!/\b(stok|stock)\b/i.test(body) || body.length < 8) return ask(questionFor(jobType));
    return { ready: true, completion: shared(body, { stock_checked: true }) };
  }

  if (jobType === 'promote_product') {
    const counted = body.match(/(\d{1,3})\s*(produk|product|sku|item)\b/i);
    const demo = /\b(promosi|promo|demo|ditawarkan|shown|display)\b/i.test(body);
    if (counted) {
      const n = Number(counted[1]);
      if (n > 0) return { ready: true, completion: shared(body, { products_demoed: n }) };
    }
    if (demo && matchCatalogProduct(body, products)) {
      return { ready: true, completion: shared(body, { products_demoed: 1 }) };
    }
    return ask(questionFor(jobType));
  }

  if (jobType === 'prospect_new_outlet') {
    if (body.length < 20) return ask(questionFor(jobType));
    return { ready: true, completion: shared(body, {}) };
  }

  if (jobType === 'returns_pickup') {
    const product = matchCatalogProduct(body, products);
    const quantity = labeledQty(body);
    const reason = returnReason(body);
    if (!product || quantity == null || !reason || !(RETURN_REASONS as readonly string[]).includes(reason)) {
      return ask(questionFor(jobType));
    }
    return {
      ready: true,
      completion: shared(body, {
        items_returned: [{ product_id: product.productId, quantity, reason }],
        replacement_issued: false,
        replacement_value: null,
      }),
    };
  }

  if (jobType === 'competitor_intel') {
    const name = competitorName(body);
    if (!name) return ask(questionFor(jobType));
    return {
      ready: true,
      completion: shared(body, {
        competitor_name: name,
        competitor_product: matchCatalogProduct(body, products)?.name ?? '',
        observed_price: parseSpokenAmount(body),
        observed_promo: '',
        shelf_share_observation: notesOf(body),
      }),
    };
  }

  if (jobType === 'new_product_activation') {
    const product = matchCatalogProduct(body, products);
    if (!product) return ask(questionFor(jobType));
    const samples = labeledQty(body);
    return {
      ready: true,
      completion: shared(body, {
        product_id: product.productId,
        product_ids: [product.productId],
        display_setup_completed: /\b(display|pajang|rak)\b/i.test(body),
        samples_given: samples,
        retailer_briefed: /\b(brief|jelaskan|dijelaskan|kasih tahu|explained)\b/i.test(body),
      }),
    };
  }

  if (jobType === 'scheme_reconciliation') {
    const amount = parseSpokenAmount(body);
    const confirmed = /\b(konfirm|confirmed|sudah jalan|executed|sesuai)\b/i.test(body);
    if (amount == null && !confirmed) return ask(questionFor(jobType));
    return {
      ready: true,
      completion: shared(body, {
        scheme_reference: '',
        execution_confirmed: confirmed,
        claim_amount: amount,
      }),
    };
  }

  return ask(questionFor(jobType));
}

function questionFor(jobType: string): string {
  switch (jobType) {
    case 'take_order':
      return 'Did this shop place an order? Send the amount, or say no order. / Apakah toko ini pesan? Kirim nilainya, atau tulis tidak ada order.';
    case 'collect_payment':
      return 'Was payment collected, and how much? / Apakah pembayaran tertagih, dan berapa?';
    case 'stock_check':
      return 'What is the stock situation at this shop? / Bagaimana stok di toko ini?';
    case 'promote_product':
      return 'How many products did you show? Name them if you can. / Berapa produk yang Anda tunjukkan? Sebutkan namanya jika bisa.';
    case 'prospect_new_outlet':
      return 'Send a short note about this new outlet. / Kirim catatan singkat tentang outlet baru ini.';
    case 'returns_pickup':
      return 'Which product was returned, how many (for example 2 dus), and why (expired, damaged, unsold, or other)? / Produk apa yang diretur, berapa (misalnya 2 dus), dan kenapa (kadaluarsa, rusak, tidak laku, atau lainnya)?';
    case 'competitor_intel':
      return 'Name the competitor and the price you saw. / Sebut nama kompetitor dan harga yang Anda lihat.';
    case 'new_product_activation':
      return 'Which product did you activate at this shop? / Produk apa yang Anda aktifkan di toko ini?';
    case 'scheme_reconciliation':
      return 'Was the scheme executed, and what claim amount did you see? / Apakah skema berjalan, dan berapa nilai klaimnya?';
    default:
      return 'Send the visit result in one message, including any amount. / Kirim hasil kunjungan dalam satu pesan, termasuk nilainya jika ada.';
  }
}

function shopLabel(storeName: string | null | undefined, owner: string | null | undefined): string {
  const store = storeName?.trim();
  if (store) return store;
  const person = owner?.trim();
  if (person) return person;
  return 'Open job';
}

function isScheduledToday(date: Date, timeZone: string, now = new Date()): boolean {
  const today = zonedDayRange(zonedParts(now, timeZone).dateKey, timeZone);
  const time = date.getTime();
  return time >= today.start.getTime() && time < today.end.getTime();
}

function shopMentioned(text: string, label: string): boolean {
  const name = label.trim().toLowerCase();
  return name.length >= 4 && name !== 'open job' && text.toLowerCase().includes(name);
}

async function askAgent(phone: string, body: string): Promise<boolean> {
  const creds = resolveWhatsAppCloudCredentials();
  if (!creds?.accessToken || !creds.phoneNumberId || !isWhatsAppCloudConfigured()) return false;
  await sendTextMessage({
    accessToken: creds.accessToken,
    phoneNumberId: creds.phoneNumberId,
    to: phone,
    body,
  });
  return true;
}

/**
 * Files a free-text WhatsApp reply from a sales agent onto today's open job.
 * Buyer numbers are ignored. Missing facts get one question back to the agent.
 */
export async function handleFreeformAgentReply(args: {
  fromPhone: string;
  text: string;
}): Promise<{ handled: boolean; jobId?: string; asked?: boolean }> {
  const fromPhone = toWhatsAppCloudRecipient(args.fromPhone);
  const text = args.text.trim();
  if (!fromPhone || !text) return { handled: false };

  const agents = await prisma.salesAgent.findMany({
    where: { status: 'active' },
    select: { id: true, phone: true, userId: true },
  });
  const matched = agents.filter((agent) => toWhatsAppCloudRecipient(agent.phone || '') === fromPhone);
  if (matched.length === 0) return { handled: false };

  const distributorIds = Array.from(
    new Set(matched.map((agent) => agent.userId).filter((id): id is number => id != null)),
  );
  const settings = distributorIds.length
    ? await prisma.salesJobSettings.findMany({
        where: { distributorId: { in: distributorIds } },
        select: { distributorId: true, timezone: true },
      })
    : [];
  const timeZoneByDistributor = new Map(
    settings.map((row) => [row.distributorId, row.timezone || DEFAULT_JOB_TIMEZONE]),
  );
  const now = new Date();
  const dayFilters = distributorIds.map((distributorId) => {
    const timeZone = timeZoneByDistributor.get(distributorId) || DEFAULT_JOB_TIMEZONE;
    const today = zonedDayRange(zonedParts(now, timeZone).dateKey, timeZone);
    return {
      assignedTo: { in: matched.filter((agent) => agent.userId === distributorId).map((agent) => agent.id) },
      scheduledDate: { gte: today.start, lt: today.end },
    };
  });
  const unassignedIds = matched.filter((agent) => agent.userId == null).map((agent) => agent.id);
  if (unassignedIds.length > 0) {
    const today = zonedDayRange(zonedParts(now, DEFAULT_JOB_TIMEZONE).dateKey, DEFAULT_JOB_TIMEZONE);
    dayFilters.push({
      assignedTo: { in: unassignedIds },
      scheduledDate: { gte: today.start, lt: today.end },
    });
  }
  if (dayFilters.length === 0) return { handled: false };

  const jobs = await prisma.salesJob.findMany({
    where: {
      status: { in: ['dispatched', 'in_progress'] },
      OR: dayFilters,
    },
    include: {
      client: { select: { storeName: true, owner: true } },
    },
    orderBy: { scheduledDate: 'desc' },
    take: 12,
  });
  if (jobs.length === 0) return { handled: false };

  const mentioned = jobs.filter((job) => shopMentioned(text, shopLabel(job.client?.storeName, job.client?.owner)));
  const sole = jobs.length === 1 ? jobs[0] : null;
  const soleToday = sole
    ? isScheduledToday(
        sole.scheduledDate,
        timeZoneByDistributor.get(sole.distributorId) || DEFAULT_JOB_TIMEZONE,
        now,
      )
    : false;
  let job = sole && soleToday ? sole : mentioned.length === 1 ? mentioned[0] : null;
  if (!job) {
    const lines = jobs.map((row) => shopLabel(row.client?.storeName, row.client?.owner));
    const unique = Array.from(new Set(lines));
    await askAgent(
      fromPhone,
      `Which shop is this update for? / Toko yang mana?\n${unique.map((name) => `- ${name}`).join('\n')}`,
    );
    return { handled: true, asked: true };
  }

  const products = await prisma.product.findMany({
    where: { userId: job.distributorId },
    select: { productId: true, name: true },
  });
  const facts = extractAgentFacts(job.jobType, text, products);
  if (!facts.ready || !facts.completion) {
    await askAgent(fromPhone, facts.question || questionFor(job.jobType));
    return { handled: true, asked: true, jobId: job.id };
  }

  try {
    await completeSalesJob({
      distributorId: job.distributorId,
      id: job.id,
      completion: facts.completion,
      notes: text.slice(0, 1000),
    });
  } catch (err) {
    console.error('[sales-job-agent-reply] could not complete', job.id, err);
    await askAgent(
      fromPhone,
      'Could not save this update. Please try again. / Pembaruan ini belum tersimpan. Coba lagi.',
    );
    return { handled: true, asked: true, jobId: job.id };
  }
  return { handled: true, jobId: job.id };
}

/** Agent texts are filed as job updates. Everyone else stays on the buyer path. */
export async function consumeAgentWhatsAppTexts<T extends { from: string; text: string }>(
  messages: T[],
): Promise<T[]> {
  if (messages.length === 0) return [];
  const agents = await prisma.salesAgent.findMany({
    where: { status: 'active' },
    select: { phone: true },
  });
  const agentPhones = new Set(
    agents
      .map((agent) => toWhatsAppCloudRecipient(agent.phone || ''))
      .filter((phone) => phone.length >= 8),
  );
  const buyers: T[] = [];
  for (const message of messages) {
    const from = toWhatsAppCloudRecipient(message.from);
    if (from && agentPhones.has(from)) {
      try {
        await handleFreeformAgentReply({ fromPhone: message.from, text: message.text });
      } catch (err) {
        console.error('[sales-job-agent-reply] freeform failed', err);
      }
      continue;
    }
    buyers.push(message);
  }
  return buyers;
}
