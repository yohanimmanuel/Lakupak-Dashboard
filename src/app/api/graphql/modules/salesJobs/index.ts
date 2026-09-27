import { withDashboardAuth } from '../common/auth';
import {
  completeSalesJob,
  createManualSalesJob,
  createSalesJobs,
  getSalesJobSettings,
  listSalesJobOrders,
  listSalesJobs,
  listUnresolvedSalesJobs,
  reviewSalesJob,
  salesJobDayAggregates,
  updateSalesJobSettings,
} from '@/lib/salesJobs/service';
import { suggestSalesJobsForDistributor } from '@/lib/salesJobs/suggest';
import { readCompletion } from '@/lib/salesJobs/completion';
import { prisma } from '@/lib/db';

export const salesJobsTypeDefs = /* GraphQL */ `
  type SalesJobCompletion {
    order_placed: Boolean!
    order_amount: Float
    payment_collected: Boolean!
    payment_amount: Float
    stock_checked: Boolean!
    products_demoed: Int!
    notes: String!
  }

  type SalesJob {
    id: String!
    assignedTo: String!
    agentName: String!
    agentPhone: String!
    agentRole: String!
    clientId: String!
    clientName: String!
    clientOwner: String!
    clientPhone: String!
    clientAddress: String!
    clientStatus: String!
    jobType: String!
    priorityReason: String
    suggestedProducts: [String!]!
    createdBy: String!
    status: String!
    scheduledDate: String!
    completionNotes: String
    completionData: SalesJobCompletion!
    suggestedProductNames: [String!]!
    orderId: String
    schedules: [SalesJobSchedule!]!
    dispatchNote: String
    dispatchedAt: String
    completedAt: String
  }

  type SalesJobSchedule {
    date: String!
    reminderTime: String!
  }

  type SalesJobOrderOption {
    orderId: String!
    storeName: String!
    contactPerson: String!
    buyerId: String
    orderStatus: String!
    paymentStatus: String!
    totalAmount: Float!
    orderDate: String!
  }

  type SalesJobDayAggregate {
    date: String!
    visits: Int!
    customersMet: Int!
    productsDemonstrated: Int!
    salesMade: Float!
  }

  type SalesJobSettings {
    dispatchHour: Int!
    dispatchMinute: Int!
    unresolvedCutoffHour: Int!
    timezone: String!
  }

  type SalesJobOptionAgent {
    id: String!
    name: String!
    role: String!
    status: String!
  }

  type SalesJobOptionClient {
    buyerId: String!
    storeName: String!
    owner: String!
    phone: String!
    status: String!
  }

  type SalesJobFormOptions {
    agents: [SalesJobOptionAgent!]!
    clients: [SalesJobOptionClient!]!
  }

  type SuggestSalesJobsResult {
    created: Int!
  }

  input SalesJobScheduleInput {
    scheduledDate: String!
    reminderHour: Int!
    reminderMinute: Int!
  }

  input SalesJobProspectInput {
    customerNumber: String!
    name: String!
    storeName: String!
    phone: String!
    address: String!
  }

  input CreateSalesJobItemInput {
    jobType: String!
    priorityReason: String
    clientId: String
    orderId: String
    orderIds: [String!]
    productIds: [String!]
    prospect: SalesJobProspectInput
    schedules: [SalesJobScheduleInput!]!
  }

  input SalesJobCompletionInput {
    order_placed: Boolean!
    order_amount: Float
    payment_collected: Boolean!
    payment_amount: Float
    stock_checked: Boolean!
    products_demoed: Int!
    notes: String
  }

  extend type Query {
    salesJobs(userId: Int!, status: String, assignedTo: String, date: String): [SalesJob!]!
    unresolvedSalesJobs(userId: Int!): [SalesJob!]!
    salesJobDayAggregates(userId: Int!, agentId: String!): [SalesJobDayAggregate!]!
    salesJobSettings(userId: Int!): SalesJobSettings!
    salesJobFormOptions(userId: Int!): SalesJobFormOptions!
    salesJobOrders(userId: Int!, purpose: String!, search: String): [SalesJobOrderOption!]!
  }

  extend type Mutation {
    suggestSalesJobs(userId: Int!): SuggestSalesJobsResult!
    createSalesJobs(userId: Int!, assignedTo: String!, jobs: [CreateSalesJobItemInput!]!): [SalesJob!]!
    createSalesJob(
      userId: Int!
      assignedTo: String!
      clientId: String!
      jobType: String!
      scheduledDate: String!
      priorityReason: String
      suggestedProducts: [String!]
    ): SalesJob!
    reviewSalesJob(
      userId: Int!
      id: String!
      action: String!
      clientId: String
      jobType: String
      scheduledDate: String
      suggestedProducts: [String!]
      priorityReason: String
    ): SalesJob!
    completeSalesJob(userId: Int!, id: String!, completion: SalesJobCompletionInput!): SalesJob!
    updateSalesJobSettings(
      userId: Int!
      dispatchHour: Int!
      dispatchMinute: Int!
      unresolvedCutoffHour: Int!
    ): SalesJobSettings!
  }
`;

async function formOptions(userId: number) {
  const [agents, clients] = await Promise.all([
    prisma.salesAgent.findMany({
      where: { userId, status: 'active' },
      select: { id: true, name: true, role: true, status: true },
      orderBy: { name: 'asc' },
    }),
    prisma.buyer.findMany({
      where: { userId, status: { in: ['Prospect', 'Active', 'Inactive'] } },
      select: { buyerId: true, storeName: true, owner: true, phone: true, status: true },
      orderBy: { storeName: 'asc' },
      take: 500,
    }),
  ]);
  return { agents, clients };
}

export const salesJobsResolvers = {
  Query: {
    salesJobs: withDashboardAuth(async (args: { userId: number; status?: string | null; assignedTo?: string | null; date?: string | null }) =>
      listSalesJobs({
        distributorId: args.userId,
        status: args.status,
        assignedTo: args.assignedTo,
        date: args.date,
      }),
    ),
    unresolvedSalesJobs: withDashboardAuth(async (args: { userId: number }) => listUnresolvedSalesJobs(args.userId)),
    salesJobDayAggregates: withDashboardAuth(async (args: { userId: number; agentId: string }) =>
      salesJobDayAggregates(args.userId, args.agentId),
    ),
    salesJobSettings: withDashboardAuth(async (args: { userId: number }) => getSalesJobSettings(args.userId)),
    salesJobFormOptions: withDashboardAuth(async (args: { userId: number }) => formOptions(args.userId)),
    salesJobOrders: withDashboardAuth(async (args: { userId: number; purpose: string; search?: string | null }) =>
      listSalesJobOrders({ distributorId: args.userId, purpose: args.purpose, search: args.search }),
    ),
  },
  Mutation: {
    suggestSalesJobs: withDashboardAuth(async (args: { userId: number }) => suggestSalesJobsForDistributor(args.userId)),
    createSalesJobs: withDashboardAuth(
      async (args: {
        userId: number;
        assignedTo: string;
        jobs: Parameters<typeof createSalesJobs>[0]['jobs'];
      }) => createSalesJobs({ distributorId: args.userId, assignedTo: args.assignedTo, jobs: args.jobs }),
    ),
    createSalesJob: withDashboardAuth(
      async (args: {
        userId: number;
        assignedTo: string;
        clientId: string;
        jobType: string;
        scheduledDate: string;
        priorityReason?: string | null;
        suggestedProducts?: string[] | null;
      }) =>
        createManualSalesJob({
          distributorId: args.userId,
          assignedTo: args.assignedTo,
          clientId: args.clientId,
          jobType: args.jobType,
          scheduledDate: args.scheduledDate,
          priorityReason: args.priorityReason,
          suggestedProducts: args.suggestedProducts,
        }),
    ),
    reviewSalesJob: withDashboardAuth(
      async (args: {
        userId: number;
        id: string;
        action: string;
        clientId?: string | null;
        jobType?: string | null;
        scheduledDate?: string | null;
        suggestedProducts?: string[] | null;
        priorityReason?: string | null;
      }) =>
        reviewSalesJob({
          distributorId: args.userId,
          id: args.id,
          action: args.action === 'reject' ? 'reject' : 'approve',
          clientId: args.clientId,
          jobType: args.jobType,
          scheduledDate: args.scheduledDate,
          suggestedProducts: args.suggestedProducts,
          priorityReason: args.priorityReason,
        }),
    ),
    completeSalesJob: withDashboardAuth(
      async (args: { userId: number; id: string; completion: Parameters<typeof readCompletion>[0] }) => {
        const raw = args.completion;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const row = raw as Record<string, unknown>;
          for (const key of ['order_amount', 'payment_amount']) {
            if (row[key] == null || row[key] === '') continue;
            const amount = Number(row[key]);
            if (Number.isFinite(amount) && amount < 0) {
              throw new Error('Completion amounts cannot be negative');
            }
          }
        }
        const completion = readCompletion(args.completion);
        return completeSalesJob({ distributorId: args.userId, id: args.id, completion, notes: completion.notes });
      },
    ),
    updateSalesJobSettings: withDashboardAuth(
      async (args: { userId: number; dispatchHour: number; dispatchMinute: number; unresolvedCutoffHour: number }) =>
        updateSalesJobSettings({
          distributorId: args.userId,
          dispatchHour: args.dispatchHour,
          dispatchMinute: args.dispatchMinute,
          unresolvedCutoffHour: args.unresolvedCutoffHour,
        }),
    ),
  },
};
