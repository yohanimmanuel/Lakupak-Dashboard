import { prisma } from '@/lib/db';
import { isFieldRep, OPEN_JOB_STATUSES } from '@/lib/salesJobs/completion';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';

/** Serializes suggestSalesJobs per distributor (see pg_advisory_xact_lock). */
const SUGGEST_JOBS_ADVISORY_KEY = 872_004;

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000));
}

export async function suggestSalesJobsForDistributor(
  distributorId: number,
  dateKey?: string,
): Promise<{ created: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUGGEST_JOBS_ADVISORY_KEY}, ${distributorId})`;
    const settings = await tx.salesJobSettings.findUnique({ where: { distributorId } });
    if (dateKey && settings?.lastSuggestedDateKey === dateKey) return { created: 0 };
    if (dateKey) {
      await tx.salesJobSettings.upsert({
        where: { distributorId },
        update: { lastSuggestedDateKey: dateKey },
        create: { distributorId, lastSuggestedDateKey: dateKey },
      });
    }
    const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
    const todayKey = zonedParts(new Date(), timeZone).dateKey;
    const { start } = zonedDayRange(todayKey, timeZone);

    const agents = await tx.salesAgent.findMany({
      where: { userId: distributorId, status: 'active' },
      select: { id: true, role: true },
      orderBy: { name: 'asc' },
    });
    const reps = agents.filter((agent) => isFieldRep(agent.role));
    const pool = reps.length > 0 ? reps : agents;
    if (pool.length === 0) return { created: 0 };

    const user = await tx.user.findUnique({
      where: { id: distributorId },
      select: { salesAgentRoundRobinCursor: true },
    });
    let cursor = user?.salesAgentRoundRobinCursor ?? 0;

    const buyers = await tx.buyer.findMany({
      where: { userId: distributorId, status: { in: ['Prospect', 'Active'] } },
      select: { buyerId: true },
    });
    if (buyers.length === 0) return { created: 0 };

    const now = new Date();
    const recentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const buyerIds = buyers.map((buyer) => buyer.buyerId);

    const orders = await tx.order.findMany({
      where: {
        userId: distributorId,
        buyerId: { in: buyerIds },
        isDeleted: false,
        orderDate: { gte: previousStart },
      },
      select: { buyerId: true, orderDate: true, totalAmount: true },
    });
    const lastOrder = await tx.order.groupBy({
      by: ['buyerId'],
      where: { userId: distributorId, buyerId: { in: buyerIds }, isDeleted: false },
      _max: { orderDate: true },
    });
    const lastByBuyer = new Map<string, Date>();
    for (const order of lastOrder) {
      if (order.buyerId && order._max.orderDate) lastByBuyer.set(order.buyerId, order._max.orderDate);
    }

    const offers = await tx.offer.findMany({
      where: {
        userId: distributorId,
        buyerId: { in: buyerIds },
        status: 'active',
        productId: { not: null },
      },
      select: { buyerId: true, productId: true, endDate: true },
    });

    const openJobs = await tx.salesJob.findMany({
      where: {
        distributorId,
        clientId: { in: buyerIds },
        status: { in: [...OPEN_JOB_STATUSES] },
      },
      select: { clientId: true, jobType: true },
    });
    const openKey = new Set(openJobs.map((job) => `${job.clientId}:${job.jobType}`));

    let created = 0;
    for (const buyer of buyers) {
      const reasons: string[] = [];
      const last = lastByBuyer.get(buyer.buyerId);
      if (last) {
        const days = daysBetween(now, last);
        if (days >= 14) reasons.push(`${days} days since last order`);
      }

      let recent = 0;
      let previous = 0;
      for (const order of orders) {
        if (order.buyerId !== buyer.buyerId) continue;
        const amount = Number(order.totalAmount) || 0;
        if (order.orderDate >= recentStart) recent += amount;
        else if (order.orderDate >= previousStart) previous += amount;
      }
      if (previous > 0 && (previous - recent) / previous >= 0.3) {
        const drop = Math.round(((previous - recent) / previous) * 100);
        reasons.push(`volume dropped ${drop}%`);
      }

      const buyerOffers = offers.filter((offer) => offer.buyerId === buyer.buyerId && offer.productId);
      const expiring = buyerOffers.filter((offer) => {
        if (!offer.endDate) return false;
        const days = daysBetween(offer.endDate, now);
        return days >= 0 && days <= 2;
      });
      const suggestedProducts = Array.from(
        new Set(buyerOffers.map((offer) => offer.productId).filter((id): id is string => Boolean(id))),
      );

      if (reasons.length > 0 && !openKey.has(`${buyer.buyerId}:take_order`)) {
        const agent = pool[cursor % pool.length];
        cursor += 1;
        await tx.salesJob.create({
          data: {
            distributorId,
            assignedTo: agent.id,
            clientId: buyer.buyerId,
            jobType: 'take_order',
            priorityReason: reasons.join('. '),
            suggestedProducts,
            createdBy: 'ai',
            status: 'suggested',
            scheduledDate: start,
          },
        });
        openKey.add(`${buyer.buyerId}:take_order`);
        created += 1;
      }

      if (expiring.length > 0 && !openKey.has(`${buyer.buyerId}:promote_product`)) {
        const soonest = expiring.reduce((min, offer) => {
          const days = offer.endDate ? daysBetween(offer.endDate, now) : 99;
          return Math.min(min, days);
        }, 99);
        const agent = pool[cursor % pool.length];
        cursor += 1;
        await tx.salesJob.create({
          data: {
            distributorId,
            assignedTo: agent.id,
            clientId: buyer.buyerId,
            jobType: 'promote_product',
            priorityReason: `offer expiring in ${soonest} days`,
            suggestedProducts: Array.from(
              new Set(expiring.map((offer) => offer.productId).filter((id): id is string => Boolean(id))),
            ),
            createdBy: 'ai',
            status: 'suggested',
            scheduledDate: start,
          },
        });
        openKey.add(`${buyer.buyerId}:promote_product`);
        created += 1;
      }
    }

    if (created > 0) {
      await tx.user.update({
        where: { id: distributorId },
        data: { salesAgentRoundRobinCursor: cursor },
      });
    }
    return { created };
  }, { timeout: 60_000 });
}
