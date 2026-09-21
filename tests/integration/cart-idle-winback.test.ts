import { describe, beforeEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { addToCart } from '@/app/api/graphql/modules/marketplace/handlers/cart';
import { dispatchDueCartIdleAutomations } from '@/lib/automations/engine';
import { findIdleCartsForDistributor } from '@/lib/automations/idleCarts';
import { resetDb } from './helpers';
import { createPublishedProductWithColorVariants, createTestDistributor } from './helpers/productFixtures';
import { buildMobileBuyerId } from '@/utils/buyerSync';

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

describe('cart idle win-back', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('finds carts idle on this distributor and ignores fresh carts', async () => {
    const distributor = await createTestDistributor();
    const other = await createTestDistributor();
    const productId = `P-IDLE-${distributor.id}`;
    const otherProductId = `P-IDLE-OTHER-${other.id}`;
    await createPublishedProductWithColorVariants(distributor.id, productId);
    await createPublishedProductWithColorVariants(other.id, otherProductId);

    const idleBuyer = await prisma.marketplaceUser.create({
      data: {
        username: `idle_${distributor.id}`,
        phone: '+620000000201',
        email: 'idle@example.com',
        name: 'Idle Shop',
        storeName: 'Idle Mart',
      },
      select: { id: true },
    });
    const freshBuyer = await prisma.marketplaceUser.create({
      data: {
        username: `fresh_${distributor.id}`,
        phone: '+620000000202',
        email: 'fresh@example.com',
      },
      select: { id: true },
    });
    const otherBuyer = await prisma.marketplaceUser.create({
      data: {
        username: `other_${distributor.id}`,
        phone: '+620000000203',
      },
      select: { id: true },
    });

    const snapshot = { id: productId, name: 'Idle Snack' };
    const idleAdd = await addToCart({
      userId: idleBuyer.id,
      productId,
      productData: snapshot,
      quantity: 1,
      variant: 'Color: Black | Size: M',
    });
    await prisma.userActivity.update({
      where: { id: idleAdd.cartItem.id },
      data: { updatedAt: hoursAgo(5) },
    });

    await addToCart({
      userId: freshBuyer.id,
      productId,
      productData: snapshot,
      quantity: 1,
      variant: 'Color: Black | Size: M',
    });

    const otherAdd = await addToCart({
      userId: otherBuyer.id,
      productId: otherProductId,
      productData: { id: otherProductId, name: 'Other Snack' },
      quantity: 1,
      variant: 'Color: Black | Size: M',
    });
    await prisma.userActivity.update({
      where: { id: otherAdd.cartItem.id },
      data: { updatedAt: hoursAgo(5) },
    });

    const idle = await findIdleCartsForDistributor({
      distributorUserId: distributor.id,
      idleHours: 2,
    });

    expect(idle.map((c) => c.marketplaceUserId)).toEqual([idleBuyer.id]);
    expect(idle[0]?.buyerId).toBe(buildMobileBuyerId(idleBuyer.id, distributor.id));
    expect(idle[0]?.email).toBe('idle@example.com');
    expect(idle[0]?.productIds).toContain(productId);
  });

  it('dispatches a cart_idle run once per idle cart fingerprint', async () => {
    const distributor = await createTestDistributor();
    const productId = `P-IDLE-RUN-${distributor.id}`;
    await createPublishedProductWithColorVariants(distributor.id, productId);
    const buyer = await prisma.marketplaceUser.create({
      data: {
        username: `idle_run_${distributor.id}`,
        phone: '+620000000211',
        email: 'idle-run@example.com',
      },
      select: { id: true },
    });
    const added = await addToCart({
      userId: buyer.id,
      productId,
      productData: { id: productId, name: 'Idle Snack' },
      quantity: 1,
      variant: 'Color: Black | Size: M',
    });
    const lastActivityAt = hoursAgo(6);
    await prisma.userActivity.update({
      where: { id: added.cartItem.id },
      data: { updatedAt: lastActivityAt },
    });

    const workflow = await prisma.automationWorkflow.create({
      data: {
        userId: distributor.id,
        name: 'Cart idle',
        type: 'marketing',
        status: 'active',
        triggerType: 'cart_idle',
        triggerConfig: { hours: 2 },
        actionType: 'cart_winback',
        agentConfig: {
          note: '',
          __canvas: {
            nodes: [
              {
                id: 't1',
                data: { kind: 'trigger', catalogType: 'cart_idle', config: { hours: 2 } },
              },
              {
                id: 'a1',
                data: {
                  kind: 'action',
                  catalogType: 'notify_dashboard',
                  config: {},
                },
              },
            ],
            edges: [],
          },
        },
      },
      select: { id: true },
    });

    const first = await dispatchDueCartIdleAutomations({ workflowId: workflow.id });
    expect(first.fired).toBe(1);
    const second = await dispatchDueCartIdleAutomations({ workflowId: workflow.id });
    expect(second.fired).toBe(0);

    const runs = await prisma.automationRun.findMany({ where: { workflowId: workflow.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('success');
    expect(runs[0]?.message).toMatch(/Idle cart/);
  });
});
