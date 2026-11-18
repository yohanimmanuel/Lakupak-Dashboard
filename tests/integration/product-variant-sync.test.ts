import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { updateProduct } from '@/app/api/graphql/modules/products';
import { fetchMarketplaceProducts } from '@/app/api/graphql/modules/marketplace/handlers/products';
import { resetDb } from './helpers';
import {
  createMinimalOrderForVariant,
  createPublishedProductWithColorVariants,
  createTestDistributor,
} from './helpers/productFixtures';

function colorOptionsFromDefinitions(
  variants: Array<{ variantType: string; options: unknown }> | undefined,
): string[] {
  const colorDef = variants?.find((v) => v.variantType === 'Color');
  return Array.isArray(colorDef?.options) ? (colorDef!.options as string[]) : [];
}

describe('products.updateProduct + marketplace variant sync (integration)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('removes a never-ordered color from definitions and marketplace after update', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-VAR-SYNC-1';
    await createPublishedProductWithColorVariants(distributor.id, productId);

    const productRow = await prisma.product.findFirst({
      where: { productId },
      select: { id: true },
    });
    expect(productRow).not.toBeNull();

    await updateProduct({
      userId: distributor.id,
      productId,
      variantDefinitions: [
        { variantType: 'Color', options: ['Black', 'White'], position: 0 },
        { variantType: 'Size', options: ['M'], position: 1 },
      ],
      variantOptions: [
        {
          variantName: 'Color: Black | Size: M',
          attributes: { Color: 'Black', Size: 'M' },
          sku: `SKU-${productId}-BLACK`,
          purchasePrice: '1000',
          sellingPrice: '2000',
          originalSellingPrice: '2000',
          moq: 1,
          stockQuantity: 10,
          lowStockThreshold: 0,
          stockStatus: 'In Stock',
          isDefault: true,
          isActive: true,
        },
        {
          variantName: 'Color: White | Size: M',
          attributes: { Color: 'White', Size: 'M' },
          sku: `SKU-${productId}-WHITE`,
          purchasePrice: '1000',
          sellingPrice: '2000',
          originalSellingPrice: '2000',
          moq: 1,
          stockQuantity: 10,
          lowStockThreshold: 0,
          stockStatus: 'In Stock',
          isDefault: false,
          isActive: true,
        },
      ],
    });

    const defs = await prisma.productVariant.findMany({
      where: { productId: productRow!.id },
      select: { variantType: true, options: true },
    });
    expect(colorOptionsFromDefinitions(defs)).toEqual(expect.arrayContaining(['Black', 'White']));
    expect(colorOptionsFromDefinitions(defs)).not.toContain('Yellow');

    const yellowRow = await prisma.variantOption.findFirst({
      where: { productId: productRow!.id, variantName: { contains: 'Yellow' } },
    });
    expect(yellowRow).toBeNull();

    const listing = await fetchMarketplaceProducts({ search: 'Sync Test Shirt', limit: 20 });
    const node = listing.nodes.find(
      (n) => (n as { id?: string }).id === productId,
    ) as { variants?: Array<{ variantType: string; options: string[] }>; variantOptions?: Array<{ attributes: Record<string, string> }> } | undefined;
    expect(node).toBeTruthy();
    const colorDef = node?.variants?.find((v) => v.variantType === 'Color');
    expect(colorDef?.options ?? []).not.toContain('Yellow');
    const activeColors = (node?.variantOptions ?? []).map((vo) => vo.attributes?.Color).filter(Boolean);
    expect(activeColors).not.toContain('Yellow');
  });

  it('deletes an ordered variant while preserving order snapshots; marketplace hides the removed option', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-VAR-SYNC-2';
    await createPublishedProductWithColorVariants(distributor.id, productId);

    const productRow = await prisma.product.findFirst({
      where: { productId },
      select: { id: true },
    });
    const yellow = await prisma.variantOption.findFirst({
      where: { productId: productRow!.id, variantName: { contains: 'Yellow' } },
      select: { id: true, variantName: true },
    });
    expect(yellow).not.toBeNull();

    await createMinimalOrderForVariant({
      distributorUserId: distributor.id,
      productId,
      variantOptionId: yellow!.id,
      variantNameSnapshot: yellow!.variantName,
      orderId: 'LKO-VAR-SYNC-2',
    });

    await updateProduct({
      userId: distributor.id,
      productId,
      variantDefinitions: [
        { variantType: 'Color', options: ['Black', 'White'], position: 0 },
        { variantType: 'Size', options: ['M'], position: 1 },
      ],
      variantOptions: [
        {
          variantName: 'Color: Black | Size: M',
          attributes: { Color: 'Black', Size: 'M' },
          sku: `SKU-${productId}-BLACK`,
          purchasePrice: '1000',
          sellingPrice: '2000',
          originalSellingPrice: '2000',
          moq: 1,
          stockQuantity: 10,
          lowStockThreshold: 0,
          stockStatus: 'In Stock',
          isDefault: true,
          isActive: true,
        },
        {
          variantName: 'Color: White | Size: M',
          attributes: { Color: 'White', Size: 'M' },
          sku: `SKU-${productId}-WHITE`,
          purchasePrice: '1000',
          sellingPrice: '2000',
          originalSellingPrice: '2000',
          moq: 1,
          stockQuantity: 10,
          lowStockThreshold: 0,
          stockStatus: 'In Stock',
          isDefault: false,
          isActive: true,
        },
      ],
    });

    const yellowAfter = await prisma.variantOption.findUnique({ where: { id: yellow!.id } });
    expect(yellowAfter).toBeNull();

    const historicalOrderItem = await prisma.orderItem.findFirst({
      where: { orderId: 'LKO-VAR-SYNC-2' },
      select: {
        variantOptionId: true,
        productNameSnapshot: true,
        productSkuSnapshot: true,
        variantNameSnapshot: true,
        variantAttributesSnapshot: true,
      },
    });
    expect(historicalOrderItem?.variantOptionId).toBeNull();
    expect(historicalOrderItem?.productNameSnapshot).toBe('Sync Test Shirt');
    expect(historicalOrderItem?.variantNameSnapshot).toBe(yellow!.variantName);
    expect(historicalOrderItem?.variantAttributesSnapshot).toEqual({ Color: 'Yellow', Size: 'M' });

    // Removed options disappear from the editable product definitions as well.
    const defs = await prisma.productVariant.findMany({
      where: { productId: productRow!.id, variantType: 'Color' },
      select: { options: true },
    });
    const colorOpts = Array.isArray(defs[0]?.options) ? (defs[0]!.options as string[]) : [];
    expect(colorOpts).not.toContain('Yellow');

    const listing = await fetchMarketplaceProducts({ search: 'Sync Test Shirt', limit: 20 });
    const node = listing.nodes.find(
      (n) => (n as { id?: string }).id === productId,
    ) as { variantOptions?: Array<{ attributes: Record<string, string> }> } | undefined;
    const activeColors = (node?.variantOptions ?? []).map((vo) => vo.attributes?.Color);
    expect(activeColors).not.toContain('Yellow');
  });

  it('allows removing a variant type referenced by an order and preserves the order snapshot', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-VAR-SYNC-4';
    await createPublishedProductWithColorVariants(distributor.id, productId);

    const product = await prisma.product.findFirst({ where: { productId }, select: { id: true } });
    const colorDefinition = await prisma.productVariant.findFirst({
      where: { productId: product!.id, variantType: 'Color' },
      select: { id: true },
    });
    const yellow = await prisma.variantOption.findFirst({
      where: { productId: product!.id, variantName: { contains: 'Yellow' } },
      select: { id: true, variantName: true },
    });
    expect(colorDefinition).not.toBeNull();
    expect(yellow).not.toBeNull();

    await createMinimalOrderForVariant({
      distributorUserId: distributor.id,
      productId,
      variantOptionId: yellow!.id,
      variantNameSnapshot: yellow!.variantName,
      variantId: colorDefinition!.id,
      orderId: 'LKO-VAR-SYNC-4',
    });

    await updateProduct({
      userId: distributor.id,
      productId,
      variantDefinitions: [{ variantType: 'Size', options: ['M'], position: 0 }],
    });

    const item = await prisma.orderItem.findFirst({
      where: { orderId: 'LKO-VAR-SYNC-4' },
      select: { variantId: true, variantOptionId: true, variantNameSnapshot: true, variantAttributesSnapshot: true },
    });
    expect(item?.variantId).toBeNull();
    expect(item?.variantOptionId).toBe(yellow!.id);
    expect(item?.variantNameSnapshot).toBe(yellow!.variantName);
    expect(item?.variantAttributesSnapshot).toEqual({ Color: 'Yellow', Size: 'M' });

    const colorDefinitionAfter = await prisma.productVariant.findFirst({
      where: { productId: product!.id, variantType: 'Color' },
    });
    expect(colorDefinitionAfter).toBeNull();
  });

  it('allows editing a variant option tied to past orders without changing the order snapshot', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-VAR-SYNC-3';
    await createPublishedProductWithColorVariants(distributor.id, productId);

    const yellow = await prisma.variantOption.findFirst({
      where: {
        product: { productId },
        variantName: { contains: 'Yellow' },
      },
      select: { id: true, variantName: true },
    });
    expect(yellow).not.toBeNull();

    await createMinimalOrderForVariant({
      distributorUserId: distributor.id,
      productId,
      variantOptionId: yellow!.id,
      variantNameSnapshot: yellow!.variantName,
      orderId: 'LKO-VAR-SYNC-3',
    });

    await updateProduct({
      userId: distributor.id,
      productId,
      variantOptions: [
        {
          variantName: 'Color: Yellow | Size: M',
          attributes: { Color: 'Gold', Size: 'M' },
          sku: `SKU-${productId}-YELLOW`,
          purchasePrice: '1000',
          sellingPrice: '2000',
          originalSellingPrice: '2000',
          moq: 1,
          stockQuantity: 10,
          lowStockThreshold: 0,
          stockStatus: 'In Stock',
          isDefault: false,
          isActive: true,
        },
      ],
    });

    const currentVariant = await prisma.variantOption.findUnique({ where: { id: yellow!.id } });
    expect(currentVariant?.attributes).toEqual({ Color: 'Gold', Size: 'M' });
    const historicalOrderItem = await prisma.orderItem.findFirst({
      where: { orderId: 'LKO-VAR-SYNC-3' },
      select: { variantOptionId: true, variantNameSnapshot: true, variantAttributesSnapshot: true },
    });
    expect(historicalOrderItem?.variantOptionId).toBe(yellow!.id);
    expect(historicalOrderItem?.variantNameSnapshot).toBe(yellow!.variantName);
    expect(historicalOrderItem?.variantAttributesSnapshot).toEqual({ Color: 'Yellow', Size: 'M' });
  });
});
