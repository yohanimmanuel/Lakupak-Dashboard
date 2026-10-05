import { chatWithOpenRouter, isOpenRouterConfigured } from '@/lib/automations/openrouter';
import { prisma } from '@/lib/db';
import { completeSalesJob } from '@/lib/salesJobs/service';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import {
  jobTypeLabel,
  reportButtonPrompt,
  salesCopy,
  salesRepReplyLocale,
  whichJobPrompt,
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
    const promoted = /\b(promosi|promo|promoted|dipromosikan|ditawarkan|shown|display)\b/i.test(body);
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

function shopMentioned(text: string, label: string): boolean {
  const name = label.trim().toLowerCase();
  return name.length >= 4 && name !== 'open job' && text.toLowerCase().includes(name);
}

function pickedJobIndex(text: string, count: number): number | null {
  const named = text.match(/\b(?:nomor|number|no\.?|angka|#)\s*(\d{1,2})\b/i);
  const bare = text.trim().match(/^(\d{1,2})$/);
  const raw = named?.[1] ?? bare?.[1];
  if (!raw) return null;
  const index = Number(raw) - 1;
  return index >= 0 && index < count ? index : null;
}

function looksLikeVisitResult(text: string): boolean {
  if (orderSignal(text) != null || paymentSignal(text) != null) return true;
  return /\b(stok|stock|checked|dicek|dipromosikan|promoted|returned|diretur|retur|sampel|samples|diberikan|kompetitor|competitor|pesaing)\b/i.test(
    text,
  );
}

function wantsProductAdvice(text: string): boolean {
  return /\b(pitch|offer|tawarkan|nawarin|cara jual|cara nawar|rekomendas|recommend|menarik|promosi|bagaimana jual|how to sell|how to pitch|empower)\b/i.test(
    text,
  );
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
            storeName: true,
            contactPerson: true,
            orderStatus: true,
            paymentStatus: true,
            totalAmount: true,
            orderDate: true,
            deliveryAddress: true,
            buyer: { select: { storeName: true, owner: true, phone: true, address: true, status: true } },
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
      const outlet = [
        shopLabel(job.client?.storeName, job.client?.owner),
        job.client?.status || '',
        job.client?.phone || '',
        job.client?.address || '',
      ]
        .filter(Boolean)
        .join(', ');
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
  let body =
    locale === 'id'
      ? `Ini pekerjaan Anda:\n${jobLines}`
      : `Here are your jobs:\n${jobLines}`;
  if (isOpenRouterConfigured()) {
    try {
      const result = await chatWithOpenRouter({
        temperature: 0.4,
        maxTokens: advice ? 1400 : 700,
        messages: [
          {
            role: 'system',
            content: `You text one sales rep on WhatsApp. Write like a person and answer the question they asked. Plain sentences only: no markdown, no headings, no asterisks, and no links. The jobs, outlets, and orders below are already loaded from this distributor's dashboard for this rep. If a shop is in those records, answer about its jobs and orders. Do not say the shop is missing, and do not ask for an outlet code, owner, or address when the records already include it. When they ask how to pitch, offer, or sell, cover every product they asked about. Give each product its own short paragraph: who it is for, one reason to try it, and a line they can say in the shop. Finish the last product. Use the public web notes for that product advice. Do not use the web for private records, and do not look at any other distributor. Do not invent prices or stock that are not in the records. ${languageRule} No em dashes.`,
          },
          {
            role: 'user',
            content: `${advice ? `Look up these products on the public web for selling advice:\n${focusLines || catalog || (locale === 'id' ? 'tidak ada' : 'none')}\n\n` : ''}Jobs:\n${jobLines}\n\nOrders for this rep:\n${orderLines || (locale === 'id' ? 'tidak ada' : 'none')}\n\nProducts this distributor sells:\n${catalog || (locale === 'id' ? 'tidak ada' : 'none')}\n\nMessage:\n${text}`,
          },
        ],
        webSearch: advice,
      });
      const reply = result.content.replace(/\u2014|\u2013/g, '-').trim();
      if (reply) body = reply;
    } catch (err) {
      console.error('[sales-job-agent-reply] job question failed', err);
    }
  }
  await sendRepReply(phone, body);
}

function plainWhatsApp(text: string): string {
  return text
    .replace(/\u2014|\u2013/g, '-')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')
    .replace(/\*\*/g, '')
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

async function sendRepReply(phone: string, body: string): Promise<void> {
  for (const chunk of whatsAppChunks(body)) {
    await askAgent(phone, chunk);
  }
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
  const ordered = jobs.slice().sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  const mentioned = ordered.filter((job) => shopMentioned(text, shopLabel(job.client?.storeName, job.client?.owner)));
  const picked = pickedJobIndex(text, ordered.length);
  const numbered = picked == null ? null : ordered[picked];
  const job = ordered.length === 1 ? ordered[0] : mentioned.length === 1 ? mentioned[0] : numbered;

  if (
    (wantsFinishedJobReport(text) && !looksLikeVisitResult(text)) ||
    (job && isShopChoice(text, shopLabel(job.client?.storeName, job.client?.owner)))
  ) {
    if (!job) {
      const lines = ordered.map(
        (row) => `${shopLabel(row.client?.storeName, row.client?.owner)}. ${jobTypeLabel(locale, row.jobType)}`,
      );
      await askAgent(fromPhone, whichJobPrompt(locale, lines));
      return { handled: true, asked: true };
    }
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
