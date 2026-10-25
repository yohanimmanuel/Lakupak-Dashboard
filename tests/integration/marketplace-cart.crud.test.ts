import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { addToCart, clearCart, fetchMobileCart, removeCartItem, updateCartItem } from '@/app/api/graphql/modules/marketplace/handlers/cart';
import { addUserActivity, fetchMobileUserActivity } from '@/app/api/graphql/modules/marketplace/handlers/activity';
import { resetDb } from './helpers';
import { createPublishedProductWithColorVariants, createTestDistributor } from './helpers/productFixtures';

describe('marketplace cart CRUD (integration)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('adds, merges quantity by variant, and updates cart item', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-CART-1';
    await createPublishedProductWithColorVariants(distributor.id, productId);

    const buyer = await prisma.marketplaceUser.create({
      data: { username: 'cart_buyer', phone: '+620000000099' },
      select: { id: true },
    });

    const snapshot = {
      id: productId,
      name: 'Sync Test Shirt',
      variantOptions: [{ attributes: { Color: 'Black', Size: 'M' }, sellingPrice: 2000 }],
    };

    const first = await addToCart({
      userId: buyer.id,
      productId,
      productData: snapshot,
      quantity: 2,
      variant: 'Color: Black | Size: M',
    });
    expect(first.success).toBe(true);
    expect((first.cartItem.metadata as { quantity?: number }).quantity).toBe(2);

    const merged = await addToCart({
      userId: buyer.id,
      productId,
      productData: snapshot,
      quantity: 3,
      variant: 'Color: Black | Size: M',
    });
    expect(merged.success).toBe(true);
    expect((merged.cartItem.metadata as { quantity?: number }).quantity).toBe(5);

    const updated = await updateCartItem({
      cartItemId: merged.cartItem.id,
      quantity: 4,
      selected: true,
    });
    expect(updated.success).toBe(true);
    expect((updated.cartItem.metadata as { quantity?: number }).quantity).toBe(4);

    const cart = await fetchMobileCart(buyer.id, distributor.id);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].productId).toBe(productId);
    expect((cart.items[0].metadata as { variant?: string }).variant).toBe('Color: Black | Size: M');
  });

  it('hides cart lines for unpublished products but keeps them in the database', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-CART-2';
    await createPublishedProductWithColorVariants(distributor.id, productId);

    const buyer = await prisma.marketplaceUser.create({
      data: { username: 'cart_buyer2', phone: '+620000000098' },
      select: { id: true },
    });

    await addToCart({
      userId: buyer.id,
      productId,
      productData: { id: productId, name: 'Sync Test Shirt' },
      quantity: 1,
      variant: 'Color: Black | Size: M',
    });

    await prisma.product.updateMany({
      where: { productId },
      data: { marketplaceStatus: 'Unpublished', status: 'Draft' },
    });

    const cart = await fetchMobileCart(buyer.id, distributor.id);
    expect(cart.items).toHaveLength(0);

    const stillInDb = await prisma.userActivity.count({
      where: { userId: buyer.id, productId, activityType: 'cart' },
    });
    expect(stillInDb).toBe(1);
  });

  it('records cart abandonment when a buyer removes an item manually', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-CART-3';
    await createPublishedProductWithColorVariants(distributor.id, productId);

    const buyer = await prisma.marketplaceUser.create({
      data: { username: 'cart_buyer3', phone: '+620000000097' },
      select: { id: true },
    });

    const added = await addToCart({
      userId: buyer.id,
      productId,
      productData: { id: productId, name: 'Abandon Test Shirt' },
      quantity: 1,
      variant: 'Color: Black | Size: M',
    });

    await removeCartItem(added.cartItem.id);

    const abandonedCount = await prisma.userActivity.count({
      where: { productId, activityType: 'cart_abandoned' },
    });
    expect(abandonedCount).toBe(1);
  });

  it('does not record cart abandonment when cart is cleared after checkout', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-CART-4';
    await createPublishedProductWithColorVariants(distributor.id, productId);

    const buyer = await prisma.marketplaceUser.create({
      data: { username: 'cart_buyer4', phone: '+620000000096' },
      select: { id: true },
    });

    await addToCart({
      userId: buyer.id,
      productId,
      productData: { id: productId, name: 'Checkout Shirt' },
      quantity: 2,
      variant: 'Color: Black | Size: M',
    });

    await clearCart(buyer.id, { trackAbandonment: false });

    const cart = await fetchMobileCart(buyer.id, distributor.id);
    expect(cart.items).toHaveLength(0);

    const abandonedCount = await prisma.userActivity.count({
      where: { productId, activityType: 'cart_abandoned' },
    });
    expect(abandonedCount).toBe(0);

    const addedCount = await prisma.userActivity.count({
      where: { productId, activityType: 'cart_added' },
    });
    expect(addedCount).toBe(1);
  });

  it('records a new view event on every product page visit', async () => {
    const distributor = await createTestDistributor();
    const productId = 'P-VIEW-1';
    await createPublishedProductWithColorVariants(distributor.id, productId);

    const buyer = await prisma.marketplaceUser.create({
      data: { username: 'view_buyer', phone: '+620000000095' },
      select: { id: true },
    });

    const snapshot = { id: productId, name: 'View Test Shirt' };

    await addUserActivity({
      userId: buyer.id,
      productId,
      productData: snapshot,
      activityType: 'viewed',
    });
    await addUserActivity({
      userId: buyer.id,
      productId,
      productData: snapshot,
      activityType: 'viewed',
    });
    await addUserActivity({
      userId: buyer.id,
      productId,
      productData: snapshot,
      activityType: 'viewed',
    });

    const viewCount = await prisma.userActivity.count({
      where: { productId, activityType: 'viewed' },
    });
    expect(viewCount).toBe(3);
  });

  it('returns up to 20 unique recently viewed products even when one product dominates views', async () => {
    const distributor = await createTestDistributor();
    const buyer = await prisma.marketplaceUser.create({
      data: { username: 'view_buyer2', phone: '+620000000094' },
      select: { id: true },
    });

    const dominantProductId = 'P-VIEW-DOM';
    await createPublishedProductWithColorVariants(distributor.id, dominantProductId);

    // Seed the 210 dominant-product views in a single round-trip. The subject under
    // test is the read-side dedup in fetchMobileUserActivity, not the write path, and
    // a per-view transaction loop against a remote DB blows past the test timeout.
    await prisma.userActivity.createMany({
      data: Array.from({ length: 210 }, () => ({
        userId: buyer.id,
        productId: dominantProductId,
        productData: { id: dominantProductId, name: 'Dominant Product' },
        activityType: 'viewed',
        metadata: {},
      })),
    });

    const otherProductIds: string[] = [];
    for (let i = 0; i < 19; i += 1) {
      const productId = `P-VIEW-OTHER-${i}`;
      otherProductIds.push(productId);
      await createPublishedProductWithColorVariants(distributor.id, productId);
    }

    await prisma.userActivity.createMany({
      data: otherProductIds.map((productId, i) => ({
        userId: buyer.id,
        productId,
        productData: { id: productId, name: `Other Product ${i}` },
        activityType: 'viewed',
        metadata: {},
      })),
    });

    const result = await fetchMobileUserActivity({ userId: buyer.id, type: 'viewed' });
    const productIds = result.activities.map((activity) => activity.productId);

    expect(productIds).toHaveLength(20);
    expect(new Set(productIds).size).toBe(20);
    expect(productIds).toContain(dominantProductId);
    for (const productId of otherProductIds) {
      expect(productIds).toContain(productId);
    }
  });
});
