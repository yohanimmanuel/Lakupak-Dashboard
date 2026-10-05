import { prisma } from '@/lib/db';
import { salesRepReplyLocale, upcomingJobsMessage, type RepJobLine } from '@/lib/salesJobs/repCopy';
import { suggestSalesJobsForDistributor } from '@/lib/salesJobs/suggest';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import { dispatchJobToWhatsApp } from '@/lib/salesJobs/whatsapp';

const OPEN_JOB_STATUSES = ['pending', 'approved', 'suggested', 'dispatched', 'in_progress'] as const;

type AgentRow = { id: string; name: string; phone: string; status: string };

type DigestJob = {
  id: string;
  jobType: string;
  priorityReason: string | null;
  suggestedProducts: string[];
  status: string;
  clientName: string;
  scheduleIds: string[];
};

type AgentBucket = {
  agent: AgentRow;
  jobs: Map<string, DigestJob>;
};

function clientLabel(client: { storeName: string; owner: string } | null): string {
  return client ? client.storeName || client.owner : '';
}

function addDigestJob(bucket: AgentBucket, job: Omit<DigestJob, 'scheduleIds'>, scheduleId?: string) {
  const current = bucket.jobs.get(job.id) ?? { ...job, scheduleIds: [] };
  if (scheduleId && !current.scheduleIds.includes(scheduleId)) current.scheduleIds.push(scheduleId);
  bucket.jobs.set(job.id, current);
}

async function sendAgentDigest(args: {
  distributorId: number;
  bucket: AgentBucket;
  productName: Map<string, string>;
  rangeStart: Date;
}): Promise<'sent' | 'failed'> {
  const due = Array.from(args.bucket.jobs.values());
  const note =
    args.bucket.agent.status !== 'active'
      ? 'Sales rep is inactive'
      : !args.bucket.agent.phone
        ? 'Sales rep has no WhatsApp number'
        : null;
  if (note) {
    await prisma.salesJob.updateMany({
      where: { id: { in: due.map((job) => job.id) } },
      data: { dispatchNote: note },
    });
    return 'failed';
  }

  const upcoming = await prisma.salesJob.findMany({
    where: {
      distributorId: args.distributorId,
      assignedTo: args.bucket.agent.id,
      status: { in: [...OPEN_JOB_STATUSES] },
      OR: [
        { scheduledDate: { gte: args.rangeStart } },
        { schedules: { some: { scheduledDate: { gte: args.rangeStart } } } },
      ],
    },
    include: { client: { select: { storeName: true, owner: true } } },
    orderBy: { scheduledDate: 'asc' },
  });

  const productIds = Array.from(
    new Set([...upcoming.flatMap((job) => job.suggestedProducts), ...due.flatMap((job) => job.suggestedProducts)]),
  );
  const missing = productIds.filter((id) => !args.productName.has(id));
  if (missing.length) {
    const extra = await prisma.product.findMany({
      where: { productId: { in: missing } },
      select: { productId: true, name: true },
    });
    extra.forEach((product) => args.productName.set(product.productId, product.name));
  }
  const names = (ids: string[]) => ids.map((id) => args.productName.get(id) || id);
  const orderIds = Array.from(new Set(upcoming.flatMap((job) => job.orderIds)));
  const orderRows = orderIds.length
    ? await prisma.order.findMany({
        where: { orderId: { in: orderIds } },
        select: { orderId: true, storeName: true, buyer: { select: { storeName: true, owner: true } } },
      })
    : [];
  const storeByOrder = new Map(
    orderRows.map((order) => [order.orderId, (order.buyer?.storeName || order.buyer?.owner || order.storeName).trim()]),
  );
  const clientNames = (job: { orderIds: string[]; client: { storeName: string; owner: string } | null }) => {
    const shops: string[] = [];
    for (const orderId of job.orderIds) {
      const name = storeByOrder.get(orderId);
      if (name && !shops.includes(name)) shops.push(name);
    }
    return shops.join(', ') || clientLabel(job.client);
  };

  const listed = new Map<string, RepJobLine>();
  for (const job of upcoming) {
    listed.set(job.id, {
      clientName: clientNames(job),
      jobType: job.jobType,
      productNames: names(job.suggestedProducts),
      reason: job.priorityReason,
    });
  }
  for (const job of due) {
    if (listed.has(job.id)) continue;
    listed.set(job.id, {
      clientName: job.clientName,
      jobType: job.jobType,
      productNames: names(job.suggestedProducts),
      reason: job.priorityReason,
    });
  }
  const lines = Array.from(listed.values());
  if (!lines.length) return 'failed';

  try {
    const locale = await salesRepReplyLocale(args.distributorId);
    const sent = await dispatchJobToWhatsApp({
      id: due[0].id,
      jobType: due[0].jobType,
      priorityReason: due[0].priorityReason,
      clientName: due[0].clientName,
      suggestedProductNames: names(due[0].suggestedProducts),
      agentPhone: args.bucket.agent.phone,
      locale,
      withButtons: false,
      body: upcomingJobsMessage(locale, args.bucket.agent.name, lines),
    });
    const scheduleIds = due.flatMap((job) => job.scheduleIds);
    if (scheduleIds.length) {
      await prisma.salesJobSchedule.updateMany({
        where: { id: { in: scheduleIds } },
        data: { sentAt: new Date() },
      });
    }
    for (const job of due) {
      await prisma.salesJob.update({
        where: { id: job.id },
        data: {
          ...(job.status === 'approved' || job.status === 'pending' || job.status === 'suggested'
            ? { status: 'dispatched' as const, dispatchedAt: new Date() }
            : {}),
          whatsappMessageId: sent.messageId,
          dispatchNote: null,
        },
      });
    }
    return 'sent';
  } catch (error) {
    await prisma.salesJob.updateMany({
      where: { id: { in: due.map((job) => job.id) } },
      data: { dispatchNote: error instanceof Error ? error.message : 'WhatsApp send failed' },
    });
    return 'failed';
  }
}

/**
 * Every minute: send unsent WhatsApp reminders scheduled for today at or before the current local time.
 * After the distributor morning time, once per local day: create AI suggestions.
 * After that morning time: send pending jobs that have no explicit reminder.
 * Suggestions are created as pending and can be sent the same morning.
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
          status: { in: ['pending', 'approved', 'suggested', 'dispatched', 'in_progress'] },
        },
      },
      include: {
        job: {
          include: {
            agent: { select: { id: true, name: true, phone: true, status: true } },
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

    const buckets = new Map<string, AgentBucket>();
    const bucketFor = (agent: AgentRow) => {
      const current = buckets.get(agent.id);
      if (current) return current;
      const created: AgentBucket = { agent, jobs: new Map() };
      buckets.set(agent.id, created);
      return created;
    };
    for (const row of dueSchedules) {
      addDigestJob(
        bucketFor(row.job.agent),
        {
          id: row.job.id,
          jobType: row.job.jobType,
          priorityReason: row.job.priorityReason,
          suggestedProducts: row.job.suggestedProducts,
          status: row.job.status,
          clientName: clientLabel(row.job.client),
        },
        row.id,
      );
    }

    if (isMorning) {
      const jobs = await prisma.salesJob.findMany({
        where: {
          distributorId: distributor.id,
          status: { in: ['pending', 'approved', 'suggested'] },
          scheduledDate: { gte: range.start, lt: range.end },
          schedules: { none: {} },
        },
        include: {
          agent: { select: { id: true, name: true, phone: true, status: true } },
          client: { select: { storeName: true, owner: true } },
        },
      });
      for (const job of jobs) {
        addDigestJob(bucketFor(job.agent), {
          id: job.id,
          jobType: job.jobType,
          priorityReason: job.priorityReason,
          suggestedProducts: job.suggestedProducts,
          status: job.status,
          clientName: clientLabel(job.client),
        });
      }
    }

    for (const bucket of buckets.values()) {
      const result = await sendAgentDigest({
        distributorId: distributor.id,
        bucket,
        productName,
        rangeStart: range.start,
      });
      if (result === 'sent') dispatched += 1;
      else failed += 1;
    }
  }

  return { suggested, dispatched, failed };
}
