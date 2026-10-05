import { noteSalesWorkflowOutbound } from '@/lib/automations/engine';
import { chatWithOpenRouter, isOpenRouterConfigured } from '@/lib/automations/openrouter';
import { prisma, type Prisma } from '@/lib/db';
import { completeSalesJob } from '@/lib/salesJobs/service';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import {
  jobTypeLabel,
  reportButtonPrompt,
  salesCopy,
  salesRepReplyLocale,
  nameTheFinishedWork,
  checklistUpdatedReply,
  joinShopNames,
  buyersStillOpenReply,
  wantsFinishedJobReport,
  type SalesReplyLocale,
} from '@/lib/salesJobs/repCopy';
import { dispatchJobToWhatsApp } from '@/lib/salesJobs/whatsapp';
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

function isJobQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.includes('?') || trimmed.includes('？')) return true;
  return /^(what|which|why|how|when|where|who|can you|could you|apa|apakah|berapa|kapan|di\s*mana|dimana|kenapa|mengapa|bagaimana|tolong|jelaskan|explain|tell me)\b/i.test(
    trimmed,
  );
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
  locale: SalesReplyLocale = 'en',
): AgentFacts {
  const body = text.trim();
  if (!body || isVague(body)) {
    return ask(questionFor(jobType, locale));
  }

  if (jobType === 'take_order') {
    const placed = orderSignal(body);
    if (placed == null) return ask(questionFor(jobType, locale));
    return { ready: true, completion: shared(body, { delivered: placed, order_placed: placed, order_amount: parseSpokenAmount(body) }) };
  }

  if (jobType === 'collect_payment') {
    const paid = paymentSignal(body);
    if (paid == null) return ask(questionFor(jobType, locale));
    return { ready: true, completion: shared(body, { payment_collected: paid, payment_amount: null }) };
  }

  if (jobType === 'stock_check') {
    if (!/\b(stok|stock|checked|dicek|cek)\b/i.test(body)) return ask(questionFor(jobType, locale));
    return { ready: true, completion: shared(body, { stock_checked: true }) };
  }

  if (jobType === 'promote_product') {
    const promoted = /\b(promosi|promo|promoted|dipromosikan|mempromosikan\w*|ditawarkan|shown|display)\b/i.test(body);
    if (!promoted) return ask(questionFor(jobType, locale));
    return { ready: true, completion: shared(body, { promoted: true }) };
  }

  if (jobType === 'prospect_new_outlet') {
    if (body.length < 20) return ask(questionFor(jobType, locale));
    return { ready: true, completion: shared(body, {}) };
  }

  if (jobType === 'returns_pickup') {
    const returned = /\b(returned|retur|diretur|sudah diambil|picked up|diambil)\b/i.test(body);
    if (!returned) return ask(questionFor(jobType, locale));
    return { ready: true, completion: shared(body, { returned: true, items_returned: [] }) };
  }

  if (jobType === 'competitor_intel') {
    const name = competitorName(body);
    if (!name) return ask(questionFor(jobType, locale));
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
    if (!product) return ask(questionFor(jobType, locale));
    const samples = labeledQty(body);
    return {
      ready: true,
      completion: shared(body, {
        product_id: product.productId,
        product_ids: [product.productId],
        product_given: true,
        samples_given: samples,
        retailer_briefed: false,
      }),
    };
  }

  if (jobType === 'scheme_reconciliation') {
    const amount = parseSpokenAmount(body);
    const confirmed = /\b(konfirm|confirmed|sudah jalan|executed|sesuai)\b/i.test(body);
    if (amount == null && !confirmed) return ask(questionFor(jobType, locale));
    return {
      ready: true,
      completion: shared(body, {
        scheme_reference: '',
        execution_confirmed: confirmed,
        claim_amount: amount,
      }),
    };
  }

  return ask(questionFor(jobType, locale));
}

function questionFor(jobType: string, locale: SalesReplyLocale): string {
  switch (jobType) {
    case 'take_order':
      return salesCopy(locale, 'Was this order delivered?', 'Apakah order ini sudah terkirim?');
    case 'collect_payment':
      return salesCopy(locale, 'Was payment collected?', 'Apakah pembayaran sudah tertagih?');
    case 'stock_check':
      return salesCopy(locale, 'Was the stock checked?', 'Apakah stok sudah dicek?');
    case 'promote_product':
      return salesCopy(locale, 'Was the product promoted?', 'Apakah produk sudah dipromosikan?');
    case 'prospect_new_outlet':
      return salesCopy(locale, 'Send a short note about this new outlet.', 'Kirim catatan singkat tentang outlet baru ini.');
    case 'returns_pickup':
      return salesCopy(locale, 'Was the return picked up?', 'Apakah retur sudah diambil?');
    case 'competitor_intel':
      return salesCopy(locale, 'Name the competitor and the price you saw.', 'Sebut nama kompetitor dan harga yang Anda lihat.');
    case 'new_product_activation':
      return salesCopy(locale, 'How many units were given?', 'Berapa unit yang diberikan?');
    case 'scheme_reconciliation':
      return salesCopy(locale, 'Was the scheme executed, and what claim amount did you see?', 'Apakah skema berjalan, dan berapa nilai klaimnya?');
    default:
      return salesCopy(locale, 'Send the visit result in one message, including any amount.', 'Kirim hasil kunjungan dalam satu pesan, termasuk nilainya jika ada.');
  }
}

function shopLabel(storeName: string | null | undefined, owner: string | null | undefined): string {
  const store = storeName?.trim();
  if (store) return store;
  const person = owner?.trim();
  if (person) return person;
  return 'Open job';
}

const SHOP_TOKEN_SKIP = new Set(['retail', 'toko', 'shop', 'store', 'warung', 'baru', 'open', 'job']);

function shopMentioned(text: string, label: string): boolean {
  const name = label.trim().toLowerCase();
  if (name.length < 3 || name === 'open job') return false;
  const hay = text.toLowerCase();
  if (name.length >= 4 && hay.includes(name)) return true;
  const tokens = name.split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !SHOP_TOKEN_SKIP.has(token));
  return tokens.some((token) => new RegExp(`\\b${token}\\b`, 'i').test(hay));
}

function sameShop(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function reportedBuyers(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const raw = (value as { reportedBuyers?: unknown }).reportedBuyers;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item).trim()).filter(Boolean);
}

/** A take-order report that names only some buyers stays open until every buyer is covered. */
function buyerProgress(
  text: string,
  shops: string[],
  already: string[],
  reportNamesAShop: boolean,
): { complete: boolean; noted: string[]; remaining: string[] } {
  const names = Array.from(new Set(shops.map((shop) => shop.trim()).filter((shop) => shop && shop !== 'Open job')));
  if (names.length === 0) return { complete: true, noted: [], remaining: [] };
  const mentioned = names.filter((shop) => shopMentioned(text, shop));
  if (!reportNamesAShop) return { complete: true, noted: names, remaining: [] };
  const noted = names.filter(
    (shop) => mentioned.some((name) => sameShop(name, shop)) || already.some((name) => sameShop(name, shop)),
  );
  const remaining = names.filter((shop) => !noted.some((name) => sameShop(name, shop)));
  return { complete: remaining.length === 0, noted, remaining };
}

const VISIT_ACT =
  /\b(?:di|meng|ter|ke)?(?:kirim|kirm|ambil|jemput|antar|serah)\w*\b|\b(?:promosi|mempromosikan\w*|dipromosikan|promoted|deliver\w*|delivered|picked|sent)\b/i;

function saysJobStillOpen(text: string): boolean {
  if (isJobQuestion(text)) return false;
  if (!/\b(belum|belom|not yet|haven't|have not)\b/i.test(text)) return false;
  return VISIT_ACT.test(text) || /\b(selesai|kelar|beres|done|finished|siap)\b/i.test(text);
}

function saysJobIsDone(text: string): boolean {
  if (isJobQuestion(text) || saysJobStillOpen(text)) return false;
  if (wantsFinishedJobReport(text)) return true;
  if (/\b(selesai|kelar|beres|done|finished)\b/i.test(text)) return true;
  if (/\b(siap)\b/i.test(text) && VISIT_ACT.test(text)) return true;
  return /\b(sudah|udah|already)\b/i.test(text) && VISIT_ACT.test(text);
}

function jobTypesInText(text: string): string[] {
  const types: string[] = [];
  if (/\b(promosi|promo|mempromosikan\w*|dipromosikan|promoted|promote)\b/i.test(text)) types.push('promote_product');
  const aboutReturn = /\b(retur|return)\b/i.test(text);
  if (
    /\b(?:pesanan|orderan|ambil pesanan|order)\b/i.test(text) ||
    /\b(?:deliver\w*|delivered|sent)\b/i.test(text) ||
    /\b(?:di|meng|ter|ke)?(?:kirim|kirm|antar|serah)\w*\b/i.test(text) ||
    (!aboutReturn &&
      (/\b(?:pengambilan|diambil|ambil(?:an)?|picked)\b/i.test(text) ||
        /\b(?:di|meng|ter|ke)?jemput\w*\b/i.test(text)))
  ) {
    types.push('take_order');
  }
  if (/\b(bayar|pembayaran|tagih|payment)\b/i.test(text)) types.push('collect_payment');
  if (/\b(stok|stock)\b/i.test(text)) types.push('stock_check');
  if (/\b(retur|return)\b/i.test(text)) types.push('returns_pickup');
  if (/\b(prospek|outlet baru|prospect)\b/i.test(text)) types.push('prospect_new_outlet');
  if (/\b(sampel|aktivasi|activation)\b/i.test(text)) types.push('new_product_activation');
  if (/\b(kompetitor|competitor|pesaing)\b/i.test(text)) types.push('competitor_intel');
  return types;
}

function matchDoneJobs(
  text: string,
  ordered: { jobType: string; shops: string[]; client: { storeName: string | null; owner: string | null } | null }[],
): { indexes: number[]; ask: boolean; holdProspect: boolean } | null {
  if (!saysJobIsDone(text)) return null;
  const types = new Set(jobTypesInText(text));
  let indexes = ordered.map((_, index) => index);
  const shopIndexes = indexes.filter((index) => {
    const job = ordered[index];
    const shops = job.shops.length ? job.shops : [shopLabel(job.client?.storeName, job.client?.owner)];
    return shops.some((shop) => shopMentioned(text, shop));
  });
  if (shopIndexes.length) indexes = shopIndexes;
  if (types.size) {
    const typed = indexes.filter((index) => types.has(ordered[index].jobType));
    if (typed.length) indexes = typed;
  }
  const mentionedProspect = types.has('prospect_new_outlet');
  const beforeProspect = indexes.slice();
  indexes = indexes.filter((index) => ordered[index].jobType !== 'prospect_new_outlet');
  if (indexes.length === 0) return { indexes: [], ask: false, holdProspect: true };
  if (indexes.length === 1) {
    const candidate = indexes[0];
    const identified = types.has(ordered[candidate].jobType) || shopIndexes.includes(candidate);
    const prospectRemoved = beforeProspect.length > indexes.length;
    if (!identified && (prospectRemoved || mentionedProspect)) {
      return { indexes: beforeProspect, ask: true, holdProspect: mentionedProspect };
    }
    return { indexes, ask: false, holdProspect: mentionedProspect };
  }
  const namedShop = shopIndexes.length > 0;
  const typeCount = new Map<string, number>();
  for (const index of indexes) {
    const type = ordered[index].jobType;
    typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
  }
  const eachTypeOnce = indexes.every((index) => typeCount.get(ordered[index].jobType) === 1);
  const namedTypesCoverSelection = types.size > 0 && indexes.every((index) => types.has(ordered[index].jobType));
  if (namedTypesCoverSelection && (eachTypeOnce || !namedShop)) {
    return { indexes, ask: false, holdProspect: false };
  }
  return { indexes, ask: true, holdProspect: false };
}

function pickedJobIndex(text: string, count: number): number | null {
  const picks = pickedJobIndexes(text, count);
  return picks?.length === 1 ? picks[0] : null;
}

/** A reply that is only job numbers, including "1 dan 2", "1, 2", and "1-3". */
function pickedJobIndexes(text: string, count: number): number[] | null {
  const trimmed = text.trim();
  if (!/^(?:(?:nomor|number|no\.?|angka|#)\s*)?\d{1,2}(?:\s*(?:,|&|dan|and|sama|-)\s*\d{1,2})*\s*\.?$/i.test(trimmed)) {
    return null;
  }
  const seen = new Set<number>();
  const indexes: number[] = [];
  const add = (number: number) => {
    const index = number - 1;
    if (index < 0 || index >= count || seen.has(index)) return;
    seen.add(index);
    indexes.push(index);
  };
  const body = trimmed.replace(/^(?:nomor|number|no\.?|angka|#)\s*/i, '').replace(/\.$/, '');
  for (const part of body.split(/\s*(?:,|&|dan|and|sama)\s*/i)) {
    const range = part.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let number = low; number <= high; number += 1) add(number);
      continue;
    }
    const single = part.match(/^(\d{1,2})$/);
    if (single) add(Number(single[1]));
  }
  return indexes;
}

function looksLikeVisitResult(text: string): boolean {
  if (orderSignal(text) != null || paymentSignal(text) != null) return true;
  return /\b(stok|stock|checked|dicek|dipromosikan|mempromosikan\w*|promoted|returned|diretur|retur|sampel|samples|diberikan|kompetitor|competitor|pesaing)\b/i.test(
    text,
  );
}

function isCourtesy(text: string): boolean {
  if (isJobQuestion(text) || saysJobIsDone(text)) return false;
  return /\b(terima kasih|makasih|thanks|thank you|thx)\b/i.test(text);
}

function wantsProductAdvice(text: string): boolean {
  return /\b(pitch|offer|tawarkan|nawarin|cara jual|cara nawar|rekomendas|recommend|menarik|promosi|bagaimana jual|how to sell|how to pitch|empower)\b/i.test(
    text,
  );
}

function ordersFollowUp(
  locale: SalesReplyLocale,
  text: string,
  jobs: {
    orderIds: string[];
    clientId: string | null;
    client: { storeName: string | null; owner: string | null } | null;
  }[],
  orders: {
    orderId: string;
    buyerId: string | null;
    storeName: string | null;
    orderStatus: string | null;
    paymentStatus: string | null;
    totalAmount: unknown;
    buyer: { buyerId: string; storeName: string | null; owner: string | null } | null;
    orderItemsRel: { productNameSnapshot: string | null }[];
  }[],
): string | null {
  if (!isJobQuestion(text) || !/\b(pesanan|orderan|order|antar|kirim|kirm|deliver|bawa)\b/i.test(text)) return null;
  const mentioned = jobs.filter((job) => shopMentioned(text, shopLabel(job.client?.storeName, job.client?.owner)));
  const source = mentioned.length ? mentioned : jobs;
  const shops = source.filter(
    (job, index) =>
      source.findIndex(
        (other) => shopLabel(other.client?.storeName, other.client?.owner) === shopLabel(job.client?.storeName, job.client?.owner),
      ) === index,
  );
  if (shops.length === 0) return null;
  const paragraphs = shops.map((job) => {
    const shop = shopLabel(job.client?.storeName, job.client?.owner);
    const rows = orders.filter((order) => {
      const name = (order.buyer?.storeName || order.storeName || '').trim();
      return (
        job.orderIds.includes(order.orderId) ||
        (job.clientId != null && (order.buyerId === job.clientId || order.buyer?.buyerId === job.clientId)) ||
        (name.length > 0 && (shopMentioned(shop, name) || shopMentioned(name, shop)))
      );
    });
    if (rows.length === 0) {
      return locale === 'id'
        ? `Dari ${shop}, belum ada pesanan yang perlu diantar.`
        : `From ${shop}, there is no order to deliver.`;
    }
    return rows
      .map((order) => {
        const items = order.orderItemsRel.map((item) => item.productNameSnapshot?.trim()).filter((item): item is string => Boolean(item));
        const total = Number(order.totalAmount);
        const totalLabel = Number.isFinite(total)
          ? new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 0 }).format(total)
          : '';
        if (locale === 'id') {
          const parts = [`Dari ${shop}`];
          if (items.length) parts.push(`yang perlu kamu antar ${items.join(', ')}`);
          if (order.orderStatus) parts.push(`statusnya ${order.orderStatus}`);
          if (totalLabel) parts.push(`total ${totalLabel}`);
          if (order.paymentStatus) parts.push(`pembayaran ${order.paymentStatus}`);
          return `${parts.join(', ')}.`;
        }
        const parts = [`From ${shop}`];
        if (items.length) parts.push(`bring ${items.join(', ')}`);
        if (order.orderStatus) parts.push(`status ${order.orderStatus}`);
        if (totalLabel) parts.push(`total ${totalLabel}`);
        if (order.paymentStatus) parts.push(`payment ${order.paymentStatus}`);
        return `${parts.join(', ')}.`;
      })
      .join('\n\n');
  });
  const intro = locale === 'id' ? 'Ini yang perlu kamu antar.' : 'Here is what to deliver.';
  return [intro, ...paragraphs].join('\n\n');
}

async function answerRep(
  phone: string,
  locale: SalesReplyLocale,
  distributorId: number,
  jobs: {
    jobType: string;
    priorityReason: string | null;
    suggestedProducts: string[];
    orderIds: string[];
    clientId: string | null;
    client: {
      storeName: string | null;
      owner: string | null;
      phone: string | null;
      address: string | null;
      status: string | null;
    } | null;
  }[],
  text: string,
): Promise<void> {
  const products = await prisma.product.findMany({
    where: { userId: distributorId },
    select: { productId: true, name: true, brand: true, description: true },
    orderBy: { name: 'asc' },
    take: 40,
  });
  const nameOf = (id: string) => products.find((product) => product.productId === id)?.name || id;
  const onJobs = new Set(jobs.flatMap((job) => job.suggestedProducts));
  const mentioned = products.filter((product) => {
    const name = product.name.trim().toLowerCase();
    return name.length >= 4 && text.toLowerCase().includes(name);
  });
  const focus = (mentioned.length ? mentioned : products.filter((product) => onJobs.has(product.productId))).slice(0, 6);
  const focusLines = focus
    .map((product) => {
      const description = product.description?.replace(/\s+/g, ' ').trim().slice(0, 180);
      return [product.name.trim(), product.brand?.trim(), description].filter(Boolean).join('. ');
    })
    .join('\n');
  const orderIds = Array.from(new Set(jobs.flatMap((job) => job.orderIds)));
  const clientIds = Array.from(new Set(jobs.map((job) => job.clientId).filter((id): id is string => Boolean(id))));
  const orders =
    orderIds.length || clientIds.length
      ? await prisma.order.findMany({
          where: {
            userId: distributorId,
            isDeleted: false,
            OR: [
              ...(orderIds.length ? [{ orderId: { in: orderIds } }] : []),
              ...(clientIds.length ? [{ buyerId: { in: clientIds } }] : []),
            ],
          },
          select: {
            orderId: true,
            buyerId: true,
            storeName: true,
            contactPerson: true,
            orderStatus: true,
            paymentStatus: true,
            totalAmount: true,
            orderDate: true,
            deliveryAddress: true,
            buyer: { select: { buyerId: true, storeName: true, owner: true, phone: true, address: true, status: true } },
            orderItemsRel: { select: { productNameSnapshot: true }, take: 4 },
          },
          orderBy: { orderDate: 'desc' },
          take: 20,
        })
      : [];
  const orderLines = orders
    .map((order) => {
      const shop = order.buyer?.storeName || order.storeName;
      const items = order.orderItemsRel.map((item) => item.productNameSnapshot?.trim()).filter(Boolean);
      return [
        shop,
        order.buyer?.owner || order.contactPerson,
        order.orderId,
        order.orderStatus,
        order.paymentStatus,
        String(order.totalAmount),
        order.orderDate.toISOString().slice(0, 10),
        order.buyer?.address || order.deliveryAddress,
        items.length ? items.join(', ') : '',
      ]
        .filter(Boolean)
        .join(' | ');
    })
    .join('\n');
  const jobLines = jobs
    .map((job, index) => {
      const names = job.suggestedProducts.map(nameOf).filter(Boolean);
      const reason = job.priorityReason?.trim();
      const outlet = shopLabel(job.client?.storeName, job.client?.owner);
      return [
        `${index + 1}. ${outlet}`,
        jobTypeLabel(locale, job.jobType),
        names.length ? (locale === 'id' ? `Produk: ${names.join(', ')}` : `Products: ${names.join(', ')}`) : '',
        reason || '',
      ]
        .filter(Boolean)
        .join('. ');
    })
    .join('\n');
  const catalog = products
    .map((product) => product.name.trim())
    .filter(Boolean)
    .join(', ');
  const advice = wantsProductAdvice(text);
  const languageRule =
    locale === 'id'
      ? 'Reply entirely in Indonesian. Keep product names and shop names as written. Do not switch to English.'
      : 'Reply entirely in English. Keep product names and shop names as written. Do not switch to Indonesian.';
  let body = '';
  if (isOpenRouterConfigured()) {
    try {
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        {
          role: 'system',
          content: `You text one sales rep on WhatsApp. You are their sales manager, the same way a buyer chat stays a conversation. Answer what they asked in a few plain sentences. If they only say thanks or that they will follow up with the buyer, reply with one short friendly sentence and do not list jobs. Never paste the internal job list, phone numbers, or street addresses. Plain sentences only: no markdown, no headings, no asterisks, and no links. Never write a safety label, including User Safety or Safety Categories. Never write a thinking process, analysis, or recap of these instructions. When they ask which orders to deliver or pick up, name each shop they asked about, the products, the status, and the total from the records. Do not pitch products unless they asked how to sell. Do not repeat their message. The jobs, outlets, and orders below are already loaded for this rep. If a shop is in those records, answer about its jobs and orders. Do not say the shop is missing, and do not ask for an outlet code, owner, or address when the records already include it. When they ask how to pitch, offer, or sell, cover every product they asked about. Give each product its own short paragraph: who it is for, one reason to try it, and a line they can say in the shop. Finish the last product before you stop. Use the public web notes for that product advice. Do not use the web for private records, and do not look at any other distributor. Do not invent prices or stock that are not in the records. ${languageRule} No em dashes.`,
        },
        {
          role: 'user',
          content: `${advice ? `Look up these products on the public web for selling advice:\n${focusLines || catalog || (locale === 'id' ? 'tidak ada' : 'none')}\n\n` : ''}Jobs:\n${jobLines}\n\nOrders for this rep:\n${orderLines || (locale === 'id' ? 'tidak ada' : 'none')}\n\nProducts this distributor sells:\n${catalog || (locale === 'id' ? 'tidak ada' : 'none')}\n\nMessage:\n${text}`,
        },
      ];
      let reply = '';
      for (let part = 0; part < 4; part += 1) {
        const result = await chatWithOpenRouter({
          temperature: 0.4,
          maxTokens: advice ? 2000 : 900,
          messages,
          webSearch: advice && part === 0,
          reasoning: false,
        });
        const next = stripModelThinking(result.content);
        const echoed =
          next &&
          next.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (next && !echoed) {
          reply = !reply ? next : /[.!?]$/.test(reply) ? `${reply}\n\n${next}` : `${reply} ${next}`;
        }
        const stoppedEarly = result.finishReason === 'length' || result.finishReason === 'max_tokens';
        if (!next || echoed || !stoppedEarly) break;
        messages.push({ role: 'assistant', content: next });
        messages.push({
          role: 'user',
          content:
            'Continue from the next word. Finish every product that is still incomplete. Do not repeat text you already wrote.',
        });
      }
      if (!reply) reply = ordersFollowUp(locale, text, jobs, orders) ?? '';
      if (reply.startsWith('Ini pekerjaan Anda') || reply.startsWith('Here are your jobs')) reply = '';
      if (!reply) return;
      body = reply;
    } catch (err) {
      console.error('[sales-job-agent-reply] job question failed', err);
    }
  }
  if (!body.trim()) {
    const followUp = ordersFollowUp(locale, text, jobs, orders);
    if (followUp) body = followUp;
  }
  if (!body.trim() || body.startsWith('Ini pekerjaan Anda') || body.startsWith('Here are your jobs')) return;
  const sent = await sendRepReply(phone, body);
  if (sent) await noteSalesWorkflowOutbound(distributorId, plainWhatsApp(body));
}

function stripModelThinking(text: string): string {
  const withoutTags = text
    .replace(/\u2014|\u2013/g, '-')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/^[ \t]*(?:(?:user|response|model|content)\s+)?safety(?:\s+categor(?:y|ies))?[^:\n]*:.*$/gim, '')
    .replace(/\bsafety\s+categor(?:y|ies)\s*:\s*.+$/gim, '')
    .trim();
  if (!withoutTags) return '';
  if (
    /^(?:here'?s a thinking process|thinking process\b|analyze user input\b|let me (?:think|re-?read)\b|this is confusing\b|the prompt (?:starts|says)\b)/i.test(
      withoutTags,
    )
  ) {
    return '';
  }
  const lines = withoutTags.split('\n').map((line) => line.trim()).filter(Boolean);
  const meta = lines.filter((line) =>
    /^(?:[-*]\s*)?(?:analyze user input|the prompt|wait,|let me |i need to |this is confusing|i think the user|constraints:|no safety labels|jobs, outlets)/i.test(
      line,
    ),
  ).length;
  if (lines.length >= 4 && meta >= 3 && meta / lines.length > 0.35) return '';
  return withoutTags;
}

function plainWhatsApp(text: string): string {
  const visible = stripModelThinking(text);
  if (!visible) return '';
  return visible
    .replace(/\u2014|\u2013/g, '-')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^[ \t]*(?:user|response|model|content)\s+safety\s*:\s*.+$/gim, '')
    .replace(/\b(?:user|response|model|content)\s+safety\s*:\s*[\w.-]+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function whatsAppChunks(text: string): string[] {
  const clean = plainWhatsApp(text);
  const limit = 3500;
  if (clean.length <= limit) return clean ? [clean] : [];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const paragraph = window.lastIndexOf('\n\n');
    const line = window.lastIndexOf('\n');
    const sentence = window.lastIndexOf('. ');
    const breakAt = paragraph > 400 ? paragraph : line > 400 ? line : sentence > 400 ? sentence + 1 : limit;
    chunks.push(rest.slice(0, breakAt).trim());
    rest = rest.slice(breakAt).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function sendRepReply(phone: string, body: string): Promise<boolean> {
  const chunks = whatsAppChunks(body);
  if (chunks.length === 0) return false;
  for (const chunk of chunks) {
    if (!(await askAgent(phone, chunk))) return false;
  }
  return true;
}

function isShopChoice(text: string, label: string): boolean {
  if (!shopMentioned(text, label)) return false;
  const rest = text.toLowerCase().replace(label.toLowerCase(), '').replace(/[^a-z0-9]/g, '');
  return rest.length <= 6;
}

async function sendReportButtons(
  phone: string,
  locale: SalesReplyLocale,
  job: { id: string; jobType: string; client: { storeName: string | null; owner: string | null } | null },
): Promise<void> {
  const store = shopLabel(job.client?.storeName, job.client?.owner);
  await dispatchJobToWhatsApp({
    id: job.id,
    jobType: job.jobType,
    priorityReason: null,
    clientName: store,
    suggestedProductNames: [],
    agentPhone: phone,
    locale,
    withButtons: true,
    body: reportButtonPrompt(locale, store),
  });
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
function completionForWords(jobType: string, text: string): Record<string, unknown> {
  const notes = text.trim().slice(0, 1000);
  const facts = extractAgentFacts(jobType, text);
  if (facts.ready && facts.completion) return { ...facts.completion, notes };
  if (jobType === 'take_order') {
    const placed = orderSignal(text);
    return {
      notes,
      delivered: placed === true,
      order_placed: placed === true,
      order_amount: parseSpokenAmount(text),
    };
  }
  if (jobType === 'collect_payment') return { notes, payment_collected: paymentSignal(text) === true };
  if (jobType === 'promote_product') return { notes, promoted: true };
  if (jobType === 'stock_check') return { notes, stock_checked: true };
  if (jobType === 'returns_pickup') return { notes, returned: true, items_returned: [] };
  if (jobType === 'new_product_activation') {
    return { notes, product_given: true, samples_given: labeledQty(text), retailer_briefed: false };
  }
  return { notes };
}

type ReportedJob = {
  id: string;
  distributorId: number;
  jobType: string;
  completionData: unknown;
  shops: string[];
  client: { storeName: string | null; owner: string | null } | null;
};

function shopsOf(job: ReportedJob): string[] {
  if (job.shops.length) return job.shops;
  const fallback = shopLabel(job.client?.storeName, job.client?.owner);
  return fallback === 'Open job' ? [] : [fallback];
}

async function shopNamesByJob(
  jobs: { id: string; orderIds: string[]; client: { storeName: string | null; owner: string | null } | null }[],
): Promise<Map<string, string[]>> {
  const orderIds = Array.from(new Set(jobs.flatMap((job) => job.orderIds)));
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { orderId: { in: orderIds }, isDeleted: false },
        select: { orderId: true, storeName: true, buyer: { select: { storeName: true, owner: true } } },
      })
    : [];
  const storeByOrder = new Map(
    orders.map((order) => [order.orderId, (order.buyer?.storeName || order.buyer?.owner || order.storeName || '').trim()]),
  );
  const map = new Map<string, string[]>();
  for (const job of jobs) {
    const shops: string[] = [];
    for (const orderId of job.orderIds) {
      const name = storeByOrder.get(orderId);
      if (name && !shops.some((shop) => sameShop(shop, name))) shops.push(name);
    }
    if (shops.length === 0) {
      const fallback = shopLabel(job.client?.storeName, job.client?.owner);
      if (fallback !== 'Open job') shops.push(fallback);
    }
    map.set(job.id, shops);
  }
  return map;
}

async function noteReportedBuyers(job: ReportedJob, shops: string[]) {
  const current =
    job.completionData && typeof job.completionData === 'object' && !Array.isArray(job.completionData)
      ? { ...(job.completionData as Record<string, unknown>) }
      : {};
  const result = await prisma.salesJob.updateMany({
    where: {
      id: job.id,
      distributorId: job.distributorId,
      status: { in: ['pending', 'approved', 'suggested', 'dispatched', 'in_progress'] },
    },
    data: { completionData: { ...current, reportedBuyers: shops } as Prisma.InputJsonValue },
  });
  if (result.count === 0) throw new Error('Job cannot be updated');
}

async function saveReportedChecklists(
  fromPhone: string,
  locale: SalesReplyLocale,
  distributorId: number,
  ordered: ReportedJob[],
  indexes: number[],
  text: string,
): Promise<{ handled: true; asked: true; jobId?: string }> {
  const saved: string[] = [];
  let jobId: string | undefined;
  let heldProspect = false;
  const numberPick = pickedJobIndexes(text, ordered.length) != null;
  const selected = indexes.map((index) => ordered[index]).filter((row): row is ReportedJob => Boolean(row));
  const reportNamesAShop = ordered.some((job) => shopsOf(job).some((shop) => shopMentioned(text, shop)));
  const openTakeOrders = ordered.filter((job) => job.jobType === 'take_order');
  const progressOf = (job: ReportedJob) =>
    buyerProgress(text, shopsOf(job), reportedBuyers(job.completionData), reportNamesAShop);
  const selectedTakeOrders = selected.filter((job) => job.jobType === 'take_order');
  const takeOrdersReady =
    numberPick || selectedTakeOrders.length === 0 || openTakeOrders.every((job) => progressOf(job).complete);

  const finishing = new Map<string, ReportedJob>();
  for (const row of selected) {
    if (row.jobType === 'prospect_new_outlet') {
      heldProspect = true;
      continue;
    }
    if (row.jobType === 'take_order' && !takeOrdersReady) continue;
    finishing.set(row.id, row);
  }
  if (!numberPick && takeOrdersReady && selectedTakeOrders.length > 0) {
    for (const row of openTakeOrders) finishing.set(row.id, row);
  }

  const finishedTakeOrderShops: string[] = [];
  for (const row of finishing.values()) {
    try {
      await completeSalesJob({
        distributorId: row.distributorId,
        id: row.id,
        completion: completionForWords(row.jobType, text),
        notes: text.slice(0, 1000),
      });
      jobId = jobId ?? row.id;
      if (row.jobType === 'take_order') {
        for (const shop of shopsOf(row)) {
          if (!finishedTakeOrderShops.some((name) => sameShop(name, shop))) finishedTakeOrderShops.push(shop);
        }
      } else {
        saved.push(checklistUpdatedReply(locale, joinShopNames(locale, shopsOf(row)), row.jobType));
      }
    } catch (err) {
      console.error('[sales-job-agent-reply] could not update checklist', row.id, err);
    }
  }
  if (finishedTakeOrderShops.length > 0) {
    saved.push(checklistUpdatedReply(locale, joinShopNames(locale, finishedTakeOrderShops), 'take_order'));
  } else if (!takeOrdersReady && selectedTakeOrders.length > 0) {
    const noted: string[] = [];
    const remaining: string[] = [];
    for (const row of openTakeOrders) {
      const progress = progressOf(row);
      for (const shop of progress.noted) {
        if (!noted.some((name) => sameShop(name, shop))) noted.push(shop);
      }
      for (const shop of progress.remaining) {
        if (!remaining.some((name) => sameShop(name, shop))) remaining.push(shop);
      }
      if (progress.noted.length > 0 && !progress.complete) {
        try {
          await noteReportedBuyers(row, progress.noted);
          jobId = jobId ?? row.id;
        } catch (err) {
          console.error('[sales-job-agent-reply] could not note buyers', row.id, err);
        }
      }
    }
    if (remaining.length > 0) saved.push(buyersStillOpenReply(locale, 'take_order', noted, remaining));
  }
  if (saved.length === 0) {
    const reply = heldProspect
      ? salesCopy(
          locale,
          'Got it. That prospect stays open until a marketplace order matches it.',
          'Baik. Prospek itu tetap terbuka sampai ada pesanan marketplace yang cocok.',
        )
      : salesCopy(locale, 'Could not save this update. Please try again.', 'Pembaruan ini belum tersimpan. Coba lagi.');
    await askAgent(fromPhone, reply);
    if (heldProspect) await noteSalesWorkflowOutbound(distributorId, reply);
    return { handled: true, asked: true };
  }
  const reply = saved.join('\n\n');
  if (await askAgent(fromPhone, reply)) await noteSalesWorkflowOutbound(distributorId, reply);
  return { handled: true, asked: true, jobId };
}

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
      scheduledDate: { gte: today.start },
    };
  });
  const unassignedIds = matched.filter((agent) => agent.userId == null).map((agent) => agent.id);
  if (unassignedIds.length > 0) {
    const today = zonedDayRange(zonedParts(now, DEFAULT_JOB_TIMEZONE).dateKey, DEFAULT_JOB_TIMEZONE);
    dayFilters.push({
      assignedTo: { in: unassignedIds },
      scheduledDate: { gte: today.start },
    });
  }
  if (dayFilters.length === 0) return { handled: false };

  const jobs = await prisma.salesJob.findMany({
    where: {
      status: { in: ['pending', 'approved', 'suggested', 'dispatched', 'in_progress'] },
      OR: dayFilters,
    },
    include: {
      client: { select: { buyerId: true, storeName: true, owner: true, phone: true, address: true, status: true } },
    },
    orderBy: { scheduledDate: 'desc' },
    take: 12,
  });
  if (jobs.length === 0) return { handled: false };

  const distributorId = matched.find((agent) => agent.userId != null)?.userId ?? jobs[0].distributorId;
  const locale = await salesRepReplyLocale(distributorId);
  const shopByJob = await shopNamesByJob(jobs);
  const ordered = jobs
    .slice()
    .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())
    .map((job) => ({ ...job, shops: shopByJob.get(job.id) ?? [] }));
  const mentioned = ordered.filter((job) => shopsOf(job).some((shop) => shopMentioned(text, shop)));
  const picked = pickedJobIndex(text, ordered.length);
  const numbered = picked == null ? null : ordered[picked];
  const job = ordered.length === 1 ? ordered[0] : mentioned.length === 1 ? mentioned[0] : numbered;

  const pickedIndexes = pickedJobIndexes(text, ordered.length);
  if (pickedIndexes) {
    if (pickedIndexes.length === 0) {
      await askAgent(fromPhone, salesCopy(locale, 'Reply with a number from the list.', 'Balas dengan nomor yang ada di daftar.'));
      return { handled: true, asked: true };
    }
    return saveReportedChecklists(fromPhone, locale, distributorId, ordered, pickedIndexes, text);
  }

  if (/^(iya|ya|yes|yup|yap)\.?!?$/i.test(text)) {
    if (ordered.length === 1) {
      return saveReportedChecklists(fromPhone, locale, distributorId, ordered, [0], text);
    }
    await askAgent(fromPhone, nameTheFinishedWork(locale));
    return { handled: true, asked: true };
  }

  if (saysJobStillOpen(text)) {
    const reply = salesCopy(
      locale,
      'Got it. Tell me when that job is finished.',
      'Baik. Kabari saya kalau pekerjaan itu sudah selesai.',
    );
    if (await askAgent(fromPhone, reply)) await noteSalesWorkflowOutbound(distributorId, reply);
    return { handled: true, asked: true };
  }

  if (isCourtesy(text)) {
    const passingItOn = /\b(forward|teruskan|oper)\b/i.test(text);
    const reply = passingItOn
      ? salesCopy(
          locale,
          "You're welcome. Tell me once the buyer has replied.",
          'Sama-sama. Kabari saya kalau buyer-nya sudah balas.',
        )
      : salesCopy(locale, "You're welcome. Anything else you want to check?", 'Sama-sama. Ada lagi yang mau dicek?');
    if (await askAgent(fromPhone, reply)) await noteSalesWorkflowOutbound(distributorId, reply);
    return { handled: true, asked: true };
  }

  if (isJobQuestion(text)) {
    await answerRep(fromPhone, locale, distributorId, ordered, text);
    return { handled: true, asked: true, jobId: job?.id };
  }

  const done = matchDoneJobs(text, ordered);
  if (done) {
    if (done.holdProspect && done.indexes.length === 0) {
      const reply = salesCopy(
        locale,
        'Got it. That prospect stays open until a marketplace order matches it.',
        'Baik. Prospek itu tetap terbuka sampai ada pesanan marketplace yang cocok.',
      );
      if (await askAgent(fromPhone, reply)) await noteSalesWorkflowOutbound(distributorId, reply);
      return { handled: true, asked: true };
    }
    if (!done.ask && done.indexes.length > 0) {
      return saveReportedChecklists(fromPhone, locale, distributorId, ordered, done.indexes, text);
    }
    await askAgent(fromPhone, nameTheFinishedWork(locale));
    return { handled: true, asked: true };
  }

  if (job && isShopChoice(text, shopLabel(job.client?.storeName, job.client?.owner))) {
    await sendReportButtons(fromPhone, locale, job);
    return { handled: true, asked: true, jobId: job.id };
  }

  const filing =
    Boolean(job) &&
    (job?.status === 'dispatched' || job?.status === 'in_progress') &&
    looksLikeVisitResult(text) &&
    !isJobQuestion(text);
  if (!filing || !job) {
    await answerRep(fromPhone, locale, distributorId, ordered, text);
    return { handled: true, asked: true, jobId: job?.id };
  }

  if (job.jobType === 'prospect_new_outlet') {
    const reply = salesCopy(
      locale,
      'Got it. That prospect stays open until a marketplace order matches it.',
      'Baik. Prospek itu tetap terbuka sampai ada pesanan marketplace yang cocok.',
    );
    if (await askAgent(fromPhone, reply)) await noteSalesWorkflowOutbound(distributorId, reply);
    return { handled: true, asked: true, jobId: job.id };
  }

  const products = await prisma.product.findMany({
    where: { userId: job.distributorId },
    select: { productId: true, name: true },
  });

  const facts = extractAgentFacts(job.jobType, text, products, locale);
  if (!facts.ready || !facts.completion) {
    await askAgent(fromPhone, facts.question || questionFor(job.jobType, locale));
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
      salesCopy(locale, 'Could not save this update. Please try again.', 'Pembaruan ini belum tersimpan. Coba lagi.'),
    );
    return { handled: true, asked: true, jobId: job.id };
  }
  const reply = checklistUpdatedReply(locale, joinShopNames(locale, shopsOf(job)), job.jobType);
  if (await askAgent(fromPhone, reply)) await noteSalesWorkflowOutbound(distributorId, reply);
  return { handled: true, asked: true, jobId: job.id };
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
