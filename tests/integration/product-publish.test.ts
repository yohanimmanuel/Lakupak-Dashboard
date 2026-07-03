import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import {
  bulkPublishMarketplaceProducts,
  publishMarketplaceProduct,
} from '@/app/api/graphql/modules/products';
import { fetchMarketplaceProducts } from '@/app/api/graphql/modules/marketplace/handlers/products';
import * as websocketBroadcast from '@/utils/websocketBroadcast';
import { resetDb } from './helpers';
import {
  createDraftProductReadyToPublish,
  createDraftProductWithoutImages,
  createDraftProductWithoutStock,
  createTestDistributor,
} from './helpers/productFixtures';

describe('products.publishMarketplaceProduct (integration)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('publishes a draft product and surfaces it in marketplace listings', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-PUBLISH-1';
    await createDraftProductReadyToPublish(distributor.id, productId);

    const beforeListing = await fetchMarketplaceProducts({ search: 'Publish Test Product', limit: 20 });
    expect(beforeListing.nodes.some((n) => (n as { id?: string }).id === productId)).toBe(false);

    const result = await publishMarketplaceProduct({
      userId: distributor.id,
      productId,
      action: 'publish',
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/published/i);

    const row = await prisma.product.findFirst({
      where: { productId, userId: distributor.id },
      select: { status: true, marketplaceStatus: true, publishedAt: true },
    });
    expect(row?.status).toBe('Published');
    expect(row?.marketplaceStatus).toBe('Published');
    expect(row?.publishedAt).not.toBeNull();

    const afterListing = await fetchMarketplaceProducts({ search: 'Publish Test Product', limit: 20 });
    expect(afterListing.nodes.some((n) => (n as { id?: string }).id === productId)).toBe(true);
  });

  it('unpublishes a product and removes it from marketplace listings', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-PUBLISH-2';
    await createDraftProductReadyToPublish(distributor.id, productId);

    await publishMarketplaceProduct({ userId: distributor.id, productId, action: 'publish' });

    const unpublishResult = await publishMarketplaceProduct({
      userId: distributor.id,
      productId,
      action: 'unpublish',
    });
    expect(unpublishResult.success).toBe(true);
    expect(unpublishResult.message).toMatch(/unpublished/i);

    const row = await prisma.product.findFirst({
      where: { productId, userId: distributor.id },
      select: { status: true, marketplaceStatus: true, publishedAt: true },
    });
    expect(row?.status).toBe('Draft');
    expect(row?.marketplaceStatus).toBe('Unpublished');
    expect(row?.publishedAt).toBeNull();

    const listing = await fetchMarketplaceProducts({ search: 'Publish Test Product', limit: 20 });
    expect(listing.nodes.some((n) => (n as { id?: string }).id === productId)).toBe(false);
  });

  it('rejects publish when product has no images', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-PUBLISH-NO-IMG';
    await createDraftProductWithoutImages(distributor.id, productId);

    await expect(
      publishMarketplaceProduct({ userId: distributor.id, productId, action: 'publish' }),
    ).rejects.toThrow(/image/i);

    const row = await prisma.product.findFirst({
      where: { productId },
      select: { marketplaceStatus: true, status: true },
    });
    expect(row?.marketplaceStatus).not.toBe('Published');
    expect(row?.status).toBe('Draft');
  });

  it('rejects publish when product has no stock', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-PUBLISH-NO-STOCK';
    await createDraftProductWithoutStock(distributor.id, productId);

    await expect(
      publishMarketplaceProduct({ userId: distributor.id, productId, action: 'publish' }),
    ).rejects.toThrow(/stock/i);

    const row = await prisma.product.findFirst({
      where: { productId },
      select: { marketplaceStatus: true },
    });
    expect(row?.marketplaceStatus).not.toBe('Published');
  });

  it('broadcasts product and price updates after publish', async () => {
    const productUpdateSpy = vi
      .spyOn(websocketBroadcast, 'broadcastProductUpdate')
      .mockResolvedValue(undefined);
    const priceUpdateSpy = vi
      .spyOn(websocketBroadcast, 'broadcastPriceUpdate')
      .mockResolvedValue(undefined);

    const distributor = await createTestDistributor();
    const productId = 'P-PUBLISH-WS';
    await createDraftProductReadyToPublish(distributor.id, productId);

    await publishMarketplaceProduct({ userId: distributor.id, productId, action: 'publish' });

    expect(productUpdateSpy).toHaveBeenCalledWith([productId]);
    expect(priceUpdateSpy).toHaveBeenCalledWith([productId]);

    productUpdateSpy.mockRestore();
    priceUpdateSpy.mockRestore();
  });

  it('bulk publish succeeds for multiple ready products', async () => {
    const distributor = await createTestDistributor();
    const ids = ['P-BULK-1', 'P-BULK-2'];
    for (const productId of ids) {
      await createDraftProductReadyToPublish(distributor.id, productId);
    }

    const result = await bulkPublishMarketplaceProducts({
      userId: distributor.id,
      productIds: ids,
      action: 'publish',
    });

    expect(result.success).toBe(true);
    expect(result.successful).toEqual(expect.arrayContaining(ids));
    expect(result.failed).toHaveLength(0);

    for (const productId of ids) {
      const row = await prisma.product.findFirst({
        where: { productId, userId: distributor.id },
        select: { marketplaceStatus: true },
      });
      expect(row?.marketplaceStatus).toBe('Published');
    }
  });

  it('bulk publish reports failures for incomplete products without blocking valid ones', async () => {
    const distributor = await createTestDistributor();
    const goodId = 'P-BULK-GOOD';
    const badId = 'P-BULK-BAD';
    await createDraftProductReadyToPublish(distributor.id, goodId);
    await createDraftProductWithoutImages(distributor.id, badId);

    const result = await bulkPublishMarketplaceProducts({
      userId: distributor.id,
      productIds: [goodId, badId],
      action: 'publish',
    });

    expect(result.success).toBe(false);
    expect(result.successful).toContain(goodId);
    expect(result.failed).toContain(badId);

    const goodRow = await prisma.product.findFirst({
      where: { productId: goodId },
      select: { marketplaceStatus: true },
    });
    const badRow = await prisma.product.findFirst({
      where: { productId: badId },
      select: { marketplaceStatus: true },
    });
    expect(goodRow?.marketplaceStatus).toBe('Published');
    expect(badRow?.marketplaceStatus).not.toBe('Published');
  });
});
