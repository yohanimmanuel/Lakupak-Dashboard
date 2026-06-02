import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { addToCart, fetchMobileCart, updateCartItem } from '@/app/api/graphql/modules/marketplace/handlers/cart';
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

    const cart = await fetchMobileCart(buyer.id);
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

    const cart = await fetchMobileCart(buyer.id);
    expect(cart.items).toHaveLength(0);

    const stillInDb = await prisma.userActivity.count({
      where: { userId: buyer.id, productId, activityType: 'cart' },
    });
    expect(stillInDb).toBe(1);
  });
});
