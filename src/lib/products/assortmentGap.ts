import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/prisma-generated';
import { getMerchandisingLabel } from '@/constants/merchandisingTaxonomy';
import {
  PREFERRED_ASSORTMENT_SEGMENTS,
  type AssortmentCellKind,
  type AssortmentSegment,
} from '@/lib/products/assortmentGapShared';

export type { AssortmentCellKind, AssortmentSegment };
export { PREFERRED_ASSORTMENT_SEGMENTS, PREFERRED_ASSORTMENT_SEGMENTS as ASSORTMENT_SEGMENTS };

const ELIGIBLE_STATUSES = ['active', 'prospect'] as const;

export type AssortmentGapCell = {
  segment: AssortmentSegment;
  purchased: number;
  eligible: number;
  /** Null when the segment has no eligible retailers (missing data, not 0%). */
  penetration: number | null;
  kind: AssortmentCellKind;
};

export type AssortmentGapRow = {
  productId: string;
  name: string;
  sku: string;
  categorySlug: string | null;
  categoryLabel: string | null;
  cells: AssortmentGapCell[];
};

export type AssortmentGapVariantRow = {
  variantOptionId: number;
  variantName: string;
  sku: string | null;
  cells: AssortmentGapCell[];
};

export type AssortmentGapVariantResult = {
  productId: string;
  name: string;
  sku: string;
  segments: AssortmentSegment[];
  period: string;
  from: string | null;
  rows: AssortmentGapVariantRow[];
};

export type AssortmentGapCategory = {
  slug: string;
  label: string;
};

export type AssortmentGapResult = {
  segments: AssortmentSegment[];
  period: string;
  from: string | null;
  rows: AssortmentGapRow[];
  categories: AssortmentGapCategory[];
  totalProducts: number;
  page: number;
  limit: number;
};

const PERIOD_DAYS: Record<string, number> = {
  '30d': 30,
  '90d': 90,
  '180d': 180,
  '365d': 365,
};

function titleCaseSegment(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function preferredLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  const preferred = PREFERRED_ASSORTMENT_SEGMENTS.find((segment) => segment.toLowerCase() === key);
  return preferred ?? titleCaseSegment(raw);
}

function cellKind(purchased: number, eligible: number): { kind: AssortmentCellKind; penetration: number | null } {
  if (eligible <= 0) return { kind: 'missing', penetration: null };
  if (purchased <= 0) return { kind: 'zero', penetration: 0 };
  const penetration = Math.round((purchased / eligible) * 1000) / 10;
  if (penetration < 34) return { kind: 'low', penetration };
  if (penetration < 67) return { kind: 'medium', penetration };
  return { kind: 'high', penetration };
}

function periodStart(period: string): Date | null {
  const days = PERIOD_DAYS[period];
  if (!days) return null;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return start;
}

function sortSegments(labels: string[]): AssortmentSegment[] {
  const unique = new Map<string, string>();
  for (const label of labels) {
    const cleaned = preferredLabel(label);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!unique.has(key)) unique.set(key, cleaned);
  }

  const preferred = PREFERRED_ASSORTMENT_SEGMENTS.filter((segment) => unique.has(segment.toLowerCase()));
  const preferredKeys = new Set(preferred.map((segment) => segment.toLowerCase()));
  const rest = [...unique.values()]
    .filter((segment) => !preferredKeys.has(segment.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  return [...preferred, ...rest];
}

async function loadSegmentsForUser(userId: number, requestedSegment?: string | null): Promise<AssortmentSegment[]> {
  const requested = requestedSegment?.trim() || '';
  if (requested && requested.toLowerCase() !== 'all') {
    return [preferredLabel(requested)];
  }

  const rows = await prisma.$queryRaw<Array<{ segment: string }>>`
    SELECT TRIM("businessType") AS segment
    FROM "Buyer"
    WHERE "userId" = ${userId}
      AND LOWER(TRIM("status")) IN (${Prisma.join([...ELIGIBLE_STATUSES])})
      AND TRIM(COALESCE("businessType", '')) <> ''
    GROUP BY 1
  `;

  const discovered = sortSegments(rows.map((row) => row.segment).filter(Boolean));
  return discovered.length > 0 ? discovered : [...PREFERRED_ASSORTMENT_SEGMENTS];
}

function buildCells(
  segments: AssortmentSegment[],
  eligibleBySegment: Map<string, number>,
  purchasedBySegment: Map<string, number> | undefined,
): AssortmentGapCell[] {
  return segments.map((segment) => {
    const key = segment.toLowerCase();
    const eligible = eligibleBySegment.get(key) ?? 0;
    const bought = purchasedBySegment?.get(key) ?? 0;
    const safePurchased = eligible > 0 ? Math.min(bought, eligible) : 0;
    const scored = cellKind(safePurchased, eligible);
    return {
      segment,
      purchased: safePurchased,
      eligible,
      penetration: scored.penetration,
      kind: scored.kind,
    };
  });
}

export async function computeAssortmentGap(args: {
  userId: number;
  category?: string | null;
  segment?: string | null;
  period?: string | null;
  search?: string | null;
  page?: number | null;
  limit?: number | null;
}): Promise<AssortmentGapResult> {
  const userId = args.userId;
  const period = args.period && PERIOD_DAYS[args.period] ? args.period : args.period === 'all' ? 'all' : '90d';
  const from = periodStart(period);
  const segments = await loadSegmentsForUser(userId, args.segment);
  const segmentKeys = segments.map((segment) => segment.toLowerCase());
  const categorySlug = args.category && args.category !== 'all' ? args.category.trim() : '';
  const search = args.search?.trim() ?? '';
  const page = Math.max(1, Number(args.page) || 1);
  const limit = Math.min(6, Math.max(1, Number(args.limit) || 6));

  const productWhere = {
    userId,
    ...(categorySlug ? { merchandisingCategorySlug: categorySlug } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [totalProducts, catalog, categoryRows, eligibleRows] = await Promise.all([
    prisma.product.count({ where: productWhere }),
    prisma.product.findMany({
      where: productWhere,
      select: {
        productId: true,
        name: true,
        sku: true,
        merchandisingCategorySlug: true,
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.findMany({
      where: { userId, merchandisingCategorySlug: { not: null } },
      select: { merchandisingCategorySlug: true },
      distinct: ['merchandisingCategorySlug'],
    }),
    prisma.$queryRaw<Array<{ segment: string; eligible: number }>>`
      SELECT LOWER(TRIM("businessType")) AS segment,
             COUNT(*)::int AS eligible
      FROM "Buyer"
      WHERE "userId" = ${userId}
        AND LOWER(TRIM("status")) IN (${Prisma.join([...ELIGIBLE_STATUSES])})
        AND LOWER(TRIM("businessType")) IN (${Prisma.join(segmentKeys)})
      GROUP BY 1
    `,
  ]);

  const eligibleBySegment = new Map<string, number>();
  for (const row of eligibleRows) {
    eligibleBySegment.set(row.segment, Number(row.eligible) || 0);
  }

  const productIds = catalog.map((product) => product.productId);
  const purchasedByProduct = new Map<string, Map<string, number>>();

  if (productIds.length > 0) {
    const periodSql = from ? Prisma.sql`AND o."orderDate" >= ${from}` : Prisma.empty;
    const purchasedRows = await prisma.$queryRaw<Array<{ productId: string; segment: string; purchased: number }>>`
      SELECT oi."productId" AS "productId",
             LOWER(TRIM(b."businessType")) AS segment,
             COUNT(DISTINCT o."buyerId")::int AS purchased
      FROM "OrderItem" oi
      INNER JOIN "Order" o ON o."orderId" = oi."orderId"
      INNER JOIN "Buyer" b ON b."buyerId" = o."buyerId" AND b."userId" = o."userId"
      WHERE o."userId" = ${userId}
        AND o."isDeleted" = false
        AND o."buyerId" IS NOT NULL
        AND oi."productId" IS NOT NULL
        AND LOWER(TRIM(o."orderStatus")) NOT IN ('cancelled', 'canceled')
        AND LOWER(TRIM(b."status")) IN (${Prisma.join([...ELIGIBLE_STATUSES])})
        AND LOWER(TRIM(b."businessType")) IN (${Prisma.join(segmentKeys)})
        AND oi."productId" IN (${Prisma.join(productIds)})
        ${periodSql}
      GROUP BY oi."productId", LOWER(TRIM(b."businessType"))
    `;

    for (const row of purchasedRows) {
      const bySegment = purchasedByProduct.get(row.productId) ?? new Map<string, number>();
      bySegment.set(row.segment, Number(row.purchased) || 0);
      purchasedByProduct.set(row.productId, bySegment);
    }
  }

  const categories: AssortmentGapCategory[] = categoryRows
    .map((row) => row.merchandisingCategorySlug)
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => ({ slug, label: getMerchandisingLabel(slug) || slug }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const rows: AssortmentGapRow[] = catalog.map((product) => ({
    productId: product.productId,
    name: product.name,
    sku: product.sku,
    categorySlug: product.merchandisingCategorySlug,
    categoryLabel: getMerchandisingLabel(product.merchandisingCategorySlug) || product.merchandisingCategorySlug,
    cells: buildCells(segments, eligibleBySegment, purchasedByProduct.get(product.productId)),
  }));

  return {
    segments,
    period,
    from: from ? from.toISOString() : null,
    rows,
    categories,
    totalProducts,
    page,
    limit,
  };
}

export async function computeAssortmentGapVariants(args: {
  userId: number;
  productId: string;
  segment?: string | null;
  period?: string | null;
}): Promise<AssortmentGapVariantResult> {
  const userId = args.userId;
  const productId = String(args.productId || '').trim();
  const period = args.period && PERIOD_DAYS[args.period] ? args.period : args.period === 'all' ? 'all' : '90d';
  const from = periodStart(period);
  const segments = await loadSegmentsForUser(userId, args.segment);
  const segmentKeys = segments.map((segment) => segment.toLowerCase());

  const product = await prisma.product.findFirst({
    where: { userId, productId },
    select: {
      id: true,
      productId: true,
      name: true,
      sku: true,
      variantOptions: {
        where: { isActive: true },
        select: { id: true, variantName: true, sku: true },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!product) {
    throw new Error('Product not found');
  }

  const [eligibleRows, purchasedRows] = await Promise.all([
    prisma.$queryRaw<Array<{ segment: string; eligible: number }>>`
      SELECT LOWER(TRIM("businessType")) AS segment,
             COUNT(*)::int AS eligible
      FROM "Buyer"
      WHERE "userId" = ${userId}
        AND LOWER(TRIM("status")) IN (${Prisma.join([...ELIGIBLE_STATUSES])})
        AND LOWER(TRIM("businessType")) IN (${Prisma.join(segmentKeys)})
      GROUP BY 1
    `,
    (async () => {
      const periodSql = from ? Prisma.sql`AND o."orderDate" >= ${from}` : Prisma.empty;
      return prisma.$queryRaw<
        Array<{ variantOptionId: number | null; variantName: string | null; segment: string; purchased: number }>
      >`
        SELECT oi."variantOptionId" AS "variantOptionId",
               oi."variantNameSnapshot" AS "variantName",
               LOWER(TRIM(b."businessType")) AS segment,
               COUNT(DISTINCT o."buyerId")::int AS purchased
        FROM "OrderItem" oi
        INNER JOIN "Order" o ON o."orderId" = oi."orderId"
        INNER JOIN "Buyer" b ON b."buyerId" = o."buyerId" AND b."userId" = o."userId"
        WHERE o."userId" = ${userId}
          AND o."isDeleted" = false
          AND o."buyerId" IS NOT NULL
          AND oi."productId" = ${product.productId}
          AND LOWER(TRIM(o."orderStatus")) NOT IN ('cancelled', 'canceled')
          AND LOWER(TRIM(b."status")) IN (${Prisma.join([...ELIGIBLE_STATUSES])})
          AND LOWER(TRIM(b."businessType")) IN (${Prisma.join(segmentKeys)})
          ${periodSql}
        GROUP BY oi."variantOptionId", oi."variantNameSnapshot", LOWER(TRIM(b."businessType"))
      `;
    })(),
  ]);

  const eligibleBySegment = new Map<string, number>();
  for (const row of eligibleRows) {
    eligibleBySegment.set(row.segment, Number(row.eligible) || 0);
  }

  const purchasedByVariant = new Map<string, Map<string, number>>();
  const addPurchased = (key: string, segment: string, count: number) => {
    const bySegment = purchasedByVariant.get(key) ?? new Map<string, number>();
    bySegment.set(segment, (bySegment.get(segment) ?? 0) + count);
    purchasedByVariant.set(key, bySegment);
  };
  for (const row of purchasedRows) {
    const count = Number(row.purchased) || 0;
    if (row.variantOptionId != null) addPurchased(`id:${row.variantOptionId}`, row.segment, count);
    const name = row.variantName?.trim();
    if (name) addPurchased(`name:${name.toLowerCase()}`, row.segment, count);
  }

  const catalogVariants = product.variantOptions.length
    ? product.variantOptions
    : [{ id: 0, variantName: product.name, sku: product.sku }];

  const rows: AssortmentGapVariantRow[] = catalogVariants.map((variant) => {
    const purchased =
      purchasedByVariant.get(`id:${variant.id}`) ??
      purchasedByVariant.get(`name:${variant.variantName.trim().toLowerCase()}`);
    return {
      variantOptionId: variant.id,
      variantName: variant.variantName,
      sku: variant.sku,
      cells: buildCells(segments, eligibleBySegment, purchased),
    };
  });

  return {
    productId: product.productId,
    name: product.name,
    sku: product.sku,
    segments,
    period,
    from: from ? from.toISOString() : null,
    rows,
  };
}
