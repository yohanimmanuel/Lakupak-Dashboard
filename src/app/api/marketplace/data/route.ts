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
  baseShippingPrice: number | null;
  baseShippingRadius: number | null;
  freeShippingThreshold: number | null;
  sameDayShippingPrice: number | null;
  nextDayShippingPrice: number | null;
  expressShippingPrice: number | null;
  maxShippingRadius: number | null;
  additionalPricePerKm: number | null;
  pickupAddress: string | null;
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
    baseShippingPrice: 0,
    baseShippingRadius: 0,
    freeShippingThreshold: 0,
    sameDayShippingPrice: 0,
    nextDayShippingPrice: 0,
    expressShippingPrice: 0,
    maxShippingRadius: 0,
    additionalPricePerKm: 0,
    pickupAddress: null,
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

    // 4. Parse and validate pagination parameters
    const parsedPage = parseInt(searchParams.get('page') || '1', 10);
    const parsedLimit = parseInt(searchParams.get('limit') || '1000', 10);
    const page = Math.max(1, isNaN(parsedPage) ? 1 : parsedPage);
    const limit = Math.min(
      Math.max(1, isNaN(parsedLimit) ? 1000 : parsedLimit),
      1000 // Max 1000 items per page to prevent excessive load
    );
    const skip = (page - 1) * limit;

    // 5. Fetch all data in parallel for maximum performance
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
          baseShippingPrice: true,
          baseShippingRadius: true,
          freeShippingThreshold: true,
          sameDayShippingPrice: true,
          nextDayShippingPrice: true,
          expressShippingPrice: true,
          maxShippingRadius: true,
          additionalPricePerKm: true,
          pickupAddress: true,
        },
      }),

      // 4. Fetch all orders for overall metrics
      prisma.order.findMany({
        where: { userId: parsedUserId },
        select: { 
          totalAmount: true, 
          id: true,
        },
      }),

      // 5. Fetch all user activities for view metrics
      prisma.userActivity.findMany({
        where: {
          userId: parsedUserId,
        },
        select: {
          productId: true,
          activityType: true,
        },
      }),
    ]);

    // Calculate overall metrics
    const totalSales = orders.reduce((sum, order) => {
      const amount = Number(order.totalAmount) || 0;
      return sum + amount;
    }, 0);

    const totalOrders = orders.length;

    const totalViews = userActivities.filter(
      (activity) => activity.activityType === 'viewed'
    ).length;

    // Get all product IDs for fetching order items
    const productIds = products.map(p => p.productId);

    // Fetch all order items for all products in one query
    const orderItems = await prisma.orderItem.findMany({
      where: {
        productId: {
          in: productIds,
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
    });

    // Build per-product metrics map
    const productMetricsMap = new Map<string, {
      views: number;
      clicks: number;
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
        clicks: 0,
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
        case 'clicked':
          metrics.clicks++;
          break;
        case 'favorited':
          metrics.favorites++;
          break;
        case 'added_to_cart':
          metrics.addedToCart++;
          break;
      }
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

    // Calculate cart abandonment per product
    productMetricsMap.forEach((metrics) => {
      metrics.cartAbandoned = Math.max(0, metrics.addedToCart - metrics.sales);
    });

    // Build final products array with metrics
    const productsWithMetrics = products.map(product => {
      const metrics = productMetricsMap.get(product.productId) || {
        views: 0,
        clicks: 0,
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
        totalViews,
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
