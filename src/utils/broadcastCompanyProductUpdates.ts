import { prisma } from '@/lib/db';
import { broadcastProductUpdate } from '@/utils/websocketBroadcast';

/**
 * Notifies marketplace clients (via `product_updated`) to refresh products for all
 * dashboard users belonging to a company — e.g. after billing / payment metadata changes.
 */
export async function broadcastProductUpdatesForCompanyId(companyId: number): Promise<void> {
  const companyUsers = await prisma.user.findMany({
    where: { companyId },
    select: { id: true },
  });
  const userIds = companyUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  const products = await prisma.product.findMany({
    where: { userId: { in: userIds } },
    select: { productId: true },
  });
  const productIds = products.map((p) => p.productId).filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (productIds.length === 0) return;

  await broadcastProductUpdate(productIds);
}
