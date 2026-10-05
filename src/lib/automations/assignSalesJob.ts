import { prisma } from '@/lib/db';
import { salesRepReplyLocale, upcomingJobsMessage } from '@/lib/salesJobs/repCopy';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import { dispatchJobToWhatsApp } from '@/lib/salesJobs/whatsapp';

/** Sends the jobs that share this reminder date and time. Report buttons stay off until they say a job is finished. */
export async function executeAssignSalesJob(args: {
  userId: number;
  jobId: string;
  messageTemplate?: string;
  csReplyLanguage?: string;
  reminderDateKey?: string;
  reminderHour?: number;
  reminderMinute?: number;
  unscheduledReminder?: boolean;
}): Promise<string> {
  const job = await prisma.salesJob.findFirst({
    where: { id: args.jobId, distributorId: args.userId },
    include: {
      agent: { select: { id: true, name: true, phone: true, status: true } },
      client: { select: { storeName: true, owner: true } },
    },
  });
  if (!job) throw new Error('Sales job not found');
  const sentRecently =
    Boolean(job.whatsappMessageId) &&
    job.dispatchedAt != null &&
    Date.now() - job.dispatchedAt.getTime() < 90_000;
  if (sentRecently) return `Sales job for ${job.agent.name} was already sent on WhatsApp.`;
  const agentNote =
    job.agent.status !== 'active'
      ? 'Sales rep is inactive'
      : !job.agent.phone.trim()
        ? 'Sales rep has no WhatsApp number'
        : null;
  if (agentNote) {
    await prisma.salesJob.update({
      where: { id: job.id },
      data: { dispatchNote: agentNote },
    });
    throw new Error(agentNote);
  }

  const products: { productId: string; name: string }[] = job.suggestedProducts.length
    ? await prisma.product.findMany({
        where: { userId: args.userId, productId: { in: job.suggestedProducts } },
        select: { productId: true, name: true },
      })
    : [];
  const store = job.client?.storeName || job.client?.owner || '';
  const configured = String(args.csReplyLanguage ?? '').trim().toLowerCase();
  const locale = configured === 'id' || configured === 'en' ? configured : await salesRepReplyLocale(args.userId);
  const settings = await prisma.salesJobSettings.findUnique({ where: { distributorId: args.userId } });
  const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
  const todayKey = args.reminderDateKey || zonedParts(new Date(), timeZone).dateKey;
  const day = zonedDayRange(todayKey, timeZone);
  const open = ['pending', 'approved', 'suggested', 'dispatched', 'in_progress'];
  const slotHour = args.reminderHour;
  const slotMinute = args.reminderMinute;
  const hasSlot = !args.unscheduledReminder && slotHour != null && slotMinute != null;
  const upcoming = await prisma.salesJob.findMany({
    where: hasSlot
      ? {
          distributorId: args.userId,
          assignedTo: job.assignedTo,
          status: { in: open },
          OR: [
            { id: job.id },
            {
              schedules: {
                some: {
                  scheduledDate: { gte: day.start, lt: day.end },
                  reminderHour: slotHour,
                  reminderMinute: slotMinute,
                },
              },
            },
          ],
        }
      : args.unscheduledReminder
        ? {
            distributorId: args.userId,
            assignedTo: job.assignedTo,
            OR: [
              { id: job.id },
              {
                status: { in: ['pending', 'approved', 'suggested'] },
                scheduledDate: { gte: day.start, lt: day.end },
                schedules: { none: {} },
              },
            ],
          }
        : { id: job.id, distributorId: args.userId },
    include: { client: { select: { storeName: true, owner: true } } },
    orderBy: { scheduledDate: 'asc' },
  });
  const upcomingIds = Array.from(new Set(upcoming.flatMap((row) => row.suggestedProducts)));
  const missingIds = upcomingIds.filter((id) => !products.some((product) => product.productId === id));
  if (missingIds.length) {
    const extra = await prisma.product.findMany({
      where: { userId: args.userId, productId: { in: missingIds } },
      select: { productId: true, name: true },
    });
    products.push(...extra);
  }
  const clientIds = Array.from(new Set(upcoming.flatMap((row) => row.clientIds)));
  const buyerRows = clientIds.length
    ? await prisma.buyer.findMany({
        where: { buyerId: { in: clientIds }, userId: args.userId },
        select: { buyerId: true, storeName: true, owner: true },
      })
    : [];
  const storeByClient = new Map(buyerRows.map((buyer) => [buyer.buyerId, (buyer.storeName || buyer.owner).trim()]));
  const orderIds = Array.from(new Set(upcoming.flatMap((row) => row.orderIds)));
  const orderRows = orderIds.length
    ? await prisma.order.findMany({
        where: { orderId: { in: orderIds }, userId: args.userId },
        select: { orderId: true, storeName: true, buyer: { select: { storeName: true, owner: true } } },
      })
    : [];
  const storeByOrder = new Map(
    orderRows.map((order) => [order.orderId, (order.buyer?.storeName || order.buyer?.owner || order.storeName).trim()]),
  );
  const clientNames = (row: (typeof upcoming)[number]) => {
    const shops: string[] = [];
    for (const clientId of row.clientIds) {
      const name = storeByClient.get(clientId);
      if (name && !shops.includes(name)) shops.push(name);
    }
    for (const orderId of row.orderIds) {
      const name = storeByOrder.get(orderId);
      if (name && !shops.includes(name)) shops.push(name);
    }
    if (row.jobType === 'stock_check' && shops.length === 0) return '';
    return shops.join(', ') || row.client?.storeName || row.client?.owner || '';
  };
  const lines = (upcoming.length ? upcoming : [job]).map((row) => ({
    clientName: clientNames(row),
    jobType: row.jobType,
    productNames: row.suggestedProducts.map((id) => products.find((product) => product.productId === id)?.name || id),
    reason: row.priorityReason,
  }));
  const body = upcomingJobsMessage(locale, job.agent.name, lines);
  const sent = await dispatchJobToWhatsApp({
    id: job.id,
    jobType: job.jobType,
    priorityReason: job.priorityReason,
    clientName: store,
    suggestedProductNames: job.suggestedProducts.map((id) => products.find((product) => product.productId === id)?.name || id),
    agentPhone: job.agent.phone,
    body,
    locale,
    withButtons: false,
  });
  const sentAt = new Date();
  const coveredIds = Array.from(new Set((upcoming.length ? upcoming : [job]).map((row) => row.id)));
  const listedWithThisMessage = coveredIds.filter((id) => id !== job.id);
  if (listedWithThisMessage.length) {
    await prisma.salesJob.updateMany({
      where: { id: { in: listedWithThisMessage }, distributorId: args.userId },
      data: { dispatchedAt: sentAt, whatsappMessageId: sent.messageId, dispatchNote: null },
    });
  }
  await prisma.salesJob.update({
    where: { id: job.id },
    data: {
      ...(job.status === 'pending' || job.status === 'approved' || job.status === 'suggested'
        ? { status: 'dispatched' as const }
        : {}),
      dispatchedAt: sentAt,
      whatsappMessageId: sent.messageId,
      dispatchNote: null,
    },
  });
  return `Assigned the sales job to ${job.agent.name} and sent the WhatsApp message.`;
}
