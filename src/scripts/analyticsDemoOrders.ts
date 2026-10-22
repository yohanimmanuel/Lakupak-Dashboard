import 'dotenv/config';
import { prisma } from '@/app/api/graphql/modules/common/prisma';
import { Prisma } from '@/lib/prisma-generated';
import {
  ANALYTICS_DEMO_BUYER_PREFIX,
  ANALYTICS_DEMO_ORDER_PREFIX,
} from '@/utils/analyticsDemoData';
import { syncOrderToBuyerProfile } from '@/utils/buyerSync';

const DEMO_ORDER_PREFIX = ANALYTICS_DEMO_ORDER_PREFIX;
const DEMO_BUYER_PREFIX = ANALYTICS_DEMO_BUYER_PREFIX;

const ORDER_STATUSES = ['Delivered', 'Delivered', 'Delivered', 'Shipped', 'Confirmed', 'Pending', 'Cancelled'] as const;

type ProductWithVariant = Prisma.ProductGetPayload<{
  include: { variantOptions: true };
}>;

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Keep seeded timestamps at or before the reference moment (default: now). */
function clampToPast(date: Date, latest: Date = new Date()): Date {
  return date.getTime() > latest.getTime() ? latest : date;
}

function lastDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

async function resolveUserId(): Promise<number> {
  const fromEnv = process.env.ANALYTICS_DEMO_USER_ID;
  if (fromEnv) {
    const id = parseInt(fromEnv, 10);
    if (Number.isFinite(id) && id > 0) return id;
  }

  const user = await prisma.user.findFirst({
    where: {
      products: {
        some: {
          variantOptions: {
            some: {
              isActive: true,
              purchasePrice: { gt: 0 },
              sellingPrice: { gt: 0 },
            },
          },
        },
      },
    },
    orderBy: { id: 'asc' },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    throw new Error(
      'No distributor with priced products found. Set ANALYTICS_DEMO_USER_ID or add products with variant pricing.',
    );
  }

  console.log(`Using userId=${user.id} (${user.email ?? user.name ?? 'unknown'})`);
  return user.id;
}

async function loadProducts(userId: number): Promise<ProductWithVariant[]> {
  const products = await prisma.product.findMany({
    where: {
      userId,
      variantOptions: {
        some: {
          isActive: true,
          purchasePrice: { gt: 0 },
          sellingPrice: { gt: 0 },
        },
      },
    },
    include: {
      variantOptions: {
        where: { isActive: true, purchasePrice: { gt: 0 }, sellingPrice: { gt: 0 } },
        orderBy: { id: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 8,
  });

  if (products.length === 0) {
    throw new Error(`User ${userId} has no products with purchase/selling prices on variants.`);
  }

  return products.filter((p) => p.variantOptions.length > 0);
}

async function createDemoBuyer(
  userId: number,
  seq: number,
  createdAt: Date,
  options?: { status?: string; updatedAt?: Date },
) {
  const buyerId = `${DEMO_BUYER_PREFIX}${String(seq).padStart(3, '0')}`;
  const status = options?.status ?? 'Active';

  const buyer = await prisma.buyer.upsert({
    where: { buyerId },
    update: {
      userId,
      owner: `Demo Buyer ${seq}`,
      email: `analytics-demo-buyer-${seq}@laku.local`,
      phone: `+6281200000${String(seq).padStart(3, '0')}`,
      storeName: `Demo Store ${seq}`,
      businessType: seq % 2 === 0 ? 'Wholesale' : 'Retail',
      address: `Demo Address ${seq}, Jakarta`,
      status,
      createdAt,
    },
    create: {
      buyerId,
      owner: `Demo Buyer ${seq}`,
      email: `analytics-demo-buyer-${seq}@laku.local`,
      phone: `+6281200000${String(seq).padStart(3, '0')}`,
      storeName: `Demo Store ${seq}`,
      businessType: seq % 2 === 0 ? 'Wholesale' : 'Retail',
      address: `Demo Address ${seq}, Jakarta`,
      status,
      userId,
      createdAt,
    },
  });

  if (options?.updatedAt) {
    await prisma.buyer.update({
      where: { buyerId },
      data: { updatedAt: options.updatedAt, status },
    });
  }

  return buyer;
}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function pickStatus(index: number): string {
  return ORDER_STATUSES[index % ORDER_STATUSES.length];
}

/**
 * The Buyers table reads totals from the buyer.orderDetails snapshot, which is
 * normally rebuilt only when a buyer details page is opened. Sync demo buyers
 * from their live orders so the table matches the injected orders right away.
 */
async function syncDemoBuyerProfiles(userId: number): Promise<number> {
  const demoBuyers = await prisma.buyer.findMany({
    where: { userId, buyerId: { startsWith: DEMO_BUYER_PREFIX } },
    select: { buyerId: true },
  });

  let synced = 0;
  for (const buyer of demoBuyers) {
    if (await syncOrderToBuyerProfile(buyer.buyerId, userId)) {
      synced += 1;
    }
  }
  return synced;
}

async function seedDemoOrders() {
  const existing = await prisma.order.count({
    where: { orderId: { startsWith: DEMO_ORDER_PREFIX } },
  });
  if (existing > 0) {
    console.log(`Found ${existing} existing demo orders. Run "cleanup" first or they will be skipped.`);
    const userId = await resolveUserId();
    const synced = await syncDemoBuyerProfiles(userId);
    console.log(`Aligned ${synced} demo buyer profiles with their live demo orders.`);
    return;
  }

  const userId = await resolveUserId();
  const products = await loadProducts(userId);
  const buyers: Awaited<ReturnType<typeof createDemoBuyer>>[] = [];

  const now = new Date();
  let orderSeq = 0;
  let buyerSeq = 0;
  let created = 0;

  // Last 12 completed calendar months (exclude the current partial month)
  for (let monthOffset = 12; monthOffset >= 1; monthOffset -= 1) {
    const baseDate = new Date(now);
    baseDate.setDate(1);
    baseDate.setHours(12, 0, 0, 0);
    baseDate.setMonth(baseDate.getMonth() - monthOffset);

    const monthIndex = 12 - monthOffset;
    const growthFactor = 0.55 + monthIndex * 0.04; // ramp volume over time
    const ordersThisMonth = 2 + (monthIndex % 3); // 2–4 orders per month
    const buyersThisMonth = 1 + (monthIndex % 3); // 1–3 new buyers per month

    for (let b = 0; b < buyersThisMonth; b += 1) {
      buyerSeq += 1;
      const createdAt = new Date(baseDate);
      createdAt.setDate(Math.min(lastDayOfMonth(baseDate), 2 + b * 8 + (buyerSeq % 3)));
      createdAt.setHours(10, 0, 0, 0);

      const shouldChurn = buyerSeq % 7 === 0;
      const churnedAt = shouldChurn
        ? clampToPast(new Date(createdAt.getTime() + 45 * 24 * 60 * 60 * 1000), now)
        : undefined;

      const buyer = await createDemoBuyer(userId, buyerSeq, createdAt, {
        status: shouldChurn && churnedAt ? 'Inactive' : 'Active',
        updatedAt: shouldChurn ? churnedAt : undefined,
      });
      buyers.push(buyer);
    }

    for (let n = 0; n < ordersThisMonth; n += 1) {
      orderSeq += 1;
      const orderDate = new Date(baseDate);
      orderDate.setDate(Math.min(lastDayOfMonth(baseDate), 3 + n * 7 + (orderSeq % 4)));
      orderDate.setHours(12, 0, 0, 0);

      const eligibleBuyers = buyers.filter((b) => b.createdAt <= orderDate);
      const buyerPool = eligibleBuyers.length > 0 ? eligibleBuyers : buyers;
      const buyer = buyerPool[(orderSeq + monthIndex) % buyerPool.length];
      const product = products[(orderSeq + n) % products.length];
      const variant = product.variantOptions[0];

      const sellingPrice = Number(variant.sellingPrice);
      const piecesPerPackage = 1;
      const packageQuantity = Math.max(5, Math.round(8 + growthFactor * 12 + (orderSeq % 6) * 3));
      const pricePerPackage = sellingPrice * piecesPerPackage;
      const itemSubtotal = packageQuantity * pricePerPackage;
      const shippingFee = 15000 + (orderSeq % 5) * 5000;
      const discounts = orderSeq % 7 === 0 ? Math.round(itemSubtotal * 0.05) : 0;
      const subtotal = itemSubtotal;
      const totalAmount = Math.max(0, subtotal + shippingFee - discounts);
      const totalPieces = packageQuantity * piecesPerPackage;

      const status = pickStatus(orderSeq);
      const isPaid = status !== 'Cancelled' && status !== 'Pending';
      const paymentStatus = isPaid ? 'Paid' : status === 'Cancelled' ? 'Cancelled' : 'Unpaid';
      const paidAt = isPaid
        ? clampToPast(new Date(orderDate.getTime() + 24 * 60 * 60 * 1000), now)
        : null;

      const orderId = `${DEMO_ORDER_PREFIX}${monthKey(orderDate).replace('-', '')}-${String(orderSeq).padStart(3, '0')}`;

      const deliveredAt =
        status === 'Delivered'
          ? clampToPast(new Date(orderDate.getTime() + 3 * 24 * 60 * 60 * 1000), now)
          : null;

      await prisma.order.create({
        data: {
          orderId,
          buyerId: buyer.buyerId,
          buyerIdSnapshot: buyer.buyerId,
          userId,
          orderDate,
          orderDateSnapshot: orderDate,
          orderStatus: status,
          paymentStatus,
          deliveryMethod: 'Seller/Distributor Delivery',
          deliveryOption: 'Standard',
          subtotal: decimal(subtotal),
          discounts: decimal(discounts),
          shippingFee: decimal(shippingFee),
          totalAmount: decimal(totalAmount),
          paymentTerms: 'Immediate',
          totalOrders: totalPieces,
          contactPerson: buyer.owner,
          contactPersonSnapshot: buyer.owner,
          storeName: buyer.storeName,
          storeNameSnapshot: buyer.storeName,
          contactPhone: buyer.phone,
          contactPhoneSnapshot: buyer.phone,
          customerEmail: buyer.email,
          customerEmailSnapshot: buyer.email,
          deliveryAddress: buyer.address,
          deliveryAddressSnapshot: buyer.address,
          deliveryConfirmation: status === 'Delivered' ? 'confirmed' : 'pending',
          paidAt,
          deliveredAt,
          orderItemsRel: {
            create: {
              productId: product.productId,
              variantOptionId: variant.id,
              subtotal: decimal(itemSubtotal),
              packageQuantity,
              piecesPerPackage,
              pricePerPackage: decimal(pricePerPackage),
              unitPriceSnapshot: decimal(sellingPrice),
              productNameSnapshot: product.name,
              productSkuSnapshot: product.sku,
              productTypeSnapshot: product.productType,
              productImageSnapshot: product.images[0] ?? null,
              variantNameSnapshot: variant.variantName,
              currencySnapshot: 'IDR',
            },
          },
        },
      });

      created += 1;
    }

    console.log(`  ${monthLabel(baseDate)}: ${ordersThisMonth} orders, ${buyersThisMonth} new buyers`);
  }

  const synced = await syncDemoBuyerProfiles(userId);
  console.log(`Aligned ${synced} demo buyer profiles with their live demo orders.`);
  console.log(`\nCreated ${created} demo orders (${DEMO_ORDER_PREFIX}*) and ${buyers.length} demo buyers (${DEMO_BUYER_PREFIX}*).`);
  console.log('Open Dashboard → Analytics → Sales for customer acquisition, or Financial/Operational with "Per Year".');
  console.log(`Cleanup: npx tsx src/scripts/analyticsDemoOrders.ts cleanup`);
}

async function cleanupDemoOrders() {
  const demoOrders = await prisma.order.findMany({
    where: { orderId: { startsWith: DEMO_ORDER_PREFIX } },
    select: { orderId: true },
  });

  if (demoOrders.length === 0) {
    console.log('No demo orders to delete.');
  } else {
    const deleted = await prisma.order.deleteMany({
      where: { orderId: { startsWith: DEMO_ORDER_PREFIX } },
    });
    console.log(`Deleted ${deleted.count} demo orders.`);
  }

  const deletedBuyers = await prisma.buyer.deleteMany({
    where: { buyerId: { startsWith: DEMO_BUYER_PREFIX } },
  });
  console.log(`Deleted ${deletedBuyers.count} demo buyers.`);
}

async function main() {
  const command = process.argv[2]?.toLowerCase();

  if (command === 'seed') {
    await seedDemoOrders();
    return;
  }

  if (command === 'cleanup') {
    await cleanupDemoOrders();
    return;
  }

  console.log('Usage:');
  console.log('  npx tsx src/scripts/analyticsDemoOrders.ts seed');
  console.log('  npx tsx src/scripts/analyticsDemoOrders.ts cleanup');
  process.exit(1);
}

async function shutdown(code: number): Promise<never> {
  await Promise.race([
    prisma.$disconnect().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  process.exit(code);
}

main()
  .then(() => shutdown(0))
  .catch(async (error) => {
    console.error(error);
    await shutdown(1);
  });
