import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';

// Company interface to ensure consistent shape
interface Company {
  name: string | null;
  logo: string | null;
  bannerImage: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  pickupAddress: string | null;
  shippingPreferences: string | null;
  defaultDeliveryLeadTimeMinDays: number | null;
  defaultDeliveryLeadTimeMaxDays: number | null;
}

// Factory function for default company object
function createDefaultCompany(): Company {
  return {
    name: 'Your Store',
    logo: null,
    bannerImage: null,
    businessAddress: 'Not set',
    businessPhone: 'Not set',
    businessEmail: 'Not set',
    pickupAddress: null,
    shippingPreferences: null,
    defaultDeliveryLeadTimeMinDays: null,
    defaultDeliveryLeadTimeMaxDays: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate the user
    const authenticatedUserId = await getAuthenticatedUserId(request);
    
    if (!authenticatedUserId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // 2. Get and validate requested userId
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');

    if (!userIdParam) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Parse and validate userId as integer
    const parsedUserId = parseInt(userIdParam, 10);
    if (isNaN(parsedUserId) || !Number.isInteger(parsedUserId) || parsedUserId <= 0) {
      return NextResponse.json(
        { error: 'Invalid User ID. Must be a positive integer.' },
        { status: 400 }
      );
    }

    // 3. Authorization check: ensure user can only access their own data
    if (authenticatedUserId !== parsedUserId) {
      return NextResponse.json(
        { error: 'Forbidden. You can only access your own marketplace data.' },
        { status: 403 }
      );
    }

    // 4a. Parse and validate timeRange parameter
    const validTimeRanges = ['7d', '30d', '90d', '1y'] as const;
    type TimeRange = typeof validTimeRanges[number];
    const rawTimeRange = searchParams.get('timeRange') || '30d';
    const timeRange: TimeRange = (validTimeRanges as readonly string[]).includes(rawTimeRange)
      ? (rawTimeRange as TimeRange)
      : '30d';

    const timeRangeDays: Record<TimeRange, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const since = new Date();
    since.setDate(since.getDate() - timeRangeDays[timeRange]);

    // 4b. Parse and validate pagination parameters
    const parsedPage = parseInt(searchParams.get('page') || '1', 10);
    const parsedLimit = parseInt(searchParams.get('limit') || '1000', 10);
    const page = Math.max(1, isNaN(parsedPage) ? 1 : parsedPage);
    const limit = Math.min(
      Math.max(1, isNaN(parsedLimit) ? 1000 : parsedLimit),
      1000 // Max 1000 items per page to prevent excessive load
    );
    const skip = (page - 1) * limit;

    // 5. Fetch seller's product IDs first (UserActivity is per product, not per dashboard user)
    const sellerProductIds = await prisma.product.findMany({
      where: { userId: parsedUserId },
      select: { productId: true },
    }).then((rows) => rows.map((p) => p.productId));

    // 6. Fetch all data in parallel (activities filtered by productId = seller's products)
    const [products, productCount, company, orders, userActivities] = await Promise.all([
      // 1. Fetch products with variant options (paginated)
      prisma.product.findMany({
        where: {
          userId: parsedUserId,
        },
        select: {
          id: true,
          productId: true,
          name: true,
          images: true,
          status: true,
          returnPolicyDays: true,
          publishedAt: true,
          variantOptions: {
            select: {
              sellingPrice: true,
            },
          },
        },
        skip,
        take: limit,
      }),

      // 2. Count total products for pagination metadata
      prisma.product.count({
        where: {
          userId: parsedUserId,
        },
      }),

      // 3. Fetch company data
      prisma.company.findFirst({
        where: {
          users: {
            some: { id: parsedUserId },
          },
        },
        select: {
          name: true,
          logo: true,
          bannerImage: true,
          businessAddress: true,
          businessPhone: true,
          businessEmail: true,
          pickupAddress: true,
          shippingPreferences: true,
          defaultDeliveryLeadTimeMinDays: true,
          defaultDeliveryLeadTimeMaxDays: true,
        },
      }),

      // 4. Fetch orders within the selected time range for metrics
      prisma.order.findMany({
        where: { userId: parsedUserId, orderDate: { gte: since } },
        select: { 
          totalAmount: true, 
          id: true,
          buyerId: true,
        },
      }),

      // 5. Fetch user activities within the selected time range
      sellerProductIds.length > 0
        ? prisma.userActivity.findMany({
            where: {
              productId: { in: sellerProductIds },
              createdAt: { gte: since },
            },
            select: {
              productId: true,
              activityType: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // Calculate overall metrics
    const totalSales = orders.reduce((sum, order) => {
      const amount = Number(order.totalAmount) || 0;
      return sum + amount;
    }, 0);

    const totalOrders = orders.length;

    const uniqueBuyerIds = new Set<string>();
    orders.forEach((o) => {
      if (o.buyerId && typeof o.buyerId === 'string' && o.buyerId.trim()) uniqueBuyerIds.add(o.buyerId.trim());
    });
    const totalBuyers = uniqueBuyerIds.size;

    const totalViews = userActivities.filter(
      (a) => a.activityType === 'viewed'
    ).length;
    const totalFavorites = userActivities.filter(
      (a) => a.activityType === 'favorite'
    ).length;
    const totalCartAddedCount = userActivities.filter(
      (a) => a.activityType === 'cart_added'
    ).length;
    const totalCartAbandonedCount = userActivities.filter(
      (a) => a.activityType === 'cart_abandoned'
    ).length;
    // Added to Cart = adds minus removals, so it decreases when customer removes from cart
    const totalAddedToCart = Math.max(0, totalCartAddedCount - totalCartAbandonedCount);

    // Get all product IDs for fetching order items
    const productIds = products.map(p => p.productId);

    // Fetch review counts per product within the selected time range
    const reviewGroups = productIds.length > 0
      ? await prisma.productReview.groupBy({
          by: ['productId'],
          where: {
            productId: { in: productIds },
            createdAt: { gte: since },
          },
          _count: { id: true },
        })
      : [];
    const reviewCountByProductId = new Map<string, number>();
    for (const g of reviewGroups) {
      reviewCountByProductId.set(g.productId, g._count.id);
    }
    const totalReviews = reviewGroups.reduce((sum, g) => sum + g._count.id, 0);

    // Fetch order items within the selected time range (aligned with overall order metrics)
    const orderItems = productIds.length > 0
      ? await prisma.orderItem.findMany({
          where: {
            productId: { in: productIds },
            order: {
              userId: parsedUserId,
              orderDate: { gte: since },
            },
          },
          select: {
            productId: true,
            packageQuantity: true,
            pricePerPackage: true,
            order: {
              select: {
                orderStatus: true,
              },
            },
          },
        })
      : [];

    // Build per-product metrics map (activity types match GraphQL/marketplace: 'viewed', 'favorite', 'cart')
    const productMetricsMap = new Map<string, {
      views: number;
      favorites: number;
      addedToCart: number;
      cartAbandoned: number;
      sales: number;
      revenue: number;
    }>();

    // Initialize metrics for all products
    products.forEach(product => {
      productMetricsMap.set(product.productId, {
        views: 0,
        favorites: 0,
        addedToCart: 0,
        cartAbandoned: 0,
        sales: 0,
        revenue: 0,
      });
    });

    // Aggregate user activities per product
    userActivities.forEach(activity => {
      const productId = activity.productId;
      if (!productId) return;
      
      const metrics = productMetricsMap.get(productId);
      if (!metrics) return;

      switch (activity.activityType) {
        case 'viewed':
          metrics.views++;
          break;
        case 'favorite':
          metrics.favorites++;
          break;
        case 'cart_added':
          metrics.addedToCart++;
          break;
        case 'cart_abandoned':
          // Only when user actually removed from cart (or cleared cart), not "still in cart"
          metrics.cartAbandoned++;
          break;
      }
    });

    // Added to Cart = add events minus remove events (decreases when item removed from cart)
    productMetricsMap.forEach((metrics) => {
      metrics.addedToCart = Math.max(0, metrics.addedToCart - metrics.cartAbandoned);
    });

    // Aggregate order items per product
    orderItems.forEach(item => {
      const productId = item.productId;
      if (!productId) return;
      
      const metrics = productMetricsMap.get(productId);
      if (!metrics) return;

      const quantity = Number(item.packageQuantity) || 0;
      const pricePerPackage = Number(item.pricePerPackage) || 0;

      metrics.sales++;
      metrics.revenue += quantity * pricePerPackage;
    });

    // Build final products array with metrics
    const productsWithMetrics = products.map(product => {
      const metrics = productMetricsMap.get(product.productId) || {
        views: 0,
        favorites: 0,
        addedToCart: 0,
        cartAbandoned: 0,
        sales: 0,
        revenue: 0,
      };

      return {
        ...product,
        marketplaceStatus: product.status === 'Published' ? 'Published' : 'Not Published',
        // Use actual DB publishedAt timestamp, format to ISO string if exists
        publishedAt: product.status === 'Published' && product.publishedAt 
          ? product.publishedAt.toISOString() 
          : undefined,
        reviews: reviewCountByProductId.get(product.productId) ?? 0,
        ...metrics,
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(productCount / limit);
    const hasMore = page < totalPages;
    const isTruncated = productCount > limit && page === 1 && !searchParams.has('page');

    // Return consolidated response with pagination metadata
    return NextResponse.json({
      products: productsWithMetrics,
      company: company || createDefaultCompany(),
      overallMetrics: {
        totalSales,
        totalOrders,
        totalBuyers,
        totalViews,
        totalFavorites,
        totalAddedToCart,
        cartAbandonedCount: totalCartAbandonedCount,
        totalReviews,
      },
      pagination: {
        totalCount: productCount,
        totalPages,
        currentPage: page,
        pageSize: limit,
        hasMore,
        isTruncated, // True if results are limited without explicit pagination
      },
    });
  } catch (error) {
    console.error('Error fetching marketplace data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch marketplace data' },
      { status: 500 }
    );
  }
}
