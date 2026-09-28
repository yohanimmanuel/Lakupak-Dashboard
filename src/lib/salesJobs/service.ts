import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import {
  buildStoredCompletion,
  readCompletion,
  SALES_JOB_TYPES,
  type SalesJobType,
} from '@/lib/salesJobs/completion';
import { DEFAULT_JOB_TIMEZONE, zonedDayRange, zonedParts } from '@/lib/salesJobs/time';

const JOB_INCLUDE = {
  agent: { select: { id: true, name: true, phone: true, role: true } },
  client: { select: { buyerId: true, customerNumber: true, storeName: true, owner: true, phone: true, address: true, status: true } },
  schedules: { orderBy: { scheduledDate: 'asc' as const } },
} as const;

function assertJobType(value: string): SalesJobType {
  if (!(SALES_JOB_TYPES as readonly string[]).includes(value)) {
    throw new Error('Unknown job type');
  }
  return value as SalesJobType;
}

export async function listSalesJobs(args: {
  distributorId: number;
  status?: string | null;
  assignedTo?: string | null;
  date?: string | null;
}) {
  const settings = await prisma.salesJobSettings.findUnique({ where: { distributorId: args.distributorId } });
  const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
  const range = args.date ? zonedDayRange(args.date, timeZone) : null;
  const jobs = await prisma.salesJob.findMany({
    where: {
      distributorId: args.distributorId,
      ...(args.status ? { status: args.status } : {}),
      ...(args.assignedTo ? { assignedTo: args.assignedTo } : {}),
      ...(range
        ? {
            OR: [
              { scheduledDate: { gte: range.start, lt: range.end } },
              { schedules: { some: { scheduledDate: { gte: range.start, lt: range.end } } } },
            ],
          }
        : {}),
    },
    include: JOB_INCLUDE,
    orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
  });
  return attachProductNames(jobs.map((job) => mapJob(job, timeZone)));
}

async function attachProductNames<T extends { suggestedProducts: string[] }>(rows: T[]) {
  const ids = Array.from(new Set(rows.flatMap((row) => row.suggestedProducts)));
  if (ids.length === 0) return rows.map((row) => ({ ...row, suggestedProductNames: [] as string[] }));
  const products = await prisma.product.findMany({
    where: { productId: { in: ids } },
    select: { productId: true, name: true },
  });
  const names = new Map(products.map((product) => [product.productId, product.name]));
  return rows.map((row) => ({
    ...row,
    suggestedProductNames: row.suggestedProducts.map((id) => names.get(id) || id),
  }));
}

function mapJob(job: {
  id: string;
  assignedTo: string;
  clientId: string | null;
  jobType: string;
  priorityReason: string | null;
  suggestedProducts: string[];
  createdBy: string;
  status: string;
  scheduledDate: Date;
  completionNotes: string | null;
  completionData: unknown;
  dispatchNote: string | null;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  orderId?: string | null;
  orderIds?: string[];
  schedules?: { scheduledDate: Date; reminderHour: number; reminderMinute: number }[];
  agent: { id: string; name: string; phone: string; role: string };
  client: { buyerId: string; customerNumber: string | null; storeName: string; owner: string; phone: string; address: string; status: string } | null;
}, timeZone: string) {
  const schedules = (job.schedules ?? [])
    .slice()
    .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())
    .map((row) => ({
      date: zonedParts(row.scheduledDate, timeZone).dateKey,
      reminderTime: `${String(row.reminderHour).padStart(2, '0')}:${String(row.reminderMinute).padStart(2, '0')}`,
    }));
  return {
    id: job.id,
    assignedTo: job.assignedTo,
    agentName: job.agent.name,
    agentPhone: job.agent.phone,
    agentRole: job.agent.role,
    clientId: job.clientId ?? '',
    clientCustomerNumber: job.client?.customerNumber ?? '',
    clientName: job.client ? job.client.storeName || job.client.owner : '',
    clientOwner: job.client?.owner ?? '',
    clientPhone: job.client?.phone ?? '',
    clientAddress: job.client?.address ?? '',
    clientStatus: job.client?.status ?? '',
    jobType: job.jobType,
    priorityReason: job.priorityReason,
    suggestedProducts: job.suggestedProducts,
    createdBy: job.createdBy,
    status: job.status,
    orderId: job.orderId ?? null,
    orderIds: job.orderIds ?? [],
    schedules,
    scheduledDate: schedules[0]?.date ?? zonedParts(job.scheduledDate, timeZone).dateKey,
    createdAt: zonedParts(job.createdAt, timeZone).dateKey,
    completionNotes: job.completionNotes,
    completionData: readCompletion(job.completionData),
    dispatchNote: job.dispatchNote,
    dispatchedAt: job.dispatchedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

export async function createManualSalesJob(args: {
  distributorId: number;
  assignedTo: string;
  clientId: string;
  jobType: string;
  scheduledDate: string;
  priorityReason?: string | null;
  suggestedProducts?: string[] | null;
}) {
  const agent = await prisma.salesAgent.findFirst({
    where: { id: args.assignedTo, userId: args.distributorId },
    select: { id: true },
  });
  if (!agent) throw new Error('Sales rep not found');
  const client = await prisma.buyer.findFirst({
    where: { buyerId: args.clientId, userId: args.distributorId },
    select: { buyerId: true },
  });
  if (!client) throw new Error('Client not found');
  const settings = await prisma.salesJobSettings.findUnique({ where: { distributorId: args.distributorId } });
  const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
  const { start } = zonedDayRange(args.scheduledDate.slice(0, 10), timeZone);
  const created = await prisma.salesJob.create({
    data: {
      distributorId: args.distributorId,
      assignedTo: args.assignedTo,
      clientId: args.clientId,
      jobType: assertJobType(args.jobType),
      priorityReason: args.priorityReason?.trim() || null,
      suggestedProducts: args.suggestedProducts?.filter(Boolean) ?? [],
      createdBy: 'manager',
      status: 'pending',
      scheduledDate: start,
    },
    include: JOB_INCLUDE,
  });
  return (await attachProductNames([mapJob(created, timeZone)]))[0];
}

export async function reviewSalesJob(args: {
  distributorId: number;
  id: string;
  action: 'approve' | 'reject';
  clientId?: string | null;
  jobType?: string | null;
  scheduledDate?: string | null;
  suggestedProducts?: string[] | null;
  priorityReason?: string | null;
}) {
  const existing = await prisma.salesJob.findFirst({
    where: { id: args.id, distributorId: args.distributorId, status: 'suggested' },
  });
  if (!existing) throw new Error('Suggested job not found');
  const settings = await prisma.salesJobSettings.findUnique({ where: { distributorId: args.distributorId } });
  const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
  if (args.action === 'reject') {
    const updated = await prisma.salesJob.update({
      where: { id: existing.id },
      data: { status: 'skipped' },
      include: JOB_INCLUDE,
    });
    return (await attachProductNames([mapJob(updated, timeZone)]))[0];
  }

  let clientId = existing.clientId;
  if (args.clientId && args.clientId !== existing.clientId) {
    const client = await prisma.buyer.findFirst({
      where: { buyerId: args.clientId, userId: args.distributorId },
      select: { buyerId: true },
    });
    if (!client) throw new Error('Client not found');
    clientId = client.buyerId;
  }
  const scheduledDate = args.scheduledDate
    ? zonedDayRange(args.scheduledDate.slice(0, 10), timeZone).start
    : existing.scheduledDate;

  const updated = await prisma.salesJob.update({
    where: { id: existing.id },
    data: {
      status: 'pending',
      clientId,
      jobType: args.jobType ? assertJobType(args.jobType) : existing.jobType,
      scheduledDate,
      suggestedProducts: args.suggestedProducts ?? existing.suggestedProducts,
      priorityReason: args.priorityReason !== undefined ? args.priorityReason : existing.priorityReason,
    },
    include: JOB_INCLUDE,
  });
  return (await attachProductNames([mapJob(updated, timeZone)]))[0];
}

const MARK_PENDING_SOURCE_STATUSES = ['pending', 'approved', 'suggested', 'dispatched', 'in_progress', 'completed', 'skipped'] as const;

export async function markSalesJobsPending(args: { distributorId: number; ids: string[] }) {
  const ids = Array.from(new Set(args.ids.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return 0;
  const result = await prisma.salesJob.updateMany({
    where: {
      id: { in: ids },
      distributorId: args.distributorId,
      status: { in: [...MARK_PENDING_SOURCE_STATUSES] },
    },
    data: { status: 'pending', completedAt: null },
  });
  return result.count;
}

export async function completeSalesJob(args: {
  distributorId: number;
  id: string;
  completion: unknown;
  notes?: string | null;
}) {
  const existing = await prisma.salesJob.findFirst({
    where: {
      id: args.id,
      distributorId: args.distributorId,
      status: { in: ['pending', 'approved', 'suggested', 'dispatched', 'in_progress'] },
    },
  });
  if (!existing) throw new Error('Job cannot be completed');
  const completion = buildStoredCompletion(existing.jobType, args.completion);
  if (existing.jobType === 'returns_pickup') {
    const productIds = Array.from(new Set((completion.items_returned ?? []).map((item) => item.product_id)));
    if (productIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { userId: args.distributorId, productId: { in: productIds } },
        select: { productId: true },
      });
      if (products.length !== productIds.length) throw new Error('One or more products were not found');
    }
  }
  if (existing.jobType === 'new_product_activation') {
    const productIds = Array.from(new Set(completion.product_ids ?? (completion.product_id ? [completion.product_id] : [])));
    if (productIds.length === 0) throw new Error('Select at least one product');
    const products = await prisma.product.findMany({
      where: { userId: args.distributorId, productId: { in: productIds } },
      select: { productId: true },
    });
    if (products.length !== productIds.length) throw new Error('One or more products were not found');
  }
  if (existing.jobType === 'scheme_reconciliation' && completion.scheme_reference) {
    const offer = await prisma.offer.findFirst({
      where: { userId: args.distributorId, offerId: completion.scheme_reference },
      select: { buyerId: true },
    });
    if (offer?.buyerId && offer.buyerId !== existing.clientId) throw new Error('That offer belongs to another client');
  }
  const updated = await prisma.salesJob.update({
    where: { id: existing.id },
    data: {
      status: 'completed',
      completionData: completion,
      completionNotes: args.notes?.trim() || completion.notes || existing.completionNotes,
      completedAt: new Date(),
    },
    include: JOB_INCLUDE,
  });
  const settings = await prisma.salesJobSettings.findUnique({ where: { distributorId: args.distributorId } });
  const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
  return (await attachProductNames([mapJob(updated, timeZone)]))[0];
}

export async function salesJobDayAggregates(distributorId: number, agentId: string) {
  const settings = await prisma.salesJobSettings.findUnique({ where: { distributorId } });
  const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
  const jobs = await prisma.salesJob.findMany({
    where: { distributorId, assignedTo: agentId, status: 'completed' },
    select: { clientId: true, completedAt: true, scheduledDate: true, completionData: true },
  });
  const byDate = new Map<string, { clients: Set<string>; visits: number; products: number; sales: number }>();
  for (const job of jobs) {
    const when = job.completedAt ?? job.scheduledDate;
    const key = zonedParts(when, timeZone).dateKey;
    const row = byDate.get(key) ?? { clients: new Set<string>(), visits: 0, products: 0, sales: 0 };
    const data = readCompletion(job.completionData);
    row.visits += 1;
    if (job.clientId) row.clients.add(job.clientId);
    row.products += data.products_demoed;
    if (data.order_placed && data.order_amount) row.sales += data.order_amount;
    byDate.set(key, row);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, row]) => ({
      date,
      visits: row.visits,
      customersMet: row.clients.size,
      productsDemonstrated: row.products,
      salesMade: row.sales,
    }));
}

export async function getSalesJobSettings(distributorId: number) {
  const row = await prisma.salesJobSettings.findUnique({ where: { distributorId } });
  return {
    dispatchHour: row?.dispatchHour ?? 7,
    dispatchMinute: row?.dispatchMinute ?? 0,
    unresolvedCutoffHour: row?.unresolvedCutoffHour ?? 18,
    timezone: row?.timezone || DEFAULT_JOB_TIMEZONE,
  };
}

export async function updateSalesJobSettings(args: {
  distributorId: number;
  dispatchHour: number;
  dispatchMinute: number;
  unresolvedCutoffHour: number;
}) {
  const dispatchHour = Math.min(23, Math.max(0, Math.floor(args.dispatchHour)));
  const dispatchMinute = Math.min(59, Math.max(0, Math.floor(args.dispatchMinute)));
  const unresolvedCutoffHour = Math.min(23, Math.max(0, Math.floor(args.unresolvedCutoffHour)));
  const row = await prisma.salesJobSettings.upsert({
    where: { distributorId: args.distributorId },
    update: { dispatchHour, dispatchMinute, unresolvedCutoffHour },
    create: {
      distributorId: args.distributorId,
      dispatchHour,
      dispatchMinute,
      unresolvedCutoffHour,
      timezone: DEFAULT_JOB_TIMEZONE,
    },
  });
  return {
    dispatchHour: row.dispatchHour,
    dispatchMinute: row.dispatchMinute,
    unresolvedCutoffHour: row.unresolvedCutoffHour,
    timezone: row.timezone,
  };
}

export async function listUnresolvedSalesJobs(distributorId: number) {
  const settings = await getSalesJobSettings(distributorId);
  const now = zonedParts(new Date(), settings.timezone);
  const pastCutoff = now.hour > settings.unresolvedCutoffHour || (now.hour === settings.unresolvedCutoffHour && now.minute > 0);
  const today = zonedDayRange(now.dateKey, settings.timezone);
  const jobs = await prisma.salesJob.findMany({
    where: {
      distributorId,
      status: 'dispatched',
      OR: [
        { scheduledDate: { lt: today.start } },
        ...(pastCutoff ? [{ scheduledDate: { gte: today.start, lt: today.end } }] : []),
      ],
    },
    include: JOB_INCLUDE,
    orderBy: { scheduledDate: 'asc' },
  });
  return attachProductNames(jobs.map((job) => mapJob(job, settings.timezone)));
}

type ScheduleInput = { scheduledDate: string; reminderHour: number; reminderMinute: number };

export type CreateSalesJobItem = {
  id?: string | null;
  jobType: string;
  priorityReason?: string | null;
  clientId?: string | null;
  orderId?: string | null;
  orderIds?: string[] | null;
  productIds?: string[] | null;
  prospect?: {
    customerNumber: string;
    name: string;
    storeName: string;
    phone: string;
    address: string;
  } | null;
  schedules: ScheduleInput[];
};

function normalizeSchedules(schedules: ScheduleInput[], timeZone: string) {
  if (!schedules.length) throw new Error('Add at least one date and WhatsApp reminder');
  const seen = new Set<string>();
  return schedules.map((row) => {
    const dateKey = row.scheduledDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Each visit needs a date');
    const reminderHour = Math.floor(row.reminderHour);
    const reminderMinute = Math.floor(row.reminderMinute);
    if (reminderHour < 0 || reminderHour > 23 || reminderMinute < 0 || reminderMinute > 59) {
      throw new Error('WhatsApp reminder time is not valid');
    }
    const key = `${dateKey} ${reminderHour}:${reminderMinute}`;
    if (seen.has(key)) throw new Error('A job cannot repeat the same date and reminder time');
    seen.add(key);
    return { dateKey, start: zonedDayRange(dateKey, timeZone).start, reminderHour, reminderMinute };
  });
}

export async function deleteSalesJobs(args: { distributorId: number; ids: string[] }) {
  const ids = Array.from(new Set(args.ids.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return 0;
  const result = await prisma.salesJob.deleteMany({
    where: { id: { in: ids }, distributorId: args.distributorId },
  });
  return result.count;
}

export async function createSalesJobs(args: {
  distributorId: number;
  assignedTo: string;
  jobs: CreateSalesJobItem[];
  replaceIds?: string[];
}) {
  if (!args.jobs.length) throw new Error('Add at least one job');
  const agent = await prisma.salesAgent.findFirst({
    where: { id: args.assignedTo, userId: args.distributorId, status: 'active' },
    select: { id: true },
  });
  if (!agent) throw new Error('Sales rep not found');
  const settings = await prisma.salesJobSettings.findUnique({ where: { distributorId: args.distributorId } });
  const timeZone = settings?.timezone || DEFAULT_JOB_TIMEZONE;
  const submittedIds = args.jobs.map((item) => item.id?.trim() || '').filter(Boolean);
  if (new Set(submittedIds).size !== submittedIds.length) throw new Error('A job cannot be updated more than once');

  const created = await prisma.$transaction(async (tx) => {
    const replaceIds = Array.from(new Set((args.replaceIds ?? []).map((id) => id.trim()).filter(Boolean)));
    const keptIds = new Set(
      args.jobs
        .map((item) => item.id?.trim() || '')
        .filter((id) => id && replaceIds.includes(id)),
    );
    const droppedIds = replaceIds.filter((id) => !keptIds.has(id));
    if (droppedIds.length > 0) {
      await tx.salesJob.deleteMany({
        where: { id: { in: droppedIds }, distributorId: args.distributorId },
      });
    }
    const rows = [];
    for (const item of args.jobs) {
      const existingId = item.id?.trim() || '';
      const jobType = assertJobType(item.jobType);
      const schedules = normalizeSchedules(item.schedules ?? [], timeZone);
      const earliest = schedules.slice().sort((a, b) => a.start.getTime() - b.start.getTime())[0];
      let clientId: string | null = item.clientId?.trim() || null;
      let orderId: string | null = null;
      let productIds: string[] = [];

      let linkedOrderIds: string[] = [];
      if (jobType === 'take_order' || jobType === 'collect_payment' || jobType === 'returns_pickup') {
        const requested = Array.from(
          new Set([...(item.orderIds ?? []), item.orderId ?? ''].map((id) => id.trim()).filter(Boolean)),
        );
        if (requested.length === 0) throw new Error('Select an order');
        const orders = await tx.order.findMany({
          where: { orderId: { in: requested }, userId: args.distributorId, isDeleted: false },
          select: { orderId: true, buyerId: true, paymentStatus: true, orderStatus: true },
        });
        if (orders.length !== requested.length) throw new Error('Select an order that belongs to a client');
        if (orders.some((order) => !order.buyerId || order.orderStatus === 'Cancelled')) {
          throw new Error('Select an order that belongs to a client');
        }
        if (jobType === 'collect_payment' && orders.some((order) => order.paymentStatus === 'Paid')) {
          throw new Error('This order is already paid');
        }
        const buyers = new Set(orders.map((order) => order.buyerId));
        if (buyers.size !== 1) throw new Error('Choose orders for the same client');
        clientId = orders[0].buyerId as string;
        linkedOrderIds = requested;
        orderId = requested[0];
      } else if (
        jobType === 'promote_product' ||
        jobType === 'stock_check' ||
        jobType === 'new_product_activation' ||
        jobType === 'competitor_intel' ||
        jobType === 'scheme_reconciliation'
      ) {
        if (!clientId) throw new Error('Select a client');
        const client = await tx.buyer.findFirst({
          where: { buyerId: clientId, userId: args.distributorId },
          select: { buyerId: true },
        });
        if (!client) throw new Error('Client not found');
        if (jobType === 'promote_product' || jobType === 'stock_check' || jobType === 'new_product_activation') {
          productIds = Array.from(new Set((item.productIds ?? []).map((id) => id.trim()).filter(Boolean)));
          if (productIds.length === 0) throw new Error('Select at least one product');
          const products = await tx.product.findMany({
            where: { userId: args.distributorId, productId: { in: productIds } },
            select: { productId: true },
          });
          if (products.length !== productIds.length) throw new Error('One or more products were not found');
        }
      } else {
        const prospect = item.prospect;
        const customerNumber = prospect?.customerNumber.trim() ?? '';
        const name = prospect?.name.trim() ?? '';
        const storeName = prospect?.storeName.trim() ?? '';
        const phone = prospect?.phone.trim() ?? '';
        const address = prospect?.address.trim() ?? '';
        if (!customerNumber || !name || !storeName || !phone || !address) {
          throw new Error('Fill in the new outlet');
        }
        const editingThisJob = Boolean(existingId) && keptIds.has(existingId);
        let storedClientId: string | null = null;
        if (editingThisJob) {
          const current = await tx.salesJob.findFirst({
            where: { id: existingId, distributorId: args.distributorId },
            select: { clientId: true },
          });
          storedClientId = current?.clientId ?? null;
          if (!clientId) clientId = storedClientId;
        }
        const linked = clientId
          ? await tx.buyer.findFirst({
              where: { buyerId: clientId, userId: args.distributorId },
              select: { buyerId: true, status: true },
            })
          : null;
        const reusable = Boolean(linked && (linked.status === 'Prospect' || linked.buyerId.startsWith('LKP-')));
        const sameStoredBuyer = Boolean(linked && storedClientId && linked.buyerId === storedClientId);
        const keepLinked = Boolean(linked && (reusable || (editingThisJob && sameStoredBuyer)));
        const duplicate = await tx.buyer.findFirst({
          where: {
            userId: args.distributorId,
            customerNumber,
            ...(keepLinked && linked ? { buyerId: { not: linked.buyerId } } : {}),
          },
          select: { buyerId: true },
        });
        if (duplicate) throw new Error('Customer number already exists');
        if (keepLinked && linked) {
          await tx.buyer.update({
            where: { buyerId: linked.buyerId },
            data: { customerNumber, owner: name, storeName, phone, address },
          });
          clientId = linked.buyerId;
        } else {
          const buyerId = `LKP-${randomUUID()}`;
          await tx.buyer.create({
            data: {
              buyerId,
              customerNumber,
              userId: args.distributorId,
              owner: name,
              storeName,
              phone,
              address,
              email: '',
              businessType: '',
              status: 'Prospect',
            },
          });
          clientId = buyerId;
        }
      }

      const scheduleRows = schedules.map((schedule) => ({
        scheduledDate: schedule.start,
        reminderHour: schedule.reminderHour,
        reminderMinute: schedule.reminderMinute,
      }));
      const jobFields = {
        assignedTo: args.assignedTo,
        clientId,
        orderId,
        orderIds: linkedOrderIds,
        jobType,
        priorityReason: item.priorityReason?.trim() || null,
        suggestedProducts: productIds,
        scheduledDate: earliest.start,
      };
      if (keptIds.has(existingId)) {
        const owned = await tx.salesJob.findFirst({
          where: { id: existingId, distributorId: args.distributorId },
          select: { id: true },
        });
        if (!owned) throw new Error('Job not found');
      }
      const row = keptIds.has(existingId)
        ? await tx.salesJob.update({
            where: { id: existingId },
            data: {
              ...jobFields,
              status: 'pending',
              schedules: { deleteMany: {}, create: scheduleRows },
            },
            include: JOB_INCLUDE,
          })
        : await tx.salesJob.create({
            data: {
              ...jobFields,
              distributorId: args.distributorId,
              createdBy: 'manager',
              status: 'pending',
              schedules: { create: scheduleRows },
            },
            include: JOB_INCLUDE,
          });
      rows.push(row);
    }
    return rows;
  });

  return attachProductNames(created.map((job) => mapJob(job, timeZone)));
}

export async function listSalesJobOrders(args: { distributorId: number; purpose: string; search?: string | null }) {
  const search = args.search?.trim();
  const orders = await prisma.order.findMany({
    where: {
      userId: args.distributorId,
      isDeleted: false,
      buyerId: { not: null },
      orderStatus: { notIn: ['Cancelled', 'Returned'] },
      ...(args.purpose === 'collect_payment' ? { paymentStatus: { not: 'Paid' } } : {}),
      ...(search
        ? {
            OR: [
              { orderId: { contains: search, mode: 'insensitive' } },
              { storeName: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      orderId: true,
      storeName: true,
      contactPerson: true,
      buyerId: true,
      orderStatus: true,
      paymentStatus: true,
      totalAmount: true,
      orderDate: true,
    },
    orderBy: { orderDate: 'desc' },
    take: 40,
  });
  return orders.map((order) => ({
    orderId: order.orderId,
    storeName: order.storeName,
    contactPerson: order.contactPerson,
    buyerId: order.buyerId,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    totalAmount: Number(order.totalAmount),
    orderDate: zonedParts(order.orderDate, DEFAULT_JOB_TIMEZONE).dateKey,
  }));
}
