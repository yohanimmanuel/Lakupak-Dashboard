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

  input RecordSupplierSupplyInput {
    sku: String
    product: String!
    quantity: Int!
    totalValue: Float
    suppliedDate: String!
    productId: String
    variantName: String
    updateCurrentStock: Boolean
  }

  type RecordSupplierSupplyResult {
    success: Boolean!
    stockUpdated: Boolean!
    supplier: Supplier!
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

    supplierSupplyMoveCandidates(
      userId: Int!
      supplierId: String!
    ): [SupplyMoveCandidate!]!

    supplierTransferRecords(
      userId: Int!
      supplierId: String!
    ): [SupplierTransferRecord!]!

  }

  type SupplyMoveCandidate {
    productId: String!
    variantName: String!
    sku: String!
    productLabel: String!
    targetSupplierName: String!
    historyCount: Int!
    totalSupplied: Float!
    totalValue: Float!
  }

  type SupplierTransferRecord {
    id: Int!
    sku: String!
    product: String!
    totalSupplied: String!
    totalValue: String!
    lastDelivery: String!
    productId: String
    variantName: String
    targetSupplierName: String!
    recordType: String!
  }

  input SupplyMoveVariantInput {
    productId: String!
    variantName: String!
  }

  type MoveSupplierSuppliesResult {
    success: Boolean!
    movedHistoryCount: Int!
    supplies: String
    message: String
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
      expectedUpdatedAt: String
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

    recordSupplierSupply(
      userId: Int!
      supplierId: String!
      input: RecordSupplierSupplyInput!
    ): RecordSupplierSupplyResult!

    moveSupplierSupplies(
      userId: Int!
      fromSupplierId: String!
      variants: [SupplyMoveVariantInput!]!
    ): MoveSupplierSuppliesResult!

    moveSelectedSupplyRecords(
      userId: Int!
      fromSupplierId: String!
      recordIds: [Int!]!
    ): MoveSupplierSuppliesResult!
  }
`;

type BuyerWithRecords = BuyerModel & {
  buyerRecords?: Array<{
    orderNo: string;
    product: string;
    totalOrders: string;
    totalSpend: string;
    shippingFee: string | null;
    lastOrderDate: string;
    outstanding: string;
    freeItems: number | null;
    discountBadge: string | null;
    offerApplied: boolean | null;
    syncedFromOrders: boolean;
    sortOrder: number;
  }>;
};

type SupplierWithRecords = SupplierModel & {
  supplyRecords?: Array<{
    suppliesno: string;
    sku: string;
    product: string;
    totalSupplied: string;
    totalValue: string;
    lastDelivery: string;
    status: string;
    deliverySuccess: string | null;
    recordType: string;
    productId: string | null;
    variantName: string | null;
    updateCurrentStock: boolean;
    stockApplied: boolean;
    sortOrder: number;
  }>;
};

const mapBuyer = (buyer: BuyerWithRecords) => ({
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
  orderDetails:
    buyer.buyerRecords && buyer.buyerRecords.length > 0
      ? JSON.stringify(
          buyer.buyerRecords.map((row) => ({
            orderNo: row.orderNo,
            product: row.product,
            totalOrders: row.totalOrders,
            totalSpend: row.totalSpend,
            shippingFee: row.shippingFee ?? undefined,
            lastOrderDate: row.lastOrderDate,
            outstanding: row.outstanding,
            freeItems: row.freeItems ?? undefined,
            discountBadge: row.discountBadge ?? undefined,
            offerApplied: row.offerApplied ?? undefined,
            syncedFromOrders: row.syncedFromOrders || undefined,
          })),
        )
      : null,
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

const mapSupplier = (supplier: SupplierWithRecords) => ({
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
  supplies:
    supplier.supplyRecords && supplier.supplyRecords.length > 0
      ? JSON.stringify(
          supplier.supplyRecords.map((row) => ({
            suppliesno: row.suppliesno,
            sku: row.sku,
            product: row.product,
            totalSupplied: row.totalSupplied,
            totalValue: row.totalValue,
            lastDelivery: row.lastDelivery,
            status: row.status,
            deliverySuccess: row.deliverySuccess ?? undefined,
            recordType: row.recordType === 'summary' ? 'summary' : 'history',
            productId: row.productId ?? undefined,
            variantName: row.variantName ?? undefined,
            updateCurrentStock: row.updateCurrentStock === true,
            stockApplied: row.stockApplied === true,
          })),
        )
      : null,
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
      include: {
        buyerRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
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
      include: {
        supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
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

  const buyerInclude = {
    buyerRecords: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  };

  let buyer;
  if (isNumericId(id)) {
    buyer = await prisma.buyer.findFirst({
      where: { id: Number(id), userId },
      include: buyerInclude,
    });
  } else {
    buyer = await prisma.buyer.findFirst({
      where: { buyerId: id, userId },
      include: buyerInclude,
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
        ? await prisma.buyer.findFirst({ where: { id: Number(id), userId }, include: buyerInclude })
        : await prisma.buyer.findFirst({ where: { buyerId: id, userId }, include: buyerInclude });
      if (refreshed) buyer = refreshed;
    }
  } catch {
    // best-effort; return the row we already loaded
  }

  return mapBuyer(buyer);
};

const fetchSingleSupplier = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  const supplierInclude = {
    supplyRecords: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  };

  let supplier;
  if (isNumericId(id)) {
    supplier = await prisma.supplier.findFirst({
      where: { id: Number(id), userId },
      include: supplierInclude,
    });
  } else {
    supplier = await prisma.supplier.findFirst({
      where: { supplierId: id, userId },
      include: supplierInclude,
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
  const orderDetailsPayload = args.orderDetails ? String(args.orderDetails) : null;
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
    const { replaceBuyerOrderRecords } = await import('@/lib/clients/buyerRecords');
    const withRecords = await prisma.$transaction(async (tx) => {
      const buyer = await tx.buyer.create({
        data: finalBuyerData,
      });
      await replaceBuyerOrderRecords(tx, buyer.id, orderDetailsPayload);
      return tx.buyer.findUnique({
        where: { id: buyer.id },
        include: { buyerRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      });
    });

    // Notify about new buyer registration
    try {
      await NotificationService.createNewBuyerNotification(
        userId,
        withRecords!.buyerId,
        withRecords!.storeName,
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

    return mapBuyer(withRecords!);
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
  const orderDetailsPayload =
    args.orderDetails !== undefined
      ? args.orderDetails
        ? String(args.orderDetails)
        : null
      : undefined;

  try {
    const { lockBuyerOrderRecords, replaceBuyerOrderRecords } = await import(
      '@/lib/clients/buyerRecords'
    );
    const withRecords = await prisma.$transaction(async (tx) => {
      // Lock before Buyer row update so order matches syncOrderToBuyerProfile
      // (advisory lock → buyer.update) and avoids deadlocks with concurrent sync.
      await lockBuyerOrderRecords(tx, existingBuyer.id);
      const buyer = await tx.buyer.update({
        where: { id: existingBuyer.id },
        data: cleanUpdateData,
      });
      if (orderDetailsPayload !== undefined) {
        await replaceBuyerOrderRecords(tx, buyer.id, orderDetailsPayload);
      }
      return tx.buyer.findUnique({
        where: { id: buyer.id },
        include: { buyerRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      });
    });

    // Keep assortment opportunity segments aligned with live buyer business type.
    if (
      cleanUpdateData.businessType !== undefined &&
      String(cleanUpdateData.businessType).trim() !== String(existingBuyer.businessType || '').trim()
    ) {
      try {
        const { syncAssortmentOpportunitySegments } = await import(
          '@/lib/assortmentOpportunities/service'
        );
        await syncAssortmentOpportunitySegments(Number(userId), withRecords!.buyerId);
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

    return mapBuyer(withRecords!);
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

  const buyerRecordsInclude = {
    buyerRecords: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  };

  let deleted;
  if (isNumericId(id)) {
    deleted = await prisma.buyer.findFirst({
      where: { id: Number(id), userId: Number(userId) },
      include: buyerRecordsInclude,
    });

    if (!deleted) {
      throw new Error('Buyer not found');
    }
  } else {
    deleted = await prisma.buyer.findFirst({
      where: { buyerId: id, userId: Number(userId) },
      include: buyerRecordsInclude,
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
  }> = [];
  // Index-aligned with toCreate / ready so ensureContactIdsAvailable ID remaps keep payloads.
  const importOrderDetailsByIndex: Array<string | null> = [];
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
      });
      importOrderDetailsByIndex.push(row.orderDetails ? String(row.orderDetails) : null);
    } catch {
      failedCount += 1;
    }
  }

  let successCount = 0;
  if (toCreate.length > 0) {
    const ready = await ensureContactIdsAvailable('buyer', toCreate, usedIds, makeBuyerId);
    const { buildBuyerRecordCreateManyRows } = await import('@/lib/clients/buyerRecords');
    // Parent buyers + child records in one txn so a child failure cannot leave orphans.
    successCount = await prisma.$transaction(async (tx) => {
      const result = await tx.buyer.createMany({ data: ready });
      const created = await tx.buyer.findMany({
        where: {
          userId: distributorUserId,
          buyerId: { in: ready.map((row) => row.buyerId) },
        },
        select: { id: true, buyerId: true },
      });
      const buyerRefIdByBuyerId = new Map(created.map((row) => [row.buyerId, row.id]));
      const buyerRecordRows = ready.flatMap((row, index) => {
        const payload = importOrderDetailsByIndex[index];
        if (payload == null) return [];
        const buyerRefId = buyerRefIdByBuyerId.get(row.buyerId);
        if (buyerRefId == null) return [];
        return buildBuyerRecordCreateManyRows(buyerRefId, payload);
      });
      if (buyerRecordRows.length > 0) {
        await tx.buyerRecord.createMany({ data: buyerRecordRows });
      }
      return result.count;
    });
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
  }> = [];
  // Index-aligned with toCreate / ready so ensureContactIdsAvailable ID remaps keep payloads.
  const importSuppliesByIndex: Array<string | null> = [];
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
      });
      importSuppliesByIndex.push(row.supplies ? String(row.supplies) : null);
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
    const { buildSupplyRecordCreateManyRows } = await import('@/lib/suppliers/supplyRecordStore');
    // Parent suppliers + child records in one txn so a child failure cannot leave orphans.
    successCount = await prisma.$transaction(async (tx) => {
      const result = await tx.supplier.createMany({ data: ready });
      const created = await tx.supplier.findMany({
        where: {
          userId: distributorUserId,
          supplierId: { in: ready.map((row) => row.supplierId) },
        },
        select: { id: true, supplierId: true },
      });
      const supplierRefIdBySupplierId = new Map(created.map((row) => [row.supplierId, row.id]));
      const supplyRecordRows = ready.flatMap((row, index) => {
        const payload = importSuppliesByIndex[index];
        if (payload == null) return [];
        const supplierRefId = supplierRefIdBySupplierId.get(row.supplierId);
        if (supplierRefId == null) return [];
        return buildSupplyRecordCreateManyRows(supplierRefId, payload);
      });
      if (supplyRecordRows.length > 0) {
        await tx.supplyRecord.createMany({ data: supplyRecordRows });
      }
      return result.count;
    });
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

  const suppliesPayload = data.supplies || null;
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
    const { replaceSupplierSupplyRecords } = await import('@/lib/suppliers/supplyRecordStore');
    const withRecords = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: supplierData,
      });
      await replaceSupplierSupplyRecords(tx, supplier.id, suppliesPayload);
      return tx.supplier.findUnique({
        where: { id: supplier.id },
        include: { supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      });
    });
    return mapSupplier(withRecords!);
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
  expectedUpdatedAt?: string | null;
}) => {
  const { userId, id, supplierId, expectedUpdatedAt, ...updateData } = args;

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
  }> = {};
  const suppliesPayload =
    updateData.supplies !== undefined
      ? updateData.supplies
        ? String(updateData.supplies)
        : null
      : undefined;

  if (updateData.name !== undefined) cleanUpdateData.name = String(updateData.name);
  if (updateData.contact !== undefined) cleanUpdateData.contact = String(updateData.contact);
  if (updateData.email !== undefined) cleanUpdateData.email = String(updateData.email);
  if (updateData.phone !== undefined) cleanUpdateData.phone = String(updateData.phone);
  if (updateData.businessType !== undefined) cleanUpdateData.businessType = String(updateData.businessType);
  if (updateData.address !== undefined) cleanUpdateData.address = String(updateData.address);
  if (updateData.status !== undefined) cleanUpdateData.status = String(updateData.status);
  if (updateData.logistics !== undefined) cleanUpdateData.logistics = updateData.logistics ? String(updateData.logistics) : null;
  if (updateData.notes !== undefined) cleanUpdateData.notes = updateData.notes ? String(updateData.notes) : null;

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
    const withRecords = await prisma.$transaction(async (tx) => {
      // Serialize concurrent supplies saves for this supplier so deltas use a fresh previous snapshot.
      if (suppliesPayload !== undefined) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(userId)}, ${879_332})`;
        const { loadSupplierSuppliesJson, replaceSupplierSupplyRecords } = await import(
          '@/lib/suppliers/supplyRecordStore'
        );
        const { finalizeSupplierSuppliesSave } = await import(
          '@/lib/suppliers/applySupplierSuppliesSave'
        );
        if (expectedUpdatedAt) {
          const current = await tx.supplier.findUnique({
            where: { id: existingSupplier.id },
            select: { updatedAt: true },
          });
          if (!current || current.updatedAt.toISOString() !== expectedUpdatedAt) {
            throw new Error('Supplier supplies have changed. Reload the supplier before saving.');
          }
        }
        const previousSuppliesRaw = await loadSupplierSuppliesJson(tx, existingSupplier.id);
        const finalized = await finalizeSupplierSuppliesSave({
          userId: Number(userId),
          previousSuppliesRaw,
          nextSuppliesRaw: suppliesPayload,
          db: tx,
        });
        await replaceSupplierSupplyRecords(tx, existingSupplier.id, finalized.suppliesJson);
      }

      await tx.supplier.update({
        where: { id: existingSupplier.id },
        data: cleanUpdateData,
      });
      return tx.supplier.findUnique({
        where: { id: existingSupplier.id },
        include: { supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      });
    });

    try {
      const { invalidateDashboardCache, invalidateProductCache } = await import('@/lib/queryCache');
      await Promise.all([
        invalidateDashboardCache(Number(userId)),
        invalidateProductCache(Number(userId)),
      ]);
    } catch {
      // ignore cache failures
    }

    return mapSupplier(withRecords!);
  } catch (error: unknown) {
    throw new Error('Failed to update supplier');
  }
};

const deleteSupplier = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  if (!/^\d+$/.test(userId.toString())) {
    throw new Error('Invalid userId format');
  }

  const supplyRecordsInclude = {
    supplyRecords: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  };

  let deleted;
  if (isNumericId(id)) {
    deleted = await prisma.supplier.findFirst({
      where: { id: Number(id), userId: Number(userId) },
      include: supplyRecordsInclude,
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
      include: supplyRecordsInclude,
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

async function loadCatalogVariantsForUser(userId: number) {
  const { productLabel } = await import('@/lib/suppliers/syncProductSupplies');
  const products = await prisma.product.findMany({
    where: { userId },
    select: {
      productId: true,
      name: true,
      supplier: true,
      variantOptions: {
        where: { isActive: true },
        select: { variantName: true, sku: true },
      },
    },
  });
  return products.flatMap((product) =>
    (product.variantOptions || [])
      .filter((v) => String(v.variantName || '').trim())
      .map((v) => {
        const variantName = String(v.variantName || '').trim() || 'Default';
        const sku =
          String(v.sku || '').trim() ||
          `${String(product.productId).trim()}|${variantName}`;
        return {
          productId: String(product.productId).trim(),
          variantName,
          sku,
          productLabel: productLabel(String(product.name || ''), variantName),
          supplierName: String(product.supplier || '').trim(),
        };
      }),
  );
}


// Only show history rows whose product catalog supplier differs from the current supplier.
// The destination is derived from Product.supplier, never chosen by the client.
const fetchSupplierTransferRecords = async (args: { userId: number; supplierId: string }) => {
  const userId = Number(args.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Invalid user');
  const supplier = await prisma.supplier.findFirst({
    where: { userId, supplierId: args.supplierId },
    select: { id: true, name: true },
  });
  if (!supplier) throw new Error('Supplier not found');
  const [records, products, suppliers] = await Promise.all([
    prisma.supplyRecord.findMany({
      where: { supplierRefId: supplier.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
    prisma.product.findMany({ where: { userId }, select: {
      productId: true, supplier: true,
      variantOptions: { select: { variantName: true } },
    } }),
    prisma.supplier.findMany({ where: { userId }, select: { name: true } }),
  ]);
  const known = new Set(suppliers.map(s => s.name.trim().toLowerCase()));
  const catalog = new Map(products.map(p => [p.productId.trim().toLowerCase(), p]));
  const historyTotals = new Map<string, { qty: number; value: number }>();
  const amount = (value: string) => Number(value);
  const keyOf = (row: { productId: string | null; variantName: string | null }) =>
    `${String(row.productId || '').trim().toLowerCase()}|${String(row.variantName || '').trim().toLowerCase()}`;
  for (const row of records) {
    if (row.recordType !== 'history') continue;
    const key = keyOf(row);
    const total = historyTotals.get(key) || { qty: 0, value: 0 };
    total.qty += amount(row.totalSupplied);
    total.value += amount(row.totalValue);
    historyTotals.set(key, total);
  }
  return records.flatMap(row => {
    const product = catalog.get(String(row.productId || '').trim().toLowerCase());
    const variant = String(row.variantName || '').trim().toLowerCase();
    if (!product || !variant || !product.variantOptions.some(v => v.variantName.trim().toLowerCase() === variant)) return [];
    const targetSupplierName = String(product.supplier || '').trim();
    const target = targetSupplierName.toLowerCase();
    if (!target || target === supplier.name.trim().toLowerCase() || !known.has(target)) return [];
    let quantity = Number(row.totalSupplied);
    let value = Number(row.totalValue);
    if (row.recordType === 'summary') {
      const history = historyTotals.get(keyOf(row)) || { qty: 0, value: 0 };
      quantity -= history.qty;
      value -= history.value;
      // Only the opening portion of the summary is independently transferable.
      if (!Number.isFinite(quantity) || !Number.isFinite(value) || quantity < 0 || value < 0) return [];
      if (quantity === 0 && value === 0) return [];
    } else if (row.recordType !== 'history') return [];
    return [{
      id: row.recordType === 'summary' ? -row.id : row.id,
      sku: row.sku, product: row.product,
      totalSupplied: String(quantity), totalValue: String(value),
      lastDelivery: row.recordType === 'summary' ? '' : row.lastDelivery,
      productId: row.productId, variantName: row.variantName,
      targetSupplierName, recordType: row.recordType,
    }];
  });
};

const fetchSupplierSupplyMoveCandidates = async (args: {
  userId: number;
  supplierId: string;
}) => {
  const userId = Number(args.userId);
  if (!Number.isFinite(userId) || userId <= 0) throw new Error('Invalid userId format');
  const supplierKey = String(args.supplierId || '').trim();
  if (!supplierKey) return [];

  const supplier = await prisma.supplier.findFirst({
    where: {
      userId,
      OR: isNumericId(supplierKey)
        ? [{ id: Number(supplierKey) }, { supplierId: supplierKey }]
        : [{ supplierId: supplierKey }],
    },
    select: {
      id: true,
      name: true,
      supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!supplier) return [];

  const [variants, suppliers] = await Promise.all([
    loadCatalogVariantsForUser(userId),
    prisma.supplier.findMany({
      where: { userId },
      select: { name: true },
    }),
  ]);

  const { supplyDetailFromRecord } = await import('@/lib/suppliers/supplyRecordStore');
  const { findSupplyMoveCandidates } = await import('@/lib/suppliers/orphanedSupplies');
  return findSupplyMoveCandidates({
    supplies: supplier.supplyRecords.map(supplyDetailFromRecord),
    currentSupplierName: supplier.name,
    variants,
    supplierNames: suppliers.map((s) => s.name),
  });
};

const moveSupplierSupplies = async (args: {
  userId: number;
  fromSupplierId: string;
  variants: Array<{ productId: string; variantName: string }>;
}) => {
  const userId = Number(args.userId);
  if (!Number.isFinite(userId) || userId <= 0) throw new Error('Invalid userId format');
  const fromKey = String(args.fromSupplierId || '').trim();
  const variants = (args.variants || [])
    .map((v) => ({
      productId: String(v.productId || '').trim(),
      variantName: String(v.variantName || '').trim(),
    }))
    .filter((v) => v.productId && v.variantName);
  if (!fromKey || variants.length === 0) {
    return { success: false, movedHistoryCount: 0, supplies: null, message: 'Nothing to move' };
  }

  const { supplyDetailFromRecord, replaceSupplierSupplyRecords, loadSupplierSuppliesJson } =
    await import('@/lib/suppliers/supplyRecordStore');
  const { pickRowsForVariants } = await import('@/lib/suppliers/orphanedSupplies');
  const { mergeSupplyLists, belongsToProduct } = await import('@/lib/suppliers/syncProductSupplies');
  const { isSupplyHistoryRow } = await import('@/lib/suppliers/supplyRecords');

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}, ${879_332})`;

    const fromSupplier = await tx.supplier.findFirst({
      where: {
        userId,
        OR: isNumericId(fromKey)
          ? [{ id: Number(fromKey) }, { supplierId: fromKey }]
          : [{ supplierId: fromKey }],
      },
      select: {
        id: true,
        name: true,
        supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!fromSupplier) throw new Error('Supplier not found');

    const catalogVariants = await loadCatalogVariantsForUser(userId);
    const selectedKeys = new Set(
      variants.map((v) => `${v.productId.toLowerCase()}|${v.variantName.toLowerCase()}`),
    );
    const targetNameByKey = new Map<string, string>();
    for (const variant of catalogVariants) {
      const key = `${variant.productId.toLowerCase()}|${variant.variantName.toLowerCase()}`;
      if (selectedKeys.has(key) && variant.supplierName) {
        targetNameByKey.set(key, variant.supplierName);
      }
    }
    if (targetNameByKey.size === 0) {
      return { movedHistoryCount: 0, fromId: fromSupplier.id };
    }

    const allSuppliers = await tx.supplier.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });
    const supplierByName = new Map(
      allSuppliers.map((s) => [String(s.name || '').trim().toLowerCase(), s] as const),
    );

    const fromSupplies = fromSupplier.supplyRecords.map(supplyDetailFromRecord);
    const { keep, move } = pickRowsForVariants(fromSupplies, variants, catalogVariants);
    if (move.length === 0) {
      return { movedHistoryCount: 0, fromId: fromSupplier.id };
    }

    // Group moved rows by target supplier name.
    const moveByTarget = new Map<number, typeof move>();
    const unresolved: typeof move = [];
    for (const row of move) {
      const key = `${String(row.productId || '').trim().toLowerCase()}|${String(row.variantName || '').trim().toLowerCase()}`;
      const targetName = targetNameByKey.get(key) || '';
      const target = supplierByName.get(targetName.trim().toLowerCase());
      if (!target || target.id === fromSupplier.id) {
        unresolved.push(row);
        continue;
      }
      const list = moveByTarget.get(target.id) || [];
      list.push(row);
      moveByTarget.set(target.id, list);
    }

    const nextFrom = [...keep, ...unresolved];
    await replaceSupplierSupplyRecords(tx, fromSupplier.id, nextFrom);
    await tx.supplier.update({
      where: { id: fromSupplier.id },
      data: { updatedAt: new Date() },
    });

    let movedHistoryCount = 0;
    for (const [targetId, rows] of moveByTarget) {
      movedHistoryCount += rows.filter((r) => isSupplyHistoryRow(r)).length;
      const targetRow = allSuppliers.find((s) => s.id === targetId);
      const existing = (targetRow?.supplyRecords || []).map(supplyDetailFromRecord);
      // Drop the target's stock-mirror AUTO rows for these variants so moved

      // Prevent overwriting existing destination supply history.
      const movingVariantKeys = new Set(
        rows.map((row) =>
          `${String(row.productId || '').trim().toLowerCase()}|${String(row.variantName || '').trim().toLowerCase()}`
        )
      );

      const hasConflict = existing.some((row) => {
        if (!isSupplyHistoryRow(row)) return false;

        const pid = String(row.productId || '').trim().toLowerCase();
        const vn = String(row.variantName || '').trim().toLowerCase();

        return Boolean(pid && vn && movingVariantKeys.has(`${pid}|${vn}`));
      });

      if (hasConflict) {
        throw new Error(
          'The destination supplier already has supply history for a selected variant. Transfer cancelled to prevent data loss.'
        );
      }

      // summary/history from the old supplier become the source of truth.
      const existingKept = existing.filter((row) => {
        const pid = String(row.productId || '').trim();
        const vn = String(row.variantName || '').trim();
        if (pid && vn) {
          return !selectedKeys.has(`${pid.toLowerCase()}|${vn.toLowerCase()}`);
        }
        return !variants.some((v) =>
          belongsToProduct(row, { productId: v.productId }, {
            skus: catalogVariants
              .filter(
                (c) =>
                  c.productId.toLowerCase() === v.productId.toLowerCase() &&
                  c.variantName.toLowerCase() === v.variantName.toLowerCase(),
              )
              .map((c) => c.sku),
            labels: catalogVariants
              .filter(
                (c) =>
                  c.productId.toLowerCase() === v.productId.toLowerCase() &&
                  c.variantName.toLowerCase() === v.variantName.toLowerCase(),
              )
              .map((c) => c.productLabel),
          }),
        );
      });
      const merged = mergeSupplyLists(existingKept, rows);
      for (const row of merged) {
        const pid = String(row.productId || '').trim();
        const vn = String(row.variantName || '').trim();
        if (!pid || !vn) continue;
        const catalog = catalogVariants.find(
          (v) =>
            v.productId.toLowerCase() === pid.toLowerCase() &&
            v.variantName.toLowerCase() === vn.toLowerCase(),
        );
        if (!catalog) continue;
        if (!row.sku) row.sku = catalog.sku;
        if (!row.product) row.product = catalog.productLabel;
      }
      await replaceSupplierSupplyRecords(tx, targetId, merged);
      await tx.supplier.update({
        where: { id: targetId },
        data: { updatedAt: new Date() },
      });
    }

    return { movedHistoryCount, fromId: fromSupplier.id };
  });

  try {
    const { invalidateDashboardCache } = await import('@/lib/queryCache');
    await invalidateDashboardCache(userId);
  } catch {
    // Ignore cache invalidation errors
  }

  const supplies = await loadSupplierSuppliesJson(prisma, result.fromId);
  return {
    success: true,
    movedHistoryCount: result.movedHistoryCount,
    supplies,
    message: `Moved ${result.movedHistoryCount} history record(s)`,
  };
};


const moveSelectedSupplyRecords = async (args: {
  userId: number;
  fromSupplierId: string;
  recordIds: number[];
}) => {
  const userId = Number(args.userId);
  const recordIds = args.recordIds || [];

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('Invalid user');
  }

  if (
    recordIds.length === 0 ||
    recordIds.length > 500 ||
    new Set(recordIds).size !== recordIds.length ||
    recordIds.some((id) => !Number.isSafeInteger(id) || id === 0)
  ) {
    throw new Error('Invalid supply record selection');
  }

  const { loadSupplierSuppliesJson } =
    await import('@/lib/suppliers/supplyRecordStore');

  const result = await prisma.$transaction(
    async (tx) => {
      // Serialize manual transfers for this distributor.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${userId}, ${879332})
      `;

      const source = await tx.supplier.findFirst({
        where: { userId, supplierId: args.fromSupplierId },
        select: { id: true, supplierId: true, name: true },
      });
      if (!source) throw new Error('Source supplier not found');
      const historyIds = recordIds.filter(id => id > 0);
      const openingIds = recordIds.filter(id => id < 0).map(id => -id);
      const selected = await tx.supplyRecord.findMany({
        where: { id: { in: [...historyIds, ...openingIds] }, supplierRefId: source.id },
      });
      if (selected.length !== recordIds.length || selected.some(row =>
        row.recordType !== (openingIds.includes(row.id) ? 'summary' : 'history')
      )) throw new Error('Records changed. Refresh and retry.');
      const identities = selected.map(r => ({
        productId: String(r.productId || '').trim(),
        variantName: String(r.variantName || '').trim(),
      }));
      if (identities.some(i => !i.productId || !i.variantName)) {
        throw new Error('Legacy records without catalog identity cannot be transferred automatically.');
      }
      const products = await tx.product.findMany({
        where: { userId, productId: { in: [...new Set(identities.map(i => i.productId))] } },
        select: { productId: true, supplier: true,
          variantOptions: { select: { variantName: true } } },
      });
      const byProduct = new Map(products.map(p => [p.productId.toLowerCase(), p]));
      const targetNames = new Set<string>();
      for (const identity of identities) {
        const product = byProduct.get(identity.productId.toLowerCase());
        if (!product || !product.variantOptions.some(v => v.variantName.toLowerCase() === identity.variantName.toLowerCase())) {
          throw new Error('Product variant no longer exists in the catalog.');
        }
        const targetName = String(product.supplier || '').trim();
        if (!targetName || targetName.toLowerCase() === source.name.trim().toLowerCase()) {
          throw new Error('Selected supply no longer requires a transfer. Refresh and retry.');
        }
        targetNames.add(targetName.toLowerCase());
      }
      if (targetNames.size !== 1) {
        throw new Error('Select records going to the same catalog supplier, then transfer the other records separately.');
      }
      const destinations = await tx.supplier.findMany({
        where: { userId, name: { equals: [...targetNames][0], mode: 'insensitive' } },
        select: { id: true, supplierId: true },
      });
      if (destinations.length !== 1 || destinations[0].id === source.id) {
        throw new Error('Catalog destination supplier is missing or ambiguous');
      }
      const destination = destinations[0];

      // Lock supplier rows in consistent ID order.
      const lockedSupplierIds = [
        source.id,
        destination.id,
      ].sort((a, b) => a - b);

      await tx.$queryRaw`
        SELECT id FROM "Supplier"
        WHERE id IN (${lockedSupplierIds[0]}, ${lockedSupplierIds[1]})
        ORDER BY id
        FOR UPDATE
      `;

      // Locking is coordinated by the distributor advisory lock. All reads and
      // writes below are in this single transaction; no product stock is changed.
      const records = await tx.supplyRecord.findMany({
        where: { id: { in: [...historyIds, ...openingIds] }, supplierRefId: source.id },
        orderBy: { id: 'asc' },
      });
      if (records.length !== recordIds.length) throw new Error('Records changed. Refresh and retry.');
      const parseAmount = (value: string) => {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new Error('Invalid supply quantity or value');
        return n;
      };
      const groups = new Map<string, {
        productId: string; variantName: string; sku: string; product: string;
        quantity: number; value: number; openingQuantity: number; openingValue: number;
      }>();
      for (const row of records) {
        if (!row.productId || !row.variantName) throw new Error('Unlinked legacy record cannot be transferred');
        const key = `${row.productId.toLowerCase()}|${row.variantName.toLowerCase()}`;
        const group = groups.get(key) || {
          productId: row.productId, variantName: row.variantName,
          sku: row.sku, product: row.product, quantity: 0, value: 0,
          openingQuantity: 0, openingValue: 0,
        };
        if (row.recordType === 'history') {
          group.quantity += parseAmount(row.totalSupplied);
          group.value += parseAmount(row.totalValue);
        }
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        const identity = { productId: group.productId, variantName: group.variantName, recordType: 'summary' };
        const sourceSummaries = await tx.supplyRecord.findMany({ where: { supplierRefId: source.id, ...identity } });
        const destinationSummaries = await tx.supplyRecord.findMany({ where: { supplierRefId: destination.id, ...identity } });
        if (sourceSummaries.length !== 1 || destinationSummaries.length > 1) {
          throw new Error('Ambiguous supply summary. Reconcile before transferring.');
        }
        const summary = sourceSummaries[0];
        const sourceQty = parseAmount(summary.totalSupplied);
        const sourceValue = parseAmount(summary.totalValue);
        if (openingIds.includes(summary.id)) {
          // Opening balance = frozen summary minus ALL history still at source.
          const allHistory = await tx.supplyRecord.findMany({ where: {
            supplierRefId: source.id, productId: group.productId,
            variantName: group.variantName, recordType: 'history',
          } });
          const historyQty = allHistory.reduce((sum, row) => sum + parseAmount(row.totalSupplied), 0);
          const historyValue = allHistory.reduce((sum, row) => sum + parseAmount(row.totalValue), 0);
          group.openingQuantity = sourceQty - historyQty;
          group.openingValue = sourceValue - historyValue;
          if (group.openingQuantity < 0 || group.openingValue < 0 ||
              (group.openingQuantity === 0 && group.openingValue === 0)) {
            throw new Error('Opening balance changed. Refresh and retry.');
          }
        }
        const moveQty = group.quantity + group.openingQuantity;
        const moveValue = group.value + group.openingValue;
        if (sourceQty < moveQty || sourceValue < moveValue) throw new Error('Supply summary does not match selected records');
        const remainingQty = sourceQty - moveQty;
        const remainingValue = sourceValue - moveValue;
        // Preserve the opening balance's original database ID when possible.
        // A summary also contains rolled-up history, so only move it directly
        // after separating any history that must remain at the source.
        const movingOpening = openingIds.includes(summary.id);
        if (movingOpening && destinationSummaries.length === 0) {
          if (remainingQty !== 0 || remainingValue !== 0) {
            // Remaining source history needs its own aggregate summary.
            // Do not fabricate a dated history event or a second opening balance.
            await tx.supplyRecord.create({ data: {
              supplierRefId: source.id,
              suppliesno: `SUM-${crypto.randomUUID()}`,
              sku: summary.sku, product: summary.product,
              productId: group.productId, variantName: group.variantName,
              totalSupplied: String(remainingQty),
              totalValue: String(remainingValue),
              recordType: 'summary', status: summary.status,
            } });
          }
          // Transfer ownership of the original opening record; its ID survives.
          await tx.supplyRecord.update({ where: { id: summary.id }, data: {
            supplierRefId: destination.id,
            totalSupplied: String(moveQty),
            totalValue: String(moveValue),
          } });
        } else {
          // Destination already has an aggregate summary, or only history moves.
          // Merge quantities without duplicating an opening balance.
          if (remainingQty === 0 && remainingValue === 0) {
            await tx.supplyRecord.delete({ where: { id: summary.id } });
          } else {
            await tx.supplyRecord.update({ where: { id: summary.id }, data: {
              totalSupplied: String(remainingQty),
              totalValue: String(remainingValue),
            } });
          }
          if (destinationSummaries.length) {
            const target = destinationSummaries[0];
            await tx.supplyRecord.update({ where: { id: target.id }, data: {
              totalSupplied: String(parseAmount(target.totalSupplied) + moveQty),
              totalValue: String(parseAmount(target.totalValue) + moveValue),
            } });
          } else {
            await tx.supplyRecord.create({ data: {
              supplierRefId: destination.id,
              suppliesno: `SUM-${crypto.randomUUID()}`,
              sku: group.sku, product: group.product,
              productId: group.productId, variantName: group.variantName,
              totalSupplied: String(moveQty), totalValue: String(moveValue),
              recordType: 'summary', status: 'Active',
            } });
          }
        }
      }
      const moved = await tx.supplyRecord.updateMany({
        where: { id: { in: historyIds }, supplierRefId: source.id, recordType: 'history' },
        data: { supplierRefId: destination.id },
      });
      if (moved.count !== historyIds.length) throw new Error('Transfer conflict. Refresh and retry.');
      await tx.supplier.updateMany({
        where: { id: { in: [source.id, destination.id] }, userId },
        data: { updatedAt: new Date() },
      });
      return {
        sourceId: source.id,
        count: moved.count + openingIds.length,
      };
    },
    {
      isolationLevel: 'Serializable',
      timeout: 15000,
    }
  );

  try {
    const { invalidateDashboardCache } = await import('@/lib/queryCache');
    await invalidateDashboardCache(userId);
  } catch (error) {
    console.error('Supply transfer succeeded but cache invalidation failed', error);
  }
  const supplies = await loadSupplierSuppliesJson(
    prisma,
    result.sourceId
  );

  return {
    success: true,
    movedHistoryCount: result.count,
    supplies,
    message: `Moved ${result.count} supply record(s)`,
  };
};


/**
 * Record a dated supply event (history). Updates summary totals.
 * If suppliedDate is today, also increases matched variant current stock.
 * Past-dated supplies never change current stock.
 */
const recordSupplierSupply = async (args: {
  userId: number;
  supplierId: string;
  input: {
    sku?: string | null;
    product: string;
    quantity: number;
    totalValue?: number | null;
    suppliedDate: string;
    productId?: string | null;
    variantName?: string | null;
    updateCurrentStock?: boolean | null;
  };
}) => {
  const { userId, supplierId, input } = args;
  if (!/^\d+$/.test(String(userId))) {
    throw new Error('Invalid userId format');
  }

  const qty = Math.max(0, Math.floor(Number(input.quantity) || 0));
  if (qty <= 0) {
    throw new Error('Quantity must be greater than zero');
  }
  const productName = String(input.product || '').trim();
  if (!productName) {
    throw new Error('Product name is required');
  }

  const {
    createHistorySupplyRow,
    upsertSummaryFromSupplyEvent,
    isSupplyReceivedToday,
    todayYmdJakarta,
    parseSupplyDateYmd,
  } = await import('@/lib/suppliers/supplyRecords');
  const { incrementVariantStockForSupply } = await import('@/lib/suppliers/applySupplierSuppliesSave');

  const suppliedDate = parseSupplyDateYmd(input.suppliedDate);
  if (!suppliedDate) {
    throw new Error('Invalid supplied date');
  }

  const supplier = await prisma.supplier.findFirst({
    where: {
      userId: Number(userId),
      OR: isNumericId(supplierId)
        ? [{ id: Number(supplierId) }, { supplierId }]
        : [{ supplierId }],
    },
  });
  if (!supplier) {
    throw new Error('Supplier not found');
  }

  const { getCurrencyConfig } = await import('@/config/currencyConfig');
  const userCurrency = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: { currency: true },
  });
  const maxFractionDigits =
    getCurrencyConfig(userCurrency?.currency || undefined).formatOptions.maximumFractionDigits ?? 2;
  const moneyFactor = 10 ** Math.max(0, Number(maxFractionDigits) || 0);
  const rawTotalValue = Number(input.totalValue) || 0;
  // Keep currency precision (e.g. 2dp USD); do not coerce to whole units.
  const totalValue = Math.max(
    0,
    Math.round((Number.isFinite(rawTotalValue) ? rawTotalValue : 0) * moneyFactor) / moneyFactor,
  );
  const sku = String(input.sku || '').trim();
  const productId = String(input.productId || '').trim() || undefined;
  const variantName = String(input.variantName || '').trim() || undefined;

  // Prefer explicit checkbox; fall back to "today" for older API callers.
  const updateStock =
    input.updateCurrentStock === true ||
    (input.updateCurrentStock == null && isSupplyReceivedToday(suppliedDate, todayYmdJakarta()));

  const { loadSupplierSupplies, replaceSupplierSupplyRecords } = await import(
    '@/lib/suppliers/supplyRecordStore'
  );

  const { stockUpdated, withRecords } = await prisma.$transaction(async (tx) => {
    // Same lock key as updateSupplier so concurrent supply writes share one critical section.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(userId)}, ${879_332})`;

    let stockUpdatedInTx = false;
    if (updateStock) {
      stockUpdatedInTx = await incrementVariantStockForSupply({
        userId: Number(userId),
        sku,
        productId,
        variantName,
        quantity: qty,
        db: tx,
      });
    }

    // stockApplied only after a successful stock write so failed increments can retry.
    const historyRow = createHistorySupplyRow({
      sku,
      product: productName,
      quantity: qty,
      totalValue,
      suppliedDate,
      productId,
      variantName,
      updateCurrentStock: updateStock,
      stockApplied: stockUpdatedInTx,
    });

    let supplies = await loadSupplierSupplies(tx, supplier.id);
    supplies = [...supplies, historyRow];
    // Totals always update; product stock only when Update Stock is checked.
    supplies = upsertSummaryFromSupplyEvent(supplies, {
      sku,
      product: productName,
      quantity: qty,
      totalValue,
      productId,
      variantName,
    });

    await replaceSupplierSupplyRecords(tx, supplier.id, supplies);
    await tx.supplier.update({
      where: { id: supplier.id },
      data: { updatedAt: new Date() },
    });

    const next = await tx.supplier.findUnique({
      where: { id: supplier.id },
      include: { supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    });

    return { stockUpdated: stockUpdatedInTx, withRecords: next };
  });

  try {
    const { invalidateDashboardCache, invalidateProductCache } = await import('@/lib/queryCache');
    await Promise.all([
      invalidateDashboardCache(Number(userId)),
      invalidateProductCache(Number(userId)),
    ]);
  } catch {
    // ignore
  }

  return {
    success: true,
    stockUpdated,
    supplier: mapSupplier(withRecords || supplier),
    message: stockUpdated
      ? 'Supply recorded and current stock increased'
      : 'Supply recorded (current stock unchanged)',
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
    supplierSupplyMoveCandidates: withDashboardAuth(fetchSupplierSupplyMoveCandidates),
    supplierTransferRecords: withDashboardAuth(fetchSupplierTransferRecords),
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
    recordSupplierSupply: withDashboardAuth(recordSupplierSupply),
    moveSupplierSupplies: withDashboardAuth(moveSupplierSupplies),
    moveSelectedSupplyRecords: withDashboardAuth(moveSelectedSupplyRecords),
  },
};

export { fetchBuyersConnection, fetchSuppliersConnection };

