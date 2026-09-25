type JsonRecord = Record<string, unknown>;

export type BuyerContactRow = {
  buyerId: string;
  email: string;
  phone: string;
  owner: string;
  storeName: string;
};

export type BuyerContactSource = {
  buyerId: string;
  email: string | null;
  phone: string | null;
  owner: string;
  storeName: string;
};

/** Email/phone from the workflow node’s selectedBuyers (UI selection). */
export function pickedBuyerContactOverrides(
  config: JsonRecord | null | undefined,
): Map<string, { email: string; phone: string }> {
  const out = new Map<string, { email: string; phone: string }>();
  const list = config?.selectedBuyers;
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as JsonRecord;
    const buyerId = String(row.buyerId ?? '').trim();
    if (!buyerId) continue;
    out.set(buyerId, {
      email: String(row.buyerEmail ?? row.email ?? '').trim(),
      phone: String(row.buyerPhone ?? row.phone ?? '').trim(),
    });
  }
  return out;
}

/**
 * Preserve buyerIds order, dedupe by buyerId, and merge node vs DB contacts.
 * - prefer "config": node email/phone when valid
 * - prefer "db": DB email/phone when valid (channel buyer messages)
 */
export function orderBuyersWithContactOverrides(
  buyerIds: string[],
  buyers: BuyerContactSource[],
  config?: JsonRecord | null,
  opts?: { prefer?: 'config' | 'db' },
): BuyerContactRow[] {
  const prefer = opts?.prefer ?? 'config';
  const byId = new Map(buyers.map((b) => [b.buyerId, b]));
  const overrides = pickedBuyerContactOverrides(config);
  const ordered: BuyerContactRow[] = [];
  const seen = new Set<string>();
  for (const id of buyerIds) {
    const b = byId.get(id);
    if (!b || seen.has(b.buyerId)) continue;
    seen.add(b.buyerId);
    const overlay = overrides.get(b.buyerId);
    const dbEmail = String(b.email ?? '').trim();
    const dbPhone = String(b.phone ?? '').trim();
    const configEmail = overlay?.email ?? '';
    const configPhone = overlay?.phone ?? '';
    ordered.push({
      buyerId: b.buyerId,
      email:
        prefer === 'config'
          ? configEmail.includes('@')
            ? configEmail
            : dbEmail
          : dbEmail.includes('@')
            ? dbEmail
            : configEmail,
      phone: prefer === 'config' ? configPhone || dbPhone : dbPhone || configPhone,
      owner: b.owner,
      storeName: b.storeName,
    });
  }
  return ordered;
}
