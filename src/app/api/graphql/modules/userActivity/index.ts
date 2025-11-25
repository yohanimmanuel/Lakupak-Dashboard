import { prisma } from '../common/prisma';
import { sanitizePagination } from '../common/utils';

export const userActivityTypeDefs = /* GraphQL */ `
  enum ActivityType {
    favorite
    viewed
    purchased
    cart
  }

  type UserActivity {
    id: Int!
    userId: Int!
    productId: String!
    productData: JSONObject!
    activityType: ActivityType!
    metadata: JSONObject
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    userActivities(
      userId: Int!
      activityType: ActivityType!
      limit: Int = 20
    ): [UserActivity!]!
  }
`;

const fetchUserActivities = async (args: {
  userId: number;
  activityType: string;
  limit?: number;
}) => {
  const { userId, activityType, limit = 20 } = args;
  const { limit: safeLimit } = sanitizePagination(1, limit, 100);

  const activities = await prisma.userActivity.findMany({
    where: { userId, activityType },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
  });

  return activities.map((activity) => ({
    id: activity.id,
    userId: activity.userId,
    productId: activity.productId,
    productData: activity.productData,
    activityType: activity.activityType as 'favorite' | 'viewed' | 'purchased' | 'cart',
    metadata: activity.metadata,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  }));
};

export const userActivityResolvers = {
  Query: {
    userActivities: (_: unknown, args: Parameters<typeof fetchUserActivities>[0]) =>
      fetchUserActivities(args),
  },
};

