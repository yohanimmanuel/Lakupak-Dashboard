import { prisma } from '@/lib/db';
import { salesRepReplyLocale, upcomingJobsMessage } from '@/lib/salesJobs/repCopy';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import { dispatchJobToWhatsApp } from '@/lib/salesJobs/whatsapp';

/** Sends the salesman's upcoming jobs. Report buttons stay off until they say a job is finished. */
export async function executeAssignSalesJob(args: {
  userId: number;
  jobId: string;
  messageTemplate?: string;
  csReplyLanguage?: string;
}): Promise<string> {
  const job = await prisma.salesJob.findFirst({
    where: { id: args.jobId, distributorId: args.userId },
    include: {
      agent: { select: { id: true, name: true, phone: true, status: true } },
      client: { select: { storeName: true, owner: true } },
    },
  });
  if (!job) throw new Error('Sales job not found');
  if (job.whatsappMessageId) return `Sales job for ${job.agent.name} was already sent on WhatsApp.`;
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
  const today = zonedDayRange(zonedParts(new Date(), timeZone).dateKey, timeZone);
  const upcoming = await prisma.salesJob.findMany({
    where: {
      distributorId: args.userId,
      assignedTo: job.assignedTo,
      status: { in: ['pending', 'approved', 'suggested', 'dispatched', 'in_progress'] },
      OR: [{ id: job.id }, { scheduledDate: { gte: today.start } }, { schedules: { some: { scheduledDate: { gte: today.start } } } }],
    },
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
  const lines = (upcoming.length ? upcoming : [job]).map((row) => ({
    clientName: row.client?.storeName || row.client?.owner || '',
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
  await prisma.salesJob.update({
    where: { id: job.id },
    data: {
      ...(job.status === 'pending' || job.status === 'approved' || job.status === 'suggested'
        ? { status: 'dispatched', dispatchedAt: new Date() }
        : {}),
      whatsappMessageId: sent.messageId,
      dispatchNote: null,
    },
  });
  return `Assigned the sales job to ${job.agent.name} and sent the WhatsApp message.`;
}
