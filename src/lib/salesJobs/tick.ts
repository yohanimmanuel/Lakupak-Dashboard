import { prisma } from '@/lib/db';
import { dispatchJobToWhatsApp } from '@/lib/salesJobs/whatsapp';
import { suggestSalesJobsForDistributor } from '@/lib/salesJobs/suggest';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';

type DispatchableJob = {
  id: string;
  jobType: string;
  priorityReason: string | null;
  suggestedProducts: string[];
  status: string;
  agent: { phone: string; status: string };
  client: { storeName: string; owner: string };
};

async function sendApprovedJob(job: DispatchableJob, productName: Map<string, string>) {
  if (job.agent.status !== 'active' || !job.agent.phone) {
    await prisma.salesJob.update({
      where: { id: job.id },
      data: { dispatchNote: 'Sales rep has no WhatsApp number' },
    });
    return 'failed' as const;
  }
  try {
    const sent = await dispatchJobToWhatsApp({
      id: job.id,
      jobType: job.jobType,
      priorityReason: job.priorityReason,
      clientName: job.client.storeName || job.client.owner,
      suggestedProductNames: job.suggestedProducts.map((id) => productName.get(id) || id),
      agentPhone: job.agent.phone,
    });
    await prisma.salesJob.update({
      where: { id: job.id },
      data: {
        ...(job.status === 'approved' ? { status: 'dispatched' as const, dispatchedAt: new Date() } : {}),
        whatsappMessageId: sent.messageId,
        dispatchNote: null,
      },
    });
    return 'sent' as const;
  } catch (error) {
    await prisma.salesJob.update({
      where: { id: job.id },
      data: { dispatchNote: error instanceof Error ? error.message : 'WhatsApp send failed' },
    });
    return 'failed' as const;
  }
}

/**
 * Every minute: send unsent WhatsApp reminders scheduled for today at or before the current local time.
 * After the distributor morning time, once per local day: create AI suggestions.
 * After that morning time: send approved jobs that have no explicit reminder.
 * Suggestions created in the same pass stay suggested until a manager approves them.
 */
export async function tickSalesJobs(now = new Date()): Promise<{ suggested: number; dispatched: number; failed: number }> {
  const distributors = await prisma.user.findMany({
    where: { salesAgents: { some: { status: 'active' } } },
    select: { id: true, salesJobSettings: true },
  });

  let suggested = 0;
  let dispatched = 0;
  let failed = 0;

  for (const distributor of distributors) {
    const settings = distributor.salesJobSettings;
    const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
    const hour = settings?.dispatchHour ?? 7;
    const minute = settings?.dispatchMinute ?? 0;
    const parts = zonedParts(now, timeZone);
    const isMorning = parts.hour > hour || (parts.hour === hour && parts.minute >= minute);
    const range = zonedDayRange(parts.dateKey, timeZone);

    if (isMorning && settings?.lastSuggestedDateKey !== parts.dateKey) {
      try {
        const result = await suggestSalesJobsForDistributor(distributor.id, parts.dateKey);
        suggested += result.created;
      } catch (error) {
        console.error('[sales-jobs] suggest failed', distributor.id, error);
      }
    }

    const dueSchedules = await prisma.salesJobSchedule.findMany({
      where: {
        sentAt: null,
        scheduledDate: { gte: range.start, lt: range.end },
        OR: [
          { reminderHour: { lt: parts.hour } },
          { reminderHour: parts.hour, reminderMinute: { lte: parts.minute } },
        ],
        job: {
          distributorId: distributor.id,
          status: { in: ['approved', 'dispatched', 'in_progress'] },
        },
      },
      include: {
        job: {
          include: {
            agent: { select: { phone: true, status: true } },
            client: { select: { storeName: true, owner: true } },
          },
        },
      },
    });

    const productIds = Array.from(new Set(dueSchedules.flatMap((row) => row.job.suggestedProducts)));
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { productId: { in: productIds } },
          select: { productId: true, name: true },
        })
      : [];
    const productName = new Map(products.map((product) => [product.productId, product.name]));

    const byJob = new Map<string, { job: DispatchableJob; scheduleIds: string[] }>();
    for (const row of dueSchedules) {
      const current = byJob.get(row.jobId) ?? {
        job: {
          id: row.job.id,
          jobType: row.job.jobType,
          priorityReason: row.job.priorityReason,
          suggestedProducts: row.job.suggestedProducts,
          status: row.job.status,
          agent: row.job.agent,
          client: row.job.client,
        },
        scheduleIds: [],
      };
      current.scheduleIds.push(row.id);
      byJob.set(row.jobId, current);
    }

    for (const entry of byJob.values()) {
      const result = await sendApprovedJob(entry.job, productName);
      if (result === 'sent') {
        await prisma.salesJobSchedule.updateMany({
          where: { id: { in: entry.scheduleIds } },
          data: { sentAt: new Date() },
        });
        dispatched += 1;
      } else {
        failed += 1;
      }
    }

    if (!isMorning) continue;

    const jobs = await prisma.salesJob.findMany({
      where: {
        distributorId: distributor.id,
        status: 'approved',
        scheduledDate: { gte: range.start, lt: range.end },
        schedules: { none: {} },
      },
      include: {
        agent: { select: { phone: true, status: true } },
        client: { select: { storeName: true, owner: true } },
      },
    });
    const legacyProductIds = Array.from(new Set(jobs.flatMap((job) => job.suggestedProducts)));
    const missingIds = legacyProductIds.filter((id) => !productName.has(id));
    if (missingIds.length) {
      const extra = await prisma.product.findMany({
        where: { productId: { in: missingIds } },
        select: { productId: true, name: true },
      });
      extra.forEach((product) => productName.set(product.productId, product.name));
    }
    for (const job of jobs) {
      const result = await sendApprovedJob(job, productName);
      if (result === 'sent') dispatched += 1;
      else failed += 1;
    }
  }

  return { suggested, dispatched, failed };
}
