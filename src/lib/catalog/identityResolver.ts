import type { Prisma, PrismaClient } from '@/lib/prisma-generated';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type CatalogIdentityInput = {
  productId?: string | null;
  variantOptionId?: number | string | null;
  productName?: string | null;
  variantName?: string | null;
  sku?: string | null;
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

/** Normalize labels for deterministic comparison without persisting legacy aliases. */
export function normalizeCatalogIdentity(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[‐‑‒–—]/g, '-');
}

function asCandidate(
  product: { productId: string; name: string },
  variant: { id: number; variantName: string; sku: string | null },
): CatalogIdentityCandidate {
  return {
    productId: product.productId,
    productName: product.name,
    variantOptionId: variant.id,
    variantName: variant.variantName,
    sku: variant.sku,
  };
}

/**
 * Resolve an existing buyer/supplier row against the current catalog using only
 * deterministic identifiers. No legacy alias table or persistent alias writes
 * are used. A SKU must uniquely identify one active variant within the user.
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
    if (exact.length === 1) {
      return { status: 'matched', candidate: exact[0].candidate, matchedBy: 'variantOptionId' };
    }
  }

  if (productId) {
    const sameProduct = all.filter((entry) => entry.product.productId === productId);
    const exactVariant = variantName
      ? sameProduct.filter((entry) => normalizeCatalogIdentity(entry.variant.variantName) === variantName)
      : sameProduct;
    if (exactVariant.length === 1) {
      return { status: 'matched', candidate: exactVariant[0].candidate, matchedBy: 'productId+variantName' };
    }
    if (exactVariant.length > 1) {
      return { status: 'ambiguous', candidates: exactVariant.map((entry) => entry.candidate), matchedBy: 'productId+variantName' };
    }
  }

  if (sku) {
    const matches = all.filter((entry) => normalizeCatalogIdentity(entry.variant.sku) === sku);
    if (matches.length === 1) {
      return { status: 'matched', candidate: matches[0].candidate, matchedBy: 'uniqueSku' };
    }
    if (matches.length > 1) {
      return { status: 'ambiguous', candidates: matches.map((entry) => entry.candidate), matchedBy: 'sku' };
    }
  }

  if (productName || variantName) {
    const matches = all.filter((entry) =>
      (!productName || normalizeCatalogIdentity(entry.product.name) === productName) &&
      (!variantName || normalizeCatalogIdentity(entry.variant.variantName) === variantName),
    );
    if (matches.length === 1) {
      return { status: 'matched', candidate: matches[0].candidate, matchedBy: 'productName+variantName' };
    }
    if (matches.length > 1) {
      return { status: 'ambiguous', candidates: matches.map((entry) => entry.candidate), matchedBy: 'productName+variantName' };
    }
  }

  return { status: 'unmatched', candidates: [] };
}
