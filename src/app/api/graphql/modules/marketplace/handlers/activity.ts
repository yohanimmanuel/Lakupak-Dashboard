import type { Prisma } from '@/lib/db';
import { prisma } from '../../common/prisma';
import { getTodayBoundaries } from '@/lib/dateUtils';

// Helper function to cleanup old viewed products
async function cleanupOldViewedProducts(userId: number) {
  const { startOfToday } = getTodayBoundaries();
  
  const deletedCount = await prisma.userActivity.deleteMany({
    where: {
      userId: userId,
      activityType: 'viewed',
      createdAt: {
        lt: startOfToday
      }
    }
  });
  
  return deletedCount.count;
}

export const fetchMobileUserActivity = async (args: {
  userId: number;
  type: string;
}) => {
  const { userId, type } = args;

  const whereClause: Record<string, unknown> = { 
    userId,
    activityType: type
  };

  if (type === 'viewed') {
    const { startOfToday, endOfToday } = getTodayBoundaries();
    
    whereClause.createdAt = {
      gte: startOfToday,
      lte: endOfToday
    };
  }

  if (type === 'viewed') {
    await cleanupOldViewedProducts(userId);
  }

  const activities = await prisma.userActivity.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    take: type === 'viewed' ? 20 : undefined
  });

  return {
    success: true,
    activities: activities.map(activity => ({
      id: activity.id,
      userId: activity.userId,
      productId: activity.productId,
      productData: activity.productData as Prisma.InputJsonValue,
      activityType: activity.activityType as 'favorite' | 'viewed' | 'purchased' | 'cart',
      metadata: activity.metadata as Prisma.InputJsonValue | null,
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
    }))
  };
};

export const addUserActivity = async (args: {
  userId: number;
  productId: string;
  productData: Record<string, unknown>;
  activityType: string;
  metadata?: Record<string, unknown>;
}) => {
  const { userId, productId, productData, activityType, metadata } = args;

  const result = await prisma.$transaction(async (tx) => {
    const existingActivity = await tx.userActivity.findFirst({
      where: {
        userId,
        productId,
        activityType,
      },
    });

    if (existingActivity) {
      const updatedActivity = await tx.userActivity.update({
        where: { id: existingActivity.id },
        data: {
          productData: productData as Prisma.InputJsonValue,
          metadata: (metadata || existingActivity.metadata) as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });

      return { row: updatedActivity, action: 'updated' as const };
    }

    const newActivity = await tx.userActivity.create({
      data: {
        userId,
        productId,
        productData: productData as Prisma.InputJsonValue,
        activityType,
        metadata: (metadata || {}) as Prisma.InputJsonValue,
      },
    });

    return { row: newActivity, action: 'created' as const };
  });

  if (activityType === 'viewed') {
    try {
      await cleanupOldViewedProducts(userId);
    } catch (error) {
      // Log but don't fail the request - cleanup is non-critical
      console.error('Failed to cleanup old viewed products:', error);
    }
  }

  return {
    success: true,
    activity: {
      id: result.row.id,
      userId: result.row.userId,
      productId: result.row.productId,
      productData: result.row.productData as Prisma.InputJsonValue,
      activityType: result.row.activityType as 'favorite' | 'viewed' | 'purchased' | 'cart',
      metadata: result.row.metadata as Prisma.InputJsonValue | null,
      createdAt: result.row.createdAt.toISOString(),
      updatedAt: result.row.updatedAt.toISOString(),
    },
    action: result.action,
  };
};

export const deleteUserActivity = async (args: {
  userId: number;
  productId: string;
  type: string;
}) => {
  const { userId, productId, type } = args;

  const deletedActivity = await prisma.userActivity.deleteMany({
    where: {
      userId,
      productId,
      activityType: type
    }
  });

  return {
    success: true,
    deletedCount: deletedActivity.count
  };
};

