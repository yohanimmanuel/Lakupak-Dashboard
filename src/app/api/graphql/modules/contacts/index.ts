import { type Buyer as BuyerModel, type Supplier as SupplierModel } from '@/lib/db';
import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo, isNumericId, parseMoney, MAX_PRODUCT_LIMIT } from '../common/utils';
import {
  validateBuyerInput,
  sanitizeBuyerData,
  validateBuyerUpdate,
} from '@/utils/buyer-security';
import {
  validateSupplierInput,
  generateUniqueSupplierId,
} from '@/utils/supplier-security';
import type { SupplierFormData } from '@/types/client';
import { NotificationService } from '../notifications';
import { syncOrderToBuyerProfile } from '@/utils/buyerSync';

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

  input BulkBuyerInput {
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
  }

  input BulkSupplierInput {
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
  }

  type BulkContactImportResult {
    success: Boolean!
    successCount: Int!
    failedCount: Int!
    message: String
  }

  type BulkContactDeleteResult {
    success: Boolean!
    successCount: Int!
    failedCount: Int!
    message: String
  }

  type SyncProductSuppliersResult {
    success: Boolean!
    productsProcessed: Int!
    suppliersTouched: Int!
    message: String
  }

  extend type Query {
    buyers(
      userId: Int!
      page: Int = 1
      limit: Int = 50
      search: String
      status: String
      businessType: String
      storeNames: [String]
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

    bulkDeleteBuyers(
      userId: Int!
      ids: [String!]!
    ): BulkContactDeleteResult!

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

    bulkCreateBuyers(
      userId: Int!
      buyers: [BulkBuyerInput!]!
    ): BulkContactImportResult!

    bulkCreateSuppliers(
      userId: Int!
      suppliers: [BulkSupplierInput!]!
    ): BulkContactImportResult!

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

    bulkDeleteSuppliers(
      userId: Int!
      ids: [String!]!
    ): BulkContactDeleteResult!

    syncSuppliersFromProducts(
      userId: Int!
    ): SyncProductSuppliersResult!
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
  storeNames?: string[] | null;
}) => {
  const { userId, page = 1, limit = 50, search, status, businessType, storeNames } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit, MAX_PRODUCT_LIMIT);

  const whereClause: Record<string, unknown> = { userId };

  if (search) {
    whereClause.OR = [
      { storeName: { contains: search, mode: 'insensitive' } },
      { owner: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (storeNames != null && storeNames.length > 0) {
    whereClause.storeName = { in: storeNames };
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
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit, MAX_PRODUCT_LIMIT);

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

  // Refresh spend/outstanding from live orders only when order-derived details exist
  // (avoids wiping createBuyer / imported orderDetails with []).
  try {
    const synced = await syncOrderToBuyerProfile(buyer.buyerId, userId);
    if (synced) {
      const refreshed = isNumericId(id)
        ? await prisma.buyer.findFirst({ where: { id: Number(id), userId } })
        : await prisma.buyer.findFirst({ where: { buyerId: id, userId } });
      if (refreshed) buyer = refreshed;
    }
  } catch {
    // best-effort; return the row we already loaded
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

    // Keep assortment opportunity segments aligned with live buyer business type.
    if (
      cleanUpdateData.businessType !== undefined &&
      String(cleanUpdateData.businessType).trim() !== String(existingBuyer.businessType || '').trim()
    ) {
      try {
        const { syncAssortmentOpportunitySegments } = await import(
          '@/lib/assortmentOpportunities/service'
        );
        await syncAssortmentOpportunitySegments(Number(userId), buyer.buyerId);
      } catch (error) {
        // Opportunities still sync on next list/refresh if this fails.
        console.error('[Buyers] Assortment opportunity segment sync failed:', error);
      }
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
  } else {
    deleted = await prisma.buyer.findFirst({
      where: { buyerId: id, userId: Number(userId) },
    });

    if (!deleted) {
      throw new Error('Buyer not found');
    }
  }

  const buyerBusinessId = deleted.buyerId;
  const distributorUserId = Number(userId);

  await prisma.$transaction(async (tx) => {
    // Detach client rates before removing the CRM row (FK is ON DELETE SET NULL,
    // but explicit clear keeps offer drafts / standing rates without a client).
    await tx.offer.updateMany({
      where: { userId: distributorUserId, buyerId: buyerBusinessId },
      data: { buyerId: null, status: 'draft' },
    });

    // Detach sales jobs so CRM delete is not blocked by SalesJob_clientId_fkey.
    await tx.salesJob.updateMany({
      where: { distributorId: distributorUserId, clientId: buyerBusinessId },
      data: { clientId: null },
    });
    // One parameterized update — avoids N round-trips for multi-client jobs.
    await tx.$executeRaw`
      UPDATE "SalesJob"
      SET "clientIds" = array_remove("clientIds", ${buyerBusinessId})
      WHERE "distributorId" = ${distributorUserId}
        AND ${buyerBusinessId} = ANY ("clientIds")
    `;

    // Pending unpaid POs for this relationship should look like a new buyer again
    // (no priced lines until the distributor re-sends pricing).
    const pendingOrderWhere = {
      userId: distributorUserId,
      buyerId: buyerBusinessId,
      isDeleted: false,
      orderStatus: 'Pending',
      paymentStatus: 'Unpaid',
    } as const;

    await tx.orderItem.updateMany({
      where: { order: pendingOrderWhere },
      data: {
        pricePerPackage: 0,
        subtotal: 0,
        unitPriceSnapshot: null,
        offerApplied: false,
        offerBadgeSnapshot: null,
        offerNameSnapshot: null,
        offerIdSnapshot: null,
        originalPriceSnapshot: null,
        discountPercentage: null,
        discountAmount: null,
        promotionDetailsSnapshot: null,
      },
    });
    await tx.order.updateMany({
      where: pendingOrderWhere,
      data: { subtotal: 0, totalAmount: 0, discounts: 0 },
    });

    if (isNumericId(id)) {
      await tx.buyer.delete({
        where: { id: Number(id) },
      });
    } else {
      await tx.buyer.delete({
        where: { buyerId: id },
      });
    }
  });

  // Invalidate dashboard cache after buyer deletion
  try {
    const { invalidateDashboardCache } = await import('@/lib/queryCache');
    await invalidateDashboardCache(userId);
  } catch (error) {
    // Ignore cache invalidation errors
  }

  // Sync workflows so deleted buyer is removed from all automations
  try {
    const { syncAllWorkflowsForUser } = await import('@/lib/automations/syncWorkflowBuyers');
    await syncAllWorkflowsForUser(Number(userId));
  } catch (error) {
    // Ignore workflow sync errors
  }

  return {
    success: true,
    deleted: mapBuyer(deleted),
  };
};

const MAX_BULK_CONTACT_IMPORT = 1000;

const makeBuyerId = () =>
  'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();

const allocateUniqueId = (
  preferred: string | null | undefined,
  usedIds: Set<string>,
  generate: () => string,
): string => {
  const candidate = String(preferred || '').trim();
  if (candidate && !usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const next = generate();
    if (!usedIds.has(next)) {
      usedIds.add(next);
      return next;
    }
  }
  throw new Error('Unable to generate unique ID');
};

/** Import is permissive: bad email/phone become blank instead of dropping the row. */
const normalizeImportEmail = (value: unknown): string => {
  const email = String(value ?? '').trim();
  if (!email) return '';
  if (!email.includes('@') || !email.includes('.') || email.length > 254) return '';
  return email.toLowerCase();
};

const normalizeImportPhone = (value: unknown): string => {
  const phone = String(value ?? '').trim();
  if (!phone) return '';
  return phone.length > 30 ? phone.slice(0, 30) : phone;
};

const truncateImportText = (value: unknown, max: number): string => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
};

/**
 * buyerId/supplierId are globally unique. Seed with this user's IDs plus any
 * preferred IDs already taken by other accounts so createMany never silently skips.
 */
const seedUsedContactIds = async (
  kind: 'buyer' | 'supplier',
  userId: number,
  preferredIds: Array<string | null | undefined>,
): Promise<Set<string>> => {
  const uniquePreferred = [
    ...new Set(
      preferredIds
        .map((id) => String(id ?? '').trim())
        .filter((id) => id.length > 0),
    ),
  ];

  if (kind === 'buyer') {
    const rows = await prisma.buyer.findMany({
      where: {
        OR: [
          { userId },
          ...(uniquePreferred.length > 0 ? [{ buyerId: { in: uniquePreferred } }] : []),
        ],
      },
      select: { buyerId: true },
    });
    return new Set(rows.map((row) => row.buyerId));
  }

  const rows = await prisma.supplier.findMany({
    where: {
      OR: [
        { userId },
        ...(uniquePreferred.length > 0 ? [{ supplierId: { in: uniquePreferred } }] : []),
      ],
    },
    select: { supplierId: true },
  });
  return new Set(rows.map((row) => row.supplierId));
};

const ensureContactIdsAvailable = async <T extends { buyerId?: string; supplierId?: string }>(
  kind: 'buyer' | 'supplier',
  rows: T[],
  usedIds: Set<string>,
  generate: () => string,
): Promise<T[]> => {
  if (rows.length === 0) return rows;

  const idKey = kind === 'buyer' ? 'buyerId' : 'supplierId';
  const ids = rows.map((row) => String(row[idKey as keyof T] ?? ''));
  const taken =
    kind === 'buyer'
      ? await prisma.buyer.findMany({
          where: { buyerId: { in: ids } },
          select: { buyerId: true },
        })
      : await prisma.supplier.findMany({
          where: { supplierId: { in: ids } },
          select: { supplierId: true },
        });
  const takenSet = new Set(
    taken.map((row) => ('buyerId' in row ? row.buyerId : row.supplierId)),
  );
  if (takenSet.size === 0) return rows;

  return rows.map((row) => {
    const current = String(row[idKey as keyof T] ?? '');
    if (!takenSet.has(current)) return row;
    const nextId = allocateUniqueId(null, usedIds, generate);
    return { ...row, [idKey]: nextId };
  });
};

const bulkCreateBuyers = async (args: {
  userId: number;
  buyers: Array<{
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
  }>;
}) => {
  const { userId, buyers } = args;

  if (!/^\d+$/.test(String(userId))) {
    throw new Error('Invalid userId format');
  }
  if (!Array.isArray(buyers) || buyers.length === 0) {
    return { success: true, successCount: 0, failedCount: 0, message: 'Nothing to import' };
  }
  if (buyers.length > MAX_BULK_CONTACT_IMPORT) {
    throw new Error(`Too many rows (max ${MAX_BULK_CONTACT_IMPORT})`);
  }

  const distributorUserId = Number(userId);
  const usedIds = await seedUsedContactIds(
    'buyer',
    distributorUserId,
    buyers.map((row) => row.buyerId),
  );

  const toCreate: Array<{
    buyerId: string;
    userId: number;
    storeName: string;
    owner: string;
    email: string;
    phone: string;
    businessType: string;
    address: string;
    status: string;
    avatar: string | null;
    logistics: string | null;
    notes: string | null;
    orderDetails: string | null;
  }> = [];
  let failedCount = 0;

  for (const row of buyers) {
    try {
      const buyerId = allocateUniqueId(row.buyerId, usedIds, makeBuyerId);
      toCreate.push({
        buyerId,
        userId: distributorUserId,
        storeName: truncateImportText(row.storeName, 100),
        owner: truncateImportText(row.owner, 100),
        email: normalizeImportEmail(row.email),
        phone: normalizeImportPhone(row.phone),
        businessType: truncateImportText(row.businessType, 100),
        address: truncateImportText(row.address, 500),
        status: truncateImportText(row.status, 50) || 'Active',
        avatar: row.avatar ? String(row.avatar) : null,
        logistics: row.logistics ? String(row.logistics) : null,
        notes: row.notes ? String(row.notes) : null,
        orderDetails: row.orderDetails ? String(row.orderDetails) : null,
      });
    } catch {
      failedCount += 1;
    }
  }

  let successCount = 0;
  if (toCreate.length > 0) {
    const ready = await ensureContactIdsAvailable('buyer', toCreate, usedIds, makeBuyerId);
    const result = await prisma.buyer.createMany({ data: ready });
    successCount = result.count;
    failedCount += Math.max(0, buyers.length - successCount - failedCount);
  } else {
    failedCount = buyers.length;
  }

  try {
    const { invalidateDashboardCache } = await import('@/lib/queryCache');
    await invalidateDashboardCache(Number(userId));
  } catch {
    // Ignore cache invalidation errors
  }

  return {
    success: true,
    successCount,
    failedCount,
    message: `Imported ${successCount} buyer(s)${failedCount ? `, ${failedCount} failed` : ''}`,
  };
};

const bulkCreateSuppliers = async (args: {
  userId: number;
  suppliers: Array<{
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
  }>;
}) => {
  const { userId, suppliers } = args;

  if (!/^\d+$/.test(String(userId))) {
    throw new Error('Invalid userId format');
  }
  if (!Array.isArray(suppliers) || suppliers.length === 0) {
    return { success: true, successCount: 0, failedCount: 0, message: 'Nothing to import' };
  }
  if (suppliers.length > MAX_BULK_CONTACT_IMPORT) {
    throw new Error(`Too many rows (max ${MAX_BULK_CONTACT_IMPORT})`);
  }

  const distributorUserId = Number(userId);
  const usedIds = await seedUsedContactIds(
    'supplier',
    distributorUserId,
    suppliers.map((row) => row.supplierId),
  );

  const toCreate: Array<{
    supplierId: string;
    userId: number;
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
  }> = [];
  let failedCount = 0;

  for (const row of suppliers) {
    try {
      const supplierId = allocateUniqueId(row.supplierId, usedIds, generateUniqueSupplierId);
      toCreate.push({
        supplierId,
        userId: distributorUserId,
        name: truncateImportText(row.name, 100),
        contact: truncateImportText(row.contact, 100),
        email: normalizeImportEmail(row.email),
        phone: normalizeImportPhone(row.phone),
        businessType: truncateImportText(row.businessType, 100),
        address: truncateImportText(row.address, 500),
        status: truncateImportText(row.status, 50) || 'Active',
        logistics: row.logistics ? String(row.logistics) : null,
        notes: row.notes ? String(row.notes) : null,
        supplies: row.supplies ? String(row.supplies) : null,
      });
    } catch {
      failedCount += 1;
    }
  }

  let successCount = 0;
  if (toCreate.length > 0) {
    const ready = await ensureContactIdsAvailable(
      'supplier',
      toCreate,
      usedIds,
      generateUniqueSupplierId,
    );
    const result = await prisma.supplier.createMany({ data: ready });
    successCount = result.count;
    failedCount += Math.max(0, suppliers.length - successCount - failedCount);
  } else {
    failedCount = suppliers.length;
  }

  try {
    const { invalidateDashboardCache } = await import('@/lib/queryCache');
    await invalidateDashboardCache(Number(userId));
  } catch {
    // Ignore cache invalidation errors
  }

  return {
    success: true,
    successCount,
    failedCount,
    message: `Imported ${successCount} supplier(s)${failedCount ? `, ${failedCount} failed` : ''}`,
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

const bulkDeleteBuyers = async (args: { userId: number; ids: string[] }) => {
  const { userId, ids } = args;

  if (!/^\d+$/.test(userId.toString())) {
    throw new Error('Invalid userId format');
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: true, successCount: 0, failedCount: 0, message: 'Nothing to delete' };
  }
  if (ids.length > MAX_BULK_CONTACT_IMPORT) {
    throw new Error(`Too many rows (max ${MAX_BULK_CONTACT_IMPORT})`);
  }

  const uniqueIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  const numericIds = uniqueIds.filter(isNumericId).map(Number);
  const businessIds = uniqueIds.filter((id) => !isNumericId(id));

  const found = await prisma.buyer.findMany({
    where: {
      userId: Number(userId),
      OR: [
        ...(numericIds.length > 0 ? [{ id: { in: numericIds } }] : []),
        ...(businessIds.length > 0 ? [{ buyerId: { in: businessIds } }] : []),
      ],
    },
  });

  if (found.length === 0) {
    return {
      success: true,
      successCount: 0,
      failedCount: uniqueIds.length,
      message: 'No matching buyers',
    };
  }

  const distributorUserId = Number(userId);
  const buyerBusinessIds = found.map((buyer) => buyer.buyerId);
  const dbIds = found.map((buyer) => buyer.id);

  await prisma.$transaction(async (tx) => {
    await tx.offer.updateMany({
      where: { userId: distributorUserId, buyerId: { in: buyerBusinessIds } },
      data: { buyerId: null, status: 'draft' },
    });

    await tx.salesJob.updateMany({
      where: { distributorId: distributorUserId, clientId: { in: buyerBusinessIds } },
      data: { clientId: null },
    });

    if (buyerBusinessIds.length > 0) {
      await tx.$executeRaw`
        UPDATE "SalesJob"
        SET "clientIds" = COALESCE((
          SELECT array_agg(elem ORDER BY ord)
          FROM unnest("clientIds") WITH ORDINALITY AS t(elem, ord)
          WHERE NOT (elem = ANY(${buyerBusinessIds}::text[]))
        ), ARRAY[]::text[])
        WHERE "distributorId" = ${distributorUserId}
          AND "clientIds" && ${buyerBusinessIds}::text[]
      `;
    }

    const pendingOrderWhere = {
      userId: distributorUserId,
      buyerId: { in: buyerBusinessIds },
      isDeleted: false,
      orderStatus: 'Pending',
      paymentStatus: 'Unpaid',
    } as const;

    await tx.orderItem.updateMany({
      where: { order: pendingOrderWhere },
      data: {
        pricePerPackage: 0,
        subtotal: 0,
        unitPriceSnapshot: null,
        offerApplied: false,
        offerBadgeSnapshot: null,
        offerNameSnapshot: null,
        offerIdSnapshot: null,
        originalPriceSnapshot: null,
        discountPercentage: null,
        discountAmount: null,
        promotionDetailsSnapshot: null,
      },
    });
    await tx.order.updateMany({
      where: pendingOrderWhere,
      data: { subtotal: 0, totalAmount: 0, discounts: 0 },
    });

    await tx.buyer.deleteMany({
      where: { userId: distributorUserId, id: { in: dbIds } },
    });
  });

  try {
    const { invalidateDashboardCache } = await import('@/lib/queryCache');
    await invalidateDashboardCache(userId);
  } catch {
    // Ignore cache invalidation errors
  }

  try {
    const { syncAllWorkflowsForUser } = await import('@/lib/automations/syncWorkflowBuyers');
    await syncAllWorkflowsForUser(distributorUserId);
  } catch {
    // Ignore workflow sync errors
  }

  return {
    success: true,
    successCount: found.length,
    failedCount: Math.max(0, uniqueIds.length - found.length),
    message: `Deleted ${found.length} buyer(s)`,
  };
};

const syncSuppliersFromProducts = async (args: { userId: number }) => {
  const { userId } = args;
  if (!/^\d+$/.test(String(userId))) {
    throw new Error('Invalid userId format');
  }

  const { syncAllProductSuppliersForUser } = await import('@/lib/suppliers/syncProductSupplies');
  const result = await syncAllProductSuppliersForUser(Number(userId));

  try {
    const { invalidateDashboardCache } = await import('@/lib/queryCache');
    await invalidateDashboardCache(Number(userId));
  } catch {
    // Ignore cache invalidation errors
  }

  return {
    success: true,
    productsProcessed: result.productsProcessed,
    suppliersTouched: result.suppliersTouched,
    message: `Synced ${result.productsProcessed} product(s) into ${result.suppliersTouched} supplier(s)`,
  };
};

const bulkDeleteSuppliers = async (args: { userId: number; ids: string[] }) => {
  const { userId, ids } = args;

  if (!/^\d+$/.test(userId.toString())) {
    throw new Error('Invalid userId format');
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: true, successCount: 0, failedCount: 0, message: 'Nothing to delete' };
  }
  if (ids.length > MAX_BULK_CONTACT_IMPORT) {
    throw new Error(`Too many rows (max ${MAX_BULK_CONTACT_IMPORT})`);
  }

  const uniqueIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  const numericIds = uniqueIds.filter(isNumericId).map(Number);
  const businessIds = uniqueIds.filter((id) => !isNumericId(id));

  const found = await prisma.supplier.findMany({
    where: {
      userId: Number(userId),
      OR: [
        ...(numericIds.length > 0 ? [{ id: { in: numericIds } }] : []),
        ...(businessIds.length > 0 ? [{ supplierId: { in: businessIds } }] : []),
      ],
    },
    select: { id: true },
  });

  if (found.length === 0) {
    return {
      success: true,
      successCount: 0,
      failedCount: uniqueIds.length,
      message: 'No matching suppliers',
    };
  }

  const result = await prisma.supplier.deleteMany({
    where: {
      userId: Number(userId),
      id: { in: found.map((row) => row.id) },
    },
  });

  return {
    success: true,
    successCount: result.count,
    failedCount: Math.max(0, uniqueIds.length - result.count),
    message: `Deleted ${result.count} supplier(s)`,
  };
};

import { withDashboardAuth } from '../common/auth';

export const contactsResolvers = {
  Query: {
    buyers: withDashboardAuth(fetchBuyersConnection),
    buyer: withDashboardAuth(fetchSingleBuyer),
    suppliers: withDashboardAuth(fetchSuppliersConnection),
    supplier: withDashboardAuth(fetchSingleSupplier),
  },
  Mutation: {
    createBuyer: withDashboardAuth(createBuyer),
    bulkCreateBuyers: withDashboardAuth(bulkCreateBuyers),
    updateBuyer: withDashboardAuth(updateBuyer),
    deleteBuyer: withDashboardAuth(deleteBuyer),
    bulkDeleteBuyers: withDashboardAuth(bulkDeleteBuyers),
    createSupplier: withDashboardAuth(createSupplier),
    bulkCreateSuppliers: withDashboardAuth(bulkCreateSuppliers),
    updateSupplier: withDashboardAuth(updateSupplier),
    deleteSupplier: withDashboardAuth(deleteSupplier),
    bulkDeleteSuppliers: withDashboardAuth(bulkDeleteSuppliers),
    syncSuppliersFromProducts: withDashboardAuth(syncSuppliersFromProducts),
  },
};

export { fetchBuyersConnection, fetchSuppliersConnection };

