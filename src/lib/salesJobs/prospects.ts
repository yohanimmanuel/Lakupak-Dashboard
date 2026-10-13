import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';

export type SalesProspect = {
  buyerId: string;
  customerNumber: string;
  owner: string;
  storeName: string;
  phone: string;
  address: string;
  region: string;
  status: string;
};

type ProspectInput = {
  customerNumber: string;
  name: string;
  storeName: string;
  phone: string;
  address: string;
  region?: string | null;
};

const prospectSelect = {
  buyerId: true,
  customerNumber: true,
  owner: true,
  storeName: true,
  phone: true,
  address: true,
  region: true,
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
  if (!customerNumber || !owner || !storeName || !phone || !address) {
    throw new Error('Fill in the new outlet');
  }
  return { customerNumber, owner, storeName, phone, address, region: region || null };
}

function mapProspect(row: {
  buyerId: string;
  customerNumber: string | null;
  owner: string;
  storeName: string;
  phone: string;
  address: string;
  region: string | null;
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
      businessType: '',
      status: 'Prospect',
    },
    select: prospectSelect,
  });
  return mapProspect(row);
}

export async function updateSalesProspect(distributorId: number, buyerId: string, input: ProspectInput) {
  const fields = readFields(input);
  const existing = await prisma.buyer.findFirst({
    where: { buyerId, userId: distributorId, status: 'Prospect' },
    select: { buyerId: true },
  });
  if (!existing) throw new Error('Prospect not found');
  await assertUniqueCustomerNumber(distributorId, fields.customerNumber, buyerId);
  const updated = await prisma.buyer.updateMany({
    where: { buyerId, userId: distributorId, status: 'Prospect' },
    data: fields,
  });
  if (updated.count !== 1) throw new Error('Prospect not found');
  const row = await prisma.buyer.findFirst({
    where: { buyerId, userId: distributorId, status: 'Prospect' },
    select: prospectSelect,
  });
  if (!row) throw new Error('Prospect not found');
  return mapProspect(row);
}
