import { type Prisma } from '@/lib/db';
import { prisma } from '../common/prisma';
import { sanitizePagination, buildPaginationInfo } from '../common/utils';

// Helper to safely access sales models with runtime validation
const getSalesAgentModel = () => {
  const model = (prisma as unknown as Record<string, unknown>).salesAgent;
  if (!model || typeof model !== 'object' || !('findMany' in model)) {
    throw new Error('SalesAgent model not found on Prisma client. Please run: npx prisma generate and restart the server.');
  }
  return model as {
    findMany: (args: unknown) => Promise<SalesAgentModel[]>;
    findFirst: (args: unknown) => Promise<SalesAgentModel | null>;
    findUnique: (args: unknown) => Promise<SalesAgentModel | null>;
    create: (args: unknown) => Promise<SalesAgentModel>;
    update: (args: unknown) => Promise<SalesAgentModel>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
    delete: (args: unknown) => Promise<SalesAgentModel>;
    count: (args: unknown) => Promise<number>;
  };
};

const getSalesTeamModel = () => {
  const model = (prisma as unknown as Record<string, unknown>).salesTeam;
  if (!model || typeof model !== 'object' || !('findMany' in model)) {
    throw new Error('SalesTeam model not found on Prisma client. Please run: npx prisma generate and restart the server.');
  }
  return model as {
    findMany: (args: unknown) => Promise<SalesTeamModel[]>;
    findFirst: (args: unknown) => Promise<SalesTeamModel | null>;
    findUnique: (args: unknown) => Promise<SalesTeamModel | null>;
    create: (args: unknown) => Promise<SalesTeamModel>;
    update: (args: unknown) => Promise<SalesTeamModel>;
    delete: (args: unknown) => Promise<SalesTeamModel>;
    count: (args: unknown) => Promise<number>;
  };
};

const getFieldReportModel = (tx?: unknown) => {
  const client = (tx || prisma) as unknown as Record<string, unknown>;
  const model = client.fieldReport;
  if (!model || typeof model !== 'object' || !('createMany' in model)) {
    throw new Error('FieldReport model not found. Please run: npx prisma generate and restart the server.');
  }
  return model as {
    createMany: (args: unknown) => Promise<{ count: number }>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
};

const getSalesTargetModel = (tx?: unknown) => {
  const client = (tx || prisma) as unknown as Record<string, unknown>;
  const model = client.salesTarget;
  if (!model || typeof model !== 'object' || !('createMany' in model)) {
    throw new Error('SalesTarget model not found. Please run: npx prisma generate and restart the server.');
  }
  return model as {
    createMany: (args: unknown) => Promise<{ count: number }>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
};

const getFavoriteProductModel = (tx?: unknown) => {
  const client = (tx || prisma) as unknown as Record<string, unknown>;
  const model = client.favoriteProduct;
  if (!model || typeof model !== 'object' || !('createMany' in model)) {
    throw new Error('FavoriteProduct model not found. Please run: npx prisma generate and restart the server.');
  }
  return model as {
    createMany: (args: unknown) => Promise<{ count: number }>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
};

// ============================================================================ //
// TYPE DEFS
// ============================================================================ //

export const salesTypeDefs = /* GraphQL */ `
  type FavoriteProduct {
    productId: String!
    productDbId: Int!
    name: String!
    productType: String!
    brand: String
    images: [String!]
    sellingPrice: String
  }

  type FieldReport {
    id: String!
    date: String!
    location: String
    startTime: String
    endTime: String
    activities: JSONObject
    notes: String
    createdAt: String!
    updatedAt: String!
  }

  type SalesTarget {
    id: String!
    period: String!
    goal: Float!
    achieved: Float!
    unitsSold: Int!
    createdAt: String!
    updatedAt: String!
  }

  type SalesAgent {
    id: String!
    name: String!
    email: String!
    phone: String!
    role: String!
    status: String!
    avatar: String
    territory: String
    bio: String
    sex: String
    teamId: String
    teamName: String
    userId: Int
    favoriteProducts: [FavoriteProduct!]!
    fieldReports: [FieldReport!]!
    salesTargets: [SalesTarget!]!
    createdAt: String!
    updatedAt: String!
  }

  type SalesTeam {
    id: String!
    name: String!
    memberIds: [String!]!
    members: [SalesAgent!]!
    userId: Int
    createdAt: String!
    updatedAt: String!
  }

  type SalesAgentConnection {
    nodes: [SalesAgent!]!
    pagination: PaginationInfo!
  }

  type SalesTeamConnection {
    nodes: [SalesTeam!]!
    pagination: PaginationInfo!
  }

  input FieldReportInput {
    id: String
    date: String!
    location: String
    startTime: String
    endTime: String
    activities: JSONObject
    notes: String
  }

  input SalesTargetInput {
    id: String
    period: String!
    goal: Float!
    achieved: Float
    unitsSold: Int
  }

  input CreateSalesAgentInput {
    name: String!
    email: String!
    phone: String!
    role: String!
    status: String!
    avatar: String
    territory: String
    bio: String
    sex: String
    teamId: String
    fieldReports: [FieldReportInput!]
    salesTargets: [SalesTargetInput!]
    favoriteProductIds: [Int!]
  }

  input UpdateSalesAgentInput {
    id: String!
    name: String
    email: String
    phone: String
    role: String
    status: String
    avatar: String
    territory: String
    bio: String
    sex: String
    teamId: String
    fieldReports: [FieldReportInput!]
    salesTargets: [SalesTargetInput!]
    favoriteProductIds: [Int!]
  }

  input CreateSalesTeamInput {
    name: String!
    memberIds: [String!]!
  }

  input UpdateSalesTeamInput {
    id: String!
    name: String
    memberIds: [String!]
  }

  type DeleteSalesAgentResult {
    success: Boolean!
    deleted: SalesAgent
  }

  type DeleteSalesTeamResult {
    success: Boolean!
    deleted: SalesTeam
  }

  extend type Query {
    salesAgents(
      userId: Int!
      page: Int = 1
      limit: Int = 50
      search: String
      role: String
      status: String
      teamId: String
    ): SalesAgentConnection!

    salesAgent(userId: Int!, id: String!): SalesAgent

    salesTeams(
      userId: Int!
      page: Int = 1
      limit: Int = 50
      search: String
    ): SalesTeamConnection!

    salesTeam(userId: Int!, id: String!): SalesTeam
  }

  extend type Mutation {
    createSalesAgent(
      userId: Int!
      input: CreateSalesAgentInput!
    ): SalesAgent!

    updateSalesAgent(
      userId: Int!
      input: UpdateSalesAgentInput!
    ): SalesAgent!

    deleteSalesAgent(
      userId: Int!
      id: String!
    ): DeleteSalesAgentResult!

    createSalesTeam(
      userId: Int!
      input: CreateSalesTeamInput!
    ): SalesTeam!

    updateSalesTeam(
      userId: Int!
      input: UpdateSalesTeamInput!
    ): SalesTeam!

    deleteSalesTeam(
      userId: Int!
      id: String!
    ): DeleteSalesTeamResult!
  }
`;

// ============================================================================ //
// HELPER FUNCTIONS
// ============================================================================ //

// Type definitions for Prisma models
// These will be properly typed once Prisma generates the types
type SalesAgentInclude = {
  team: true;
  fieldReports: true;
  salesTargets: true;
  favoriteProducts: {
    include: {
      product: {
        include: {
          variantOptions: true;
        };
      };
    };
  };
};

type SalesTeamInclude = {
  members: {
    include: {
      team: true;
      fieldReports: true;
      salesTargets: true;
      favoriteProducts: {
        include: {
          product: {
            include: {
              variantOptions: true;
            };
          };
        };
      };
    };
  };
};

type SalesAgentModel = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  avatar: string | null;
  territory: string | null;
  teamId: string | null;
  userId: number | null;
  createdAt: Date;
  updatedAt: Date;
  team: {
    id: string;
    name: string;
  } | null;
  fieldReports: Array<{
    id: string;
    date: Date;
    location: string | null;
    startTime: string | null;
    endTime: string | null;
    activities: unknown;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  salesTargets: Array<{
    id: string;
    period: string;
    goal: number;
    achieved: number;
    unitsSold: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  favoriteProducts: Array<{
    productId: number; // Foreign key from FavoriteProduct model
    product: {
      productId: string;
      name: string;
      productType: string;
      brand: string;
      images: string[];
      variantOptions: Array<{
        isDefault: boolean;
        sellingPrice: number;
      }>;
    };
  }>;
  bio: string | null;
  sex: string | null;
};

type SalesTeamModel = {
  id: string;
  name: string;
  userId: number | null;
  createdAt: Date;
  updatedAt: Date;
  members: SalesAgentModel[];
};

const mapSalesAgent = (agent: SalesAgentModel) => {
  return {
    id: agent.id,
    name: agent.name,
    email: agent.email,
    phone: agent.phone,
    role: agent.role,
    status: agent.status,
    avatar: agent.avatar,
    territory: agent.territory,
    bio: agent.bio,
    sex: agent.sex,
    teamId: agent.teamId,
    teamName: agent.team?.name || undefined,
    userId: agent.userId,
    favoriteProducts: (agent.favoriteProducts || []).map((fp) => ({
      productId: fp.product.productId,
      productDbId: (fp as { productId: number }).productId, // Database ID from FavoriteProduct relation (foreign key)
      name: fp.product.name,
      productType: fp.product.productType,
      brand: fp.product.brand,
      images: fp.product.images,
      sellingPrice: fp.product.variantOptions?.find((vo) => vo.isDefault)?.sellingPrice?.toString() || '0',
    })),
    fieldReports: (agent.fieldReports || []).map((fr) => ({
      id: fr.id,
      date: fr.date.toISOString(),
      location: fr.location,
      startTime: fr.startTime,
      endTime: fr.endTime,
      activities: fr.activities as Record<string, unknown> | null,
      notes: fr.notes,
      createdAt: fr.createdAt.toISOString(),
      updatedAt: fr.updatedAt.toISOString(),
    })),
    salesTargets: (agent.salesTargets || []).map((st) => ({
      id: st.id,
      period: st.period,
      goal: st.goal,
      achieved: st.achieved,
      unitsSold: st.unitsSold,
      createdAt: st.createdAt.toISOString(),
      updatedAt: st.updatedAt.toISOString(),
    })),
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
};

const mapSalesTeam = (team: SalesTeamModel) => {
  return {
    id: team.id,
    name: team.name,
    memberIds: team.members.map((m) => m.id),
    members: team.members.map((m) => mapSalesAgent(m)),
    userId: team.userId,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
  };
};

const fetchSalesAgentsConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  search?: string | null;
  role?: string | null;
  status?: string | null;
  teamId?: string | null;
}) => {
  const { userId, page = 1, limit = 50, search, role, status, teamId } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);

  const whereClause: {
    userId: number;
    OR?: Array<{
      name?: { contains: string; mode: 'insensitive' };
      email?: { contains: string; mode: 'insensitive' };
      phone?: { contains: string; mode: 'insensitive' };
      territory?: { contains: string; mode: 'insensitive' };
    }>;
    role?: string;
    status?: string;
    teamId?: string | null;
  } = { userId };

  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { territory: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (role && role !== 'All Roles') {
    whereClause.role = role;
  }

  if (status && status !== 'All Status') {
    whereClause.status = status.toLowerCase();
  }

  if (teamId) {
    whereClause.teamId = teamId;
  }

  const salesAgent = getSalesAgentModel();
  const [agents, totalCount] = await Promise.all([
    salesAgent.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        team: true,
        fieldReports: true,
        salesTargets: true,
        favoriteProducts: {
          include: {
            product: {
              include: {
                variantOptions: true,
              },
            },
          },
        },
      },
    }),
    salesAgent.count({ where: whereClause }),
  ]);

  return {
    nodes: agents.map(mapSalesAgent),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const fetchSingleSalesAgent = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  const agent = await (prisma as unknown as { salesAgent: { findFirst: (args: unknown) => Promise<SalesAgentModel | null> } }).salesAgent.findFirst({
    where: {
      id,
      userId,
    },
    include: {
      team: true,
      fieldReports: true,
      salesTargets: true,
      favoriteProducts: {
        include: {
          product: {
            include: {
              variantOptions: true,
            },
          },
        },
      },
    },
  });

  if (!agent) {
    return null;
  }

  return mapSalesAgent(agent);
};

const fetchSalesTeamsConnection = async (args: {
  userId: number;
  page?: number;
  limit?: number;
  search?: string | null;
}) => {
  const { userId, page = 1, limit = 50, search } = args;
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);

  const whereClause: {
    userId: number;
    name?: { contains: string; mode: 'insensitive' };
  } = { userId };

  if (search) {
    whereClause.name = { contains: search, mode: 'insensitive' };
  }

  const salesTeam = getSalesTeamModel();
  const [teams, totalCount] = await Promise.all([
    salesTeam.findMany({
      where: whereClause,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          include: {
            team: true,
            fieldReports: true,
            salesTargets: true,
            favoriteProducts: {
              include: {
                product: {
                  include: {
                    variantOptions: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    salesTeam.count({ where: whereClause }),
  ]);

  return {
    nodes: teams.map(mapSalesTeam),
    pagination: buildPaginationInfo(safePage, safeLimit, totalCount),
  };
};

const fetchSingleSalesTeam = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  const salesTeam = getSalesTeamModel();
  const team = await salesTeam.findFirst({
    where: {
      id,
      userId,
    },
    include: {
      members: {
        include: {
          team: true,
          fieldReports: true,
          salesTargets: true,
          favoriteProducts: {
            include: {
              product: {
                include: {
                  variantOptions: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!team) {
    return null;
  }

  return mapSalesTeam(team);
};

const createSalesAgent = async (args: {
  userId: number;
  input: {
    name: string;
    email: string;
    phone: string;
    role: string;
    status: string;
    avatar?: string | null;
    territory?: string | null;
    bio?: string | null;
    sex?: string | null;
    teamId?: string | null;
    fieldReports?: Array<{
      date: string;
      location?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      activities?: Record<string, unknown> | null;
      notes?: string | null;
    }> | null;
    salesTargets?: Array<{
      period: string;
      goal: number;
      achieved?: number | null;
      unitsSold?: number | null;
    }> | null;
    favoriteProductIds?: number[] | null;
  };
}) => {
  const { userId, input } = args;

  if (!input.name || !input.email || !input.phone || !input.role) {
    throw new Error('Missing required fields: name, email, phone, role');
  }

  // Check if email already exists
  const salesAgent = getSalesAgentModel();
  const existingAgent = await salesAgent.findUnique({
    where: { email: input.email },
  });

  if (existingAgent) {
    throw new Error('Sales agent with this email already exists');
  }

  const agent = await prisma.$transaction(async (tx) => {
    const salesAgentModel = (tx as unknown as Record<string, unknown>).salesAgent;
    if (!salesAgentModel || typeof salesAgentModel !== 'object' || !('create' in salesAgentModel)) {
      throw new Error('SalesAgent model not available in transaction. Please run: npx prisma generate and restart the server.');
    }
    const createdAgent = await (salesAgentModel as { create: (args: unknown) => Promise<SalesAgentModel> }).create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
        status: input.status || 'active',
        avatar: input.avatar,
        territory: input.territory,
        bio: input.bio,
        sex: input.sex,
        teamId: input.teamId,
        userId,
        fieldReports: input.fieldReports
          ? {
              create: input.fieldReports.map((fr) => ({
                date: new Date(fr.date),
                location: fr.location,
                startTime: fr.startTime,
                endTime: fr.endTime,
                activities: fr.activities || null,
                notes: fr.notes,
              })),
            }
          : undefined,
        salesTargets: input.salesTargets
          ? {
              create: input.salesTargets.map((st) => ({
                period: st.period,
                goal: st.goal,
                achieved: st.achieved || 0,
                unitsSold: st.unitsSold || 0,
              })),
            }
          : undefined,
      },
    });

    // Create favorite products if provided
    if (input.favoriteProductIds && input.favoriteProductIds.length > 0) {
        await getFavoriteProductModel(tx).createMany({
        data: input.favoriteProductIds.map((productId) => ({
          salesAgentId: createdAgent.id,
          productId,
        })),
        skipDuplicates: true,
      });
    }

    return createdAgent;
  });

  const agentWithRelations = await (prisma as unknown as { salesAgent: { findUnique: (args: unknown) => Promise<SalesAgentModel | null> } }).salesAgent.findUnique({
    where: { id: agent.id },
    include: {
      team: true,
      fieldReports: true,
      salesTargets: true,
      favoriteProducts: {
        include: {
          product: {
            include: {
              variantOptions: true,
            },
          },
        },
      },
    },
  });

  if (!agentWithRelations) {
    throw new Error('Failed to fetch created sales agent');
  }

  return mapSalesAgent(agentWithRelations);
};

const updateSalesAgent = async (args: {
  userId: number;
  input: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    status?: string | null;
    avatar?: string | null;
    territory?: string | null;
    bio?: string | null;
    sex?: string | null;
    teamId?: string | null;
    fieldReports?: Array<{
      id?: string | null;
      date: string;
      location?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      activities?: Record<string, unknown> | null;
      notes?: string | null;
    }> | null;
    salesTargets?: Array<{
      id?: string | null;
      period: string;
      goal: number;
      achieved?: number | null;
      unitsSold?: number | null;
    }> | null;
    favoriteProductIds?: number[] | null;
  };
}) => {
  const { userId, input } = args;

  const salesAgent = getSalesAgentModel();
  const existingAgent = await salesAgent.findFirst({
    where: {
      id: input.id,
      userId,
    },
  });

  if (!existingAgent) {
    throw new Error('Sales agent not found or you do not have permission to update it');
  }

  // Check email uniqueness if email is being updated
  if (input.email && input.email !== existingAgent.email) {
    const salesAgent = getSalesAgentModel();
    const emailExists = await salesAgent.findUnique({
      where: { email: input.email },
    });

    if (emailExists) {
      throw new Error('Sales agent with this email already exists');
    }
  }

  const updatedAgent = await prisma.$transaction(async (tx) => {
    // Update basic fields
    const updateData: Record<string, unknown> = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.role !== undefined) updateData.role = input.role;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.avatar !== undefined) updateData.avatar = input.avatar;
    if (input.territory !== undefined) updateData.territory = input.territory;
    if (input.bio !== undefined) updateData.bio = input.bio;
    if (input.sex !== undefined) updateData.sex = input.sex;
    if (input.teamId !== undefined) updateData.teamId = input.teamId;

    const salesAgentModel = (tx as unknown as Record<string, unknown>).salesAgent;
    if (!salesAgentModel || typeof salesAgentModel !== 'object' || !('update' in salesAgentModel)) {
      throw new Error('SalesAgent model not available in transaction. Please run: npx prisma generate and restart the server.');
    }
    const agent = await (salesAgentModel as { update: (args: unknown) => Promise<SalesAgentModel> }).update({
      where: { id: input.id },
      data: updateData,
    });

    // Update field reports
    if (input.fieldReports !== undefined) {
      // Delete existing reports
      await getFieldReportModel(tx).deleteMany({
        where: { salesAgentId: input.id },
      });

      // Create new reports
      if (input.fieldReports && input.fieldReports.length > 0) {
        await getFieldReportModel(tx).createMany({
          data: input.fieldReports.map((fr) => ({
            salesAgentId: input.id,
            date: new Date(fr.date),
            location: fr.location,
            startTime: fr.startTime,
            endTime: fr.endTime,
            activities: fr.activities || null,
            notes: fr.notes,
          })),
        });
      }
    }

    // Update sales targets
    if (input.salesTargets !== undefined) {
      // Delete existing targets
      await getSalesTargetModel(tx).deleteMany({
        where: { salesAgentId: input.id },
      } as never);

      // Create new targets
      if (input.salesTargets && input.salesTargets.length > 0) {
        await getSalesTargetModel(tx).createMany({
          data: input.salesTargets.map((st) => ({
            salesAgentId: input.id,
            period: st.period,
            goal: st.goal,
            achieved: st.achieved || 0,
            unitsSold: st.unitsSold || 0,
          })),
        });
      }
    }

    // Update favorite products
    if (input.favoriteProductIds !== undefined) {
      // Delete existing favorites
      await getFavoriteProductModel(tx).deleteMany({
        where: { salesAgentId: input.id },
      });

      // Create new favorites
      if (input.favoriteProductIds && input.favoriteProductIds.length > 0) {
        await getFavoriteProductModel(tx).createMany({
          data: input.favoriteProductIds.map((productId: number) => ({
            salesAgentId: input.id,
            productId,
          })),
          skipDuplicates: true,
        });
      }
    }

    return agent;
  });

  const agentWithRelations = await (prisma as unknown as { salesAgent: { findUnique: (args: unknown) => Promise<SalesAgentModel | null> } }).salesAgent.findUnique({
    where: { id: updatedAgent.id },
    include: {
      team: true,
      fieldReports: true,
      salesTargets: true,
      favoriteProducts: {
        include: {
          product: {
            include: {
              variantOptions: true,
            },
          },
        },
      },
    },
  });

  if (!agentWithRelations) {
    throw new Error('Failed to fetch updated sales agent');
  }

  return mapSalesAgent(agentWithRelations);
};

const deleteSalesAgent = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  const agent = await (prisma as unknown as { salesAgent: { findFirst: (args: unknown) => Promise<SalesAgentModel | null> } }).salesAgent.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!agent) {
    throw new Error('Sales agent not found or you do not have permission to delete it');
  }

  const salesAgent = getSalesAgentModel();
  await salesAgent.delete({
    where: { id },
  });

  return {
    success: true,
    deleted: mapSalesAgent(agent as SalesAgentModel),
  };
};

const createSalesTeam = async (args: {
  userId: number;
  input: {
    name: string;
    memberIds: string[];
  };
}) => {
  const { userId, input } = args;

  if (!input.name || !input.memberIds || input.memberIds.length === 0) {
    throw new Error('Missing required fields: name, memberIds');
  }

  // Verify all member IDs exist and belong to the user
  const members = await (prisma as unknown as { salesAgent: { findMany: (args: unknown) => Promise<SalesAgentModel[]> } }).salesAgent.findMany({
    where: {
      id: { in: input.memberIds },
      userId,
    },
  });

  if (members.length !== input.memberIds.length) {
    throw new Error('One or more member IDs are invalid or do not belong to you');
  }

  const team = await prisma.$transaction(async (tx) => {
      const salesTeamModel = (tx as unknown as Record<string, unknown>).salesTeam;
      if (!salesTeamModel || typeof salesTeamModel !== 'object' || !('create' in salesTeamModel)) {
        throw new Error('SalesTeam model not available in transaction. Please run: npx prisma generate and restart the server.');
      }
      const createdTeam = await (salesTeamModel as { create: (args: unknown) => Promise<SalesTeamModel> }).create({
      data: {
        name: input.name,
        userId,
      },
    });

    // Update members to belong to this team
    const salesAgentModel = (tx as unknown as Record<string, unknown>).salesAgent;
    if (!salesAgentModel || typeof salesAgentModel !== 'object' || !('updateMany' in salesAgentModel)) {
      throw new Error('SalesAgent model not available in transaction. Please run: npx prisma generate and restart the server.');
    }
    await (salesAgentModel as { updateMany: (args: unknown) => Promise<{ count: number }> }).updateMany({
      where: {
        id: { in: input.memberIds },
        userId,
      },
      data: {
        teamId: createdTeam.id,
      },
    });

    return createdTeam;
  });

  const salesTeam = getSalesTeamModel();
  const teamWithRelations = await salesTeam.findUnique({
    where: { id: team.id },
    include: {
      members: {
        include: {
          team: true,
          fieldReports: true,
          salesTargets: true,
          favoriteProducts: {
            include: {
              product: {
                include: {
                  variantOptions: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!teamWithRelations) {
    throw new Error('Failed to fetch created sales team');
  }

  return mapSalesTeam(teamWithRelations);
};

const updateSalesTeam = async (args: {
  userId: number;
  input: {
    id: string;
    name?: string | null;
    memberIds?: string[] | null;
  };
}) => {
  const { userId, input } = args;

  const salesTeamModel = getSalesTeamModel();
  const existingTeam = await salesTeamModel.findFirst({
    where: {
      id: input.id,
      userId,
    },
  });

  if (!existingTeam) {
    throw new Error('Sales team not found or you do not have permission to update it');
  }

  const updatedTeam = await prisma.$transaction(async (tx) => {
    // Update team name if provided
    if (input.name !== undefined) {
      await (tx as unknown as { salesTeam: { update: (args: unknown) => Promise<SalesTeamModel> } }).salesTeam.update({
        where: { id: input.id },
        data: { name: input.name },
      });
    }

    // Update members if provided
    if (input.memberIds !== undefined) {
      // Remove all current members from this team
      await (tx as unknown as { salesAgent: { updateMany: (args: unknown) => Promise<{ count: number }> } }).salesAgent.updateMany({
        where: {
          teamId: input.id,
          userId,
        },
        data: {
          teamId: null,
        },
      });

      // Verify all new member IDs exist and belong to the user
      if (input.memberIds && input.memberIds.length > 0) {
        const members = await (tx as unknown as { salesAgent: { findMany: (args: unknown) => Promise<SalesAgentModel[]> } }).salesAgent.findMany({
          where: {
            id: { in: input.memberIds },
            userId,
          },
        });

        if (members.length !== input.memberIds.length) {
          throw new Error('One or more member IDs are invalid or do not belong to you');
        }

        // Add new members to this team
        await (tx as unknown as { salesAgent: { updateMany: (args: unknown) => Promise<{ count: number }> } }).salesAgent.updateMany({
          where: {
            id: { in: input.memberIds },
            userId,
          },
          data: {
            teamId: input.id,
          },
        });
      }
    }

    return existingTeam;
  });

  const teamWithRelations = await salesTeamModel.findUnique({
    where: { id: updatedTeam.id },
    include: {
      members: {
        include: {
          team: true,
          fieldReports: true,
          salesTargets: true,
          favoriteProducts: {
            include: {
              product: {
                include: {
                  variantOptions: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!teamWithRelations) {
    throw new Error('Failed to fetch updated sales team');
  }

  return mapSalesTeam(teamWithRelations);
};

const deleteSalesTeam = async (args: { userId: number; id: string }) => {
  const { userId, id } = args;

  const salesTeam = getSalesTeamModel();
  const team = await salesTeam.findFirst({
    where: {
      id,
      userId,
    },
    include: {
      members: true,
    },
  });

  if (!team) {
    throw new Error('Sales team not found or you do not have permission to delete it');
  }

  await prisma.$transaction(async (tx) => {
    // Remove all members from this team
    const salesAgentModel = (tx as unknown as Record<string, unknown>).salesAgent;
    if (!salesAgentModel || typeof salesAgentModel !== 'object' || !('updateMany' in salesAgentModel)) {
      throw new Error('SalesAgent model not available in transaction. Please run: npx prisma generate and restart the server.');
    }
    await (salesAgentModel as { updateMany: (args: unknown) => Promise<{ count: number }> }).updateMany({
      where: {
        teamId: id,
        userId,
      },
      data: {
        teamId: null,
      },
    });

    // Delete the team
    const salesTeamModel = (tx as unknown as Record<string, unknown>).salesTeam;
    if (!salesTeamModel || typeof salesTeamModel !== 'object' || !('delete' in salesTeamModel)) {
      throw new Error('SalesTeam model not available in transaction. Please run: npx prisma generate and restart the server.');
    }
    await (salesTeamModel as { delete: (args: unknown) => Promise<SalesTeamModel> }).delete({
      where: { id },
    });
  });

  return {
    success: true,
    deleted: mapSalesTeam(team),
  };
};

// ============================================================================ //
// RESOLVERS
// ============================================================================ //

export const salesResolvers = {
  Query: {
    salesAgents: async (_: unknown, args: {
      userId: number;
      page?: number;
      limit?: number;
      search?: string | null;
      role?: string | null;
      status?: string | null;
      teamId?: string | null;
    }) => {
      return fetchSalesAgentsConnection(args);
    },
    salesAgent: async (_: unknown, args: { userId: number; id: string }) => {
      return fetchSingleSalesAgent(args);
    },
    salesTeams: async (_: unknown, args: {
      userId: number;
      page?: number;
      limit?: number;
      search?: string | null;
    }) => {
      return fetchSalesTeamsConnection(args);
    },
    salesTeam: async (_: unknown, args: { userId: number; id: string }) => {
      return fetchSingleSalesTeam(args);
    },
  },
  Mutation: {
    createSalesAgent: async (_: unknown, args: {
      userId: number;
      input: {
        name: string;
        email: string;
        phone: string;
        role: string;
        status: string;
        avatar?: string | null;
        territory?: string | null;
        bio?: string | null;
        sex?: string | null;
        teamId?: string | null;
        fieldReports?: Array<{
          date: string;
          location?: string | null;
          startTime?: string | null;
          endTime?: string | null;
          activities?: Record<string, unknown> | null;
          notes?: string | null;
        }> | null;
        salesTargets?: Array<{
          period: string;
          goal: number;
          achieved?: number | null;
          unitsSold?: number | null;
        }> | null;
        favoriteProductIds?: number[] | null;
      };
    }) => {
      return createSalesAgent(args);
    },
    updateSalesAgent: async (_: unknown, args: {
      userId: number;
      input: {
        id: string;
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        role?: string | null;
        status?: string | null;
        avatar?: string | null;
        territory?: string | null;
        bio?: string | null;
        sex?: string | null;
        teamId?: string | null;
        fieldReports?: Array<{
          id?: string | null;
          date: string;
          location?: string | null;
          startTime?: string | null;
          endTime?: string | null;
          activities?: Record<string, unknown> | null;
          notes?: string | null;
        }> | null;
        salesTargets?: Array<{
          id?: string | null;
          period: string;
          goal: number;
          achieved?: number | null;
          unitsSold?: number | null;
        }> | null;
        favoriteProductIds?: number[] | null;
      };
    }) => {
      return updateSalesAgent(args);
    },
    deleteSalesAgent: async (_: unknown, args: { userId: number; id: string }) => {
      return deleteSalesAgent(args);
    },
    createSalesTeam: async (_: unknown, args: {
      userId: number;
      input: {
        name: string;
        memberIds: string[];
      };
    }) => {
      return createSalesTeam(args);
    },
    updateSalesTeam: async (_: unknown, args: {
      userId: number;
      input: {
        id: string;
        name?: string | null;
        memberIds?: string[] | null;
      };
    }) => {
      return updateSalesTeam(args);
    },
    deleteSalesTeam: async (_: unknown, args: { userId: number; id: string }) => {
      return deleteSalesTeam(args);
    },
  },
};
