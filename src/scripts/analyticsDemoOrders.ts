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

/** Match buyer form types so the heatmap gets a column for every segment. */
const DEMO_BUSINESS_TYPES = [
  'Warung',
  'Kiosk',
  'Minimarket',
  'Wholesaler',
  'Restaurant',
  'Hotel',
  'Canteen',
  'Other',
] as const;

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
    take: 20,
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

  const businessType = DEMO_BUSINESS_TYPES[(seq - 1) % DEMO_BUSINESS_TYPES.length];

  const buyer = await prisma.buyer.upsert({
    where: { buyerId },
    update: {
      userId,
      owner: `Demo Buyer ${seq}`,
      email: `analytics-demo-buyer-${seq}@laku.local`,
      phone: `+6281200000${String(seq).padStart(3, '0')}`,
      storeName: `Demo Store ${seq}`,
      businessType,
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
      businessType,
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

type DemoBuyer = Awaited<ReturnType<typeof createDemoBuyer>>;

async function createDemoOrder(args: {
  userId: number;
  orderId: string;
  buyer: DemoBuyer;
  product: ProductWithVariant;
  orderDate: Date;
  status: string;
  packageQuantity: number;
  shippingFee: number;
  discounts?: number;
  now: Date;
}) {
  const variant = args.product.variantOptions[0];
  const sellingPrice = Number(variant.sellingPrice);
  const packageQuantity = args.packageQuantity;
  const pricePerPackage = sellingPrice;
  const itemSubtotal = packageQuantity * pricePerPackage;
  const discounts = args.discounts ?? 0;
  const totalAmount = Math.max(0, itemSubtotal + args.shippingFee - discounts);
  const isPaid = args.status !== 'Cancelled' && args.status !== 'Pending';

  await prisma.order.create({
    data: {
      orderId: args.orderId,
      buyerId: args.buyer.buyerId,
      buyerIdSnapshot: args.buyer.buyerId,
      userId: args.userId,
      orderDate: args.orderDate,
      orderDateSnapshot: args.orderDate,
      orderStatus: args.status,
      paymentStatus: isPaid ? 'Paid' : args.status === 'Cancelled' ? 'Cancelled' : 'Unpaid',
      deliveryMethod: 'Seller/Distributor Delivery',
      deliveryOption: 'Standard',
      subtotal: decimal(itemSubtotal),
      discounts: decimal(discounts),
      shippingFee: decimal(args.shippingFee),
      totalAmount: decimal(totalAmount),
      paymentTerms: 'Immediate',
      totalOrders: packageQuantity,
      contactPerson: args.buyer.owner,
      contactPersonSnapshot: args.buyer.owner,
      storeName: args.buyer.storeName,
      storeNameSnapshot: args.buyer.storeName,
      contactPhone: args.buyer.phone,
      contactPhoneSnapshot: args.buyer.phone,
      customerEmail: args.buyer.email,
      customerEmailSnapshot: args.buyer.email,
      deliveryAddress: args.buyer.address,
      deliveryAddressSnapshot: args.buyer.address,
      deliveryConfirmation: args.status === 'Delivered' ? 'confirmed' : 'pending',
      paidAt: isPaid ? clampToPast(new Date(args.orderDate.getTime() + 20 * 60 * 60 * 1000), args.now) : null,
      deliveredAt:
        args.status === 'Delivered'
          ? clampToPast(new Date(args.orderDate.getTime() + 2 * 24 * 60 * 60 * 1000), args.now)
          : null,
      orderItemsRel: {
        create: {
          productId: args.product.productId,
          variantOptionId: variant.id,
          subtotal: decimal(itemSubtotal),
          packageQuantity,
          piecesPerPackage: 1,
          pricePerPackage: decimal(pricePerPackage),
          unitPriceSnapshot: decimal(sellingPrice),
          productNameSnapshot: args.product.name,
          productSkuSnapshot: args.product.sku,
          productTypeSnapshot: args.product.productType,
          productImageSnapshot: args.product.images[0] ?? null,
          variantNameSnapshot: variant.variantName,
          currencySnapshot: 'IDR',
        },
      },
    },
  });
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
  const buyers: DemoBuyer[] = [];
  const TARGET_ORDERS = 500;
  /** Fixed share reserved for mixed recent fill orders after historical + green passes. */
  const FILL_RESERVE = Math.max(40, Math.floor(TARGET_ORDERS * 0.1));
  const earlierCap = TARGET_ORDERS - FILL_RESERVE;

  const now = new Date();
  let orderSeq = 0;
  let buyerSeq = 0;
  let created = 0;

  // Last 12 completed calendar months (exclude the current partial month)
  monthLoop: for (let monthOffset = 12; monthOffset >= 1; monthOffset -= 1) {
    if (created >= earlierCap) break;

    const baseDate = new Date(now);
    baseDate.setDate(1);
    baseDate.setHours(12, 0, 0, 0);
    baseDate.setMonth(baseDate.getMonth() - monthOffset);

    const monthIndex = 12 - monthOffset;
    const growthFactor = 0.55 + monthIndex * 0.04;
    const ordersThisMonth = 18 + (monthIndex % 5); // 18–22 / month ≈ 240 historical
    const buyersThisMonth = 10 + (monthIndex % 3); // 10–12 / month ≈ 128 buyers across all segments

    for (let b = 0; b < buyersThisMonth; b += 1) {
      buyerSeq += 1;
      const createdAt = new Date(baseDate);
      createdAt.setDate(Math.min(lastDayOfMonth(baseDate), 1 + b * 3 + (buyerSeq % 3)));
      createdAt.setHours(10, 0, 0, 0);

      const shouldChurn = buyerSeq % 11 === 0;
      const isProspect = !shouldChurn && buyerSeq % 6 === 0;
      const churnedAt = shouldChurn
        ? clampToPast(new Date(createdAt.getTime() + 45 * 24 * 60 * 60 * 1000), now)
        : undefined;

      const buyer = await createDemoBuyer(userId, buyerSeq, createdAt, {
        status: shouldChurn && churnedAt ? 'Inactive' : isProspect ? 'Prospect' : 'Active',
        updatedAt: shouldChurn ? churnedAt : undefined,
      });
      buyers.push(buyer);
    }

    let monthOrders = 0;
    for (let n = 0; n < ordersThisMonth; n += 1) {
      if (created >= earlierCap) break monthLoop;
      orderSeq += 1;
      const orderDate = new Date(baseDate);
      const daysInMonth = lastDayOfMonth(baseDate);
      // Spread orders evenly across the month (avoids clamping many late indexes onto the last day).
      const dayOfMonth =
        ordersThisMonth <= 1
          ? Math.min(15, daysInMonth)
          : 1 + Math.round((n * (daysInMonth - 1)) / (ordersThisMonth - 1));
      orderDate.setDate(dayOfMonth);
      orderDate.setHours(12, 0, 0, 0);

      const eligibleBuyers = buyers.filter((b) => b.createdAt <= orderDate);
      const buyerPool = eligibleBuyers.length > 0 ? eligibleBuyers : buyers;
      const buyer = buyerPool[(orderSeq + monthIndex) % buyerPool.length];
      const product = products[(orderSeq + n) % products.length];

      await createDemoOrder({
        userId,
        orderId: `${DEMO_ORDER_PREFIX}${monthKey(orderDate).replace('-', '')}-${String(orderSeq).padStart(3, '0')}`,
        buyer,
        product,
        orderDate,
        status: pickStatus(orderSeq),
        packageQuantity: Math.max(5, Math.round(8 + growthFactor * 12 + (orderSeq % 6) * 3)),
        shippingFee: 15000 + (orderSeq % 5) * 5000,
        discounts: orderSeq % 7 === 0 ? Math.round(Number(product.variantOptions[0].sellingPrice) * 0.05 * 10) : 0,
        now,
      });
      created += 1;
      monthOrders += 1;
    }

    console.log(`  ${monthLabel(baseDate)}: ${monthOrders} orders, ${buyersThisMonth} new buyers`);
  }

  const eligibleBuyers = buyers.filter((buyer) => {
    const status = String(buyer.status).toLowerCase();
    return status === 'active' || status === 'prospect';
  });
  const recentPool = eligibleBuyers.length > 0 ? eligibleBuyers : buyers;

  // Push a few products into "high" (green) penetration across every segment in the last 90 days.
  const heroProducts = products.slice(0, Math.min(3, products.length));
  let greenCreated = 0;
  greenLoop: for (const product of heroProducts) {
    for (let i = 0; i < recentPool.length; i += 1) {
      if (created >= earlierCap) break greenLoop;
      // ~80% of eligible buyers buy each hero product → green cells (≥67%).
      if (i % 5 === 0) continue;
      orderSeq += 1;
      const daysAgo = 3 + ((i + greenCreated) % 60);
      const orderDate = clampToPast(new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000), now);
      orderDate.setHours(10 + (i % 6), 20, 0, 0);
      await createDemoOrder({
        userId,
        orderId: `${DEMO_ORDER_PREFIX}GREEN-${String(orderSeq).padStart(3, '0')}`,
        buyer: recentPool[i],
        product,
        orderDate,
        status: 'Delivered',
        packageQuantity: 8 + (i % 5),
        shippingFee: 10000 + (i % 3) * 2500,
        now,
      });
      created += 1;
      greenCreated += 1;
    }
  }
  console.log(`  Heatmap green boost: ${greenCreated} orders across ${heroProducts.length} products`);

  // Always use the reserved share (and any unused earlier budget) without exceeding TARGET_ORDERS.
  const fillQuota = Math.max(0, TARGET_ORDERS - created);
  let fillCreated = 0;
  while (fillCreated < fillQuota) {
    orderSeq += 1;
    const n = fillCreated;
    const daysAgo = 2 + (n % 85);
    const orderDate = clampToPast(new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000), now);
    orderDate.setHours(11 + (n % 5), 10, 0, 0);
    await createDemoOrder({
      userId,
      orderId: `${DEMO_ORDER_PREFIX}FILL-${String(orderSeq).padStart(3, '0')}`,
      buyer: recentPool[n % recentPool.length],
      product: products[n % products.length],
      orderDate,
      status: pickStatus(n),
      packageQuantity: 6 + (n % 8) * 2,
      shippingFee: 12000 + (n % 4) * 3000,
      now,
    });
    created += 1;
    fillCreated += 1;
  }
  console.log(`  Volume fill: ${fillCreated} orders (reserve ${FILL_RESERVE}, total target ${TARGET_ORDERS})`);

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
