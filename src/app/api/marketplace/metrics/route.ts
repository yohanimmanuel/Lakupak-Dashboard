import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';

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
    const userId = searchParams.get('userId');

    if (!userId || userId.trim() === '') {
      return NextResponse.json(
        { error: 'Valid integer userId is required' },
        { status: 400 }
      );
    }

    // Parse and validate userId as finite positive integer
    const userIdNum = Number.parseInt(userId, 10);
    if (!Number.isInteger(userIdNum) || Number.isNaN(userIdNum) || userIdNum <= 0) {
      return NextResponse.json(
        { error: 'Valid integer userId is required' },
        { status: 400 }
      );
    }

    // 3. Authorization check: ensure user can only access their own metrics
    if (authenticatedUserId !== userIdNum) {
      return NextResponse.json(
        { error: 'Forbidden. You can only access your own marketplace metrics.' },
        { status: 403 }
      );
    }

    // 4. Fetch marketplace metrics for the authenticated user
    // Get all orders for this user (from Order table)
    const orders = await prisma.order.findMany({
      where: { 
        userId: userIdNum,
        // Optionally filter for marketplace orders only if you have a field for it
      },
      select: {
        totalAmount: true,
        id: true,
      },
    });

    // Calculate total sales amount (sum of all order totalAmount)
    const totalSales = orders.reduce((sum, order) => {
      const amount = Number(order.totalAmount) || 0;
      return sum + amount;
    }, 0);

    // Count total orders
    const totalOrders = orders.length;

    // Get all user's products to filter marketplace activities for views
    const userProducts = await prisma.product.findMany({
      where: { userId: userIdNum },
      select: { productId: true },
    });

    const productIds = userProducts.map(p => p.productId);

    // Count total views from UserActivity
    const totalViews = productIds.length > 0 
      ? await prisma.userActivity.count({
          where: {
            productId: { in: productIds },
            activityType: 'viewed',
          },
        })
      : 0;

    return NextResponse.json({
      totalSales,
      totalOrders,
      totalViews,
    });
  } catch (error) {
    console.error('Error fetching marketplace metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch marketplace metrics' },
      { status: 500 }
    );
  }
}
