import { prisma } from '@/lib/db';
import { createProduct } from '@/app/api/graphql/modules/products';

export async function createDistributor(email?: string) {
  return prisma.user.create({
    data: { email: email ?? `dist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`, password: 'x' },
    select: { id: true },
  });
}

export async function createMarketplaceBuyer() {
  const suffix = Math.random().toString(36).slice(2, 8);
  return prisma.marketplaceUser.create({
    data: { username: `buyer_${suffix}`, phone: `+6200000${String(Date.now()).slice(-6)}` },
    select: { id: true },
  });
}

const COLOR_OPTIONS = ['Black', 'White', 'Blue', 'Yellow'] as const;

export function colorVariantDefinitions(colors: readonly string[] = COLOR_OPTIONS) {
  return [{ variantType: 'Color', options: [...colors], position: 0 }];
}

export function colorVariantOptionsPayload(colors: readonly string[] = COLOR_OPTIONS) {
  return colors.map((color, i) => ({
    variantName: `Color: ${color}`,
    attributes: { Color: color },
    purchasePrice: '1000',
    sellingPrice: '2000',
    originalSellingPrice: '2000',
    moq: 1,
    stockQuantity: 10,
    lowStockThreshold: 0,
    stockStatus: 'In Stock',
    isDefault: i === 0,
    isActive: true,
  }));
}

export async function createPublishedColorProduct(opts: {
  userId: number;
  productId: string;
  name: string;
  colors?: readonly string[];
}) {
  const colors = opts.colors ?? COLOR_OPTIONS;
  return createProduct({
    userId: opts.userId,
    productId: opts.productId,
    sku: `SKU-${opts.productId}`,
    name: opts.name,
    description: 'Integration test product',
    productType: 'Apparel',
    brand: 'TestBrand',
    supplier: 'TestSupplier',
    status: 'Published',
    productCategory: 'Retail',
    catalogName: 'Default',
    images: [],
    variantDefinitions: colorVariantDefinitions(colors),
    variantOptions: colorVariantOptionsPayload(colors),
  });
}

export function colorOptionsFromMarketplaceNode(node: {
  variants?: unknown;
  variantOptions?: Array<{ attributes?: unknown; isActive?: boolean }>;
}) {
  const defs = (node.variants ?? []) as Array<{ variantType?: string; options?: unknown }>;
  const colorDef = defs.find((d) => d.variantType === 'Color');
  const defOptions = Array.isArray(colorDef?.options) ? (colorDef!.options as string[]) : [];
  const activeAttrs = (node.variantOptions ?? [])
    .filter((vo) => vo.isActive !== false)
    .map((vo) => {
      const attrs = vo.attributes as Record<string, string> | null;
      return attrs?.Color ?? null;
    })
    .filter((v): v is string => !!v);
  return { defOptions, activeAttrs };
}
