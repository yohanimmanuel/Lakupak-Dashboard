import type { Prisma } from '@/lib/db';
import { prisma } from '../../common/prisma';

const RECENTLY_VIEWED_PRODUCT_LIMIT = 20;

type UserActivityRow = {
  id: number;
  userId: number;
  productId: string;
  productData: Prisma.JsonValue;
  activityType: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

async function fetchRecentlyViewedActivities(userId: number): Promise<UserActivityRow[]> {
  // Latest view per product, ordered by most recent view across products
  return prisma.$queryRaw<UserActivityRow[]>`
    SELECT
      ranked.id,
      ranked."userId",
      ranked."productId",
      ranked."productData",
      ranked."activityType",
      ranked.metadata,
      ranked."createdAt",
      ranked."updatedAt"
    FROM (
      SELECT
        ua.*,
        ROW_NUMBER() OVER (
          PARTITION BY ua."productId"
          ORDER BY ua."createdAt" DESC, ua.id DESC
        ) AS rn
      FROM "public"."UserActivity" ua
      WHERE ua."userId" = ${userId}
        AND ua."activityType" = 'viewed'
    ) ranked
    WHERE ranked.rn = 1
    ORDER BY ranked."createdAt" DESC, ranked.id DESC
    LIMIT ${RECENTLY_VIEWED_PRODUCT_LIMIT}
  `;
}

function mapActivityRow(activity: UserActivityRow) {
  return {
    id: activity.id,
    userId: activity.userId,
    productId: activity.productId,
    productData: activity.productData as Prisma.InputJsonValue,
    activityType: activity.activityType as 'favorite' | 'viewed' | 'purchased' | 'cart',
    metadata: activity.metadata as Prisma.InputJsonValue | null,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

export const fetchMobileUserActivity = async (args: {
  userId: number;
  type: string;
}) => {
  const { userId, type } = args;

  if (type === 'viewed') {
    const activities = await fetchRecentlyViewedActivities(userId);
    return {
      success: true,
      activities: activities.map(mapActivityRow),
    };
  }

  const activities = await prisma.userActivity.findMany({
    where: {
      userId,
      activityType: type,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  return {
    success: true,
    activities: activities.map(mapActivityRow),
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
    // Each product view is a separate analytics event for seller dashboards
    if (activityType === 'viewed') {
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
    }

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

