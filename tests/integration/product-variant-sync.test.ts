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

  it('deactivates an ordered variant instead of deleting it; marketplace hides inactive options', async () => {
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

    const yellowAfter = await prisma.variantOption.findUnique({
      where: { id: yellow!.id },
      select: { isActive: true },
    });
    expect(yellowAfter?.isActive).toBe(false);

    // Locked by order history: Yellow remains in definition options for integrity.
    const defs = await prisma.productVariant.findMany({
      where: { productId: productRow!.id, variantType: 'Color' },
      select: { options: true },
    });
    const colorOpts = Array.isArray(defs[0]?.options) ? (defs[0]!.options as string[]) : [];
    expect(colorOpts).toContain('Yellow');

    const listing = await fetchMarketplaceProducts({ search: 'Sync Test Shirt', limit: 20 });
    const node = listing.nodes.find(
      (n) => (n as { id?: string }).id === productId,
    ) as { variantOptions?: Array<{ attributes: Record<string, string> }> } | undefined;
    const activeColors = (node?.variantOptions ?? []).map((vo) => vo.attributes?.Color);
    expect(activeColors).not.toContain('Yellow');
  });

  it('blocks attribute changes on a variant option tied to past orders', async () => {
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

    await expect(
      updateProduct({
        userId: distributor.id,
        productId,
        variantOptions: [
          {
            variantName: 'Color: Yellow | Size: M',
            attributes: { Color: 'Gold', Size: 'M' },
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
      }),
    ).rejects.toThrow(/used in past orders/i);
  });
});
