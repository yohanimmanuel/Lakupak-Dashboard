import { supplierReceiptTotals } from '@/lib/suppliers/supplierReceiptTotals';
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
import { getSupplyReceivedInput, getSupplyRecordType } from '@/lib/suppliers/supplyRecords';

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
    orderLineDetails: String
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
    variantOptionId: Int
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

    setSupplierReceiptArchived(userId: Int!, supplierId: String!, suppliesno: String!, archived: Boolean!): Boolean!
    deleteArchivedSupplierReceipt(userId: Int!, supplierId: String!, suppliesno: String!): Boolean!

    recordSupplierSupply(
      userId: Int!
      supplierId: String!
      input: RecordSupplierSupplyInput!
    ): RecordSupplierSupplyResult!


  }
`;

type BuyerWithRecords = BuyerModel & {
  orderLineDetails?: string | null;
  buyerRecords?: Array<{
    orderNo: string;
    product: string;
    productId: string | null;
    // Prisma stores variantOptionId as an Int?; keep this numeric to match generated types.
    variantOptionId: number | null;
    variantName: string | null;
    stockType: string | null;
    piecesPerPackage: number | null;
    totalOrders: string;
    totalSpend: string;
    shippingFee: string | null;
    lastOrderDate: string;
    outstanding: string;
    freeItems: number | null;
    discountBadge: string | null;
    offerApplied: boolean | null;
    syncedFromOrders: boolean;
    skuSnapshot: string | null;
    sortOrder: number;
  }>;
};

type SupplierWithRecords = SupplierModel & {
  supplyRecords?: Array<{
    suppliesno: string;
    sku: string;
    product: string;
    /** Original supplier-entered package quantity, e.g. "1" for one Carton. */
    receivedQuantity: string;
    /** Original supplier-selected stock level; inventory quantity remains totalSupplied in Pieces. */
    receivedUnit: string;
    totalSupplied: string;
    totalValue: string;
    lastSuppliedDate: string;
    status: string;
    deliverySuccess: string | null;
    recordType: string;
    productId: string | null;
    variantName: string | null;
    updateCurrentStock: boolean;
    stockApplied: boolean;
    stockAppliedVariantOptionId?: number | null;
    historicalVariantOptionId?: number | null;
    sortOrder: number;
    archivedAt?: Date | null;
    variantOptionId?: number | null;
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
  orderLineDetails: (buyer as BuyerWithRecords).orderLineDetails ?? null,
  orderDetails:
    buyer.buyerRecords && buyer.buyerRecords.length > 0
      ? JSON.stringify(
          buyer.buyerRecords.map((row) => ({
            orderNo: row.orderNo,
            product: row.product,
            productId: row.productId ?? undefined,
            variantOptionId: row.variantOptionId ?? undefined,
            sku: row.skuSnapshot ?? undefined,
            variantName: row.variantName ?? undefined,
            stockType: row.stockType ?? undefined,
            piecesPerPackage: row.piecesPerPackage ?? undefined,
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
            // Legacy rows can have an empty-string DB default. Normalize them to
            // their canonical Pieces total so both modal and profile show a quantity.
            ...getSupplyReceivedInput({
              receivedQuantity: row.receivedQuantity,
              receivedUnit: row.receivedUnit,
              totalSupplied: row.totalSupplied,
            }),
            totalSupplied: row.totalSupplied,
            totalValue: row.totalValue,
            lastSuppliedDate: row.lastSuppliedDate,
            status: row.status,
            deliverySuccess: row.deliverySuccess ?? undefined,
            recordType: getSupplyRecordType({ suppliesno: row.suppliesno, recordType: row.recordType as 'history' | 'summary' }),
            productId: row.productId ?? undefined,
            variantName: row.variantName ?? undefined,
            updateCurrentStock: row.updateCurrentStock === true,
            stockApplied: row.stockApplied === true,
            stockAppliedVariantOptionId: row.stockAppliedVariantOptionId ?? undefined,
            historicalVariantOptionId: row.historicalVariantOptionId ?? undefined,
            variantOptionId: row.variantOptionId ?? undefined,
            archivedAt: row.archivedAt?.toISOString() ?? null,
          })),
        )
      : null,
  avgMonthlyPurchaseValue: (supplier as { avgMonthlyPurchaseValue?: unknown }).avgMonthlyPurchaseValue 
    ? parseMoney((supplier as { avgMonthlyPurchaseValue?: unknown }).avgMonthlyPurchaseValue as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined) 
    : null, // Convert Decimal to number
  // SupplierTable and SupplierProfile must report the same active receipts.
  // Supplier totals include active dated receipts only; legacy snapshots and archives are excluded.
  totalPurchases: supplierReceiptTotals(supplier.supplyRecords || []).totalPurchases,
  totalSupplies: supplierReceiptTotals(supplier.supplyRecords || []).totalSupplies,
  onTimeDeliveryRate: (supplier as { onTimeDeliveryRate?: unknown }).onTimeDeliveryRate 
    ? parseMoney((supplier as { onTimeDeliveryRate?: unknown }).onTimeDeliveryRate as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined) 
    : null, // Convert Decimal to number
  userId: supplier.userId ?? null,
  createdAt: supplier.createdAt.toISOString(),
  updatedAt: supplier.updatedAt.toISOString(),
});

type BuyerOrderLineSnapshot = {
  id: number;
  productId: string | null;
  productName: string;
  productSkuSnapshot: string | null;
  variantOptionId: number | null;
  variantId: number | null;
  variantNameSnapshot: string | null;
  packageQuantity: number | null;
  packageType: string | null;
  piecesPerPackage: number | null;
  subtotal: string;
  pricePerPackage: string | null;
  promotionDetailsSnapshot: string | null;
  moqSnapshot: number | null;
};

async function loadBuyerOrderLineSnapshots(
  userId: number,
  orderNos: string[],
): Promise<Map<string, BuyerOrderLineSnapshot[]>> {
  const exactOrderNos = [...new Set(orderNos.map((value) => String(value || '').trim()).filter(Boolean))];
  if (exactOrderNos.length === 0) return new Map();
  const orders = await prisma.order.findMany({
    where: {
      userId,
      orderId: { in: exactOrderNos },
      isDeleted: false,
      orderStatus: { notIn: ['Cancelled', 'Returned'] },
    },
    select: {
      orderId: true,
      buyerId: true,
      orderItemsRel: {
        select: {
          id: true,
          productId: true,
          productNameSnapshot: true,
          variantId: true,
          variantOptionId: true,
          productSkuSnapshot: true,
          variantNameSnapshot: true,
          packageQuantity: true,
          packageType: true,
          piecesPerPackage: true,
          subtotal: true,
          pricePerPackage: true,
          promotionDetailsSnapshot: true,
          moqSnapshot: true,
        },
      },
    },
  });
  const snapshots = new Map<string, BuyerOrderLineSnapshot[]>();
  for (const order of orders) {
    snapshots.set(String(order.orderId || '').trim(), order.orderItemsRel.map((item) => ({
      id: item.id,
      productId: item.productId ?? null,
      productName: item.productNameSnapshot || 'Unknown Product',
      productSkuSnapshot: item.productSkuSnapshot ?? null,
      variantOptionId: item.variantOptionId ?? null,
      variantId: item.variantId ?? null,
      variantNameSnapshot: item.variantNameSnapshot ?? null,
      packageQuantity: item.packageQuantity ?? null,
      packageType: item.packageType ?? null,
      piecesPerPackage: item.piecesPerPackage ?? null,
      subtotal: item.subtotal.toString(),
      pricePerPackage: item.pricePerPackage?.toString() ?? null,
      promotionDetailsSnapshot: item.promotionDetailsSnapshot ?? null,
      moqSnapshot: item.moqSnapshot ?? null,
    })));
  }
  return snapshots;
}

function withBuyerOrderLineSnapshots(
  buyer: BuyerWithRecords,
  snapshots: Map<string, BuyerOrderLineSnapshot[]>,
): BuyerWithRecords {
  const records = buyer.buyerRecords || [];
  // BuyerRecord is a compact per-order summary. Older imports may contain more
  // than one summary row for an orderNo; emit immutable OrderItem lines only once.
  const marketplaceRecordsByOrder = new Map<string, (typeof records)[number]>();
  for (const record of records) {
    const orderNo = String(record.orderNo || '').trim();
    if (!orderNo || !(record.syncedFromOrders || orderNo.toUpperCase().startsWith('LKO-'))) continue;
    if (!marketplaceRecordsByOrder.has(orderNo)) marketplaceRecordsByOrder.set(orderNo, record);
  }
  const orderLineDetails = [...marketplaceRecordsByOrder.values()]
    .map((record) => ({
      orderNo: record.orderNo,
      orderDate: record.lastOrderDate,
      totalSpend: record.totalSpend,
      shippingFee: record.shippingFee,
      outstanding: record.outstanding,
      orderItems: snapshots.get(String(record.orderNo || '').trim()) || [],
    }))
    .filter((record) => record.orderItems.length > 0);

  return {
    ...buyer,
    orderLineDetails: orderLineDetails.length ? JSON.stringify(orderLineDetails) : null,
    buyerRecords: records.map((record) => {
      const lines = snapshots.get(String(record.orderNo || '').trim()) || [];
      if (lines.length === 0) return record;
      const distinct = (values: Array<string | null | undefined>) =>
        [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
      const skus = distinct(lines.map((line) => line.productSkuSnapshot));
      const variants = distinct(lines.map((line) => line.variantNameSnapshot));
      const productIds = distinct(lines.map((line) => line.productId));
      const variantIds = [...new Set(lines.map((line) => line.variantOptionId).filter((value): value is number => value != null))];
      return {
        ...record,
        skuSnapshot: record.skuSnapshot || (skus.length ? skus.join(', ') : null),
        variantName: record.variantName || (variants.length ? variants.join(', ') : null),
        productId: record.productId || (productIds.length === 1 ? productIds[0] : null),
        variantOptionId: record.variantOptionId ?? (variantIds.length === 1 ? variantIds[0] : null),
      };
    }),
  };
}

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

  // Backfill missing legacy BuyerRecord SKU/variant labels from immutable OrderItem
  // snapshots in one batched query. Do not depend on the current Product Catalog.
  const buyerOrderNos = buyers.flatMap((buyer) =>
    (buyer as BuyerWithRecords).buyerRecords
      ?.filter((record) => record.syncedFromOrders || String(record.orderNo || '').toUpperCase().startsWith('LKO-'))
      .map((record) => record.orderNo) || [],
  );
  const orderLineSnapshots = await loadBuyerOrderLineSnapshots(userId, buyerOrderNos);
  return {
    nodes: buyers.map((buyer) => mapBuyer(withBuyerOrderLineSnapshots(buyer as BuyerWithRecords, orderLineSnapshots))),
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

  // Profile reads stay read-only. Fill missing legacy labels from immutable OrderItem
  // snapshots in the same request, using one batched query rather than client hydration.
  const buyerOrderNos = (buyer as BuyerWithRecords).buyerRecords
    ?.filter((record) => record.syncedFromOrders || String(record.orderNo || '').toUpperCase().startsWith('LKO-'))
    .map((record) => record.orderNo) || [];
  const orderLineSnapshots = await loadBuyerOrderLineSnapshots(userId, buyerOrderNos);
  return mapBuyer(withBuyerOrderLineSnapshots(buyer as BuyerWithRecords, orderLineSnapshots));
};

const fetchSingleSupplier = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  // Supplier reads are read-only. Current inventory belongs to Product Catalog;
  // supplier totals are derived only from persisted receipt history.

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
    // Surface actionable stock/identity validation errors rather than hiding
    // every failure behind a generic message. Do not expose database internals.
    if (error instanceof Error && /^(Supply stock update blocked:|Cannot reverse supplier stock:|Supplier supplies have changed\.|Duplicate supply record number\.|Duplicate stored supply record number\.)/.test(error.message)) {
      throw error;
    }
    console.error('Supplier update failed', error);
    throw new Error('Failed to update supplier. Check the server log for details.');
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
  // Supplier receipts are now entered/imported explicitly. This old mutation
  // remains as a compatibility no-op and must not regenerate AUTO balances.
  return {
    success: true,
    productsProcessed: 0,
    suppliersTouched: 0,
    message: 'Supplier receipts are managed explicitly; no catalog snapshots were generated.',
  };
};

/**
 * Soft archive a receipt only when its original catalog variant has been deleted.
 * Active receipts linked to live variants cannot be archived.
 */
/** Archive only orphaned/legacy receipt history. This is visibility-only and never changes stock. */
const setSupplierReceiptArchived = async (args: { userId: number; supplierId: string; suppliesno: string; archived: boolean }): Promise<boolean> => {
  const { userId, supplierId, suppliesno, archived } = args;
  await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { userId, OR: isNumericId(supplierId) ? [{ id: Number(supplierId) }, { supplierId }] : [{ supplierId }] },
      select: { id: true },
    });
    if (!supplier) throw new Error('Supplier not found');

    const row = await tx.supplyRecord.findFirst({
      where: { supplierRefId: supplier.id, suppliesno },
    });
    if (!row || row.recordType !== 'history') throw new Error('Receipt history record not found');
    if (row.variantOptionId != null) throw new Error('Only receipts whose original catalog variant is no longer linked can be archived');

    const historicalId = row.historicalVariantOptionId;
    if (historicalId) {
      const stillExists = await tx.variantOption.findFirst({
        where: { id: historicalId, product: { userId } },
        select: { id: true },
      });
      if (stillExists) throw new Error('The original catalog variant still exists; this receipt cannot be archived.');
    }
    if (row.stockApplied && row.stockAppliedVariantOptionId != null) {
      const appliedTargetStillExists = await tx.variantOption.findFirst({
        where: { id: row.stockAppliedVariantOptionId, product: { userId } },
        select: { id: true },
      });
      if (appliedTargetStillExists) {
        throw new Error('This receipt still has an active inventory movement. Untick Update Stock and save before archiving.');
      }
    }
    await tx.supplyRecord.update({
      where: { id: row.id },
      data: { archivedAt: archived ? new Date() : null },
    });
  });
  try { const { invalidateDashboardCache } = await import('@/lib/queryCache'); await invalidateDashboardCache(userId); } catch { /* best effort */ }
  return true;
};

/** Permanently delete an already-archived orphaned receipt history row. */
const deleteArchivedSupplierReceipt = async (args: { userId: number; supplierId: string; suppliesno: string }): Promise<boolean> => {
  const { userId, supplierId, suppliesno } = args;
  await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { userId, OR: isNumericId(supplierId) ? [{ id: Number(supplierId) }, { supplierId }] : [{ supplierId }] },
      select: { id: true },
    });
    if (!supplier) throw new Error('Supplier not found');

    const row = await tx.supplyRecord.findFirst({
      where: { supplierRefId: supplier.id, suppliesno },
    });
    if (!row || row.recordType !== 'history' || !row.archivedAt) {
      throw new Error('Only archived receipt history can be permanently deleted.');
    }
    if (row.variantOptionId != null) {
      throw new Error('A receipt linked to a live catalog variant cannot be permanently deleted here.');
    }
    if (row.stockApplied && row.stockAppliedVariantOptionId != null) {
      const appliedTargetStillExists = await tx.variantOption.findFirst({
        where: { id: row.stockAppliedVariantOptionId, product: { userId } },
        select: { id: true },
      });
      if (appliedTargetStillExists) throw new Error('Cannot delete a receipt with an active inventory movement.');
    }
    await tx.supplyRecord.delete({ where: { id: row.id } });
  });
  try { const { invalidateDashboardCache } = await import('@/lib/queryCache'); await invalidateDashboardCache(userId); } catch { /* best effort */ }
  return true;
};

const recordSupplierSupply = async (args: {
  userId: number;
  supplierId: string;
  input: {
    variantOptionId?: number | null;
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
  // An explicit variant ID is immutable historical identity, not a SKU alias.
  // Legacy callers may omit it; only uniquely resolved live variants are linked.
  const requestedVariantId = input.variantOptionId == null ? null : Number(input.variantOptionId);
  if (requestedVariantId != null && (!Number.isSafeInteger(requestedVariantId) || requestedVariantId <= 0)) {
    throw new Error('Invalid variantOptionId');
  }

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

    const selected = requestedVariantId == null ? null : await tx.variantOption.findFirst({
      where: { id: requestedVariantId, product: { userId: Number(userId) } },
      select: { id: true, isActive: true, sku: true, variantName: true, product: { select: { productId: true } } },
    });
    if (requestedVariantId != null && !selected) throw new Error('Variant does not belong to this user');
    if (selected && productId && selected.product.productId !== productId) throw new Error('Variant/product mismatch');
    if (selected && sku && selected.sku && selected.sku !== sku) throw new Error('Variant/SKU mismatch');
    if (selected && variantName && selected.variantName !== variantName) throw new Error('Variant name mismatch');
    // Never auto-link a legacy receipt by a recycled SKU. Legacy history remains
    // unlinked until the user explicitly chooses a live variant.
    const variantOptionId = selected?.id;
    let stockUpdatedInTx = false;
    if (updateStock && !variantOptionId) {
      throw new Error('Select a current product variant before updating stock');
    }
    if (updateStock && selected?.isActive !== true) {
      throw new Error('Archived variants cannot receive stock');
    }
    if (updateStock) {
      stockUpdatedInTx = await incrementVariantStockForSupply({
        userId: Number(userId),
        variantOptionId,
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
      variantOptionId,
      updateCurrentStock: updateStock,
      stockApplied: stockUpdatedInTx,
    });

    const supplies = await loadSupplierSupplies(tx, supplier.id);
    // Persist the receipt event only. AUTO rows are current Product variant
    // stock snapshots and are reconciled from Product after this transaction;
    // never increment them here (that caused repeated receipt totals).
    await replaceSupplierSupplyRecords(tx, supplier.id, [...supplies, historyRow]);
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

  let supplierAfterReconcile = withRecords || supplier;
  if (stockUpdated && productId) {
    try {
      const product = await prisma.product.findFirst({
        where: { productId, userId: Number(userId) },
        select: {
          productId: true,
          name: true,
          supplier: true,
          userId: true,
          variantOptions: {
            select: {
              variantName: true,
              sku: true,
              purchasePrice: true,
              stockQuantity: true,
              isActive: true,
            },
          },
        },
      });
      if (product) {
        const { syncSupplierFromProduct } = await import('@/lib/suppliers/syncProductSupplies');
        await syncSupplierFromProduct({
          productId: product.productId,
          name: product.name,
          supplier: product.supplier,
          userId: Number(userId),
          variantOptions: product.variantOptions,
        });
      }
      const refreshedSupplier = await prisma.supplier.findUnique({
        where: { id: supplier.id },
        include: { supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      });
      if (refreshedSupplier) supplierAfterReconcile = refreshedSupplier;
    } catch (syncError) {
      console.warn('[Suppliers] Stock snapshot reconciliation skipped after receipt:', syncError);
    }
  }

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
    supplier: mapSupplier(supplierAfterReconcile),
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
    setSupplierReceiptArchived: withDashboardAuth(setSupplierReceiptArchived),
    deleteArchivedSupplierReceipt: withDashboardAuth(deleteArchivedSupplierReceipt),
  },
};

export { fetchBuyersConnection, fetchSuppliersConnection };

