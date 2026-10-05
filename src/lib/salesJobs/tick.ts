import { prisma } from '@/lib/db';
import { dispatchSalesJobCreatedAutomations, noteSalesWorkflowOutbound } from '@/lib/automations/engine';
import { salesRepReplyLocale, upcomingJobsMessage, type RepJobLine } from '@/lib/salesJobs/repCopy';
import { suggestSalesJobsForDistributor } from '@/lib/salesJobs/suggest';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';
import { dispatchJobToWhatsApp } from '@/lib/salesJobs/whatsapp';

type AgentRow = { id: string; name: string; phone: string; status: string };

type ReminderSlot = {
  dateKey: string;
  hour: number;
  minute: number;
  scheduleId: string;
};

type DigestJob = {
  id: string;
  jobType: string;
  priorityReason: string | null;
  suggestedProducts: string[];
  status: string;
  clientName: string;
  slots: ReminderSlot[];
};

type AgentBucket = {
  agent: AgentRow;
  jobs: Map<string, DigestJob>;
};

function clientLabel(client: { storeName: string; owner: string } | null): string {
  return client ? client.storeName || client.owner : '';
}

function addDigestJob(bucket: AgentBucket, job: Omit<DigestJob, 'slots'>, slot?: ReminderSlot) {
  const current = bucket.jobs.get(job.id) ?? { ...job, slots: [] };
  if (slot && !current.slots.some((row) => row.scheduleId === slot.scheduleId)) current.slots.push(slot);
  bucket.jobs.set(job.id, current);
}

function reminderScope(job: DigestJob): string {
  const scheduleIds = job.slots.map((slot) => slot.scheduleId).filter(Boolean).slice().sort();
  return scheduleIds.length > 0 ? `schedules:${scheduleIds.join(',')}` : `job:${job.id}`;
}

function slotKey(slot: ReminderSlot): string {
  return `${slot.dateKey}|${slot.hour}|${slot.minute}`;
}

/** One WhatsApp list per reminder clock time. A 14:27 job stays out of the 20:24 list. */
function groupsFor(jobs: DigestJob[], todayKey: string): { key: string; jobs: DigestJob[]; reminder?: { dateKey: string; hour: number; minute: number }; unscheduled: boolean }[] {
  const groups = new Map<string, { key: string; jobs: DigestJob[]; reminder?: { dateKey: string; hour: number; minute: number }; unscheduled: boolean }>();
  for (const job of jobs) {
    if (job.slots.length === 0) {
      const key = `unscheduled:${todayKey}`;
      const group = groups.get(key) ?? { key, jobs: [], unscheduled: true };
      group.jobs.push(job);
      groups.set(key, group);
      continue;
    }
    const bySlot = new Map<string, DigestJob>();
    for (const slot of job.slots) {
      const key = slotKey(slot);
      const existing = bySlot.get(key);
      if (existing) {
        existing.slots.push(slot);
        continue;
      }
      bySlot.set(key, { ...job, slots: [slot] });
    }
    for (const [key, slotJob] of bySlot) {
      const slot = slotJob.slots[0];
      const group = groups.get(key) ?? {
        key,
        jobs: [],
        unscheduled: false,
        reminder: { dateKey: slot.dateKey, hour: slot.hour, minute: slot.minute },
      };
      group.jobs.push(slotJob);
      groups.set(key, group);
    }
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.unscheduled !== b.unscheduled) return a.unscheduled ? -1 : 1;
    const hour = (a.reminder?.hour ?? 0) - (b.reminder?.hour ?? 0);
    if (hour !== 0) return hour;
    return (a.reminder?.minute ?? 0) - (b.reminder?.minute ?? 0);
  });
}

async function sendAgentDigest(args: {
  distributorId: number;
  bucket: AgentBucket;
  productName: Map<string, string>;
  excludeJobIds?: ReadonlySet<string>;
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

  const dueIds = due.map((job) => job.id).filter((id) => !args.excludeJobIds?.has(id));
  const listedJobs = dueIds.length
    ? await prisma.salesJob.findMany({
        where: { id: { in: dueIds }, distributorId: args.distributorId },
        include: { client: { select: { storeName: true, owner: true } } },
        orderBy: { scheduledDate: 'asc' },
      })
    : [];

  const productIds = Array.from(
    new Set([...listedJobs.flatMap((job) => job.suggestedProducts), ...due.flatMap((job) => job.suggestedProducts)]),
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
  const clientIds = Array.from(new Set(listedJobs.flatMap((job) => job.clientIds)));
  const buyerRows = clientIds.length
    ? await prisma.buyer.findMany({
        where: { buyerId: { in: clientIds } },
        select: { buyerId: true, storeName: true, owner: true },
      })
    : [];
  const storeByClient = new Map(buyerRows.map((buyer) => [buyer.buyerId, (buyer.storeName || buyer.owner).trim()]));
  const orderIds = Array.from(new Set(listedJobs.flatMap((job) => job.orderIds)));
  const orderRows = orderIds.length
    ? await prisma.order.findMany({
        where: { orderId: { in: orderIds } },
        select: { orderId: true, storeName: true, buyer: { select: { storeName: true, owner: true } } },
      })
    : [];
  const storeByOrder = new Map(
    orderRows.map((order) => [order.orderId, (order.buyer?.storeName || order.buyer?.owner || order.storeName).trim()]),
  );
  const clientNames = (job: { jobType: string; clientIds: string[]; orderIds: string[]; client: { storeName: string; owner: string } | null }) => {
    const shops: string[] = [];
    for (const clientId of job.clientIds) {
      const name = storeByClient.get(clientId);
      if (name && !shops.includes(name)) shops.push(name);
    }
    for (const orderId of job.orderIds) {
      const name = storeByOrder.get(orderId);
      if (name && !shops.includes(name)) shops.push(name);
    }
    if (job.jobType === 'stock_check' && shops.length === 0) return '';
    return shops.join(', ') || clientLabel(job.client);
  };

  const listed = new Map<string, RepJobLine>();
  for (const job of listedJobs) {
    listed.set(job.id, {
      clientName: clientNames(job),
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
    const scheduleIds = due.flatMap((job) => job.slots.map((slot) => slot.scheduleId));
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
    await noteSalesWorkflowOutbound(
      args.distributorId,
      `Sent the WhatsApp job list to ${args.bucket.agent.name}.`,
    );
    return 'sent';
  } catch (error) {
    await prisma.salesJob.updateMany({
      where: { id: { in: due.map((job) => job.id) } },
      data: { dispatchNote: error instanceof Error ? error.message : 'WhatsApp send failed' },
    });
    return 'failed';
  }
}

async function markDigestHandled(due: DigestJob[]) {
  if (!due.length) return;
  const scheduleIds = due.flatMap((job) => job.slots.map((slot) => slot.scheduleId));
  if (scheduleIds.length) {
    await prisma.salesJobSchedule.updateMany({
      where: { id: { in: scheduleIds }, sentAt: null },
      data: { sentAt: new Date() },
    });
  }
  const sent = await prisma.salesJob.findFirst({
    where: { id: due[0].id },
    select: { whatsappMessageId: true },
  });
  for (const job of due) {
    await prisma.salesJob.update({
      where: { id: job.id },
      data: {
        ...(job.status === 'approved' || job.status === 'pending' || job.status === 'suggested'
          ? { status: 'dispatched' as const }
          : {}),
        dispatchedAt: new Date(),
        ...(sent?.whatsappMessageId ? { whatsappMessageId: sent.whatsappMessageId } : {}),
        dispatchNote: null,
      },
    });
  }
}

/**
 * Every minute: send unsent WhatsApp reminders scheduled for today at or before the current local time.
 * Each reminder clock time is its own message. A 14:27 job is not listed in the 20:24 message.
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
        {
          dateKey: zonedParts(row.scheduledDate, timeZone).dateKey,
          hour: row.reminderHour,
          minute: row.reminderMinute,
          scheduleId: row.id,
        },
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
      const groups = groupsFor(Array.from(bucket.jobs.values()), parts.dateKey);
      for (const group of groups) {
        const due = group.jobs;
        const covered: DigestJob[] = [];
        const uncovered: DigestJob[] = [];
        const inProgress: DigestJob[] = [];
        let sentThisBatch = false;
        const reminder = group.unscheduled ? { dateKey: parts.dateKey, unscheduled: true as const } : group.reminder;
        for (const job of due) {
          if (sentThisBatch) {
            covered.push(job);
            continue;
          }
          try {
            const outcome = await dispatchSalesJobCreatedAutomations(distributor.id, [job.id], reminderScope(job), reminder);
            const finished = outcome.executed + outcome.completedExisting > 0;
            if (finished && outcome.inProgressExisting === 0) {
              covered.push(job);
              if (outcome.executed > 0) sentThisBatch = true;
            } else if (outcome.inProgressExisting === 0) uncovered.push(job);
            else inProgress.push(job);
          } catch (error) {
            console.error('[sales-jobs] workflow dispatch failed', distributor.id, job.id, error);
            failed += 1;
          }
        }
        if (covered.length > 0) {
          await markDigestHandled(covered);
          dispatched += 1;
        }
        if (uncovered.length === 0) continue;
        const result = await sendAgentDigest({
          distributorId: distributor.id,
          bucket: { agent: bucket.agent, jobs: new Map(uncovered.map((job) => [job.id, job])) },
          productName,
          excludeJobIds: new Set([...covered, ...inProgress].map((job) => job.id)),
        });
        if (result === 'sent') {
          await markDigestHandled(uncovered);
          dispatched += 1;
        } else failed += 1;
      }
    }
  }

  return { suggested, dispatched, failed };
}
