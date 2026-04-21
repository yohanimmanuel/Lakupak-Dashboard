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
      null as any,
      { input: { cartItemId: 123, quantity: 2 } } as any,
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
      null as any,
      { cartItemId: item.userActivities[0].id } as any,
      { user: { id: userB.id } },
    );

    expect(res).toEqual({ success: false, cartItem: null, message: 'Forbidden' });
  });
});

