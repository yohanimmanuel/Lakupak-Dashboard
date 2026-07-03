import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { marketplaceResolvers } from '@/app/api/graphql/modules/marketplace/resolvers';
import { resetDb } from './helpers';

describe('marketplace cart mutations - auth/ownership', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rejects updateCartItem when unauthenticated', async () => {
    const res = await marketplaceResolvers.Mutation.updateCartItem(
      undefined,
      { input: { cartItemId: 123, quantity: 2 } },
      {},
    );
    expect(res).toEqual({ success: false, cartItem: null, message: 'Unauthorized' });
  });

  it('rejects removeCartItem when cartItem belongs to another user', async () => {
    const userA = await prisma.marketplaceUser.create({
      data: { username: 'a', phone: '+620000000010' },
      select: { id: true },
    });
    const userB = await prisma.marketplaceUser.create({
      data: { username: 'b', phone: '+620000000011' },
      select: { id: true },
    });

    const userAExists = await prisma.marketplaceUser.findUnique({ where: { id: userA.id }, select: { id: true } });
    expect(userAExists).not.toBeNull();

    const item = await prisma.marketplaceUser.update({
      where: { id: userA.id },
      data: {
        userActivities: {
          create: {
            productId: 'P-1',
            productData: {},
            activityType: 'cart',
            metadata: { quantity: 1 },
          },
        },
      },
      select: {
        userActivities: {
          select: { id: true },
          orderBy: { id: 'desc' },
          take: 1,
        },
      },
    });

    const res = await marketplaceResolvers.Mutation.removeCartItem(
      undefined,
      { cartItemId: item.userActivities[0].id },
      { user: { id: userB.id, type: 'marketplace' } },
    );

    expect(res).toEqual({ success: false, cartItem: null, message: 'Forbidden' });
  });

  it('rejects updateCartItem when cartItem belongs to another user', async () => {
    const userA = await prisma.marketplaceUser.create({
      data: { username: 'a2', phone: '+620000000012' },
      select: { id: true },
    });
    const userB = await prisma.marketplaceUser.create({
      data: { username: 'b2', phone: '+620000000013' },
      select: { id: true },
    });

    const item = await prisma.marketplaceUser.update({
      where: { id: userA.id },
      data: {
        userActivities: {
          create: {
            productId: 'P-2',
            productData: {},
            activityType: 'cart',
            metadata: { quantity: 1, selected: true },
          },
        },
      },
      select: {
        userActivities: {
          select: { id: true },
          orderBy: { id: 'desc' },
          take: 1,
        },
      },
    });

    const res = await marketplaceResolvers.Mutation.updateCartItem(
      undefined,
      { input: { cartItemId: item.userActivities[0].id, quantity: 5 } },
      { user: { id: userB.id, type: 'marketplace' } },
    );

    expect(res).toEqual({ success: false, cartItem: null, message: 'Forbidden' });
  });
});

