import { withDashboardAuth } from '../common/auth';
import {
  completeSalesJob,
  createManualSalesJob,
  createSalesJobs,
  deleteSalesJobs,
  getSalesJobSettings,
  listSalesJobOrders,
  listSalesJobs,
  listUnresolvedSalesJobs,
  markSalesJobsPending,
  reviewSalesJob,
  salesJobDayAggregates,
  updateSalesJobSettings,
} from '@/lib/salesJobs/service';
import { suggestSalesJobsForDistributor } from '@/lib/salesJobs/suggest';
import {
  createSalesProspect,
  deleteSalesProspects,
  getSalesProspect,
  listSalesProspects,
  updateSalesProspect,
} from '@/lib/salesJobs/prospects';
import { prisma } from '@/lib/db';

export const salesJobsTypeDefs = /* GraphQL */ `
  type SalesJobReturnedItem {
    product_id: String!
    quantity: Int!
    reason: String!
  }

  type SalesJobStockCount {
    product_id: String!
    checked: Boolean!
    counted: Int
  }

  type SalesJobGivenCount {
    product_id: String!
    quantity: Int!
  }

  type SalesJobCompletion {
    order_placed: Boolean!
    order_amount: Float
    payment_collected: Boolean!
    payment_amount: Float
    stock_checked: Boolean!
    products_demoed: Int!
    notes: String!
    delivered: Boolean
    promoted: Boolean
    returned: Boolean
    product_given: Boolean
    stock_counts: [SalesJobStockCount!]
    items_returned: [SalesJobReturnedItem!]
    replacement_issued: Boolean
    replacement_value: Float
    competitor_name: String
    competitor_product: String
    observed_price: Float
    observed_promo: String
    shelf_share_observation: String
    product_id: String
    product_ids: [String!]
    display_setup_completed: Boolean
    samples_given: Int
    given_counts: [SalesJobGivenCount!]
    retailer_briefed: Boolean
    scheme_reference: String
    execution_confirmed: Boolean
    claim_amount: Float
  }

  type SalesJobLinkedClient {
    name: String!
    status: String!
  }

  type SalesJob {
    id: String!
    assignedTo: String!
    agentName: String!
    agentPhone: String!
    agentRole: String!
    clientId: String!
    clientCustomerNumber: String!
    clientName: String!
    clientOwner: String!
    clientPhone: String!
    clientAddress: String!
    clientStatus: String!
    linkedClients: [SalesJobLinkedClient!]!
    jobType: String!
    priorityReason: String
    suggestedProducts: [String!]!
    createdBy: String!
    status: String!
    scheduledDate: String!
    createdAt: String!
    updatedAt: String!
    listGroupId: String!
    completionNotes: String
    completionData: SalesJobCompletion!
    suggestedProductNames: [String!]!
    orderId: String
    orderIds: [String!]!
    clientIds: [String!]!
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
    id: String
    jobType: String!
    priorityReason: String
    clientId: String
    clientIds: [String!]
    orderId: String
    orderIds: [String!]
    productIds: [String!]
    prospect: SalesJobProspectInput
    schedules: [SalesJobScheduleInput!]!
  }

  input SalesJobReturnedItemInput {
    product_id: String!
    quantity: Int!
    reason: String!
  }

  input SalesJobGivenCountInput {
    product_id: String!
    quantity: Int!
  }

  input SalesJobStockCountInput {
    product_id: String!
    checked: Boolean!
    counted: Int
  }

  input SalesJobCompletionInput {
    order_placed: Boolean!
    order_amount: Float
    payment_collected: Boolean!
    payment_amount: Float
    stock_checked: Boolean!
    products_demoed: Int!
    notes: String
    delivered: Boolean
    promoted: Boolean
    returned: Boolean
    product_given: Boolean
    stock_counts: [SalesJobStockCountInput!]
    items_returned: [SalesJobReturnedItemInput!]
    replacement_issued: Boolean
    replacement_value: Float
    competitor_name: String
    competitor_product: String
    observed_price: Float
    observed_promo: String
    shelf_share_observation: String
    product_id: String
    product_ids: [String!]
    display_setup_completed: Boolean
    samples_given: Int
    given_counts: [SalesJobGivenCountInput!]
    retailer_briefed: Boolean
    scheme_reference: String
    execution_confirmed: Boolean
    claim_amount: Float
  }

  type SalesProspect {
    buyerId: String!
    customerNumber: String!
    owner: String!
    storeName: String!
    phone: String!
    address: String!
    region: String!
    buyerType: String!
    notes: String!
    status: String!
  }

  type DeleteSalesProspectsResult {
    deleted: Int!
    skipped: Int!
  }

  extend type Query {
    salesProspects(userId: Int!): [SalesProspect!]!
    salesProspect(userId: Int!, buyerId: String!): SalesProspect
    salesJobs(userId: Int!, status: String, assignedTo: String, date: String): [SalesJob!]!
    unresolvedSalesJobs(userId: Int!): [SalesJob!]!
    salesJobDayAggregates(userId: Int!, agentId: String!): [SalesJobDayAggregate!]!
    salesJobSettings(userId: Int!): SalesJobSettings!
    salesJobFormOptions(userId: Int!): SalesJobFormOptions!
    salesJobOrders(userId: Int!, purpose: String!, search: String): [SalesJobOrderOption!]!
  }

  extend type Mutation {
    createSalesProspect(
      userId: Int!
      customerNumber: String!
      name: String!
      storeName: String!
      phone: String!
      address: String!
      region: String
      buyerType: String
      notes: String
    ): SalesProspect!
    updateSalesProspect(
      userId: Int!
      buyerId: String!
      customerNumber: String!
      name: String!
      storeName: String!
      phone: String!
      address: String!
      region: String
      buyerType: String
      notes: String
    ): SalesProspect!
    deleteSalesProspects(userId: Int!, buyerIds: [String!]!): DeleteSalesProspectsResult!
    suggestSalesJobs(userId: Int!): SuggestSalesJobsResult!
    createSalesJobs(userId: Int!, assignedTo: String!, jobs: [CreateSalesJobItemInput!]!, timeZone: String): [SalesJob!]!
    updateSalesJobs(userId: Int!, assignedTo: String!, replaceIds: [String!]!, jobs: [CreateSalesJobItemInput!]!, timeZone: String): [SalesJob!]!
    deleteSalesJobs(userId: Int!, ids: [String!]!): Int!
    markSalesJobsPending(userId: Int!, ids: [String!]!): Int!
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
    salesProspects: withDashboardAuth(async (args: { userId: number }) => listSalesProspects(args.userId)),
    salesProspect: withDashboardAuth(async (args: { userId: number; buyerId: string }) =>
      getSalesProspect(args.userId, args.buyerId),
    ),
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
    createSalesProspect: withDashboardAuth(
      async (args: {
        userId: number;
        customerNumber: string;
        name: string;
        storeName: string;
        phone: string;
        address: string;
        region?: string | null;
        buyerType?: string | null;
        notes?: string | null;
      }) => createSalesProspect(args.userId, args),
    ),
    updateSalesProspect: withDashboardAuth(
      async (args: {
        userId: number;
        buyerId: string;
        customerNumber: string;
        name: string;
        storeName: string;
        phone: string;
        address: string;
        region?: string | null;
        buyerType?: string | null;
        notes?: string | null;
      }) => updateSalesProspect(args.userId, args.buyerId, args),
    ),
    deleteSalesProspects: withDashboardAuth(async (args: { userId: number; buyerIds: string[] }) =>
      deleteSalesProspects(args.userId, args.buyerIds),
    ),
    suggestSalesJobs: withDashboardAuth(async (args: { userId: number }) => suggestSalesJobsForDistributor(args.userId)),
    createSalesJobs: withDashboardAuth(
      async (args: {
        userId: number;
        assignedTo: string;
        jobs: Parameters<typeof createSalesJobs>[0]['jobs'];
        timeZone?: string | null;
      }) =>
        createSalesJobs({
          distributorId: args.userId,
          assignedTo: args.assignedTo,
          jobs: args.jobs,
          timeZone: args.timeZone,
        }),
    ),
    updateSalesJobs: withDashboardAuth(
      async (args: {
        userId: number;
        assignedTo: string;
        replaceIds: string[];
        jobs: Parameters<typeof createSalesJobs>[0]['jobs'];
        timeZone?: string | null;
      }) =>
        createSalesJobs({
          distributorId: args.userId,
          assignedTo: args.assignedTo,
          jobs: args.jobs,
          replaceIds: args.replaceIds,
          timeZone: args.timeZone,
        }),
    ),
    deleteSalesJobs: withDashboardAuth(async (args: { userId: number; ids: string[] }) =>
      deleteSalesJobs({ distributorId: args.userId, ids: args.ids }),
    ),
    markSalesJobsPending: withDashboardAuth(async (args: { userId: number; ids: string[] }) =>
      markSalesJobsPending({ distributorId: args.userId, ids: args.ids }),
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
    completeSalesJob: withDashboardAuth(async (args: { userId: number; id: string; completion: unknown }) =>
      completeSalesJob({ distributorId: args.userId, id: args.id, completion: args.completion }),
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
