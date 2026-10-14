import { NextRequest, NextResponse } from 'next/server';
import { prisma, type Prisma } from '@/lib/db';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { generateSecureOrderId, getOrderSecurityHeaders } from '@/utils/order-security';
import {
  applyOfferToPrice,
  getOfferForClientAndProduct,
} from '@/lib/offers/getOfferForClientAndProduct';
import { reverseOfferUsage, trackOfferUsage } from '@/utils/offerValidation';
import { recordManualOrderClientMatch } from '@/lib/clientMatching/service';
import { syncOrderToBuyerProfile } from '@/utils/buyerSync';
import { invalidateDashboardCache } from '@/lib/queryCache';
import {
  STOCK_NO_DEDUCT_STATUSES,
  calculateTotalQuantityWithPromotions,
  decimalToNumber,
  restoreStockForOrderItems,
} from './utils';

const ORDER_STATUSES = new Set([
  'Pending',
  'Confirmed',
  'Packed',
  'Shipped',
  'Delivered',
  'Received',
  'Failed',
  'Cancelled',
  'Returned',
]);
const PAYMENT_STATUSES = new Set(['Unpaid', 'Paid']);
const DELIVERY_METHODS = new Set([
  'Self Pickup',
  'Seller/Distributor Delivery',
  'Buyer-arranged Courier',
]);
const PAYMENT_TERMS = new Set([
  'Cash on Delivery',
  'Bank Transfer',
  'Net 7',
  'Net 14',
  'Net 30',
]);

type ItemInput = {
  productId: string;
  variantOptionId: number;
  packageQuantity: number;
};

function clip(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function money(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function optionalDate(value: unknown): Date | null | 'invalid' {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'invalid';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'invalid' : parsed;
}

function optionalInt(value: unknown): number | null | 'invalid' {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 365) return 'invalid';
  return n;
}

type PricedLine = {
  productId: string;
  variantOptionId: number;
  packageQuantity: number;
  productName: string;
  productSku: string | null;
  productType: string | null;
  productImage: string | null;
  variantName: string;
  attributes: Prisma.InputJsonValue | undefined;
  moq: number | null;
  unitPrice: number;
  basePrice: number;
  subtotal: number;
  offerApplied: boolean;
  offerBadge: string | null;
  offerName: string | null;
  offerId: string | null;
  discountAmount: number | null;
  discountPercentage: number | null;
  promotionDetails: string | null;
  lineDiscount: number;
};

class InsufficientStockError extends Error {
  constructor(productId: string, required: number) {
    super(`Insufficient stock for product ${productId}. Required: ${required} pieces.`);
    this.name = 'InsufficientStockError';
  }
}

async function deductStockForCreatedLines(tx: Prisma.TransactionClient, lines: PricedLine[]) {
  for (const line of lines) {
    const totalQtyToDeduct = calculateTotalQuantityWithPromotions({
      packageQuantity: line.packageQuantity,
      piecesPerPackage: 1,
      promotionDetailsSnapshot: line.promotionDetails,
      moqSnapshot: line.moq,
    });
    const deductResult = await tx.variantOption.updateMany({
      where: {
        id: line.variantOptionId,
        stockQuantity: { gte: totalQtyToDeduct },
      },
      data: {
        stockQuantity: { decrement: totalQtyToDeduct },
      },
    });
    if (deductResult.count === 0) {
      throw new InsufficientStockError(line.productId, totalQtyToDeduct);
    }

    const afterDeduct = await tx.variantOption.findUnique({
      where: { id: line.variantOptionId },
      select: { stockQuantity: true, stockStatus: true, lowStockThreshold: true },
    });
    if (!afterDeduct) continue;
    const lowStockThreshold = afterDeduct.lowStockThreshold || 0;
    let newStockStatus = 'In Stock';
    if (afterDeduct.stockQuantity <= 0) {
      newStockStatus = 'Out of Stock';
    } else if (lowStockThreshold > 0 && afterDeduct.stockQuantity <= lowStockThreshold) {
      newStockStatus = 'Low Stock';
    }
    if (newStockStatus !== afterDeduct.stockStatus) {
      await tx.variantOption.update({
        where: { id: line.variantOptionId },
        data: { stockStatus: newStockStatus },
      });
    }
  }
}

function lineCreateData(line: PricedLine, currency: string | null) {
  return {
    productId: line.productId,
    variantOptionId: line.variantOptionId,
    packageQuantity: line.packageQuantity,
    packageType: line.productType,
    piecesPerPackage: 1,
    pricePerPackage: line.unitPrice,
    subtotal: line.subtotal,
    productNameSnapshot: line.productName,
    productSkuSnapshot: line.productSku,
    productTypeSnapshot: line.productType,
    productImageSnapshot: line.productImage,
    variantNameSnapshot: line.variantName,
    variantAttributesSnapshot: line.attributes,
    unitPriceSnapshot: line.unitPrice,
    currencySnapshot: currency,
    moqSnapshot: line.moq,
    offerApplied: line.offerApplied,
    offerBadgeSnapshot: line.offerBadge,
    offerNameSnapshot: line.offerName,
    offerIdSnapshot: line.offerId,
    originalPriceSnapshot: line.offerApplied ? line.basePrice : null,
    discountAmount: line.discountAmount,
    discountPercentage: line.discountPercentage,
    promotionDetailsSnapshot: line.promotionDetails,
  };
}

async function priceDistributorLines(
  userId: number,
  buyerId: string,
  items: ItemInput[],
): Promise<{ error: string; code: string; status: number } | { priced: PricedLine[]; currency: string | null }> {
  const seller = await prisma.user.findUnique({
    where: { id: userId },
    select: { currency: true },
  });
  const products = await prisma.product.findMany({
    where: { userId, productId: { in: items.map((item) => item.productId) } },
    select: {
      productId: true,
      name: true,
      sku: true,
      productType: true,
      images: true,
      variantOptions: {
        where: { isActive: true },
        select: {
          id: true,
          variantName: true,
          sku: true,
          sellingPrice: true,
          moq: true,
          attributes: true,
        },
      },
    },
  });
  const productById = new Map(products.map((product) => [product.productId, product]));
  const priced: PricedLine[] = [];
  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) return { error: 'Product not found', code: 'product_not_found', status: 404 };
    const variant = product.variantOptions.find((option) => option.id === item.variantOptionId);
    if (!variant) return { error: 'Product variant not found', code: 'variant_not_found', status: 404 };
    const basePrice = money(Number(variant.sellingPrice));
    const offer = await getOfferForClientAndProduct(buyerId, product.productId, {
      userId,
      variantOptionId: variant.id,
    });
    const applied = offer ? applyOfferToPrice(basePrice, offer) : null;
    const unitPrice = money(applied ? applied.unitPrice : basePrice);
    const hasPromo = Boolean(applied?.promotionDetails);
    const hasDiscount = Boolean(applied && applied.discountAmount > 0);
    const offerBadge = !offer ? null : hasPromo && hasDiscount ? 'All Offers' : hasPromo ? 'Promotion' : 'Discount';
    priced.push({
      productId: product.productId,
      variantOptionId: variant.id,
      packageQuantity: item.packageQuantity,
      productName: product.name,
      productSku: variant.sku || product.sku || null,
      productType: product.productType || null,
      productImage: product.images[0] || null,
      variantName: variant.variantName,
      attributes: variant.attributes == null ? undefined : (variant.attributes as Prisma.InputJsonValue),
      moq: variant.moq,
      unitPrice,
      basePrice,
      subtotal: money(unitPrice * item.packageQuantity),
      offerApplied: Boolean(offer),
      offerBadge,
      offerName: offer ? offer.notes || offer.description || 'Client offer' : null,
      offerId: offer?.id ?? null,
      discountAmount:
        applied && applied.discountAmount > 0 && offer?.discountType !== 'buy_x_get_y'
          ? money(applied.discountAmount)
          : null,
      discountPercentage:
        offer?.discountType === 'percentage' && applied?.discountPercentage ? applied.discountPercentage : null,
      promotionDetails: applied?.promotionDetails
        ? JSON.stringify({
            minQuantity: applied.promotionDetails.buyQuantity,
            freeQuantity: applied.promotionDetails.freeQuantity,
            applyMode: applied.promotionDetails.applyMode,
            moq: variant.moq != null && variant.moq > 0 ? variant.moq : null,
          })
        : null,
      lineDiscount: money(Math.max(0, basePrice - unitPrice) * item.packageQuantity),
    });
  }
  return { priced, currency: seller?.currency || null };
}

export async function createDistributorOrderHandler(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401, headers });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'invalid' }, { status: 400, headers });
  }

  const buyerId = clip(body.buyerId, 80);
  const contactPerson = clip(body.contactPerson, 200);
  const contactPhone = clip(body.contactPhone, 40);
  const customerEmail = clip(body.customerEmail, 200);
  const storeName = clip(body.storeName, 200);
  const deliveryAddress = clip(body.deliveryAddress, 500);
  const deliveryMethod = clip(body.deliveryMethod, 80);
  const paymentTerms = clip(body.paymentTerms, 80);
  const orderStatus = clip(body.orderStatus, 40) || 'Pending';
  const paymentStatus = clip(body.paymentStatus, 40) || 'Unpaid';
  const preferredDeliveryTime = clip(body.preferredDeliveryTime, 80);
  const assignedLogistics = clip(body.assignedLogistics, 120);
  const trackingNumber = clip(body.trackingNumber, 80);
  const deliveryNote = clip(body.deliveryNote, 1000);
  const pod = clip(body.pod, 500);

  if (!buyerId || !contactPerson || !contactPhone || !storeName || !deliveryAddress) {
    return NextResponse.json(
      { error: 'Client, contact, store, and delivery address are required', code: 'invalid' },
      { status: 400, headers },
    );
  }
  if (!DELIVERY_METHODS.has(deliveryMethod) || !PAYMENT_TERMS.has(paymentTerms)) {
    return NextResponse.json({ error: 'Invalid delivery method or payment terms', code: 'invalid' }, { status: 400, headers });
  }
  if (!ORDER_STATUSES.has(orderStatus) || !PAYMENT_STATUSES.has(paymentStatus)) {
    return NextResponse.json({ error: 'Invalid order or payment status', code: 'invalid' }, { status: 400, headers });
  }

  const orderDate = optionalDate(body.orderDate) ?? new Date();
  const preferredDeliveryDate = optionalDate(body.preferredDeliveryDate);
  const estimatedDeliveryDate = optionalDate(body.estimatedDeliveryDate);
  const estimatedDeliveryMinDays = optionalInt(body.estimatedDeliveryMinDays);
  const estimatedDeliveryMaxDays = optionalInt(body.estimatedDeliveryMaxDays);
  if (
    orderDate === 'invalid' ||
    preferredDeliveryDate === 'invalid' ||
    estimatedDeliveryDate === 'invalid' ||
    estimatedDeliveryMinDays === 'invalid' ||
    estimatedDeliveryMaxDays === 'invalid'
  ) {
    return NextResponse.json({ error: 'Invalid date or delivery window', code: 'invalid' }, { status: 400, headers });
  }
  if (
    estimatedDeliveryMinDays != null &&
    estimatedDeliveryMaxDays != null &&
    estimatedDeliveryMinDays > estimatedDeliveryMaxDays
  ) {
    return NextResponse.json({ error: 'Min days cannot be greater than max days', code: 'invalid_duration' }, { status: 400, headers });
  }

  const shippingFee = money(typeof body.shippingFee === 'number' ? body.shippingFee : Number(body.shippingFee || 0));
  if (!Number.isFinite(shippingFee) || shippingFee > 1_000_000_000) {
    return NextResponse.json({ error: 'Invalid shipping fee', code: 'invalid' }, { status: 400, headers });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length < 1 || rawItems.length > 40) {
    return NextResponse.json({ error: 'Add between 1 and 40 products', code: 'invalid' }, { status: 400, headers });
  }

  const items: ItemInput[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Invalid product line', code: 'invalid' }, { status: 400, headers });
    }
    const row = raw as Record<string, unknown>;
    const productId = clip(row.productId, 80);
    const variantOptionId = Number(row.variantOptionId);
    const packageQuantity = Number(row.packageQuantity);
    if (!productId || !Number.isInteger(variantOptionId) || variantOptionId <= 0) {
      return NextResponse.json({ error: 'Each line needs a product and variant', code: 'invalid' }, { status: 400, headers });
    }
    if (!Number.isInteger(packageQuantity) || packageQuantity < 1 || packageQuantity > 100000) {
      return NextResponse.json({ error: 'Quantity must be a whole number of at least 1', code: 'invalid' }, { status: 400, headers });
    }
    const key = `${productId}:${variantOptionId}`;
    if (seen.has(key)) {
      return NextResponse.json({ error: 'The same product variant is listed twice', code: 'duplicate_line' }, { status: 400, headers });
    }
    seen.add(key);
    items.push({ productId, variantOptionId, packageQuantity });
  }

  const buyer = await prisma.buyer.findFirst({
    where: { buyerId, userId },
    select: { buyerId: true, businessType: true, region: true, avatar: true },
  });
  if (!buyer) {
    return NextResponse.json({ error: 'Client not found', code: 'client_not_found' }, { status: 404, headers });
  }

  const pricedResult = await priceDistributorLines(userId, buyerId, items);
  if ('error' in pricedResult) {
    return NextResponse.json(
      { error: pricedResult.error, code: pricedResult.code },
      { status: pricedResult.status, headers },
    );
  }
  const priced = pricedResult.priced;

  const subtotal = money(priced.reduce((sum, line) => sum + line.subtotal, 0));
  const totalOrders = priced.reduce((sum, line) => sum + line.packageQuantity, 0);
  const totalAmount = money(subtotal + shippingFee);
  const now = new Date();

  let orderId = '';
  let activeBuyerId = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    orderId = generateSecureOrderId();
    activeBuyerId = `LKB-${Math.floor(10000000 + Math.random() * 90000000)}`;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.buyer.create({
          data: {
            buyerId: activeBuyerId,
            userId,
            owner: contactPerson,
            email: customerEmail || '',
            phone: contactPhone,
            storeName,
            businessType: buyer.businessType || 'Retailer',
            address: deliveryAddress,
            region: buyer.region,
            avatar: buyer.avatar,
            status: 'Active',
          },
        });
        await tx.order.create({
          data: {
            orderId,
            buyerId: activeBuyerId,
            userId,
            orderDate: orderDate as Date,
            orderStatus,
            paymentStatus,
            paidAt: paymentStatus === 'Paid' ? now : null,
            deliveryMethod,
            shippingMethod: deliveryMethod,
            shippingMethodLabel: deliveryMethod,
            subtotal,
            discounts: 0,
            shippingFee,
            totalAmount,
            paymentTerms,
            totalOrders,
            contactPerson,
            storeName,
            contactPhone,
            customerEmail: customerEmail || null,
            deliveryAddress,
            preferredDeliveryDate,
            preferredDeliveryTime: preferredDeliveryTime || null,
            estimatedDeliveryDate,
            estimatedDeliveryMinDays,
            estimatedDeliveryMaxDays,
            assignedLogistics: assignedLogistics || null,
            trackingNumber: trackingNumber || null,
            deliveryNote: deliveryNote || null,
            pod: pod || null,
            buyerIdSnapshot: activeBuyerId,
            contactPersonSnapshot: contactPerson,
            contactPhoneSnapshot: contactPhone,
            customerEmailSnapshot: customerEmail || null,
            deliveryAddressSnapshot: deliveryAddress,
            orderDateSnapshot: orderDate as Date,
            storeNameSnapshot: storeName,
            orderItemsRel: {
              create: priced.map((line) => lineCreateData(line, pricedResult.currency)),
            },
          },
        });
        for (const line of priced) {
          if (!line.offerId) continue;
          await trackOfferUsage(line.offerId, '', null, line.lineDiscount, tx);
        }
        if (!(STOCK_NO_DEDUCT_STATUSES as readonly string[]).includes(orderStatus)) {
          await deductStockForCreatedLines(tx, priced);
        }
      });
      break;
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        return NextResponse.json({ error: error.message, code: 'insufficient_stock' }, { status: 409, headers });
      }
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'P2002' && attempt < 2) continue;
      throw error;
    }
  }

  await syncOrderToBuyerProfile(activeBuyerId, userId).catch(() => undefined);
  await recordManualOrderClientMatch({
    distributorId: userId,
    existingClientId: buyerId,
    activeBuyerId,
    orderId,
    phone: contactPhone,
    storeName,
    ownerName: contactPerson,
    address: deliveryAddress,
    email: customerEmail,
  }).catch(() => undefined);
  await invalidateDashboardCache(userId).catch(() => undefined);

  return NextResponse.json({ orderId }, { status: 201, headers });
}

export async function updateDistributorOrderHandler(userId: number, body: Record<string, unknown>) {
  const headers = getOrderSecurityHeaders();
  const orderId = clip(body.orderId, 80);
  const buyerId = clip(body.buyerId, 80);
  const contactPerson = clip(body.contactPerson, 200);
  const contactPhone = clip(body.contactPhone, 40);
  const customerEmail = clip(body.customerEmail, 200);
  const storeName = clip(body.storeName, 200);
  const deliveryAddress = clip(body.deliveryAddress, 500);
  const deliveryMethod = clip(body.deliveryMethod, 80);
  const paymentTerms = clip(body.paymentTerms, 80);
  const preferredDeliveryTime = clip(body.preferredDeliveryTime, 80);
  const assignedLogistics = clip(body.assignedLogistics, 120);
  const trackingNumber = clip(body.trackingNumber, 80);
  const deliveryNote = clip(body.deliveryNote, 1000);
  const pod = clip(body.pod, 500);

  if (!orderId || !buyerId || !contactPerson || !contactPhone || !storeName || !deliveryAddress) {
    return NextResponse.json({ error: 'Client, contact, store, and delivery address are required', code: 'invalid' }, { status: 400, headers });
  }
  if (!deliveryMethod || !paymentTerms) {
    return NextResponse.json({ error: 'Invalid delivery method or payment terms', code: 'invalid' }, { status: 400, headers });
  }

  const orderDate = optionalDate(body.orderDate) ?? new Date();
  const preferredDeliveryDate = optionalDate(body.preferredDeliveryDate);
  const estimatedDeliveryDate = optionalDate(body.estimatedDeliveryDate);
  const estimatedDeliveryMinDays = optionalInt(body.estimatedDeliveryMinDays);
  const estimatedDeliveryMaxDays = optionalInt(body.estimatedDeliveryMaxDays);
  if (
    orderDate === 'invalid' ||
    preferredDeliveryDate === 'invalid' ||
    estimatedDeliveryDate === 'invalid' ||
    estimatedDeliveryMinDays === 'invalid' ||
    estimatedDeliveryMaxDays === 'invalid'
  ) {
    return NextResponse.json({ error: 'Invalid date or delivery window', code: 'invalid' }, { status: 400, headers });
  }
  if (
    estimatedDeliveryMinDays != null &&
    estimatedDeliveryMaxDays != null &&
    estimatedDeliveryMinDays > estimatedDeliveryMaxDays
  ) {
    return NextResponse.json({ error: 'Min days cannot be greater than max days', code: 'invalid_duration' }, { status: 400, headers });
  }

  const shippingFee = money(typeof body.shippingFee === 'number' ? body.shippingFee : Number(body.shippingFee || 0));
  if (!Number.isFinite(shippingFee) || shippingFee > 1_000_000_000) {
    return NextResponse.json({ error: 'Invalid shipping fee', code: 'invalid' }, { status: 400, headers });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length < 1 || rawItems.length > 40) {
    return NextResponse.json({ error: 'Add between 1 and 40 products', code: 'invalid' }, { status: 400, headers });
  }
  const items: ItemInput[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Invalid product line', code: 'invalid' }, { status: 400, headers });
    }
    const row = raw as Record<string, unknown>;
    const productId = clip(row.productId, 80);
    const variantOptionId = Number(row.variantOptionId);
    const packageQuantity = Number(row.packageQuantity);
    if (!productId || !Number.isInteger(variantOptionId) || variantOptionId <= 0) {
      return NextResponse.json({ error: 'Each line needs a product and variant', code: 'invalid' }, { status: 400, headers });
    }
    if (!Number.isInteger(packageQuantity) || packageQuantity < 1 || packageQuantity > 100000) {
      return NextResponse.json({ error: 'Quantity must be a whole number of at least 1', code: 'invalid' }, { status: 400, headers });
    }
    const key = `${productId}:${variantOptionId}`;
    if (seen.has(key)) {
      return NextResponse.json({ error: 'The same product variant is listed twice', code: 'duplicate_line' }, { status: 400, headers });
    }
    seen.add(key);
    items.push({ productId, variantOptionId, packageQuantity });
  }

  const existing = await prisma.order.findFirst({
    where: { orderId, userId, isDeleted: false },
    select: {
      buyerId: true,
      subtotal: true,
      discounts: true,
      orderItemsRel: { select: { productId: true, variantOptionId: true, packageQuantity: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Order not found', code: 'invalid' }, { status: 404, headers });
  }
  const buyer = await prisma.buyer.findFirst({ where: { buyerId, userId }, select: { buyerId: true } });
  if (!buyer) {
    return NextResponse.json({ error: 'Client not found', code: 'client_not_found' }, { status: 404, headers });
  }

  const sameLines =
    existing.buyerId === buyerId &&
    existing.orderItemsRel.length === items.length &&
    items.every((item) =>
      existing.orderItemsRel.some(
        (row) =>
          row.productId === item.productId &&
          row.variantOptionId === item.variantOptionId &&
          row.packageQuantity === item.packageQuantity,
      ),
    );

  const pricedResult = sameLines ? null : await priceDistributorLines(userId, buyerId, items);
  if (pricedResult && 'error' in pricedResult) {
    return NextResponse.json(
      { error: pricedResult.error, code: pricedResult.code },
      { status: pricedResult.status, headers },
    );
  }
  const priced = pricedResult && 'priced' in pricedResult ? pricedResult.priced : null;
  const subtotal = priced ? money(priced.reduce((sum, line) => sum + line.subtotal, 0)) : money(decimalToNumber(existing.subtotal));
  const discounts = priced ? 0 : money(decimalToNumber(existing.discounts));
  const totalOrders = priced
    ? priced.reduce((sum, line) => sum + line.packageQuantity, 0)
    : items.reduce((sum, item) => sum + item.packageQuantity, 0);

  try {
  await prisma.$transaction(async (tx) => {
    let stockAlreadyDeducted = false;
    if (priced) {
      const current = await tx.order.findFirst({
        where: { orderId, userId, isDeleted: false },
        select: {
          orderStatus: true,
          orderItemsRel: {
            select: {
              productId: true,
              variantOptionId: true,
              variantId: true,
              packageQuantity: true,
              piecesPerPackage: true,
              promotionDetailsSnapshot: true,
              moqSnapshot: true,
            },
          },
        },
      });
      if (!current) {
        throw new Error('Order not found');
      }
      stockAlreadyDeducted = !(STOCK_NO_DEDUCT_STATUSES as readonly string[]).includes(current.orderStatus);
      if (stockAlreadyDeducted) {
        const claimed = await tx.order.updateMany({
          where: {
            orderId,
            userId,
            isDeleted: false,
            orderStatus: { notIn: [...STOCK_NO_DEDUCT_STATUSES] },
          },
          data: { updatedAt: new Date() },
        });
        stockAlreadyDeducted = claimed.count === 1;
      }
      if (stockAlreadyDeducted) {
        await restoreStockForOrderItems(tx, current.orderItemsRel);
      }
      await reverseOfferUsage(orderId, tx);
      await tx.orderItem.deleteMany({ where: { orderId } });
      for (const line of priced) {
        await tx.orderItem.create({ data: { orderId, ...lineCreateData(line, pricedResult && 'priced' in pricedResult ? pricedResult.currency : null) } });
        if (line.offerId) await trackOfferUsage(line.offerId, '', null, line.lineDiscount, tx);
      }
      if (stockAlreadyDeducted) {
        await deductStockForCreatedLines(tx, priced);
      }
    }
    await tx.order.update({
      where: { orderId },
      data: {
        buyerId,
        orderDate: orderDate as Date,
        deliveryMethod,
        shippingMethod: deliveryMethod,
        shippingMethodLabel: deliveryMethod,
        subtotal,
        discounts,
        shippingFee,
        totalAmount: money(subtotal + shippingFee - discounts),
        paymentTerms,
        totalOrders,
        contactPerson,
        storeName,
        contactPhone,
        customerEmail: customerEmail || null,
        deliveryAddress,
        preferredDeliveryDate,
        preferredDeliveryTime: preferredDeliveryTime || null,
        estimatedDeliveryDate,
        estimatedDeliveryMinDays,
        estimatedDeliveryMaxDays,
        assignedLogistics: assignedLogistics || null,
        trackingNumber: trackingNumber || null,
        deliveryNote: deliveryNote || null,
        pod: pod || null,
        buyerIdSnapshot: buyerId,
        contactPersonSnapshot: contactPerson,
        contactPhoneSnapshot: contactPhone,
        customerEmailSnapshot: customerEmail || null,
        deliveryAddressSnapshot: deliveryAddress,
        orderDateSnapshot: orderDate as Date,
        storeNameSnapshot: storeName,
      },
    });
  });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message, code: 'insufficient_stock' }, { status: 409, headers });
    }
    throw error;
  }

  await syncOrderToBuyerProfile(buyerId, userId).catch(() => undefined);
  await invalidateDashboardCache(userId).catch(() => undefined);
  return NextResponse.json({ orderId }, { status: 200, headers });
}
