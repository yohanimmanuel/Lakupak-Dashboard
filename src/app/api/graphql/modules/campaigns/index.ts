import { type Prisma } from '@/lib/db';
import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo, parseMoney } from '../common/utils';
import { Prisma as PrismaClient } from '@/lib/prisma-generated';
import { NotificationService } from '../notifications';

// ============================================================================ //
// TYPE DEFS
// ============================================================================ //

export const campaignsTypeDefs = /* GraphQL */ `
  type CampaignContentBlock {
    id: String!
    type: String!
    order: Int!
    text: String
    textStyle: String
    imageUrl: String
    imageAlt: String
    productId: String
    productName: String
    productImage: String
    productPrice: Float
    productButtonText: String
    productButtonLink: String
    buttonText: String
    buttonLink: String
    buttonStyle: String
    listItems: JSONObject
    headerText: String
    headerImage: String
    spacingSize: String
  }

  type Campaign {
    id: String!
    campaignId: String!
    name: String!
    description: String
    status: String!
    sentDate: String
    recipients: String!
    opensCount: Int!
    clicksCount: Int!
    revenue: Float!
    orders: Int!
    contentBlocks: JSONObject
    userId: Int
    createdAt: String
    updatedAt: String
  }

  type CampaignConnection {
    nodes: [Campaign!]!
    pagination: PaginationInfo!
  }

  type DeleteCampaignResult {
    success: Boolean!
    deleted: Campaign
  }

  extend type Query {
    campaigns(
      userId: Int!
      page: Int = 1
      limit: Int = 50
      status: String
    ): CampaignConnection!

    campaign(userId: Int!, id: String!): Campaign
  }

  extend type Mutation {
    createCampaign(
      userId: Int!
      campaignId: String
      name: String!
      description: String
      status: String
      recipients: String!
      contentBlocks: JSONObject
    ): Campaign!

    updateCampaign(
      userId: Int!
      id: String!
      name: String
      description: String
      status: String
      recipients: String
      sentDate: String
      opensCount: Int
      clicksCount: Int
      revenue: Float
      orders: Int
      contentBlocks: JSONObject
    ): Campaign!

    deleteCampaign(userId: Int!, id: String!): DeleteCampaignResult!
  }
`;

// ============================================================================ //
// HELPER FUNCTIONS
// ============================================================================ //

const generateCampaignId = (): string => {
  const randomNumbers = Math.floor(Math.random() * 900000) + 100000; // 6 digits
  return `CAMP${randomNumbers}`;
};

const mapCampaign = (campaign: Prisma.CampaignGetPayload<{}>): {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  status: string;
  sentDate: string | null;
  recipients: string;
  opensCount: number;
  clicksCount: number;
  revenue: number;
  orders: number;
  contentBlocks: unknown[] | null;
  userId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
} => {
  return {
    id: campaign.id,
    campaignId: campaign.campaignId,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    sentDate: campaign.sentDate ? campaign.sentDate.toISOString() : null,
    recipients: campaign.recipients,
    opensCount: campaign.opensCount ?? 0,
    clicksCount: campaign.clicksCount ?? 0,
    revenue: parseMoney(campaign.revenue), // Convert Decimal to number
    orders: campaign.orders,
    contentBlocks: campaign.contentBlocks as unknown[] | null,
    userId: campaign.userId,
    createdAt: campaign.createdAt ? campaign.createdAt.toISOString() : null,
    updatedAt: campaign.updatedAt ? campaign.updatedAt.toISOString() : null,
  };
};

const fetchCampaignsConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  status?: string | null;
}) => {
  const { userId, page = 1, limit = 50, status } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);

  const whereClause: Prisma.CampaignWhereInput = { userId };

  if (status && status !== 'All') {
    if (status === 'Completed') {
      whereClause.status = { in: ['Sent', 'Completed'] };
    } else {
      whereClause.status = status;
    }
  }

  const [campaigns, totalCount] = await Promise.all([
    prisma.campaign.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.campaign.count({ where: whereClause }),
  ]);

  return {
    nodes: campaigns.map(mapCampaign),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const fetchSingleCampaign = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  const campaign = await prisma.campaign.findFirst({
    where: {
      OR: [{ id }, { campaignId: id }],
      userId,
    },
  });

  if (!campaign) {
    return null;
  }

  return mapCampaign(campaign);
};

const createCampaign = async (args: {
  userId: number;
  campaignId?: string | null;
  name: string;
  description?: string | null;
  status?: string | null;
  recipients: string;
  contentBlocks?: unknown | null;
}) => {
  const {
    userId,
    campaignId,
    name,
    description,
    status = 'Draft',
    recipients,
    contentBlocks,
  } = args;

  // Validate required fields
  const trimmedName = name?.trim();
  const trimmedRecipients = recipients?.trim();
  
  if (!trimmedName) {
    throw new Error('Campaign name is required');
  }
  if (!trimmedRecipients) {
    throw new Error('Recipients is required');
  }

  let finalCampaignId = campaignId || generateCampaignId();
  
  // Ensure unique campaignId
  const existingCampaign = await prisma.campaign.findFirst({
    where: { campaignId: finalCampaignId, userId },
  });

  if (existingCampaign) {
    finalCampaignId = generateCampaignId();
  }

  // Handle contentBlocks: if it's an array with items, use it; otherwise set to JsonNull
  let contentBlocksValue: Prisma.InputJsonValue | typeof PrismaClient.JsonNull;
  if (contentBlocks && Array.isArray(contentBlocks) && contentBlocks.length > 0) {
    contentBlocksValue = contentBlocks as Prisma.InputJsonValue;
  } else {
    contentBlocksValue = PrismaClient.JsonNull;
  }

  const campaign = await prisma.campaign.create({
    data: {
      campaignId: finalCampaignId,
      name: trimmedName,
      description: description?.trim() || null,
      status: status || 'Draft',
      recipients: trimmedRecipients,
      contentBlocks: contentBlocksValue,
      userId,
    },
  });

  return mapCampaign(campaign);
};

const updateCampaign = async (args: {
  userId: number;
  id: string;
  name?: string | null;
  description?: string | null;
  status?: string | null;
  recipients?: string | null;
  sentDate?: string | null;
  opensCount?: number | null;
  clicksCount?: number | null;
  revenue?: number | null;
  orders?: number | null;
  contentBlocks?: unknown | null;
}) => {
  const {
    userId,
    id,
    name,
    description,
    status,
    recipients,
    sentDate,
    opensCount,
    clicksCount,
    revenue,
    orders,
    contentBlocks,
  } = args;

  const where = {
    OR: [{ id }, { campaignId: id }],
    userId,
  };

  const existingCampaign = await prisma.campaign.findFirst({
    where,
  });

  if (!existingCampaign) {
    throw new Error('Campaign not found or you do not have permission to update it');
  }

  const updateData: Prisma.CampaignUpdateInput = {};

  if (name !== undefined && name !== null) updateData.name = name;
  if (description !== undefined) updateData.description = description ?? null;
  if (status !== undefined && status !== null) updateData.status = status;
  if (recipients !== undefined && recipients !== null) updateData.recipients = recipients;
  if (sentDate !== undefined) {
    updateData.sentDate = sentDate ? new Date(sentDate) : null;
  }
  if (opensCount !== undefined && opensCount !== null) updateData.opensCount = opensCount;
  if (clicksCount !== undefined && clicksCount !== null) updateData.clicksCount = clicksCount;
  if (revenue !== undefined && revenue !== null) updateData.revenue = revenue;
  if (orders !== undefined && orders !== null) updateData.orders = orders;
  if (contentBlocks !== undefined) {
    if (contentBlocks && Array.isArray(contentBlocks) && contentBlocks.length > 0) {
      updateData.contentBlocks = contentBlocks as Prisma.InputJsonValue;
    } else {
      updateData.contentBlocks = PrismaClient.JsonNull;
    }
  }

  const updatedCampaign = await prisma.campaign.update({
    where: { id: existingCampaign.id },
    data: updateData,
  });

  // Send notification whenever campaign status is set to 'Sent'
  if (status === 'Sent') {
    try {
      await NotificationService.createCampaignSentNotification(
        userId,
        updatedCampaign.campaignId,
        updatedCampaign.name,
        updatedCampaign.recipients
      );
    } catch (notifError) {
      // Don't fail campaign update if notification fails
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Campaigns] Sent notification failed:', notifError);
      }
    }
  }

  return mapCampaign(updatedCampaign);
};

const deleteCampaign = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  const where = {
    OR: [{ id }, { campaignId: id }],
    userId,
  };

  const campaign = await prisma.campaign.findFirst({
    where,
  });

  if (!campaign) {
    throw new Error('Campaign not found or you do not have permission to delete it');
  }

  await prisma.campaign.delete({
    where: { id: campaign.id },
  });

  return {
    success: true,
    deleted: mapCampaign(campaign),
  };
};

// ============================================================================ //
// RESOLVERS
// ============================================================================ //

export const campaignsResolvers = {
  Query: {
    campaigns: async (_: unknown, args: {
      userId: number;
      page?: number;
      limit?: number;
      status?: string | null;
    }) => {
      return fetchCampaignsConnection(args);
    },
    campaign: async (_: unknown, args: { userId: number; id: string }) => {
      return fetchSingleCampaign(args);
    },
  },
  Mutation: {
    createCampaign: async (_: unknown, args: {
      userId: number;
      campaignId?: string | null;
      name: string;
      description?: string | null;
      status?: string | null;
      recipients: string;
      contentBlocks?: unknown | null;
    }) => {
      return createCampaign(args);
    },
    updateCampaign: async (_: unknown, args: {
      userId: number;
      id: string;
      name?: string | null;
      description?: string | null;
      status?: string | null;
      recipients?: string | null;
      sentDate?: string | null;
      opensCount?: number | null;
      clicksCount?: number | null;
      revenue?: number | null;
      orders?: number | null;
      contentBlocks?: unknown | null;
    }) => {
      return updateCampaign(args);
    },
    deleteCampaign: async (_: unknown, args: { userId: number; id: string }) => {
      return deleteCampaign(args);
    },
  },
};

