import { prisma } from '@/lib/db';
import { fieldsForCatalogType, type WorkflowFieldUpdate } from '@/lib/lakuAi/workflowPlan';

type BuyerRow = {
  buyerId: string;
  storeName: string;
  owner: string;
  phone: string;
  email: string;
  status: string;
};

type ProductRow = { productId: string; name: string };
type OfferRow = { offerId: string; notes: string | null; description: string | null; status: string };

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function statusRank(status: string): number {
  if (status === 'Active') return 0;
  if (status === 'Prospect') return 1;
  return 2;
}

function uniqueQueries(values: unknown[]): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    const key = norm(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    queries.push(text);
  }
  return queries.slice(0, 20);
}

function pickBuyer(query: string, buyers: BuyerRow[]): BuyerRow | null {
  const q = norm(query);
  if (!q) return null;
  const exact = buyers
    .filter((buyer) => norm(buyer.buyerId) === q || norm(buyer.storeName) === q || norm(buyer.owner) === q)
    .sort((left, right) => statusRank(left.status) - statusRank(right.status));
  if (exact[0]) return exact[0];
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 8) {
    const tail = digits.slice(-10);
    const phone = buyers.find((buyer) => buyer.phone.replace(/\D/g, '').endsWith(tail));
    if (phone) return phone;
  }
  if (q.length < 4) return null;
  const partial = buyers.filter((buyer) => {
    const store = norm(buyer.storeName);
    const owner = norm(buyer.owner);
    return store.includes(q) || owner.includes(q) || (store.length >= 4 && q.includes(store));
  });
  return partial.length === 1 ? partial[0]! : null;
}

function pickProduct(query: string, products: ProductRow[]): ProductRow | null {
  const q = norm(query);
  if (!q) return null;
  const exact = products.find((product) => norm(product.productId) === q || norm(product.name) === q);
  if (exact) return exact;
  if (q.length < 4) return null;
  const partial = products.filter((product) => norm(product.name).includes(q));
  return partial.length === 1 ? partial[0]! : null;
}

function offerLabel(offer: OfferRow): string {
  return (offer.notes || offer.description || offer.offerId).replace(/\s+/g, ' ').trim().slice(0, 120);
}

function pickOffer(query: string, offers: OfferRow[]): OfferRow | null {
  const q = norm(query);
  if (!q) return null;
  const exact = offers.find((offer) => norm(offer.offerId) === q || norm(offerLabel(offer)) === q);
  if (exact) return exact;
  if (q.length < 4) return null;
  const partial = offers.filter((offer) => norm(offerLabel(offer)).includes(q));
  return partial.length === 1 ? partial[0]! : null;
}

function hasKind(catalogType: string, kind: 'buyer' | 'product' | 'offer'): boolean {
  return fieldsForCatalogType(catalogType).some((field) => field.kind === kind);
}

async function loadRecords(userId: number) {
  const [buyers, products, offers] = await Promise.all([
    prisma.buyer.findMany({
      where: { userId },
      select: { buyerId: true, storeName: true, owner: true, phone: true, email: true, status: true },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    }),
    prisma.product.findMany({
      where: { userId },
      select: { productId: true, name: true },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    }),
    prisma.offer.findMany({
      where: { userId },
      select: { offerId: true, notes: true, description: true, status: true },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    }),
  ]);
  return { buyers, products, offers };
}

function resolveUpdate(
  update: WorkflowFieldUpdate,
  records: Awaited<ReturnType<typeof loadRecords>>,
): { config: Record<string, unknown>; missing: string[] } {
  const config: Record<string, unknown> = { ...update.config };
  const missing: string[] = [];
  delete config.buyers;
  delete config.products;

  if (hasKind(update.type, 'buyer')) {
    const queries = uniqueQueries([
      ...(Array.isArray(update.config.buyers) ? update.config.buyers : []),
      update.config.buyerId,
    ]);
    const picked: BuyerRow[] = [];
    for (const query of queries) {
      const hit = pickBuyer(query, records.buyers);
      if (hit && !picked.some((buyer) => buyer.buyerId === hit.buyerId)) picked.push(hit);
      else if (!hit) missing.push(query);
    }
    if (picked.length) {
      config.selectedBuyers = picked.map((buyer) => ({
        buyerId: buyer.buyerId,
        buyerLabel: buyer.storeName || buyer.owner,
        buyerPhone: buyer.phone,
        buyerEmail: buyer.email,
      }));
      config.buyerId = picked[0]!.buyerId;
      config.buyerLabel = picked[0]!.storeName || picked[0]!.owner;
      config.buyerPhone = picked[0]!.phone;
      config.buyerEmail = picked[0]!.email;
    } else if (queries.length) {
      delete config.buyerId;
    }
  } else {
    delete config.buyerId;
  }

  if (hasKind(update.type, 'product')) {
    const queries = uniqueQueries([
      ...(Array.isArray(update.config.products) ? update.config.products : []),
      update.config.productId,
    ]);
    const picked: ProductRow[] = [];
    for (const query of queries) {
      const hit = pickProduct(query, records.products);
      if (hit && !picked.some((product) => product.productId === hit.productId)) picked.push(hit);
      else if (!hit) missing.push(query);
    }
    if (picked.length) {
      config.selectedProducts = picked.map((product) => ({
        productId: product.productId,
        productLabel: product.name,
        variantId: '',
        variantLabel: '',
      }));
      config.productId = picked[0]!.productId;
      config.productLabel = picked[0]!.name;
      config.variantId = '';
      config.variantLabel = '';
    } else if (queries.length) {
      delete config.productId;
    }
  } else {
    delete config.productId;
  }

  if (hasKind(update.type, 'offer')) {
    const query = String(update.config.offerId ?? '').trim();
    if (query) {
      const hit = pickOffer(query, records.offers);
      if (hit) {
        const label = offerLabel(hit);
        config.selectedOffers = [{ offerId: hit.offerId, offerLabel: label, offerStatus: hit.status }];
        config.offerId = hit.offerId;
        config.offerLabel = label;
        config.offerStatus = hit.status;
      } else {
        missing.push(query);
        delete config.offerId;
      }
    }
  } else {
    delete config.offerId;
  }

  return { config, missing };
}

/** Turns store and product names into the picker fields the canvas already saves. */
function mentionsPhrase(haystack: string, phrase: string): boolean {
  const hay = haystack.toLowerCase();
  const needle = phrase.toLowerCase();
  let from = 0;
  while (from < hay.length) {
    const index = hay.indexOf(needle, from);
    if (index < 0) return false;
    const before = hay[index - 1] ?? '';
    const after = hay[index + needle.length] ?? '';
    const boundary = (char: string) => char === '' || /[^a-z0-9-]/i.test(char);
    if (boundary(before) && boundary(after)) return true;
    from = index + needle.length;
  }
  return false;
}

function mentionedStores(message: string, buyers: BuyerRow[]): string[] {
  const names: string[] = [];
  for (const buyer of buyers) {
    const store = buyer.storeName.trim();
    if (store.length < 4 || !mentionsPhrase(message, store)) continue;
    if (!names.some((name) => name.toLowerCase() === store.toLowerCase())) names.push(store);
  }
  return names.slice(0, 20);
}

export async function resolveWorkflowInputs(
  userId: number,
  updates: WorkflowFieldUpdate[],
  context?: { message?: string; canvasTypes?: string[] },
): Promise<{ updates: WorkflowFieldUpdate[]; missing: string[] }> {
  const pending = updates.map((update) => ({ type: update.type, config: { ...update.config } }));
  let records: Awaited<ReturnType<typeof loadRecords>>;
  try {
    records = await loadRecords(userId);
  } catch {
    const missing = updates.flatMap((update) =>
      uniqueQueries([
        ...(Array.isArray(update.config.buyers) ? update.config.buyers : []),
        ...(Array.isArray(update.config.products) ? update.config.products : []),
      ]),
    );
    return {
      updates: pending.map((update) => {
        const config = { ...update.config };
        delete config.buyers;
        delete config.products;
        return { type: update.type, config };
      }),
      missing,
    };
  }
  const mentioned = context?.message ? mentionedStores(context.message, records.buyers) : [];
  if (mentioned.length) {
    const buyerType =
      pending.find((update) => hasKind(update.type, 'buyer'))?.type ??
      context?.canvasTypes?.find((type) => hasKind(type, 'buyer'));
    if (buyerType) {
      const current = pending.find((update) => update.type === buyerType);
      const existing = Array.isArray(current?.config.buyers) ? current.config.buyers : [];
      const buyers = uniqueQueries([...existing, ...mentioned]);
      if (current) current.config.buyers = buyers;
      else pending.push({ type: buyerType, config: { buyers } });
    }
  }
  if (!pending.length) return { updates: [], missing: [] };
  const missing: string[] = [];
  const resolved: WorkflowFieldUpdate[] = [];
  for (const update of pending) {
    const next = resolveUpdate(update, records);
    missing.push(...next.missing);
    if (Object.keys(next.config).length) resolved.push({ type: update.type, config: next.config });
  }
  return { updates: resolved, missing };
}

/** Short real names so the model can pick a buyer or product without inventing an id. */
export async function workflowRecordHints(userId: number): Promise<string> {
  try {
    const records = await loadRecords(userId);
    const buyers = records.buyers
      .slice(0, 40)
      .map((buyer) => `${buyer.storeName || buyer.owner} (${buyer.status})`)
      .join(', ');
    const products = records.products
      .slice(0, 40)
      .map((product) => product.name)
      .join(', ');
    const offers = records.offers
      .slice(0, 20)
      .map((offer) => offerLabel(offer))
      .join(', ');
    return [
      `Buyers on this account: ${buyers || 'none'}.`,
      `Products on this account: ${products || 'none'}.`,
      `Offers on this account: ${offers || 'none'}.`,
    ].join('\n');
  } catch {
    return '';
  }
}
