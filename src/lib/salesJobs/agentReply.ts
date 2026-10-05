import { noteSalesWorkflowOutbound } from '@/lib/automations/engine';
import { chatWithOpenRouter, isOpenRouterConfigured } from '@/lib/automations/openrouter';
import { prisma, type Prisma } from '@/lib/db';
import { readCompletion } from '@/lib/salesJobs/completion';
import { completeSalesJob } from '@/lib/salesJobs/service';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import {
  jobTypeLabel,
  reportButtonPrompt,
  salesCopy,
  salesRepReplyLocale,
  nameTheFinishedWork,
  checklistUpdatedReply,
  competitorHeardReply,
  quantityHeardReply,
  joinShopNames,
  buyersStillOpenReply,
  stockCountAsk,
  activationQtyAsk,
  competitorInputAsk,
  type CompetitorField,
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

function cleanSpokenValue(raw: string): string {
  let value = raw.replace(/[,.]?\s*\b(?:bagian\s+rak\w*|raknya|shelf(?:\s+share)?|ruang\s+pajang)\b[\s\S]*$/i, '');
  let previous = '';
  while (value !== previous) {
    previous = value;
    value = value
      .replace(/^[\s,:.\-–]+/, '')
      .replace(/^(?:nya|adalah|ialah|yaitu|diantara|antara|untuk|juga|yang|is|are|was)\b[\s,:]*/i, '')
      .replace(/[\s,.\-–]+$/g, '')
      .trim();
  }
  return value;
}

function tidyLabelValue(key: 'name' | 'product' | 'price' | 'promo', value: string): string {
  if (key === 'product') {
    return value.replace(/^(?:yang\s+)?(?:di\s*)?pajang(?:an)?\b[\s,:]*/i, '').replace(/^(?:on\s+the\s+shelf|displayed)\b[\s,:]*/i, '').trim() || value;
  }
  if (key !== 'promo') return value;
  let next = value;
  let previous = '';
  while (next !== previous) {
    previous = next;
    next = next.replace(/^(?:dikenakan|sekitar|ada|about|there(?:'s| is)?)\b[\s,:]*/i, '').trim();
  }
  return next || value;
}

/** The competitor name, product, price, and promo written in the rep's own words. */
function competitorFactsFromText(text: string): { name: string; product: string; price: number | null; promo: string } {
  const labels: { key: 'name' | 'product' | 'price' | 'promo'; pattern: RegExp }[] = [
    { key: 'name', pattern: /\b(?:nama\s+(?:competitor|kompetitor|pesaing)(?:nya)?|(?:competitor|kompetitor|pesaing)(?:\s*nya|\s+name)?|nama\s+pesaing)\b/i },
    { key: 'product', pattern: /\b(?:produk(?:nya)?|competitor\s+product|produk\s+pesaing)\b/i },
    { key: 'price', pattern: /\b(?:harga(?:nya)?|price)\b/i },
    { key: 'promo', pattern: /\bpromo(?:nya)?\b/i },
  ];
  const found = labels.flatMap((label) => {
    const match = label.pattern.exec(text);
    return match?.index == null ? [] : [{ key: label.key, index: match.index, length: match[0].length }];
  });
  found.sort((left, right) => left.index - right.index);
  const facts = { name: '', product: '', price: null as number | null, promo: '' };
  found.forEach((label, position) => {
    const next = found[position + 1]?.index ?? text.length;
    const value = tidyLabelValue(label.key, cleanSpokenValue(text.slice(label.index + label.length, next)));
    if (!value || facts[label.key]) return;
    if (label.key === 'price') {
      const spoken = parseSpokenAmount(value);
      const plain = value.match(/\d{1,9}/);
      const price = spoken ?? (plain ? Number(plain[0]) : null);
      if (price != null && Number.isInteger(price)) facts.price = price;
      return;
    }
    if (label.key === 'name') facts.name = value;
    if (label.key === 'product') facts.product = value;
    if (label.key === 'promo') facts.promo = value;
  });
  return facts;
}

const INPUT_JOB_TYPES = new Set(['stock_check', 'competitor_intel', 'new_product_activation']);

type PendingInput = {
  stock_counts?: { product_id: string; counted: number }[];
  given_counts?: { product_id: string; quantity: number }[];
  competitor_name?: string;
  competitor_product?: string;
  observed_price?: number | null;
  observed_promo?: string;
  shelf_share_observation?: string;
  samples_given?: number | null;
};

function readPending(value: unknown): PendingInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const pending = (value as { pendingInput?: unknown }).pendingInput;
  if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return null;
  return pending as PendingInput;
}

type SpokenFacts = {
  quantities: { name: string; quantity: number }[];
  competitorName: string;
  competitorProduct: string;
  observedPrice: number | null;
  observedPromo: string;
  shelfShare: string;
};

function parseModelJson(text: string): Record<string, unknown> | null {
  const cleaned = stripModelThinking(text).replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function wholeQuantity(value: unknown): number | null {
  if (value == null || value === '') return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0) return null;
  return amount;
}

function matchFocusProduct(name: string, focus: CatalogProduct[]): CatalogProduct | null {
  const needle = name.trim().toLowerCase();
  if (needle.length < 3) return null;
  const hits = focus.filter((product) => {
    const full = product.name.trim().toLowerCase();
    if (!full) return false;
    if (full === needle || full.includes(needle) || needle.includes(full)) return true;
    return full
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4)
      .some((token) => needle.includes(token));
  });
  if (hits.length === 0) return null;
  hits.sort((left, right) => {
    const leftName = left.name.trim().toLowerCase();
    const rightName = right.name.trim().toLowerCase();
    const leftExact = leftName === needle || needle.includes(leftName) ? 1 : 0;
    const rightExact = rightName === needle || needle.includes(rightName) ? 1 : 0;
    if (leftExact !== rightExact) return rightExact - leftExact;
    return rightName.length - leftName.length;
  });
  const best = hits[0];
  const bestName = best.name.trim().toLowerCase();
  const tied = hits.some((product) => product.productId !== best.productId && !bestName.includes(product.name.trim().toLowerCase()));
  return tied && !needle.includes(bestName) && !bestName.includes(needle) ? null : best;
}

/** Reads quantities and competitor facts from the rep's own words. */
async function readSpokenFacts(args: {
  jobType: string;
  text: string;
  shop: string;
  products: string[];
  pending: PendingInput | null;
}): Promise<SpokenFacts | null> {
  if (!isOpenRouterConfigured()) return null;
  const known =
    args.jobType === 'stock_check'
      ? (args.pending?.stock_counts ?? []).map((line) => `${line.product_id}: ${line.counted}`).join(', ')
      : args.jobType === 'new_product_activation'
        ? (args.pending?.given_counts ?? []).map((line) => `${line.product_id}: ${line.quantity}`).join(', ')
        : [
            args.pending?.competitor_name,
            args.pending?.competitor_product,
            args.pending?.observed_price == null ? '' : String(args.pending.observed_price),
            args.pending?.observed_promo,
            args.pending?.shelf_share_observation,
          ]
            .filter(Boolean)
            .join(', ');
  try {
    const result = await chatWithOpenRouter({
      temperature: 0,
      maxTokens: 400,
      reasoning: false,
      messages: [
        {
          role: 'system',
          content:
            'You extract facts from one WhatsApp message sent by a sales rep. Reply with JSON only. Read the wording they actually used. A number can sit before or after the product, with other words in between. In quantities, set name to the matching product from the list, even when the message uses a shorter name. Leave a field empty when the message does not state it. Never guess a number, a name, a price, a promo, or a shelf note.',
        },
        {
          role: 'user',
          content: `Job: ${args.jobType}\nShop: ${args.shop}\nProducts:\n${args.products.join('\n') || 'none'}\nAlready recorded:\n${known || 'none'}\nMessage:\n${args.text}\n\nReturn {"quantities":[{"name":"","quantity":0}],"competitor_name":"","competitor_product":"","observed_price":null,"observed_promo":"","shelf_share":""}`,
        },
      ],
    });
    const row = parseModelJson(result.content);
    if (!row) return null;
    const quantities: { name: string; quantity: number }[] = [];
    if (Array.isArray(row.quantities)) {
      for (const entry of row.quantities) {
        if (!entry || typeof entry !== 'object') continue;
        const item = entry as { name?: unknown; quantity?: unknown };
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const quantity = wholeQuantity(item.quantity);
        if (!name || quantity == null) continue;
        quantities.push({ name, quantity });
      }
    }
    const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    return {
      quantities,
      competitorName: textOf(row.competitor_name),
      competitorProduct: textOf(row.competitor_product),
      observedPrice: wholeQuantity(row.observed_price) ?? (row.observed_price == null ? null : parseSpokenAmount(textOf(row.observed_price))),
      observedPromo: textOf(row.observed_promo),
      shelfShare: textOf(row.shelf_share),
    };
  } catch (err) {
    console.error('[sales-job-agent-reply] could not read the rep message', err);
    return null;
  }
}

function productAliases(product: CatalogProduct, peers: CatalogProduct[]): string[] {
  const full = product.name.trim();
  const tokens = full
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .filter(
      (token) =>
        !peers.some(
          (other) =>
            other.productId !== product.productId &&
            other.name
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .includes(token),
        ),
    );
  return [full, ...tokens].filter((name) => name.trim().length >= 3);
}

/** The number in the same phrase as each product. "54 pocky" and "pocky ada 54" both count. */
function quantitiesNearProducts(text: string, focus: CatalogProduct[]): Map<string, number> {
  const hay = text.toLowerCase();
  const mentions = focus.flatMap((product) => {
    let best: { index: number; length: number } | null = null;
    for (const alias of productAliases(product, focus)) {
      const at = hay.indexOf(alias.toLowerCase());
      if (at < 0) continue;
      if (!best || alias.length > best.length) best = { index: at, length: alias.length };
    }
    return best ? [{ productId: product.productId, index: best.index, length: best.length }] : [];
  });
  mentions.sort((left, right) => left.index - right.index);
  const numbers = Array.from(hay.matchAll(/\b(\d{1,6})\b/g)).flatMap((match) => {
    const quantity = Number(match[1]);
    return match.index == null || !Number.isInteger(quantity) ? [] : [{ quantity, index: match.index }];
  });
  const found = new Map<string, number>();
  const usedNumbers = new Set<number>();
  const usedProducts = new Set<string>();
  const clauses: { start: number; end: number }[] = [];
  const splitter = /\s*(?:,|&|\bdan\b|\band\b)\s*/gi;
  let last = 0;
  let split: RegExpExecArray | null;
  while ((split = splitter.exec(hay))) {
    clauses.push({ start: last, end: split.index });
    last = split.index + split[0].length;
  }
  clauses.push({ start: last, end: hay.length });

  const takeNearest = (
    groupMentions: { productId: string; index: number; length: number }[],
    groupNumbers: { quantity: number; index: number }[],
  ) => {
    const pairs = groupMentions.flatMap((mention) =>
      groupNumbers
        .filter((item) => !usedNumbers.has(item.index))
        .map((item) => {
          const numberEnd = item.index + String(item.quantity).length;
          const distance = item.index >= mention.index + mention.length ? item.index - (mention.index + mention.length) : mention.index - numberEnd;
          return { ...item, productId: mention.productId, distance: Math.max(0, distance) };
        }),
    );
    pairs.sort((left, right) => left.distance - right.distance);
    for (const pair of pairs) {
      if (usedNumbers.has(pair.index) || usedProducts.has(pair.productId)) continue;
      usedNumbers.add(pair.index);
      usedProducts.add(pair.productId);
      found.set(pair.productId, pair.quantity);
    }
  };

  for (const clause of clauses) {
    const groupMentions = mentions.filter((mention) => mention.index >= clause.start && mention.index < clause.end);
    const groupNumbers = numbers.filter((item) => item.index >= clause.start && item.index < clause.end);
    if (groupMentions.length === 0 || groupNumbers.length === 0) continue;
    takeNearest(groupMentions, groupNumbers);
  }
  takeNearest(
    mentions.filter((mention) => !usedProducts.has(mention.productId)),
    numbers,
  );
  return found;
}

function focusProducts(ids: string[], catalog: CatalogProduct[]): CatalogProduct[] {
  return ids.map((id) => catalog.find((product) => product.productId === id) ?? { productId: id, name: id });
}

type InputResolution =
  | { ready: true; completion: Record<string, unknown> }
  | { ready: false; question: string; pending: PendingInput };

async function resolveRequiredInput(
  jobType: string,
  text: string,
  shop: string,
  focus: CatalogProduct[],
  locale: SalesReplyLocale,
  pending: PendingInput | null,
): Promise<InputResolution | null> {
  const notes = notesOf(text);
  const heard = quantitiesNearProducts(text, focus);
  const localCompetitor = jobType === 'competitor_intel' ? competitorFactsFromText(text) : null;
  const needsModel =
    (jobType === 'competitor_intel' &&
      (!localCompetitor?.name || !localCompetitor.product || localCompetitor.price == null || !localCompetitor.promo)) ||
    (jobType !== 'competitor_intel' && focus.length > 0 && heard.size < focus.length);
  const spoken = needsModel
    ? await readSpokenFacts({
        jobType,
        text,
        shop,
        products: focus.map((product) => product.name),
        pending,
      })
    : null;
  for (const item of spoken?.quantities ?? []) {
    const product = matchFocusProduct(item.name, focus);
    if (product && !heard.has(product.productId)) heard.set(product.productId, item.quantity);
  }

  if (jobType === 'stock_check') {
    const counts = new Map((pending?.stock_counts ?? []).map((line) => [line.product_id, line.counted]));
    for (const [productId, counted] of heard) counts.set(productId, counted);
    const missing = focus.filter((product) => !counts.has(product.productId));
    const lines = focus
      .filter((product) => counts.has(product.productId))
      .map((product) => ({ product_id: product.productId, counted: counts.get(product.productId) ?? 0 }));
    if (focus.length === 0 || missing.length > 0) {
      const noted = lines.map((line) => {
        const name = focus.find((product) => product.productId === line.product_id)?.name || line.product_id;
        return `${name} ${line.counted}`;
      });
      const question =
        focus.length === 0
          ? salesCopy(
              locale,
              `For ${shop}, list each product and how many are in the warehouse.`,
              `Untuk ${shop}, sebut setiap produk dan berapa stoknya di gudang.`,
            )
          : stockCountAsk(locale, shop, missing.map((product) => product.name), noted);
      return { ready: false, question, pending: { stock_counts: lines } };
    }
    return {
      ready: true,
      completion: shared(text, {
        stock_checked: true,
        stock_counts: lines.map((line) => ({ ...line, checked: true })),
        notes,
      }),
    };
  }

  if (jobType === 'new_product_activation') {
    const counts = new Map((pending?.given_counts ?? []).map((line) => [line.product_id, line.quantity]));
    for (const [productId, quantity] of heard) counts.set(productId, quantity);
    const missing = focus.filter((product) => !counts.has(product.productId));
    const lines = focus
      .filter((product) => counts.has(product.productId))
      .map((product) => ({ product_id: product.productId, quantity: counts.get(product.productId) ?? 0 }));
    if (focus.length === 0 || missing.length > 0) {
      const noted = lines.map((line) => {
        const name = focus.find((product) => product.productId === line.product_id)?.name || line.product_id;
        return `${name} ${line.quantity}`;
      });
      return {
        ready: false,
        question: activationQtyAsk(
          locale,
          shop,
          focus.length === 0 ? [] : missing.map((product) => product.name),
          noted,
        ),
        pending: { given_counts: lines },
      };
    }
    const samples = lines.reduce((sum, line) => sum + line.quantity, 0);
    return {
      ready: true,
      completion: shared(text, {
        product_given: true,
        samples_given: samples,
        given_counts: lines,
        product_ids: focus.map((product) => product.productId),
        product_id: focus[0]?.productId,
        retailer_briefed: false,
        notes,
      }),
    };
  }

  if (jobType === 'competitor_intel') {
    const fields = {
      name: localCompetitor?.name || spoken?.competitorName || pending?.competitor_name || '',
      product: localCompetitor?.product || spoken?.competitorProduct || pending?.competitor_product || '',
      price: localCompetitor?.price ?? spoken?.observedPrice ?? pending?.observed_price ?? null,
      promo: localCompetitor?.promo || spoken?.observedPromo || pending?.observed_promo || '',
    };
    const missing: CompetitorField[] = [];
    if (!fields.name) missing.push('name');
    if (!fields.product) missing.push('product');
    if (fields.price == null) missing.push('price');
    if (!fields.promo) missing.push('promo');
    const pendingNext: PendingInput = {
      competitor_name: fields.name,
      competitor_product: fields.product,
      observed_price: fields.price,
      observed_promo: fields.promo,
    };
    if (missing.length > 0) {
      const noted = [fields.name, fields.product, fields.price == null ? '' : String(fields.price), fields.promo].filter(Boolean);
      return { ready: false, question: competitorInputAsk(locale, shop, missing, noted), pending: pendingNext };
    }
    return {
      ready: true,
      completion: shared(text, {
        competitor_name: fields.name,
        competitor_product: fields.product,
        observed_price: fields.price,
        observed_promo: fields.promo,
        notes,
      }),
    };
  }

  return null;
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
    const facts = competitorFactsFromText(body);
    if (!facts.name || !facts.product || facts.price == null || !facts.promo) return ask(questionFor(jobType, locale));
    return {
      ready: true,
      completion: shared(body, {
        competitor_name: facts.name,
        competitor_product: facts.product,
        observed_price: facts.price,
        observed_promo: facts.promo,
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
  /\b(?:di|meng|ter|ke)?(?:kirim|kirm|ambil|jemput|antar|serah|tagih|aktivasi)\w*\b|\b(?:promosi|mempromosikan\w*|dipromosikan|promoted|deliver\w*|delivered|picked|sent|memberikan|diberikan|menagih)\b/i;

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
  if (/\b(bayar|pembayaran|tagih\w*|menagih|nagih|payment)\b/i.test(text)) types.push('collect_payment');
  if (/\b(?:stok|stock)(?:nya)?\b/i.test(text)) types.push('stock_check');
  if (/\b(retur|return|pengembalian)\b/i.test(text)) types.push('returns_pickup');
  if (/\b(prospek|outlet baru|prospect)\b/i.test(text)) types.push('prospect_new_outlet');
  if (
    /\b(sampel|samples|aktivasi|activation|produk baru|new product|product given)\b/i.test(text) ||
    (/\b(memberikan|diberikan|bagikan|dikasih)\b/i.test(text) && /\b(produk|product|sampel|samples)\b/i.test(text))
  ) {
    types.push('new_product_activation');
  }
  if (/\b(?:kompetitor|competitor|pesaing)(?:nya)?\b/i.test(text)) types.push('competitor_intel');
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
  return /\b(?:stok(?:nya)?|stock|checked|dicek|dipromosikan|mempromosikan\w*|promoted|returned|diretur|retur|sampel|samples|diberikan|kompetitor(?:nya)?|competitor|pesaing(?:nya)?)\b/i.test(
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

function coachingReply(
  locale: SalesReplyLocale,
  text: string,
  jobs: { jobType: string; client: { storeName: string | null; owner: string | null } | null }[],
): string | null {
  if (!isJobQuestion(text)) return null;
  const named = jobTypesInText(text);
  const topic = named[0] || (jobs.length === 1 ? jobs[0].jobType : '');
  const match = jobs.find((job) => job.jobType === topic) || (jobs.length === 1 ? jobs[0] : undefined);
  const shop = match ? shopLabel(match.client?.storeName, match.client?.owner) : '';
  const place = shop && shop !== 'Open job' ? shop : locale === 'id' ? 'toko itu' : 'that shop';
  if (topic === 'competitor_intel' || /\b(pesaing|kompetitor|competitor)\b/i.test(text)) {
    return salesCopy(
      locale,
      `At ${place}, notice who the competitor is, which product is on the shelf, the price you see, and whether they have a promo. Send me those notes when you have them.`,
      `Di ${place}, lihat siapa pesaingnya, produk apa yang dipajang, harga yang terpasang, dan ada promo atau tidak. Kirim catatannya ke saya kalau sudah.`,
    );
  }
  if (topic === 'stock_check' || /\b(stok|stock)\b/i.test(text)) {
    return salesCopy(
      locale,
      'Count each product in the warehouse, then send me the numbers.',
      'Hitung tiap produk di gudang, lalu kirim jumlahnya ke saya.',
    );
  }
  if (topic === 'new_product_activation') {
    return salesCopy(
      locale,
      `At ${place}, note how many of each product you gave them, then send me the quantities.`,
      `Di ${place}, catat berapa banyak tiap produk yang kamu berikan, lalu kirim jumlahnya ke saya.`,
    );
  }
  if (topic === 'promote_product' || wantsProductAdvice(text)) {
    return salesCopy(
      locale,
      `At ${place}, say who the product is for, one reason to try it, and a short line they can tell the buyer.`,
      `Di ${place}, sebut siapa yang cocok memakai produknya, satu alasan untuk mencoba, dan satu kalimat yang bisa kamu sampaikan ke buyer.`,
    );
  }
  if (topic === 'collect_payment') {
    return salesCopy(
      locale,
      `At ${place}, check whether the payment came in, then tell me once it is collected.`,
      `Di ${place}, cek apakah pembayarannya sudah masuk, lalu kabari saya kalau sudah tertagih.`,
    );
  }
  if (topic === 'returns_pickup') {
    return salesCopy(
      locale,
      `At ${place}, pick up the return, then tell me once it is with you.`,
      `Di ${place}, jemput returannya, lalu kabari saya kalau sudah kamu bawa.`,
    );
  }
  if (topic === 'take_order') {
    return salesCopy(
      locale,
      `At ${place}, check whether they placed an order, then tell me the result.`,
      `Di ${place}, cek apakah mereka jadi order, lalu kabari saya hasilnya.`,
    );
  }
  return salesCopy(
    locale,
    'Ask me about the job, the product, or how to sell it, and I will answer.',
    'Tanya saja soal pekerjaannya, produknya, atau cara jualnya, nanti saya jawab.',
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
          content: `You text one sales rep on WhatsApp. You are their sales manager, the same way a buyer chat stays a conversation. Answer what they asked in a few plain sentences. If they only say thanks or that they will follow up with the buyer, reply with one short friendly sentence and do not list jobs. Never paste the internal job list, phone numbers, or street addresses. Plain sentences only: no markdown, no headings, no asterisks, and no links. Never write a safety label, including User Safety or Safety Categories. Never write a thinking process, analysis, or recap of these instructions. When they ask which orders to deliver or pick up, name each shop they asked about, the products, the status, and the total from the records. Do not pitch products unless they asked how to sell. Do not repeat their message. The jobs, outlets, and orders below are already loaded for this rep. If a shop is in those records, answer about its jobs and orders. Do not say the shop is missing, and do not ask for an outlet code, owner, or address when the records already include it. When they ask what to look for, how to check a competitor, stock, a new product, a payment, or a return, answer in a few plain sentences as their manager. When they ask how to pitch, offer, or sell, cover every product they asked about. Give each product its own short paragraph: who it is for, one reason to try it, and a line they can say in the shop. Finish the last product before you stop. Use the public web notes for that product advice. Do not use the web for private records, and do not look at any other distributor. Do not invent prices or stock that are not in the records. ${languageRule} No em dashes.`,
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
      if (!reply) reply = ordersFollowUp(locale, text, jobs, orders) ?? coachingReply(locale, text, jobs) ?? '';
      if (reply.startsWith('Ini pekerjaan Anda') || reply.startsWith('Here are your jobs')) reply = '';
      if (reply) body = reply;
    } catch (err) {
      console.error('[sales-job-agent-reply] job question failed', err);
    }
  }
  if (!body.trim()) {
    body = ordersFollowUp(locale, text, jobs, orders) ?? coachingReply(locale, text, jobs) ?? '';
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
  if (jobType === 'collect_payment') return { notes, payment_collected: paymentSignal(text) !== false, payment_amount: null };
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
  suggestedProducts: string[];
  client: { storeName: string | null; owner: string | null } | null;
};

function shopsOf(job: ReportedJob): string[] {
  if (job.shops.length) return job.shops;
  const fallback = shopLabel(job.client?.storeName, job.client?.owner);
  return fallback === 'Open job' ? [] : [fallback];
}

async function shopNamesByJob(
  jobs: {
    id: string;
    jobType: string;
    orderIds: string[];
    clientIds: string[];
    client: { storeName: string | null; owner: string | null } | null;
  }[],
): Promise<Map<string, string[]>> {
  const orderIds = Array.from(new Set(jobs.flatMap((job) => job.orderIds)));
  const clientIds = Array.from(new Set(jobs.flatMap((job) => job.clientIds)));
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { orderId: { in: orderIds }, isDeleted: false },
        select: { orderId: true, storeName: true, buyer: { select: { storeName: true, owner: true } } },
      })
    : [];
  const buyers = clientIds.length
    ? await prisma.buyer.findMany({
        where: { buyerId: { in: clientIds } },
        select: { buyerId: true, storeName: true, owner: true },
      })
    : [];
  const storeByOrder = new Map(
    orders.map((order) => [order.orderId, (order.buyer?.storeName || order.buyer?.owner || order.storeName || '').trim()]),
  );
  const storeByClient = new Map(buyers.map((buyer) => [buyer.buyerId, (buyer.storeName || buyer.owner).trim()]));
  const map = new Map<string, string[]>();
  for (const job of jobs) {
    const shops: string[] = [];
    for (const clientId of job.clientIds) {
      const name = storeByClient.get(clientId);
      if (name && !shops.some((shop) => sameShop(shop, name))) shops.push(name);
    }
    for (const orderId of job.orderIds) {
      const name = storeByOrder.get(orderId);
      if (name && !shops.some((shop) => sameShop(shop, name))) shops.push(name);
    }
    if (shops.length === 0 && job.jobType !== 'stock_check') {
      const fallback = shopLabel(job.client?.storeName, job.client?.owner);
      if (fallback !== 'Open job') shops.push(fallback);
    }
    map.set(job.id, shops);
  }
  return map;
}

function shopTitle(locale: SalesReplyLocale, job: ReportedJob): string {
  if (job.jobType === 'stock_check' && shopsOf(job).length === 0) return locale === 'id' ? 'Gudang' : 'Warehouse';
  return joinShopNames(locale, shopsOf(job));
}

/** The same fields as the completion form, for the products or shop still missing. */
function requiredInputQuestion(locale: SalesReplyLocale, job: ReportedJob, catalog: CatalogProduct[]): string {
  const shop = shopTitle(locale, job);
  const pending = readPending(job.completionData);
  const focus = focusProducts(job.suggestedProducts ?? [], catalog);
  if (job.jobType === 'stock_check') {
    if (focus.length === 0) {
      return salesCopy(
        locale,
        `For ${shop}, enter the counted stock for each product.`,
        `Untuk ${shop}, isi stok terhitung untuk setiap produk.`,
      );
    }
    const counted = new Map((pending?.stock_counts ?? []).map((line) => [line.product_id, line.counted]));
    const missing = focus.filter((product) => !counted.has(product.productId)).map((product) => product.name);
    const noted = focus
      .filter((product) => counted.has(product.productId))
      .map((product) => `${product.name} ${counted.get(product.productId)}`);
    return stockCountAsk(locale, shop, missing.length > 0 ? missing : focus.map((product) => product.name), noted);
  }
  if (job.jobType === 'new_product_activation') {
    const given = new Map((pending?.given_counts ?? []).map((line) => [line.product_id, line.quantity]));
    const missing = focus.filter((product) => !given.has(product.productId)).map((product) => product.name);
    const noted = focus
      .filter((product) => given.has(product.productId))
      .map((product) => `${product.name} ${given.get(product.productId)}`);
    return activationQtyAsk(locale, shop, missing, noted);
  }
  if (job.jobType === 'competitor_intel') {
    const fields: CompetitorField[] = ['name', 'product', 'price', 'promo'];
    const missing = fields.filter((field) => {
      if (field === 'name') return !pending?.competitor_name;
      if (field === 'product') return !pending?.competitor_product;
      if (field === 'price') return pending?.observed_price == null;
      return !pending?.observed_promo;
    });
    const noted = [
      pending?.competitor_name,
      pending?.competitor_product,
      pending?.observed_price == null ? '' : String(pending.observed_price),
      pending?.observed_promo,
    ].filter((value): value is string => Boolean(value));
    return competitorInputAsk(locale, shop, missing.length > 0 ? missing : fields, noted);
  }
  return '';
}

async function loadCatalog(distributorId: number): Promise<CatalogProduct[]> {
  return prisma.product.findMany({
    where: { userId: distributorId },
    select: { productId: true, name: true },
    orderBy: { name: 'asc' },
  });
}

async function notePending(job: ReportedJob, pending: PendingInput) {
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
    data: { completionData: { ...current, pendingInput: pending } as Prisma.InputJsonValue },
  });
  if (result.count === 0) throw new Error('Job cannot be updated');
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

function savedJobReply(
  locale: SalesReplyLocale,
  shop: string,
  jobType: string,
  completion?: Record<string, unknown>,
  catalog: CatalogProduct[] = [],
  corrected = false,
): string {
  const nameOf = (id: string) => catalog.find((product) => product.productId === id)?.name || id;
  if (jobType === 'stock_check' && Array.isArray(completion?.stock_counts)) {
    const lines = completion.stock_counts.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const line = entry as { product_id?: unknown; counted?: unknown };
      const productId = typeof line.product_id === 'string' ? line.product_id : '';
      const counted = typeof line.counted === 'number' ? line.counted : null;
      return productId && counted != null ? [`${nameOf(productId)} ${counted}`] : [];
    });
    if (lines.length > 0) return quantityHeardReply(locale, shop, lines, corrected);
  }
  if (jobType === 'new_product_activation' && Array.isArray(completion?.given_counts)) {
    const lines = completion.given_counts.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const line = entry as { product_id?: unknown; quantity?: unknown };
      const productId = typeof line.product_id === 'string' ? line.product_id : '';
      const quantity = typeof line.quantity === 'number' ? line.quantity : null;
      return productId && quantity != null ? [`${nameOf(productId)} ${quantity}`] : [];
    });
    if (lines.length > 0) return quantityHeardReply(locale, shop, lines, corrected);
  }
  if (jobType !== 'competitor_intel' || !completion) return checklistUpdatedReply(locale, shop, jobType);
  const name = typeof completion.competitor_name === 'string' ? completion.competitor_name.trim() : '';
  const product = typeof completion.competitor_product === 'string' ? completion.competitor_product.trim() : '';
  const promo = typeof completion.observed_promo === 'string' ? completion.observed_promo.trim() : '';
  const price = typeof completion.observed_price === 'number' ? completion.observed_price : null;
  const notes = typeof completion.notes === 'string' ? completion.notes : '';
  if (!name || !product || price == null || !promo) return checklistUpdatedReply(locale, shop, jobType);
  const range = notes.match(/(\d{1,9})\s*[-–]\s*(\d{1,9})/);
  return competitorHeardReply(
    locale,
    shop,
    { name, product, price: range ? `${range[1]}-${range[2]}` : String(price), promo },
    corrected,
  );
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

  const needsInput = Array.from(finishing.values()).some((row) => INPUT_JOB_TYPES.has(row.jobType));
  const catalog = needsInput ? await loadCatalog(distributorId) : [];
  const finishedTakeOrderShops: string[] = [];
  for (const row of finishing.values()) {
    try {
      if (INPUT_JOB_TYPES.has(row.jobType)) {
        const shop = shopTitle(locale, row);
        const resolution = await resolveRequiredInput(
          row.jobType,
          text,
          shop,
          focusProducts(row.suggestedProducts ?? [], catalog),
          locale,
          readPending(row.completionData),
        );
        if (resolution && !resolution.ready) {
          await notePending(row, resolution.pending);
          saved.push(resolution.question);
          jobId = jobId ?? row.id;
          continue;
        }
        if (resolution?.ready) {
          await completeSalesJob({
            distributorId: row.distributorId,
            id: row.id,
            completion: resolution.completion,
            notes: text.slice(0, 1000),
          });
          jobId = jobId ?? row.id;
          saved.push(savedJobReply(locale, shop, row.jobType, resolution.completion, catalog));
          continue;
        }
      }
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
        saved.push(checklistUpdatedReply(locale, shopTitle(locale, row), row.jobType));
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

function textNamesFocusProduct(text: string, product: CatalogProduct): boolean {
  const name = product.name.trim().toLowerCase();
  return name.length >= 4 && text.toLowerCase().includes(name);
}

/** A waiting job owns this message when it names that shop or product, or no other open job type. */
async function messageConcernsWaitingJob(
  text: string,
  ordered: ReportedJob[],
  waiting: ReportedJob[],
  distributorId: number,
): Promise<boolean> {
  if (waiting.some((job) => shopsOf(job).some((shop) => shopMentioned(text, shop)))) return true;
  const waitingIds = new Set(waiting.map((job) => job.id));
  const namedTypes = new Set(jobTypesInText(text));
  const otherOpenType =
    (looksLikeVisitResult(text) || namedTypes.size > 0) &&
    ordered.some((job) => !waitingIds.has(job.id) && namedTypes.has(job.jobType));
  if (!otherOpenType) return true;
  const catalog = await loadCatalog(distributorId);
  return waiting.some((job) =>
    focusProducts(job.suggestedProducts ?? [], catalog).some((product) => textNamesFocusProduct(text, product)),
  );
}

async function continueAwaitedInput(
  fromPhone: string,
  locale: SalesReplyLocale,
  distributorId: number,
  waiting: ReportedJob[],
  text: string,
): Promise<{ handled: true; asked: true; jobId?: string }> {
  const catalog = await loadCatalog(distributorId);
  const namedShop = waiting.filter((job) => shopsOf(job).some((shop) => shopMentioned(text, shop)));
  const namedProduct = waiting.filter((job) =>
    focusProducts(job.suggestedProducts ?? [], catalog).some((product) => textNamesFocusProduct(text, product)),
  );
  const target = waiting.length === 1 ? waiting[0] : namedShop.length === 1 ? namedShop[0] : namedProduct.length === 1 ? namedProduct[0] : null;
  if (!target) {
    const reply = waiting
      .map((job) => requiredInputQuestion(locale, job, catalog))
      .filter(Boolean)
      .join('\n\n');
    if (reply && (await askAgent(fromPhone, reply))) await noteSalesWorkflowOutbound(distributorId, reply);
    return { handled: true, asked: true };
  }
  const shop = shopTitle(locale, target);
  const resolution = await resolveRequiredInput(
    target.jobType,
    text,
    shop,
    focusProducts(target.suggestedProducts ?? [], catalog),
    locale,
    readPending(target.completionData),
  );
  if (!resolution) return { handled: true, asked: true, jobId: target.id };
  if (!resolution.ready) {
    try {
      await notePending(target, resolution.pending);
    } catch (err) {
      console.error('[sales-job-agent-reply] could not keep the pending input', target.id, err);
    }
    if (await askAgent(fromPhone, resolution.question)) await noteSalesWorkflowOutbound(distributorId, resolution.question);
    return { handled: true, asked: true, jobId: target.id };
  }
  try {
    await completeSalesJob({
      distributorId: target.distributorId,
      id: target.id,
      completion: resolution.completion,
      notes: text.slice(0, 1000),
    });
  } catch (err) {
    console.error('[sales-job-agent-reply] could not update checklist', target.id, err);
    await askAgent(
      fromPhone,
      salesCopy(locale, 'Could not save this update. Please try again.', 'Pembaruan ini belum tersimpan. Coba lagi.'),
    );
    return { handled: true, asked: true, jobId: target.id };
  }
  const reply = savedJobReply(locale, shop, target.jobType, resolution.completion, catalog);
  if (await askAgent(fromPhone, reply)) await noteSalesWorkflowOutbound(distributorId, reply);
  return { handled: true, asked: true, jobId: target.id };
}

function pendingFromStored(value: unknown): PendingInput | null {
  const saved = readCompletion(value);
  const pending = readPending(value);
  const stock = (saved.stock_counts ?? []).flatMap((line) =>
    line.counted == null ? [] : [{ product_id: line.product_id, counted: line.counted }],
  );
  return {
    ...pending,
    ...(stock.length > 0 ? { stock_counts: stock } : {}),
    ...(saved.given_counts?.length ? { given_counts: saved.given_counts } : {}),
    ...(saved.competitor_name ? { competitor_name: saved.competitor_name } : {}),
    ...(saved.competitor_product ? { competitor_product: saved.competitor_product } : {}),
    ...(saved.observed_price != null ? { observed_price: saved.observed_price } : {}),
    ...(saved.observed_promo ? { observed_promo: saved.observed_promo } : {}),
  };
}

function looksLikeCorrection(text: string): boolean {
  return /\b(?:koreksi|dikoreksi|betulkan|dibetulkan|perbaiki|diperbaiki|bukan|correction|corrected|wrong)\b/i.test(text);
}

async function reviseCompletedInput(
  fromPhone: string,
  locale: SalesReplyLocale,
  distributorId: number,
  agentIds: string[],
  text: string,
  openJobs: ReportedJob[] = [],
): Promise<{ handled: true; asked: true; jobId?: string } | null> {
  if (isJobQuestion(text) || agentIds.length === 0 || !looksLikeCorrection(text)) return null;
  const settings = await prisma.salesJobSettings.findUnique({
    where: { distributorId },
    select: { timezone: true },
  });
  const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
  const today = zonedDayRange(zonedParts(new Date(), timeZone).dateKey, timeZone);
  const completed = await prisma.salesJob.findMany({
    where: {
      distributorId,
      status: 'completed',
      jobType: { in: [...INPUT_JOB_TYPES] },
      assignedTo: { in: agentIds },
      OR: [
        { scheduledDate: { gte: today.start, lt: today.end } },
        { completedAt: { gte: today.start, lt: today.end } },
      ],
    },
    include: {
      client: { select: { buyerId: true, storeName: true, owner: true, phone: true, address: true, status: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 12,
  });
  const seen = new Set(completed.map((row) => row.id));
  const candidates: ReportedJob[] = [
    ...completed.map((row) => ({
      id: row.id,
      distributorId: row.distributorId,
      jobType: row.jobType,
      completionData: row.completionData,
      shops: [] as string[],
      suggestedProducts: row.suggestedProducts ?? [],
      client: row.client,
    })),
    ...openJobs.filter((row) => row.distributorId === distributorId && INPUT_JOB_TYPES.has(row.jobType) && !seen.has(row.id)),
  ];
  if (candidates.length === 0) return null;
  const shopByJob = await shopNamesByJob(completed);
  for (const job of openJobs) {
    if (!shopByJob.has(job.id)) shopByJob.set(job.id, job.shops);
  }
  const productIds = Array.from(new Set(candidates.flatMap((row) => row.suggestedProducts)));
  const named = productIds.length
    ? await prisma.product.findMany({
        where: { productId: { in: productIds } },
        select: { productId: true, name: true },
      })
    : [];
  const catalog = await loadCatalog(distributorId);
  const byId = new Map<string, CatalogProduct>();
  for (const product of [...catalog, ...named]) byId.set(product.productId, product);
  const namesFor = (ids: string[]) => ids.map((id) => byId.get(id) ?? { productId: id, name: id });
  const ranked = candidates.flatMap((row) => {
    const focus = namesFor(row.suggestedProducts);
    const heard = quantitiesNearProducts(text, focus);
    const competitor = row.jobType === 'competitor_intel' ? competitorFactsFromText(text) : null;
    const hits =
      row.jobType === 'competitor_intel'
        ? [competitor?.name, competitor?.product, competitor?.price != null ? '1' : '', competitor?.promo].filter(Boolean).length
        : heard.size;
    return hits > 0 ? [{ row, hits }] : [];
  });
  if (ranked.length === 0) return null;
  ranked.sort((left, right) => right.hits - left.hits);
  const tied = ranked.filter((item) => item.hits === ranked[0].hits);
  if (tied.length > 1) {
    const choices = tied.map((item) => {
      const labeled = { ...item.row, shops: shopByJob.get(item.row.id) ?? item.row.shops };
      return `${shopTitle(locale, labeled)} / ${jobTypeLabel(locale, labeled.jobType)}`;
    });
    const reply = salesCopy(
      locale,
      `Which job should I correct? ${choices.join(', ')}.`,
      `Pekerjaan yang mana yang perlu saya betulkan? ${choices.join(', ')}.`,
    );
    if (await askAgent(fromPhone, reply)) await noteSalesWorkflowOutbound(distributorId, reply);
    return { handled: true, asked: true };
  }
  const chosen = tied[0].row;
  const job = { ...chosen, shops: shopByJob.get(chosen.id) ?? chosen.shops, suggestedProducts: chosen.suggestedProducts };
  const shop = shopTitle(locale, job);
  const resolution = await resolveRequiredInput(
    job.jobType,
    text,
    shop,
    namesFor(job.suggestedProducts),
    locale,
    pendingFromStored(job.completionData),
  );
  if (!resolution?.ready) {
    const question = resolution?.question?.trim();
    if (!question) return null;
    if (await askAgent(fromPhone, question)) await noteSalesWorkflowOutbound(distributorId, question);
    return { handled: true, asked: true, jobId: job.id };
  }
  try {
    await completeSalesJob({
      distributorId: job.distributorId,
      id: job.id,
      completion: resolution.completion,
      notes: text.slice(0, 1000),
      revise: true,
    });
  } catch (err) {
    console.error('[sales-job-agent-reply] could not correct the checklist', job.id, err);
    return null;
  }
  const reply = savedJobReply(locale, shop, job.jobType, resolution.completion, Array.from(byId.values()), true);
  if (await askAgent(fromPhone, reply)) await noteSalesWorkflowOutbound(distributorId, reply);
  return { handled: true, asked: true, jobId: job.id };
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
  if (jobs.length === 0) {
    const distributorId = matched.find((agent) => agent.userId != null)?.userId;
    if (distributorId == null) return { handled: false };
    const locale = await salesRepReplyLocale(distributorId);
    const revised = await reviseCompletedInput(fromPhone, locale, distributorId, matched.map((agent) => agent.id), text);
    return revised ?? { handled: false };
  }

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

  const waiting = ordered.filter((job) => readPending(job.completionData));
  if (/^(iya|ya|yes|yup|yap)\.?!?$/i.test(text)) {
    if (waiting.length === 1) return continueAwaitedInput(fromPhone, locale, distributorId, waiting, text);
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

  if (
    waiting.length > 0 &&
    !saysJobIsDone(text) &&
    (await messageConcernsWaitingJob(text, ordered, waiting, distributorId))
  ) {
    return continueAwaitedInput(fromPhone, locale, distributorId, waiting, text);
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

  const namedInputTypes = jobTypesInText(text).filter((type) => INPUT_JOB_TYPES.has(type));
  if (namedInputTypes.length > 0) {
    let candidates = ordered.filter((row) => namedInputTypes.includes(row.jobType));
    const byShop = candidates.filter((row) => shopsOf(row).some((shop) => shopMentioned(text, shop)));
    if (byShop.length > 0) candidates = byShop;
    if (candidates.length === 1) {
      return saveReportedChecklists(fromPhone, locale, distributorId, ordered, [ordered.indexOf(candidates[0])], text);
    }
    if (candidates.length > 1) {
      const catalog = await loadCatalog(distributorId);
      const reply = candidates
        .map((row) => requiredInputQuestion(locale, row, catalog))
        .filter(Boolean)
        .join('\n\n');
      if (reply && (await askAgent(fromPhone, reply))) await noteSalesWorkflowOutbound(distributorId, reply);
      return { handled: true, asked: true };
    }
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
    const revised = await reviseCompletedInput(fromPhone, locale, distributorId, matched.map((agent) => agent.id), text, ordered);
    if (revised) return revised;
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

  if (INPUT_JOB_TYPES.has(job.jobType)) {
    const shop = shopTitle(locale, job);
    const resolution = await resolveRequiredInput(
      job.jobType,
      text,
      shop,
      focusProducts(job.suggestedProducts ?? [], products),
      locale,
      readPending(job.completionData),
    );
    if (resolution && !resolution.ready) {
      try {
        await notePending(job, resolution.pending);
      } catch (err) {
        console.error('[sales-job-agent-reply] could not keep the pending input', job.id, err);
      }
      if (await askAgent(fromPhone, resolution.question)) await noteSalesWorkflowOutbound(distributorId, resolution.question);
      return { handled: true, asked: true, jobId: job.id };
    }
    if (resolution?.ready) {
      try {
        await completeSalesJob({
          distributorId: job.distributorId,
          id: job.id,
          completion: resolution.completion,
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
      const updated = savedJobReply(locale, shop, job.jobType, resolution.completion, products);
      if (await askAgent(fromPhone, updated)) await noteSalesWorkflowOutbound(distributorId, updated);
      return { handled: true, asked: true, jobId: job.id };
    }
  }

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
  const reply = savedJobReply(locale, shopTitle(locale, job), job.jobType, facts.completion, products);
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
