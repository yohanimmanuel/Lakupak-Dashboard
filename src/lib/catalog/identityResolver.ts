import type { Prisma, PrismaClient } from '@/lib/prisma-generated';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type CatalogIdentityInput = {
  productId?: string | null;
  variantOptionId?: number | string | null;
  productName?: string | null;
  variantName?: string | null;
  sku?: string | null;
  externalSystem?: string | null;
  externalItemId?: string | null;
};

export type CatalogIdentityCandidate = {
  productId: string;
  productName: string;
  variantOptionId: number;
  variantName: string;
  sku: string | null;
};

export type CatalogIdentityResolution =
  | { status: 'matched'; candidate: CatalogIdentityCandidate; matchedBy: string }
  | { status: 'ambiguous'; candidates: CatalogIdentityCandidate[]; matchedBy: string }
  | { status: 'unmatched'; candidates: [] };

export function normalizeCatalogIdentity(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[‐‑‒–—]/g, '-');
}

function asCandidate(product: {
  productId: string;
  name: string;
  variantOptions: Array<{ id: number; variantName: string; sku: string | null }>;
}, variant: { id: number; variantName: string; sku: string | null }): CatalogIdentityCandidate {
  return {
    productId: product.productId,
    productName: product.name,
    variantOptionId: variant.id,
    variantName: variant.variantName,
    sku: variant.sku,
  };
}

/**
 * Resolve legacy/client-entered product identity into one canonical VariantOption.
 * Only unique or explicitly verified matches are automatic. Names and SKUs are
 * treated as aliases, never as permanent primary keys.
 */
export async function resolveCatalogIdentity(
  db: DbClient,
  userId: number,
  input: CatalogIdentityInput,
): Promise<CatalogIdentityResolution> {
  const productId = String(input.productId || '').trim();
  const variantId = Number(input.variantOptionId);
  const variantName = normalizeCatalogIdentity(input.variantName);
  const productName = normalizeCatalogIdentity(input.productName);
  const sku = normalizeCatalogIdentity(input.sku);
  const externalItemId = normalizeCatalogIdentity(input.externalItemId);
  const externalSystem = normalizeCatalogIdentity(input.externalSystem);

  const products = await db.product.findMany({
    where: { userId },
    select: {
      productId: true,
      name: true,
      variantOptions: {
        select: { id: true, variantName: true, sku: true, isActive: true },
      },
    },
  });

  const all = products.flatMap((product) =>
    product.variantOptions
      .filter((variant) => variant.isActive !== false)
      .map((variant) => ({ product, variant, candidate: asCandidate(product, variant) })),
  );

  if (Number.isSafeInteger(variantId) && variantId > 0) {
    const exact = all.filter((entry) => entry.variant.id === variantId);
    if (exact.length === 1) return { status: 'matched', candidate: exact[0].candidate, matchedBy: 'variantOptionId' };
  }

  if (productId) {
    const sameProduct = all.filter((entry) => entry.product.productId === productId);
    const exactVariant = variantName
      ? sameProduct.filter((entry) => normalizeCatalogIdentity(entry.variant.variantName) === variantName)
      : sameProduct;
    if (exactVariant.length === 1) return { status: 'matched', candidate: exactVariant[0].candidate, matchedBy: 'productId+variantName' };
    if (exactVariant.length > 1) return { status: 'ambiguous', candidates: exactVariant.map((entry) => entry.candidate), matchedBy: 'productId+variantName' };
  }

  const aliasFilters = [
    ...(productId ? [{ aliasType: 'product_id', normalizedValue: normalizeCatalogIdentity(productId) }] : []),
    ...(sku ? [{ aliasType: 'sku', normalizedValue: sku }] : []),
    ...(variantName ? [{ aliasType: 'variant_name', normalizedValue: variantName }] : []),
    ...(productName ? [{ aliasType: 'product_name', normalizedValue: productName }] : []),
    ...(externalItemId && externalSystem
      ? [{ aliasType: 'external_item_id', normalizedValue: externalSystem + ':' + externalItemId }]
      : []),
  ];
  if (aliasFilters.length) {
    const aliases = await db.catalogIdentityAlias.findMany({
      where: { userId, verified: true, OR: aliasFilters },
      select: { canonicalProductId: true, canonicalVariantOptionId: true },
    });
    const aliasVariantIds = [...new Set(aliases.map((alias) => alias.canonicalVariantOptionId).filter((id): id is number => id != null))];
    if (aliasVariantIds.length) {
      const matched = all.filter((entry) => aliasVariantIds.includes(entry.variant.id));
      if (matched.length === 1) return { status: 'matched', candidate: matched[0].candidate, matchedBy: 'verifiedAlias' };
      if (matched.length > 1) return { status: 'ambiguous', candidates: matched.map((entry) => entry.candidate), matchedBy: 'verifiedAlias' };
    }
  }

  if (sku) {
    const matches = all.filter((entry) => normalizeCatalogIdentity(entry.variant.sku) === sku);
    if (matches.length === 1) return { status: 'matched', candidate: matches[0].candidate, matchedBy: 'uniqueSku' };
    if (matches.length > 1) return { status: 'ambiguous', candidates: matches.map((entry) => entry.candidate), matchedBy: 'sku' };
  }

  if (productName || variantName) {
    const matches = all.filter((entry) =>
      (!productName || normalizeCatalogIdentity(entry.product.name) === productName) &&
      (!variantName || normalizeCatalogIdentity(entry.variant.variantName) === variantName),
    );
    if (matches.length === 1) return { status: 'matched', candidate: matches[0].candidate, matchedBy: 'productName+variantName' };
    if (matches.length > 1) return { status: 'ambiguous', candidates: matches.map((entry) => entry.candidate), matchedBy: 'productName+variantName' };
  }

  return { status: 'unmatched', candidates: [] };
}

/** Save a verified legacy alias only after the user has confirmed the target. */
export async function saveVerifiedCatalogAlias(
  db: DbClient,
  args: {
    userId: number;
    aliasType: string;
    aliasValue: string;
    canonicalProductId: string;
    canonicalVariantOptionId: number;
    source?: string;
    externalSystem?: string | null;
    legacyProductId?: string | null;
    legacyProductName?: string | null;
    legacyVariantName?: string | null;
    legacySku?: string | null;
  },
): Promise<void> {
  const aliasValue = String(args.aliasValue || '').trim();
  const normalizedValue = normalizeCatalogIdentity(aliasValue);
  if (!normalizedValue) throw new Error('Catalog alias value is required');

  const existing = await db.catalogIdentityAlias.findFirst({
    where: {
      userId: args.userId,
      aliasType: args.aliasType,
      normalizedValue,
      canonicalVariantOptionId: args.canonicalVariantOptionId,
    },
    select: { id: true },
  });
  const data = {
    aliasValue,
    normalizedValue,
    source: args.source || 'manual_reconciliation',
    externalSystem: args.externalSystem || null,
    legacyProductId: args.legacyProductId || null,
    legacyProductName: args.legacyProductName || null,
    legacyVariantName: args.legacyVariantName || null,
    legacySku: args.legacySku || null,
    canonicalProductId: args.canonicalProductId,
    canonicalVariantOptionId: args.canonicalVariantOptionId,
    verified: true,
  };
  if (existing) {
    await db.catalogIdentityAlias.update({ where: { id: existing.id }, data });
  } else {
    await db.catalogIdentityAlias.create({ data: { userId: args.userId, aliasType: args.aliasType, ...data } });
  }
}
