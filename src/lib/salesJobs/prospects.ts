import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { isProspectBuyerType } from '@/lib/salesJobs/prospectBuyerTypes';

export type SalesProspect = {
  buyerId: string;
  customerNumber: string;
  owner: string;
  storeName: string;
  phone: string;
  address: string;
  region: string;
  buyerType: string;
  notes: string;
  status: string;
};

type ProspectInput = {
  customerNumber: string;
  name: string;
  storeName: string;
  phone: string;
  address: string;
  region?: string | null;
  buyerType?: string | null;
  notes?: string | null;
};

const prospectSelect = {
  buyerId: true,
  customerNumber: true,
  owner: true,
  storeName: true,
  phone: true,
  address: true,
  region: true,
  businessType: true,
  notes: true,
  status: true,
} as const;

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function readFields(input: ProspectInput) {
  const customerNumber = clip(input.customerNumber, 50);
  const owner = clip(input.name, 100);
  const storeName = clip(input.storeName, 100);
  const phone = clip(input.phone, 20);
  const address = clip(input.address, 500);
  const region = clip(input.region ?? '', 80);
  const buyerType = clip(input.buyerType ?? '', 40);
  const notes = clip(input.notes ?? '', 500);
  if (!customerNumber || !owner || !storeName || !phone || !address) {
    throw new Error('Fill in the new outlet');
  }
  if (buyerType && !isProspectBuyerType(buyerType)) {
    throw new Error('Fill in the new outlet');
  }
  return { customerNumber, owner, storeName, phone, address, region: region || null, businessType: buyerType, notes: notes || null };
}

function mapProspect(row: {
  buyerId: string;
  customerNumber: string | null;
  owner: string;
  storeName: string;
  phone: string;
  address: string;
  region: string | null;
  businessType: string;
  notes: string | null;
  status: string;
}): SalesProspect {
  return {
    buyerId: row.buyerId,
    customerNumber: row.customerNumber ?? '',
    owner: row.owner,
    storeName: row.storeName,
    phone: row.phone,
    address: row.address,
    region: row.region ?? '',
    buyerType: row.businessType ?? '',
    notes: row.notes ?? '',
    status: row.status,
  };
}

async function assertUniqueCustomerNumber(distributorId: number, customerNumber: string, exceptBuyerId?: string) {
  const duplicate = await prisma.buyer.findFirst({
    where: {
      userId: distributorId,
      customerNumber,
      ...(exceptBuyerId ? { buyerId: { not: exceptBuyerId } } : {}),
    },
    select: { buyerId: true },
  });
  if (duplicate) throw new Error('Customer number already exists');
}

export async function listSalesProspects(distributorId: number) {
  const rows = await prisma.buyer.findMany({
    where: { userId: distributorId, status: 'Prospect' },
    select: prospectSelect,
    orderBy: [{ storeName: 'asc' }, { owner: 'asc' }],
  });
  return rows.map(mapProspect);
}

export async function getSalesProspect(distributorId: number, buyerId: string) {
  const row = await prisma.buyer.findFirst({
    where: { userId: distributorId, buyerId, status: 'Prospect' },
    select: prospectSelect,
  });
  return row ? mapProspect(row) : null;
}

export async function createSalesProspect(distributorId: number, input: ProspectInput) {
  const fields = readFields(input);
  await assertUniqueCustomerNumber(distributorId, fields.customerNumber);
  const row = await prisma.buyer.create({
    data: {
      buyerId: `LKP-${randomUUID()}`,
      userId: distributorId,
      customerNumber: fields.customerNumber,
      owner: fields.owner,
      storeName: fields.storeName,
      phone: fields.phone,
      address: fields.address,
      region: fields.region,
      email: '',
      businessType: fields.businessType,
      notes: fields.notes,
      status: 'Prospect',
    },
    select: prospectSelect,
  });
  return mapProspect(row);
}

export async function updateSalesProspect(distributorId: number, buyerId: string, input: ProspectInput) {
  const { notes, businessType, ...rest } = readFields(input);
  const data = {
    ...rest,
    ...(input.notes !== undefined ? { notes } : {}),
    ...(businessType ? { businessType } : {}),
  };
  const existing = await prisma.buyer.findFirst({
    where: { buyerId, userId: distributorId, status: 'Prospect' },
    select: { buyerId: true },
  });
  if (!existing) throw new Error('Prospect not found');
  await assertUniqueCustomerNumber(distributorId, rest.customerNumber, buyerId);
  const updated = await prisma.buyer.updateMany({
    where: { buyerId, userId: distributorId, status: 'Prospect' },
    data,
  });
  if (updated.count !== 1) throw new Error('Prospect not found');
  const row = await prisma.buyer.findFirst({
    where: { buyerId, userId: distributorId, status: 'Prospect' },
    select: prospectSelect,
  });
  if (!row) throw new Error('Prospect not found');
  return mapProspect(row);
}

export async function deleteSalesProspects(distributorId: number, buyerIds: string[]) {
  const ids = [...new Set(buyerIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { deleted: 0, skipped: 0 };

  return prisma.$transaction(async (tx) => {
    let deleted = 0;
    let skipped = 0;
    for (let start = 0; start < ids.length; start += 100) {
      const chunk = ids.slice(start, start + 100);
      const prospects = await tx.buyer.findMany({
        where: { userId: distributorId, status: 'Prospect', buyerId: { in: chunk } },
        select: { buyerId: true },
      });
      const prospectIds = prospects.map((row) => row.buyerId);
      if (!prospectIds.length) continue;

      const ordered = await tx.order.findMany({
        where: { buyerId: { in: prospectIds } },
        select: { buyerId: true },
      });
      const blocked = new Set(ordered.map((row) => row.buyerId).filter((id): id is string => Boolean(id)));
      const deletable = prospectIds.filter((id) => !blocked.has(id));
      skipped += blocked.size;
      if (!deletable.length) continue;

      await tx.salesJob.updateMany({
        where: { distributorId, clientId: { in: deletable } },
        data: { clientId: null },
      });
      const linkedJobs = await tx.salesJob.findMany({
        where: { distributorId, clientIds: { hasSome: deletable } },
        select: { id: true, clientIds: true },
      });
      for (const job of linkedJobs) {
        const nextIds = job.clientIds.filter((id) => !deletable.includes(id));
        if (nextIds.length === job.clientIds.length) continue;
        await tx.salesJob.update({ where: { id: job.id }, data: { clientIds: nextIds } });
      }

      const removed = await tx.buyer.deleteMany({
        where: { userId: distributorId, status: 'Prospect', buyerId: { in: deletable } },
      });
      deleted += removed.count;
    }
    return { deleted, skipped };
  });
}
