import { type Buyer as BuyerModel, type Supplier as SupplierModel } from '@/lib/db';
import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo, isNumericId, parseMoney } from '../common/utils';
import {
  validateBuyerInput,
  sanitizeBuyerData,
  validateBuyerUpdate,
} from '@/utils/buyer-security';
import {
  validateSupplierInput,
  sanitizeSupplierData,
  generateUniqueSupplierId,
} from '@/utils/supplier-security';
import type { SupplierFormData } from '@/types/client';
import { NotificationService } from '../notifications';

const nullToUndefined = <T extends Record<string, unknown>>(obj: T): { [K in keyof T]: T[K] extends null ? undefined : T[K] } => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, value === null ? undefined : value])
  ) as { [K in keyof T]: T[K] extends null ? undefined : T[K] };
};

export const contactsTypeDefs = /* GraphQL */ `
  type Buyer {
    id: Int!
    buyerId: String!
    avatar: String
    owner: String!
    storeName: String!
    email: String!
    phone: String!
    businessType: String!
    address: String!
    status: String!
    logistics: String
    notes: String
    orderDetails: String
    avgMonthlySpending: Float
    avgMonthlyOrders: Float
    userId: Int
    createdAt: String!
    updatedAt: String!
  }

  type BuyerConnection {
    nodes: [Buyer!]!
    pagination: PaginationInfo!
  }

  type Supplier {
    id: Int!
    supplierId: String!
    name: String!
    contact: String!
    email: String!
    phone: String!
    businessType: String!
    address: String!
    status: String!
    logistics: String
    notes: String
    supplies: String
    avgMonthlyPurchaseValue: Float
    totalPurchases: Float
    totalSupplies: Float
    onTimeDeliveryRate: Float
    userId: Int
    createdAt: String!
    updatedAt: String!
  }

  type SupplierConnection {
    nodes: [Supplier!]!
    pagination: PaginationInfo!
  }

  type DeleteBuyerResult {
    success: Boolean!
    deleted: Buyer
  }

  type DeleteSupplierResult {
    success: Boolean!
    deleted: Supplier
  }

  extend type Query {
    buyers(
      userId: Int!
      page: Int = 1
      limit: Int = 50
      search: String
      status: String
      businessType: String
    ): BuyerConnection!

    buyer(userId: Int!, id: String!): Buyer

    suppliers(
      userId: Int!
      page: Int = 1
      limit: Int = 50
      search: String
      status: String
      businessType: String
    ): SupplierConnection!

    supplier(userId: Int!, id: String!): Supplier
  }

  extend type Mutation {
    createBuyer(
      userId: Int!
      buyerId: String
      storeName: String
      owner: String
      email: String
      phone: String
      businessType: String
      address: String
      status: String
      avatar: String
      logistics: String
      notes: String
      orderDetails: String
    ): Buyer!

    updateBuyer(
      userId: Int!
      id: String
      buyerId: String
      storeName: String
      owner: String
      email: String
      phone: String
      businessType: String
      address: String
      status: String
      avatar: String
      logistics: String
      notes: String
      orderDetails: String
    ): Buyer!

    deleteBuyer(
      userId: Int!
      id: String!
    ): DeleteBuyerResult!

    createSupplier(
      userId: Int!
      supplierId: String
      name: String
      contact: String
      email: String
      phone: String
      businessType: String
      address: String
      status: String
      logistics: String
      notes: String
      supplies: String
    ): Supplier!

    updateSupplier(
      userId: Int!
      id: String
      supplierId: String
      name: String
      contact: String
      email: String
      phone: String
      businessType: String
      address: String
      status: String
      logistics: String
      notes: String
      supplies: String
    ): Supplier!

    deleteSupplier(
      userId: Int!
      id: String!
    ): DeleteSupplierResult!
  }
`;

const mapBuyer = (buyer: BuyerModel) => ({
  id: buyer.id,
  buyerId: buyer.buyerId,
  avatar: buyer.avatar ?? null,
  owner: buyer.owner,
  storeName: buyer.storeName,
  email: buyer.email,
  phone: buyer.phone,
  businessType: buyer.businessType,
  address: buyer.address,
  status: buyer.status,
  logistics: buyer.logistics ?? null,
  notes: buyer.notes ?? null,
  orderDetails: buyer.orderDetails ?? null,
  avgMonthlySpending: (buyer as { avgMonthlySpending?: unknown }).avgMonthlySpending 
    ? parseMoney((buyer as { avgMonthlySpending?: unknown }).avgMonthlySpending as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined) 
    : null, // Convert Decimal to number
  avgMonthlyOrders: (buyer as { avgMonthlyOrders?: unknown }).avgMonthlyOrders 
    ? parseMoney((buyer as { avgMonthlyOrders?: unknown }).avgMonthlyOrders as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined) 
    : null, // Convert Decimal to number
  userId: buyer.userId ?? null,
  createdAt: buyer.createdAt.toISOString(),
  updatedAt: buyer.updatedAt.toISOString(),
});

const mapSupplier = (supplier: SupplierModel) => ({
  id: supplier.id,
  supplierId: supplier.supplierId,
  name: supplier.name,
  contact: supplier.contact,
  email: supplier.email,
  phone: supplier.phone,
  businessType: supplier.businessType,
  address: supplier.address,
  status: supplier.status,
  logistics: supplier.logistics ?? null,
  notes: supplier.notes ?? null,
  supplies: supplier.supplies ?? null,
  avgMonthlyPurchaseValue: (supplier as { avgMonthlyPurchaseValue?: unknown }).avgMonthlyPurchaseValue 
    ? parseMoney((supplier as { avgMonthlyPurchaseValue?: unknown }).avgMonthlyPurchaseValue as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined) 
    : null, // Convert Decimal to number
  totalPurchases: (supplier as { totalPurchases?: unknown }).totalPurchases 
    ? parseMoney((supplier as { totalPurchases?: unknown }).totalPurchases as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined) 
    : null, // Convert Decimal to number
  totalSupplies: (supplier as { totalSupplies?: unknown }).totalSupplies 
    ? parseMoney((supplier as { totalSupplies?: unknown }).totalSupplies as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined) 
    : null, // Convert Decimal to number
  onTimeDeliveryRate: (supplier as { onTimeDeliveryRate?: unknown }).onTimeDeliveryRate 
    ? parseMoney((supplier as { onTimeDeliveryRate?: unknown }).onTimeDeliveryRate as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined) 
    : null, // Convert Decimal to number
  userId: supplier.userId ?? null,
  createdAt: supplier.createdAt.toISOString(),
  updatedAt: supplier.updatedAt.toISOString(),
});

const fetchBuyersConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  search?: string | null;
  status?: string | null;
  businessType?: string | null;
}) => {
  const { userId, page = 1, limit = 50, search, status, businessType } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);

  const whereClause: Record<string, unknown> = { userId };

  if (search) {
    whereClause.OR = [
      { storeName: { contains: search, mode: 'insensitive' } },
      { owner: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status && status !== 'All') {
    whereClause.status = status;
  }

  if (businessType && businessType !== 'All Types') {
    whereClause.businessType = businessType;
  }

  const [buyers, totalCount] = await Promise.all([
    prisma.buyer.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.buyer.count({ where: whereClause }),
  ]);

  return {
    nodes: buyers.map(mapBuyer),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const fetchSuppliersConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  search?: string | null;
  status?: string | null;
  businessType?: string | null;
}) => {
  const { userId, page = 1, limit = 50, search, status, businessType } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);

  const whereClause: Record<string, unknown> = { userId };

  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { contact: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status && status !== 'All') {
    whereClause.status = status;
  }

  if (businessType && businessType !== 'All Types') {
    whereClause.businessType = businessType;
  }

  const [suppliers, totalCount] = await Promise.all([
    prisma.supplier.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.supplier.count({ where: whereClause }),
  ]);

  return {
    nodes: suppliers.map(mapSupplier),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const fetchSingleBuyer = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  let buyer;
  if (isNumericId(id)) {
    buyer = await prisma.buyer.findFirst({
      where: { id: Number(id), userId },
    });
  } else {
    buyer = await prisma.buyer.findFirst({
      where: { buyerId: id, userId },
    });
  }

  if (!buyer) {
    throw new Error('Buyer not found');
  }

  return mapBuyer(buyer);
};

const fetchSingleSupplier = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  let supplier;
  if (isNumericId(id)) {
    supplier = await prisma.supplier.findFirst({
      where: { id: Number(id), userId },
    });
  } else {
    supplier = await prisma.supplier.findFirst({
      where: { supplierId: id, userId },
    });
  }

  if (!supplier) {
    throw new Error('Supplier not found');
  }

  return mapSupplier(supplier);
};

const createBuyer = async (args: {
  userId: number;
  buyerId?: string | null;
  storeName?: string | null;
  owner?: string | null;
  email?: string | null;
  phone?: string | null;
  businessType?: string | null;
  address?: string | null;
  status?: string | null;
  avatar?: string | null;
  logistics?: string | null;
  notes?: string | null;
  orderDetails?: string | null;
}) => {
  const { userId, ...data } = args;

  if (!/^\d+$/.test(userId.toString())) {
    throw new Error('Invalid userId format');
  }

  const validationData = nullToUndefined(data) as Parameters<typeof validateBuyerInput>[0];
  const validationResult = validateBuyerInput(validationData);
  if (!validationResult.valid) {
    throw new Error(validationResult.error || 'Invalid buyer data');
  }

  const buyerData = sanitizeBuyerData(validationData);

  const finalBuyerData: {
    buyerId: string;
    userId: number;
    storeName: string;
    owner: string;
    email: string;
    phone: string;
    businessType: string;
    address: string;
    status: string;
    avatar?: string | null;
    logistics?: string | null;
    notes?: string | null;
    orderDetails?: string | null;
    [key: string]: unknown;
  } = {
    ...buyerData,
    buyerId: String(buyerData.buyerId || ''),
    userId: Number(userId),
    storeName: String(buyerData.storeName || ''),
    owner: String(buyerData.owner || ''),
    email: String(buyerData.email || ''),
    phone: String(buyerData.phone || ''),
    businessType: String(buyerData.businessType || ''),
    address: String(buyerData.address || ''),
    status: String(buyerData.status || 'Active'),
    avatar: buyerData.avatar ? String(buyerData.avatar) : null,
    logistics: buyerData.logistics ? String(buyerData.logistics) : null,
    notes: buyerData.notes ? String(buyerData.notes) : null,
    orderDetails: buyerData.orderDetails ? String(buyerData.orderDetails) : null,
  };

  if (finalBuyerData.buyerId) {
    const existingBuyer = await prisma.buyer.findFirst({
      where: {
        buyerId: finalBuyerData.buyerId,
        userId: Number(userId),
      },
    });

    if (existingBuyer) {
      throw new Error('Buyer with this ID already exists');
    }
  }

  if (!finalBuyerData.buyerId) {
    let attempts = 0;
    let newBuyerId;
    do {
      newBuyerId = 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
      attempts++;
      if (attempts > 10) {
        throw new Error('Unable to generate unique buyer ID');
      }
    } while (
      await prisma.buyer.findFirst({
        where: { buyerId: newBuyerId, userId: Number(userId) },
      })
    );
    finalBuyerData.buyerId = newBuyerId;
  }

  try {
    const buyer = await prisma.buyer.create({
      data: finalBuyerData,
    });

    // Notify about new buyer registration
    try {
      await NotificationService.createNewBuyerNotification(
        userId,
        buyer.buyerId,
        buyer.storeName,
        false // Not a first order, just registration
      );
    } catch (notifError) {
      // Don't fail buyer creation if notification fails
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Buyers] New buyer notification failed:', notifError);
      }
    }

    // Invalidate dashboard cache after buyer creation
    try {
      const { invalidateDashboardCache } = await import('@/lib/queryCache');
      await invalidateDashboardCache(userId);
    } catch (error) {
      // Ignore cache invalidation errors
    }

    return mapBuyer(buyer);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new Error('Buyer with this ID already exists');
    }
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      throw new Error(error.message);
    }
    throw new Error('Failed to create buyer');
  }
};

const updateBuyer = async (args: {
  userId: number;
  id?: string | null;
  buyerId?: string | null;
  storeName?: string | null;
  owner?: string | null;
  email?: string | null;
  phone?: string | null;
  businessType?: string | null;
  address?: string | null;
  status?: string | null;
  avatar?: string | null;
  logistics?: string | null;
  notes?: string | null;
  orderDetails?: string | null;
}) => {
  const { userId, id, buyerId, ...updateData } = args;

  if (!/^\d+$/.test(userId.toString())) {
    throw new Error('Invalid userId format');
  }

  const validationData = nullToUndefined(updateData) as Parameters<typeof validateBuyerUpdate>[0];
  const validationResult = validateBuyerUpdate(validationData);
  if (!validationResult.valid) {
    throw new Error(validationResult.error || 'Invalid buyer data');
  }

  let existingBuyer;
  if (id) {
    if (isNumericId(id)) {
      existingBuyer = await prisma.buyer.findFirst({
        where: { id: Number(id), userId: Number(userId) },
      });
    } else {
      existingBuyer = await prisma.buyer.findFirst({
        where: { buyerId: id, userId: Number(userId) },
      });
    }
  } else if (buyerId) {
    existingBuyer = await prisma.buyer.findFirst({
      where: { buyerId: buyerId, userId: Number(userId) },
    });
  } else {
    throw new Error('Missing id or buyerId parameter');
  }

  if (!existingBuyer) {
    throw new Error('Buyer not found');
  }

  if (updateData.email && updateData.email !== existingBuyer.email) {
    const emailConflict = await prisma.buyer.findFirst({
      where: {
        email: String(updateData.email),
        userId: Number(userId),
        id: { not: existingBuyer.id },
      },
    });

    if (emailConflict) {
      throw new Error('Another buyer with this email already exists');
    }
  }

  const cleanUpdateData = sanitizeBuyerData(validationData);

  try {
    let buyer;
    if (id && isNumericId(id)) {
      buyer = await prisma.buyer.update({
        where: { id: Number(id) },
        data: cleanUpdateData,
      });
    } else if (buyerId || (id && !isNumericId(id))) {
      buyer = await prisma.buyer.update({
        where: { buyerId: (buyerId || id) as string },
        data: cleanUpdateData,
      });
    } else {
      throw new Error('Invalid identifier');
    }

    // Invalidate dashboard cache after buyer update
    try {
      const { invalidateDashboardCache } = await import('@/lib/queryCache');
      await invalidateDashboardCache(userId);
    } catch (error) {
      // Ignore cache invalidation errors
    }

    return mapBuyer(buyer);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new Error('Buyer with this identifier already exists');
    }
    throw new Error('Failed to update buyer');
  }
};

const deleteBuyer = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  if (!/^\d+$/.test(userId.toString())) {
    throw new Error('Invalid userId format');
  }

  let deleted;
  if (isNumericId(id)) {
    deleted = await prisma.buyer.findFirst({
      where: { id: Number(id), userId: Number(userId) },
    });

    if (!deleted) {
      throw new Error('Buyer not found');
    }

    await prisma.buyer.delete({
      where: { id: Number(id) },
    });
  } else {
    deleted = await prisma.buyer.findFirst({
      where: { buyerId: id, userId: Number(userId) },
    });

    if (!deleted) {
      throw new Error('Buyer not found');
    }

    await prisma.buyer.delete({
      where: { buyerId: id },
    });
  }

  // Invalidate dashboard cache after buyer deletion
  try {
    const { invalidateDashboardCache } = await import('@/lib/queryCache');
    await invalidateDashboardCache(userId);
  } catch (error) {
    // Ignore cache invalidation errors
  }

  return {
    success: true,
    deleted: mapBuyer(deleted),
  };
};

const createSupplier = async (args: {
  userId: number;
  supplierId?: string | null;
  name?: string | null;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  businessType?: string | null;
  address?: string | null;
  status?: string | null;
  logistics?: string | null;
  notes?: string | null;
  supplies?: string | null;
}) => {
  const { userId, ...data } = args;

  if (!/^\d+$/.test(String(userId))) {
    throw new Error('Invalid userId format');
  }

  const validationData = nullToUndefined(data) as Partial<SupplierFormData>;
  const validationResult = validateSupplierInput(validationData);
  if (!validationResult.isValid) {
    throw new Error(validationResult.errors.join(', ') || 'Invalid supplier data');
  }

  const supplierData = {
    supplierId: data.supplierId || '',
    name: data.name || '',
    contact: data.contact || '',
    email: data.email || '',
    phone: data.phone || '',
    businessType: data.businessType || '',
    address: data.address || '',
    status: data.status || 'Active',
    logistics: data.logistics || null,
    notes: data.notes || null,
    supplies: data.supplies || null,
    userId: Number(userId),
  };

  if (supplierData.supplierId) {
    const existingSupplier = await prisma.supplier.findFirst({
      where: {
        supplierId: supplierData.supplierId,
        userId: Number(userId),
      },
    });

    if (existingSupplier) {
      throw new Error('Supplier with this ID already exists');
    }
  }

  if (!supplierData.supplierId) {
    let attempts = 0;
    let newSupplierId;
    do {
      newSupplierId = generateUniqueSupplierId();
      attempts++;
      if (attempts > 10) {
        throw new Error('Unable to generate unique supplier ID');
      }
    } while (
      await prisma.supplier.findFirst({
        where: { supplierId: newSupplierId, userId: Number(userId) },
      })
    );
    supplierData.supplierId = newSupplierId;
  }

  try {
    const supplier = await prisma.supplier.create({
      data: supplierData,
    });

    return mapSupplier(supplier);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new Error('Supplier with this ID already exists');
    }
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      throw new Error(error.message);
    }
    throw new Error('Failed to create supplier');
  }
};

const updateSupplier = async (args: {
  userId: number;
  id?: string | null;
  supplierId?: string | null;
  name?: string | null;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  businessType?: string | null;
  address?: string | null;
  status?: string | null;
  logistics?: string | null;
  notes?: string | null;
  supplies?: string | null;
}) => {
  const { userId, id, supplierId, ...updateData } = args;

  if (!/^\d+$/.test(String(userId))) {
    throw new Error('Invalid userId format');
  }

  const cleanUpdateData: Partial<{
    name: string;
    contact: string;
    email: string;
    phone: string;
    businessType: string;
    address: string;
    status: string;
    logistics: string | null;
    notes: string | null;
    supplies: string | null;
  }> = {};

  if (updateData.name !== undefined) cleanUpdateData.name = String(updateData.name);
  if (updateData.contact !== undefined) cleanUpdateData.contact = String(updateData.contact);
  if (updateData.email !== undefined) cleanUpdateData.email = String(updateData.email);
  if (updateData.phone !== undefined) cleanUpdateData.phone = String(updateData.phone);
  if (updateData.businessType !== undefined) cleanUpdateData.businessType = String(updateData.businessType);
  if (updateData.address !== undefined) cleanUpdateData.address = String(updateData.address);
  if (updateData.status !== undefined) cleanUpdateData.status = String(updateData.status);
  if (updateData.logistics !== undefined) cleanUpdateData.logistics = updateData.logistics ? String(updateData.logistics) : null;
  if (updateData.notes !== undefined) cleanUpdateData.notes = updateData.notes ? String(updateData.notes) : null;
  if (updateData.supplies !== undefined) cleanUpdateData.supplies = updateData.supplies ? String(updateData.supplies) : null;

  let existingSupplier;
  if (id) {
    if (isNumericId(id)) {
      existingSupplier = await prisma.supplier.findFirst({
        where: { id: Number(id), userId: Number(userId) },
      });
    } else {
      existingSupplier = await prisma.supplier.findFirst({
        where: { supplierId: id, userId: Number(userId) },
      });
    }
  } else if (supplierId) {
    existingSupplier = await prisma.supplier.findFirst({
      where: { supplierId: supplierId, userId: Number(userId) },
    });
  } else {
    throw new Error('Missing id or supplierId');
  }

  if (!existingSupplier) {
    throw new Error('Supplier not found');
  }

  try {
    let supplier;
    if (id && isNumericId(id)) {
      supplier = await prisma.supplier.update({
        where: { id: Number(id) },
        data: cleanUpdateData,
      });
    } else if (supplierId || (id && !isNumericId(id))) {
      supplier = await prisma.supplier.update({
        where: { supplierId: (supplierId || id) as string },
        data: cleanUpdateData,
      });
    } else {
      throw new Error('Invalid identifier');
    }

    return mapSupplier(supplier);
  } catch (error: unknown) {
    throw new Error('Failed to update supplier');
  }
};

const deleteSupplier = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  if (!/^\d+$/.test(userId.toString())) {
    throw new Error('Invalid userId format');
  }

  let deleted;
  if (isNumericId(id)) {
    deleted = await prisma.supplier.findFirst({
      where: { id: Number(id), userId: Number(userId) },
    });

    if (!deleted) {
      throw new Error('Supplier not found');
    }

    await prisma.supplier.delete({
      where: { id: Number(id) },
    });
  } else {
    deleted = await prisma.supplier.findFirst({
      where: { supplierId: id, userId: Number(userId) },
    });

    if (!deleted) {
      throw new Error('Supplier not found');
    }

    await prisma.supplier.delete({
      where: { supplierId: id },
    });
  }

  return {
    success: true,
    deleted: mapSupplier(deleted),
  };
};

export const contactsResolvers = {
  Query: {
    buyers: (_: unknown, args: Parameters<typeof fetchBuyersConnection>[0]) => fetchBuyersConnection(args),
    buyer: (_: unknown, args: Parameters<typeof fetchSingleBuyer>[0]) => fetchSingleBuyer(args),
    suppliers: (_: unknown, args: Parameters<typeof fetchSuppliersConnection>[0]) => fetchSuppliersConnection(args),
    supplier: (_: unknown, args: Parameters<typeof fetchSingleSupplier>[0]) => fetchSingleSupplier(args),
  },
  Mutation: {
    createBuyer: (_: unknown, args: Parameters<typeof createBuyer>[0]) => createBuyer(args),
    updateBuyer: (_: unknown, args: Parameters<typeof updateBuyer>[0]) => updateBuyer(args),
    deleteBuyer: (_: unknown, args: Parameters<typeof deleteBuyer>[0]) => deleteBuyer(args),
    createSupplier: (_: unknown, args: Parameters<typeof createSupplier>[0]) => createSupplier(args),
    updateSupplier: (_: unknown, args: Parameters<typeof updateSupplier>[0]) => updateSupplier(args),
    deleteSupplier: (_: unknown, args: Parameters<typeof deleteSupplier>[0]) => deleteSupplier(args),
  },
};

export { fetchBuyersConnection, fetchSuppliersConnection };

