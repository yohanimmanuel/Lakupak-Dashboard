import 'dotenv/config';
import { prisma } from '@/app/api/graphql/modules/common/prisma';
import { Prisma } from '@/lib/prisma-generated';
import { syncOrderToBuyerProfile } from '@/utils/buyerSync';

/** Realistic IDs for dashboard screenshots; safe to delete via cleanup. */
const DEMO_ORDER_PREFIX = 'LKO-9901';
const DEMO_BUYER_PREFIX = 'LKB-9901';
/** Legacy analytics seed prefix (still removed on cleanup). */
const LEGACY_ORDER_PREFIX = 'ANALYTICS-DEMO-';
const LEGACY_BUYER_PREFIX = 'ANALYTICS-DEMO-BUYER-';

const ORDER_STATUSES = [
  'Delivered',
  'Delivered',
  'Shipped',
  'Shipped',
  'Packed',
  'Confirmed',
  'Pending',
  'Delivered',
  'Cancelled',
] as const;

const DEMO_BUYER_PROFILES = [
  {
    owner: 'Budi Santoso',
    storeName: 'Toko Berkah Jaya',
    businessType: 'Retail',
    address: 'Jl. Melati No. 12, Kelapa Gading, Jakarta Utara',
    email: 'berkah.jaya@toko.id',
    phone: '+6281234567890',
  },
  {
    owner: 'Siti Rahayu',
    storeName: 'Warung Sejahtera',
    businessType: 'Retail',
    address: 'Jl. Mawar No. 8, Tebet, Jakarta Selatan',
    email: 'sejahtera.warung@toko.id',
    phone: '+6281234567891',
  },
  {
    owner: 'Andi Wijaya',
    storeName: 'CV Mitra Abadi',
    businessType: 'Wholesale',
    address: 'Jl. Industri Raya No. 45, Bekasi',
    email: 'mitra.abadi@cv.id',
    phone: '+6281234567892',
  },
  {
    owner: 'Dewi Lestari',
    storeName: 'Toko Maju Bersama',
    businessType: 'Retail',
    address: 'Jl. Sudirman No. 102, Jakarta Pusat',
    email: 'maju.bersama@toko.id',
    phone: '+6281234567893',
  },
  {
    owner: 'Rudi Hartono',
    storeName: 'Grosir Makmur',
    businessType: 'Wholesale',
    address: 'Jl. Pasar Baru No. 3, Tangerang',
    email: 'grosir.makmur@toko.id',
    phone: '+6281234567894',
  },
  {
    owner: 'Fitri Handayani',
    storeName: 'Kios Sumber Rejeki',
    businessType: 'Retail',
    address: 'Jl. Anggrek No. 27, Depok',
    email: 'sumber.rejeki@kios.id',
    phone: '+6281234567895',
  },
  {
    owner: 'Agus Prasetyo',
    storeName: 'Toko Jaya Mandiri',
    businessType: 'Retail',
    address: 'Jl. Kenanga No. 15, Bogor',
    email: 'jaya.mandiri@toko.id',
    phone: '+6281234567896',
  },
  {
    owner: 'Maya Sari',
    storeName: 'Warung Bu Maya',
    businessType: 'Retail',
    address: 'Jl. Flamboyan No. 9, South Jakarta',
    email: 'bu.maya@warung.id',
    phone: '+6281234567897',
  },
  {
    owner: 'Hendra Gunawan',
    storeName: 'Distribusi Nusantara',
    businessType: 'Wholesale',
    address: 'Jl. Gatot Subroto No. 88, Jakarta Selatan',
    email: 'nusantara.dist@cv.id',
    phone: '+6281234567898',
  },
  {
    owner: 'Rina Wulandari',
    storeName: 'Toko Ceria',
    businessType: 'Retail',
    address: 'Jl. Dahlia No. 4, Rawamangun, Jakarta Timur',
    email: 'toko.ceria@toko.id',
    phone: '+6281234567899',
  },
  {
    owner: 'Yusuf Ahmad',
    storeName: 'Grosir Al-Ikhlas',
    businessType: 'Wholesale',
    address: 'Jl. Cempaka No. 21, Cibinong',
    email: 'al.ikhlas@grosir.id',
    phone: '+6281234567800',
  },
  {
    owner: 'Lestari Putri',
    storeName: 'Kios Harapan Baru',
    businessType: 'Retail',
    address: 'Jl. Bougenville No. 6, Bekasi Timur',
    email: 'harapan.baru@kios.id',
    phone: '+6281234567801',
  },
  {
    owner: 'Fajar Nugroho',
    storeName: 'Toko Sentosa',
    businessType: 'Retail',
    address: 'Jl. Kemang Raya No. 33, Jakarta Selatan',
    email: 'sentosa.toko@toko.id',
    phone: '+6281234567802',
  },
  {
    owner: 'Indah Permata',
    storeName: 'Warung Indah',
    businessType: 'Retail',
    address: 'Jl. Pahlawan No. 18, Tangerang Selatan',
    email: 'warung.indah@toko.id',
    phone: '+6281234567803',
  },
  {
    owner: 'Bambang Sutrisno',
    storeName: 'CV Sumber Makmur',
    businessType: 'Wholesale',
    address: 'Jl. Raya Bogor Km 24, Cimanggis',
    email: 'sumber.makmur@cv.id',
    phone: '+6281234567804',
  },
  {
    owner: 'Kartika Dewi',
    storeName: 'Toko Pelangi',
    businessType: 'Retail',
    address: 'Jl. Merdeka No. 7, Bandung',
    email: 'toko.pelangi@toko.id',
    phone: '+6281234567805',
  },
  {
    owner: 'Doni Kurniawan',
    storeName: 'Grosir Prima',
    businessType: 'Wholesale',
    address: 'Jl. Ahmad Yani No. 55, Surabaya',
    email: 'grosir.prima@toko.id',
    phone: '+6281234567806',
  },
  {
    owner: 'Wulan Sari',
    storeName: 'Kios Wulan',
    businessType: 'Retail',
    address: 'Jl. Diponegoro No. 14, Semarang',
    email: 'kios.wulan@toko.id',
    phone: '+6281234567807',
  },
] as const;

type ProductWithVariant = Prisma.ProductGetPayload<{
  include: { variantOptions: true };
}>;

type DemoBuyer = Awaited<ReturnType<typeof createDemoBuyer>>;

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function clampToPast(date: Date, latest: Date = new Date()): Date {
  return date.getTime() > latest.getTime() ? latest : date;
}

function lastDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function demoBuyerId(seq: number): string {
  return `${DEMO_BUYER_PREFIX}${String(seq).padStart(4, '0')}`;
}

function demoOrderId(seq: number): string {
  return `${DEMO_ORDER_PREFIX}${String(seq).padStart(5, '0')}`;
}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function pickStatus(index: number): (typeof ORDER_STATUSES)[number] {
  return ORDER_STATUSES[index % ORDER_STATUSES.length];
}

function paymentForStatus(status: string): string {
  if (status === 'Cancelled') return 'Cancelled';
  if (status === 'Pending') return 'Unpaid';
  return 'Paid';
}

function trackingForStatus(status: string, seq: number): string | null {
  if (status === 'Shipped' || status === 'Delivered' || status === 'Packed') {
    return `JNE${String(88200000 + seq).slice(-10)}`;
  }
  return null;
}

async function resolveUserId(): Promise<number> {
  const fromEnv = process.env.ANALYTICS_DEMO_USER_ID?.trim();
  const idFromEnv = fromEnv ? Number(fromEnv) : null;

  const user = await prisma.user.findFirst({
    where: {
      ...(idFromEnv && Number.isInteger(idFromEnv) && idFromEnv > 0 ? { id: idFromEnv } : {}),
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
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      company: { select: { name: true } },
    },
  });

  if (!user) {
    throw new Error(
      idFromEnv
        ? `User ${idFromEnv} not found or has no priced products. Add products or set ANALYTICS_DEMO_USER_ID.`
        : 'No distributor with priced products found. Set ANALYTICS_DEMO_USER_ID or publish products first.',
    );
  }

  const label =
    user.company?.name?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.email ||
    '';
  console.log(`Using distributor userId=${user.id}${label ? ` (${label})` : ''}`);
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
    take: 12,
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
  const profile = DEMO_BUYER_PROFILES[(seq - 1) % DEMO_BUYER_PROFILES.length];
  const buyerId = demoBuyerId(seq);
  const status = options?.status ?? 'Active';

  const buyer = await prisma.buyer.upsert({
    where: { buyerId },
    update: {
      userId,
      owner: profile.owner,
      email: profile.email,
      phone: profile.phone,
      storeName: profile.storeName,
      businessType: profile.businessType,
      address: profile.address,
      status,
      orderDetails: '[]',
      createdAt,
    },
    create: {
      buyerId,
      owner: profile.owner,
      email: profile.email,
      phone: profile.phone,
      storeName: profile.storeName,
      businessType: profile.businessType,
      address: profile.address,
      status,
      orderDetails: '[]',
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

async function createDemoOrder(opts: {
  userId: number;
  orderSeq: number;
  orderDate: Date;
  buyer: DemoBuyer;
  products: ProductWithVariant[];
  growthFactor?: number;
}) {
  const { userId, orderSeq, orderDate, buyer, products, growthFactor = 1 } = opts;
  const product = products[(orderSeq - 1) % products.length];
  const variant = product.variantOptions[0];

  const sellingPrice = Number(variant.sellingPrice);
  const piecesPerPackage = 1;
  const packageQuantity = Math.max(4, Math.round(6 + growthFactor * 10 + (orderSeq % 5) * 2));
  const pricePerPackage = sellingPrice * piecesPerPackage;
  const itemSubtotal = packageQuantity * pricePerPackage;
  const shippingFee = 12000 + (orderSeq % 6) * 4000;
  const discounts = orderSeq % 9 === 0 ? Math.round(itemSubtotal * 0.05) : 0;
  const totalAmount = Math.max(0, itemSubtotal + shippingFee - discounts);
  const totalPieces = packageQuantity * piecesPerPackage;

  const status = pickStatus(orderSeq);
  const paymentStatus = paymentForStatus(status);
  const isPaid = paymentStatus === 'Paid';
  const paidAt = isPaid ? clampToPast(new Date(orderDate.getTime() + 12 * 60 * 60 * 1000)) : null;
  const deliveredAt =
    status === 'Delivered'
      ? clampToPast(new Date(orderDate.getTime() + 2 * 24 * 60 * 60 * 1000))
      : null;

  const orderId = demoOrderId(orderSeq);
  const deliveryMethod =
    orderSeq % 11 === 0 ? 'Self Pickup' : 'Seller/Distributor Delivery';

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
      deliveryMethod,
      deliveryOption: 'Standard',
      subtotal: decimal(itemSubtotal),
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
      trackingNumber: trackingForStatus(status, orderSeq),
      paidAt,
      deliveredAt,
      createdAt: orderDate,
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
}

async function seedDemoOrders(force: boolean) {
  const existing = await prisma.order.count({
    where: { orderId: { startsWith: DEMO_ORDER_PREFIX } },
  });
  if (existing > 0 && !force) {
    console.log(`Found ${existing} existing demo orders. Run "cleanup" first or use "seed --force".`);
    return;
  }
  if (existing > 0 && force) {
    await cleanupDemoOrders();
  }

  const userId = await resolveUserId();
  const products = await loadProducts(userId);
  const buyers: DemoBuyer[] = [];
  const now = new Date();

  let orderSeq = 0;
  let buyerSeq = 0;

  // --- Recent orders (current month + last 14 days) for Home / Orders screenshots ---
  const recentOrderCount = 14;
  for (let i = 0; i < recentOrderCount; i += 1) {
    const daysAgo = i < 5 ? i : 2 + (i % 12);
    const orderDate = clampToPast(new Date(now));
    orderDate.setDate(orderDate.getDate() - daysAgo);
    orderDate.setHours(9 + (i % 8), 15 + (i % 3) * 10, 0, 0);

    if (i % 3 === 0 || buyers.length === 0) {
      buyerSeq += 1;
      const createdAt = new Date(orderDate);
      createdAt.setDate(createdAt.getDate() - 14 - (buyerSeq % 5));
      const buyer = await createDemoBuyer(userId, buyerSeq, createdAt, {
        status: buyerSeq % 9 === 0 ? 'Inactive' : 'Active',
      });
      buyers.push(buyer);
    }

    orderSeq += 1;
    const buyer = buyers[(orderSeq - 1) % buyers.length];
    await createDemoOrder({
      userId,
      orderSeq,
      orderDate,
      buyer,
      products,
      growthFactor: 1.2,
    });
  }
  console.log(`  Recent (${recentOrderCount} orders in last ~14 days)`);

  // --- Historical 6 months for analytics charts ---
  for (let monthOffset = 6; monthOffset >= 1; monthOffset -= 1) {
    const baseDate = new Date(now);
    baseDate.setDate(1);
    baseDate.setHours(12, 0, 0, 0);
    baseDate.setMonth(baseDate.getMonth() - monthOffset);

    const monthIndex = 6 - monthOffset;
    const growthFactor = 0.7 + monthIndex * 0.08;
    const ordersThisMonth = 3 + (monthIndex % 3);
    const buyersThisMonth = monthIndex % 2 === 0 ? 2 : 1;

    for (let b = 0; b < buyersThisMonth; b += 1) {
      buyerSeq += 1;
      const createdAt = new Date(baseDate);
      createdAt.setDate(Math.min(lastDayOfMonth(baseDate), 2 + b * 9 + (buyerSeq % 4)));
      createdAt.setHours(10, 0, 0, 0);

      const shouldChurn = buyerSeq % 8 === 0;
      const buyer = await createDemoBuyer(userId, buyerSeq, createdAt, {
        status: shouldChurn ? 'Inactive' : 'Active',
        updatedAt: shouldChurn
          ? clampToPast(new Date(createdAt.getTime() + 60 * 24 * 60 * 60 * 1000))
          : undefined,
      });
      buyers.push(buyer);
    }

    for (let n = 0; n < ordersThisMonth; n += 1) {
      orderSeq += 1;
      const orderDate = new Date(baseDate);
      orderDate.setDate(Math.min(lastDayOfMonth(baseDate), 4 + n * 6 + (orderSeq % 5)));
      orderDate.setHours(11 + (n % 4), 30, 0, 0);

      const buyer = buyers[(orderSeq + monthIndex) % buyers.length];
      await createDemoOrder({
        userId,
        orderSeq,
        orderDate,
        buyer,
        products,
        growthFactor,
      });
    }

    console.log(`  ${monthLabel(baseDate)}: ${ordersThisMonth} orders, ${buyersThisMonth} new buyers`);
  }

  // Repeat orders for top buyers (Home widget)
  const topBuyers = buyers.slice(0, 5);
  for (let extra = 0; extra < 8; extra += 1) {
    orderSeq += 1;
    const orderDate = clampToPast(new Date(now));
    orderDate.setDate(orderDate.getDate() - (3 + extra * 4));
    orderDate.setHours(14, 0, 0, 0);
    const buyer = topBuyers[extra % topBuyers.length];
    await createDemoOrder({
      userId,
      orderSeq,
      orderDate,
      buyer,
      products,
      growthFactor: 1.4,
    });
  }
  console.log('  Top-buyer repeat orders: 8');

  const uniqueBuyers = [...new Set(buyers.map((b) => b.buyerId))];
  for (const buyerId of uniqueBuyers) {
    await syncOrderToBuyerProfile(buyerId, userId);
  }

  console.log(
    `\nCreated ${orderSeq} demo orders (${DEMO_ORDER_PREFIX}*) and ${uniqueBuyers.length} demo buyers (${DEMO_BUYER_PREFIX}*).`,
  );
  console.log('Screenshot targets: Dashboard Home, Orders, Clients → Buyers.');
  console.log(`Cleanup: npm run analytics:demo:cleanup`);
}

async function cleanupDemoOrders() {
  const prefixes = [DEMO_ORDER_PREFIX, LEGACY_ORDER_PREFIX];
  let totalOrders = 0;
  for (const prefix of prefixes) {
    const deleted = await prisma.order.deleteMany({
      where: { orderId: { startsWith: prefix } },
    });
    totalOrders += deleted.count;
  }
  console.log(totalOrders > 0 ? `Deleted ${totalOrders} demo orders.` : 'No demo orders to delete.');

  const buyerPrefixes = [DEMO_BUYER_PREFIX, LEGACY_BUYER_PREFIX];
  let totalBuyers = 0;
  for (const prefix of buyerPrefixes) {
    const deleted = await prisma.buyer.deleteMany({
      where: { buyerId: { startsWith: prefix } },
    });
    totalBuyers += deleted.count;
  }
  console.log(totalBuyers > 0 ? `Deleted ${totalBuyers} demo buyers.` : 'No demo buyers to delete.');
}

async function main() {
  const args = process.argv.slice(2).map((a) => a.toLowerCase());
  const command = args.find((a) => a === 'seed' || a === 'cleanup');
  const force = args.includes('--force');

  if (command === 'seed') {
    await seedDemoOrders(force);
    return;
  }

  if (command === 'cleanup') {
    await cleanupDemoOrders();
    return;
  }

  console.log('Usage:');
  console.log('  npm run analytics:demo:seed              # seed demo buyers + orders');
  console.log('  npm run analytics:demo:seed -- --force   # replace existing demo data');
  console.log('  npm run analytics:demo:cleanup           # remove demo buyers + orders');
  console.log('');
  console.log('Optional: ANALYTICS_DEMO_USER_ID=<distributorId> (auto-detects first priced catalog otherwise)');
  process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
