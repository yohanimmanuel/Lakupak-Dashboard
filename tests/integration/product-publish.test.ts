import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import {
  bulkPublishMarketplaceProducts,
  publishMarketplaceProduct,
} from '@/app/api/graphql/modules/products';
import { fetchMarketplaceProducts } from '@/app/api/graphql/modules/marketplace/handlers/products';
import * as websocketBroadcast from '@/utils/websocketBroadcast';
import { NotificationService } from '@/app/api/graphql/modules/notifications';
import * as meiliMarketplaceSync from '@/lib/meiliMarketplaceSync';
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

  it('broadcasts a single product update after publish', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-PUBLISH-WS';
    await createDraftProductReadyToPublish(distributor.id, productId);

    const productUpdateSpy = vi
      .spyOn(websocketBroadcast, 'broadcastProductUpdate')
      .mockResolvedValue(undefined);
    const priceUpdateSpy = vi
      .spyOn(websocketBroadcast, 'broadcastPriceUpdate')
      .mockResolvedValue(undefined);

    await publishMarketplaceProduct({ userId: distributor.id, productId, action: 'publish' });

    expect(productUpdateSpy).toHaveBeenCalledWith([productId], 'publish');
    // A status change leaves prices untouched, and a second broadcast would make clients
    // run the same refetch twice.
    expect(priceUpdateSpy).not.toHaveBeenCalled();

    productUpdateSpy.mockRestore();
    priceUpdateSpy.mockRestore();
  });

  it('notifies only after the product is listable in the marketplace', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-PUBLISH-NOTIF';
    await createDraftProductReadyToPublish(distributor.id, productId);

    let indexed = false;
    let indexedAtNotification = false;
    let visibleAtNotification = false;
    const upsertSpy = vi
      .spyOn(meiliMarketplaceSync, 'upsertMarketplaceProductsToMeili')
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        indexed = true;
      });
    const notifySpy = vi
      .spyOn(NotificationService, 'createProductPublishedNotification')
      .mockImplementation(async () => {
        indexedAtNotification = indexed;
        const listing = await fetchMarketplaceProducts({ productId, limit: 1 });
        visibleAtNotification = listing.nodes.some((n) => (n as { id?: string }).id === productId);
      });

    await publishMarketplaceProduct({
      userId: distributor.id,
      productId,
      action: 'publish',
    });

    expect(upsertSpy).toHaveBeenCalledWith([productId], { waitForIndexing: true });
    expect(notifySpy).toHaveBeenCalledWith(distributor.id, productId, expect.any(String));
    expect(indexedAtNotification).toBe(true);
    expect(visibleAtNotification).toBe(true);

    upsertSpy.mockRestore();
    notifySpy.mockRestore();
  });

  it('bulk notify waits until every successful product is listable', async () => {
    const distributor = await createTestDistributor();
    const ids = ['P-BULK-NOTIF-1', 'P-BULK-NOTIF-2'];
    for (const productId of ids) {
      await createDraftProductReadyToPublish(distributor.id, productId);
    }

    let indexed = false;
    let indexedAtNotification = false;
    let visibleAtNotification = false;
    const upsertSpy = vi
      .spyOn(meiliMarketplaceSync, 'upsertMarketplaceProductsToMeili')
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        indexed = true;
      });
    const notifySpy = vi
      .spyOn(NotificationService, 'createProductsPublishedNotifications')
      .mockImplementation(async (_userId, products) => {
        indexedAtNotification = indexed;
        const listings = await Promise.all(
          ids.map((productId) => fetchMarketplaceProducts({ productId, limit: 1 })),
        );
        visibleAtNotification = listings.every((listing, i) =>
          listing.nodes.some((n) => (n as { id?: string }).id === ids[i]),
        );
        return products.length;
      });

    await bulkPublishMarketplaceProducts({
      userId: distributor.id,
      productIds: ids,
      action: 'publish',
    });

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy.mock.calls[0][1]).toEqual(
      expect.arrayContaining(ids.map((productId) => expect.objectContaining({ productId }))),
    );
    expect(indexedAtNotification).toBe(true);
    expect(visibleAtNotification).toBe(true);

    upsertSpy.mockRestore();
    notifySpy.mockRestore();
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
