import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { productId } = await request.json();

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Count views from UserActivity
    const views = await prisma.userActivity.count({
      where: {
        productId,
        activityType: 'viewed',
      },
    });

    // Count clicks
    const clicks = await prisma.userActivity.count({
      where: {
        productId,
        activityType: 'clicked',
      },
    });

    // Count favorites
    const favorites = await prisma.userActivity.count({
      where: {
        productId,
        activityType: 'favorite',
      },
    });

    // Count cart additions
    const addedToCart = await prisma.userActivity.count({
      where: {
        productId,
        activityType: 'cart',
      },
    });

    // Get sales and revenue from Order table (real order data)
    const orderItems = await prisma.orderItem.findMany({
      where: {
        productId,
        order: {
          orderStatus: {
            in: ['completed', 'paid', 'delivered'], // Adjust to your status values
          },
        },
      },
    });

    // Count sales (number of times this product was ordered)
    const sales = orderItems.length;

    // Calculate revenue from orders
    const revenue = orderItems.reduce((sum, item) => {
      const quantity = Number(item.packageQuantity) || 0;
      const pricePerPackage = Number(item.pricePerPackage) || 0;
      return sum + (quantity * pricePerPackage);
    }, 0);

    // Calculate cart abandonment (items added to cart but not purchased)
    const cartAbandoned = Math.max(0, addedToCart - sales);

    return NextResponse.json({
      views,
      clicks,
      favorites,
      addedToCart,
      cartAbandoned,
      sales,
      revenue,
    });
  } catch (error) {
    console.error('Error fetching product metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product metrics' },
      { status: 500 }
    );
  }
}
