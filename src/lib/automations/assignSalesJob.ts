import { prisma } from '@/lib/db';
import { groupJobLines, salesRepReplyLocale, upcomingJobsMessage } from '@/lib/salesJobs/repCopy';
import {
  allSharedDeliveriesFailed,
  lockSalesJob,
  readSharedDelivery,
  withSharedDelivery,
} from '@/lib/salesJobs/sharedDelivery';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import { dispatchJobToWhatsApp, salesJobTypeLabel, salesJobTypeLabelId } from '@/lib/salesJobs/whatsapp';

/** Sends the jobs that share this reminder date and time. Report buttons stay off until they say a job is finished. */
export async function executeAssignSalesJob(args: {
  userId: number;
  jobId: string;
  /** When set, the job is sent to these salesmen instead of only the one it is assigned to. */
  recipientAgentIds?: string[];
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

  // Recipients: the salesmen picked on the action, or the job's own salesman.
  const requestedIds = Array.from(new Set((args.recipientAgentIds ?? []).map((id) => id.trim()).filter(Boolean)));
  type Recipient = { id: string; name: string; phone: string; status: string };
  let candidates: Recipient[] = [job.agent];
  if (requestedIds.length) {
    const rows = await prisma.salesAgent.findMany({
      where: { id: { in: requestedIds }, userId: args.userId },
      select: { id: true, name: true, phone: true, status: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    candidates = requestedIds
      .map((id) => byId.get(id))
      .filter((row): row is Recipient => Boolean(row));
  }
  const recipients = candidates.filter((rep) => rep.status === 'active' && rep.phone.trim());
  if (recipients.length === 0) {
    const agentNote = requestedIds.length
      ? 'None of the selected salesmen has an active WhatsApp number'
      : job.agent.status !== 'active'
        ? 'Sales rep is inactive'
        : 'Sales rep has no WhatsApp number';
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
                dispatchedAt: null,
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
  const shopNames = (row: (typeof upcoming)[number]) => {
    const shops: string[] = [];
    for (const clientId of row.clientIds) {
      const name = storeByClient.get(clientId);
      if (name && !shops.includes(name)) shops.push(name);
    }
    for (const orderId of row.orderIds) {
      const name = storeByOrder.get(orderId);
      if (name && !shops.includes(name)) shops.push(name);
    }
    return shops;
  };
  const lines = (upcoming.length ? upcoming : [job]).map((row) => {
    const shops = shopNames(row);
    return {
      clientName: shops.join(', ') || row.client?.storeName || row.client?.owner || '',
      shops,
      jobType: row.jobType,
      productNames: row.suggestedProducts.map((id) => products.find((product) => product.productId === id)?.name || id),
      reason: row.priorityReason,
    };
  });
  // One WhatsApp per recipient. A rejected number (for example a Meta test
  // allowlist block) must not stop the other salesmen from getting the job.
  const sentTo: string[] = [];
  const failedTo: string[] = [];
  const splitNote = (note: string | null | undefined) =>
    (note ?? '').split('; ').map((part) => part.trim()).filter(Boolean);
  const sharedSend = recipients.length > 1;
  const beforeSend = await prisma.salesJob.findUnique({
    where: { id: job.id },
    select: { dispatchNote: true, completionData: true },
  });
  const noteBeforeSend = new Set(splitNote(beforeSend?.dispatchNote));
  if (sharedSend) {
    await prisma.salesJob.update({
      where: { id: job.id },
      data: { completionData: withSharedDelivery(beforeSend?.completionData, { sent: null, failed: [] }) },
    });
  }
  let firstMessageId = '';
  let firstError: unknown = null;
  const typeLabel = locale === 'id' ? salesJobTypeLabelId(job.jobType) : salesJobTypeLabel(job.jobType);
  const taskCount = groupJobLines(locale, lines).length;
  const jobSummary =
    taskCount > 1
      ? locale === 'id'
        ? `${taskCount} tugas penjualan untuk hari ini`
        : `${taskCount} sales jobs for today`
      : [typeLabel, store].filter(Boolean).join(' - ');
  for (const recipient of recipients) {
    try {
      const sent = await dispatchJobToWhatsApp({
        id: job.id,
        jobType: job.jobType,
        priorityReason: job.priorityReason,
        clientName: store,
        suggestedProductNames: job.suggestedProducts.map((id) => products.find((product) => product.productId === id)?.name || id),
        agentPhone: recipient.phone,
        agentName: recipient.name,
        jobSummary,
        sharedSend,
        body: upcomingJobsMessage(locale, recipient.name, lines),
        locale,
        withButtons: false,
      });
      if (!firstMessageId) firstMessageId = sent.messageId;
      sentTo.push(recipient.name);
    } catch (err) {
      if (!firstError) firstError = err;
      failedTo.push(recipient.name);
    }
  }
  if (sentTo.length === 0) {
    const detail = firstError instanceof Error ? firstError.message : 'WhatsApp send failed';
    await prisma.salesJob.update({
      where: { id: job.id },
      data: { dispatchNote: detail },
    });
    throw firstError instanceof Error ? firstError : new Error(detail);
  }
  const sentAt = new Date();
  const coveredIds = Array.from(new Set((upcoming.length ? upcoming : [job]).map((row) => row.id)));
  const listedWithThisMessage = coveredIds.filter((id) => id !== job.id);
  // The status webhook can note a delivery failure for one rep while the loop
  // is still sending to the others. Keep those notes instead of overwriting them,
  // and if every sent message already failed, leave the job pending.
  const sendNote = failedTo.length ? `WhatsApp failed for: ${failedTo.join(', ')}` : '';
  const allFailed = await prisma.$transaction(async (tx) => {
    await lockSalesJob(tx, job.id);
    const latest = await tx.salesJob.findUnique({
      where: { id: job.id },
      select: { dispatchNote: true, completionData: true },
    });
    const webhookNotes = splitNote(latest?.dispatchNote).filter(
      (part) => part.startsWith('WhatsApp delivery failed') && !noteBeforeSend.has(part),
    );
    const delivery = sharedSend ? { ...readSharedDelivery(latest?.completionData), sent: sentTo.length } : null;
    const failedEverywhere = Boolean(delivery && allSharedDeliveriesFailed(delivery));
    await tx.salesJob.update({
      where: { id: job.id },
      data: {
        ...(failedEverywhere
          ? { dispatchedAt: null, ...(job.status === 'dispatched' ? { status: 'pending' as const } : {}) }
          : {
              ...(job.status === 'pending' || job.status === 'approved' || job.status === 'suggested'
                ? { status: 'dispatched' as const }
                : {}),
              dispatchedAt: sentAt,
            }),
        whatsappMessageId: firstMessageId,
        dispatchNote: [sendNote, ...webhookNotes].filter(Boolean).join('; ') || null,
        ...(delivery ? { completionData: withSharedDelivery(latest?.completionData, delivery) } : {}),
      },
    });
    return failedEverywhere;
  });
  if (allFailed) throw new Error('WhatsApp delivery failed for every salesman');
  if (listedWithThisMessage.length) {
    await prisma.salesJob.updateMany({
      where: { id: { in: listedWithThisMessage }, distributorId: args.userId },
      data: { dispatchedAt: sentAt, whatsappMessageId: firstMessageId, dispatchNote: null },
    });
  }
  const names = sentTo.join(', ');
  return sentTo.length === 1 && failedTo.length === 0
    ? `Assigned the sales job to ${names} and sent the WhatsApp message.`
    : `Assigned the sales job to ${names} and sent the WhatsApp messages.${failedTo.length ? ` Failed for: ${failedTo.join(', ')}.` : ''}`;
}
