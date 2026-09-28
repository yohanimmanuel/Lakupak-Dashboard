import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import { GraphQLError } from 'graphql';

import { baseTypeDefs, baseResolvers } from './modules/common/schema';
import { mergeTypeDefs } from './modules/common/mergeTypeDefs';
import { mergeResolvers } from './modules/common/mergeResolvers';

import { productsTypeDefs, productsResolvers } from './modules/products';
import { offersTypeDefs, offersResolvers } from './modules/offers';
import { ordersTypeDefs, ordersResolvers } from './modules/orders';
import { contactsTypeDefs, contactsResolvers } from './modules/contacts';
import { dashboardTypeDefs, dashboardResolvers } from './modules/dashboard';
import { userActivityTypeDefs, userActivityResolvers } from './modules/userActivity';
import { marketplaceTypeDefs, marketplaceResolvers } from './modules/marketplace';
import { salesTypeDefs, salesResolvers } from './modules/sales';
import { salesJobsTypeDefs, salesJobsResolvers } from './modules/salesJobs';
import { clientMatchingTypeDefs, clientMatchingResolvers } from './modules/clientMatching';
import { notificationsTypeDefs, notificationsResolvers } from './modules/notifications';
import { logisticsTypeDefs, logisticsResolvers } from './modules/logistics';
import { automationsTypeDefs, automationsResolvers } from './modules/automations';
import {
  resolveGraphQLUserFromAccessToken,
  resolveDashboardGraphQLUser,
  type GraphQLAuthContext,
} from './modules/common/auth';
import {
  offerCreationRateLimiter,
  offerUpdateRateLimiter,
  offerQueryRateLimiter,
  marketplaceSearchRateLimiter,
  cartOperationRateLimiter,
  userActivityRateLimiter,
  addressOperationRateLimiter,
  productCreationRateLimiter,
  productUpdateRateLimiter,
  productQueryRateLimiter,
  productBulkPublishRateLimiter,
  clientQueryRateLimiter,
  clientCreationRateLimiter,
  clientUpdateRateLimiter,
  orderCreationRateLimiter,
  orderUpdateRateLimiter,
  salesOperationRateLimiter,
  dashboardQueryRateLimiter,
  graphQLComplexityRateLimiter,
} from '@/utils/rateLimiter';

const typeDefs = mergeTypeDefs([
  baseTypeDefs,
  productsTypeDefs,
  offersTypeDefs,
  ordersTypeDefs,
  contactsTypeDefs,
  dashboardTypeDefs,
  userActivityTypeDefs,
  marketplaceTypeDefs,
  salesTypeDefs,
  salesJobsTypeDefs,
  clientMatchingTypeDefs,
  notificationsTypeDefs,
  logisticsTypeDefs,
  automationsTypeDefs,
]);

const resolvers = mergeResolvers([
  baseResolvers,
  productsResolvers,
  offersResolvers,
  ordersResolvers,
  contactsResolvers,
  dashboardResolvers,
  userActivityResolvers,
  marketplaceResolvers,
  salesResolvers,
  salesJobsResolvers,
  clientMatchingResolvers,
  notificationsResolvers,
  logisticsResolvers,
  automationsResolvers,
]);

const server = new ApolloServer({
  typeDefs,
  resolvers: resolvers as never,
  formatError: (error) => {
    // Handle JSON parsing errors
    if (error.message.includes('JSON') || error.message.includes('Unexpected end') || error.message.includes('Unexpected token')) {
      return {
        message: 'Invalid or empty request body',
        extensions: { code: 'BAD_REQUEST' },
      };
    }
    return error;
  },
});

const apolloHandler = startServerAndCreateNextHandler<NextRequest>(server, {
  context: async (req: NextRequest): Promise<GraphQLAuthContext> => {
    try {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        const payload = verifyAccessToken(token);

        if (payload.type === 'driver') {
          return { user: null };
        }

        const user = await resolveGraphQLUserFromAccessToken(payload);
        return { user };
      }
    } catch (e) {
      if (e instanceof GraphQLError && e.extensions?.code === 'ACCOUNT_SUSPENDED') throw e;
    }

    const { getServerSession } = await import('next-auth');
    const { authOptions } = await import('@/lib/auth-options');
    const session = await getServerSession(authOptions);
    const id = (session?.user as { id?: string | number } | undefined)?.id;
    if (id == null) return { user: null };
    const numId = typeof id === 'string' ? parseInt(id, 10) : Number(id);
    if (!Number.isInteger(numId) || numId <= 0) return { user: null };
    const dashboardId = await resolveDashboardGraphQLUser(numId);
    return dashboardId ? { user: { id: dashboardId, type: 'dashboard' } } : { user: null };
  },
});

/**
 * Extract authenticated user ID from JWT token
 */
function extractAuthenticatedUserId(request: NextRequest): number | null {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = verifyAccessToken(token);
    
    // Validate that sub is a positive integer
    if (typeof payload.sub === 'number' && payload.sub > 0 && Number.isInteger(payload.sub)) {
      return payload.sub;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract GraphQL operation details from a parsed POST body
 */
function extractGraphQLOperation(body: unknown): {
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
} | null {
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  if (typeof record.query !== 'string') return null;

  return {
    query: record.query,
    operationName: typeof record.operationName === 'string' ? record.operationName : undefined,
    variables:
      record.variables && typeof record.variables === 'object' && !Array.isArray(record.variables)
        ? (record.variables as Record<string, unknown>)
        : {},
  };
}

/** Rebuild a POST request for Apollo after the original body stream was consumed */
function createApolloRequest(request: NextRequest, parsedBody: unknown): NextRequest {
  return new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(parsedBody),
  });
}


/**
 * Determine operation type for rate limiting
 */
function getOperationType(query: string): 'query' | 'mutation' | 'unknown' {
  const trimmed = query.trim();
  const lowerTrimmed = trimmed.toLowerCase();
  if (lowerTrimmed.startsWith('query') || trimmed.startsWith('{')) return 'query';
  if (lowerTrimmed.startsWith('mutation')) return 'mutation';
  return 'unknown';
}

/**
 * Match exact GraphQL operation names using regex patterns
 * This ensures precise matching and prevents overlap between different rate limiters
 */

/**
 * Check if this is an offer-related operation
 * Matches: offers, offer, createOffer, updateOffer, deleteOffer
 */
function isOfferOperation(query: string): { isOffer: boolean; isCreate: boolean; isUpdate: boolean; isQuery: boolean } {
  const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase();
  
  // Match exact operation names
  const createOfferPattern = /\bcreateoffer\s*\(/;
  const updateOfferPattern = /\bupdateoffer\s*\(/;
  const deleteOfferPattern = /\bdeleteoffer\s*\(/;
  const offersQueryPattern = /\boffers\s*\(/;
  const offerQueryPattern = /\boffer\s*\(/;
  
  return {
    isOffer: createOfferPattern.test(normalizedQuery) || 
             updateOfferPattern.test(normalizedQuery) || 
             deleteOfferPattern.test(normalizedQuery) ||
             offersQueryPattern.test(normalizedQuery) ||
             offerQueryPattern.test(normalizedQuery),
    isCreate: createOfferPattern.test(normalizedQuery),
    isUpdate: updateOfferPattern.test(normalizedQuery) || deleteOfferPattern.test(normalizedQuery),
    isQuery: offersQueryPattern.test(normalizedQuery) || offerQueryPattern.test(normalizedQuery),
  };
}

/**
 * Check if this is a marketplace-related operation
 * Matches exact marketplace operation names
 */
function isMarketplaceOperation(query: string): { 
  isMarketplace: boolean; 
  isSearch: boolean; 
  isCart: boolean; 
  isActivity: boolean;
  isAddress: boolean;
  isUser: boolean;
  isOrders: boolean;
} {
  const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase();
  
  // Marketplace search queries
  const marketplaceProductsPattern = /\bmarketplaceproducts\s*\(/;
  const mobileMarketplaceProductsPattern = /\bmobilemarketplaceproducts\s*\(/;
  
  // Cart operations
  const addToCartPattern = /\baddtocart\s*\(/;
  const updateCartItemPattern = /\bupdatecartitem\s*\(/;
  const removeCartItemPattern = /\bremovecartitem\s*\(/;
  const clearCartPattern = /\bclearcart\s*\(/;
  const mobileCartPattern = /\bmobilecart\s*\(/;
  
  // User activity operations
  const addUserActivityPattern = /\badduseractivity\s*\(/;
  const deleteUserActivityPattern = /\bdeleteuseractivity\s*\(/;
  const mobileUserActivityPattern = /\bmobileuseractivity\s*\(/;
  
  // Address operations
  const createMarketplaceAddressPattern = /\bcreatemarketplaceaddress\s*\(/;
  const updateMarketplaceAddressPattern = /\bupdatemarketplaceaddress\s*\(/;
  const deleteMarketplaceAddressPattern = /\bdeletemarketplaceaddress\s*\(/;
  const marketplaceAddressesPattern = /\bmarketplaceaddresses\s*\(/;
  
  // Other marketplace operations
  const marketplaceUserPattern = /\bmarketplaceuser\s*\(/;
  const updateMarketplaceUserPattern = /\bupdatemarketplaceuser\s*\(/;
  const mobileOrdersPattern = /\bmobileorders\s*\(/;
  
  const isSearch = marketplaceProductsPattern.test(normalizedQuery) || 
                   mobileMarketplaceProductsPattern.test(normalizedQuery);
  const isCart = addToCartPattern.test(normalizedQuery) ||
                 updateCartItemPattern.test(normalizedQuery) ||
                 removeCartItemPattern.test(normalizedQuery) ||
                 clearCartPattern.test(normalizedQuery) ||
                 mobileCartPattern.test(normalizedQuery);
  const isActivity = addUserActivityPattern.test(normalizedQuery) ||
                     deleteUserActivityPattern.test(normalizedQuery) ||
                     mobileUserActivityPattern.test(normalizedQuery);
  const isAddress = createMarketplaceAddressPattern.test(normalizedQuery) ||
                    updateMarketplaceAddressPattern.test(normalizedQuery) ||
                    deleteMarketplaceAddressPattern.test(normalizedQuery) ||
                    marketplaceAddressesPattern.test(normalizedQuery);
  const isUser = marketplaceUserPattern.test(normalizedQuery) ||
                 updateMarketplaceUserPattern.test(normalizedQuery);
  const isOrders = mobileOrdersPattern.test(normalizedQuery);
  
  return {
    isMarketplace: isSearch || isCart || isActivity || isAddress || isUser || isOrders,
    isSearch,
    isCart,
    isActivity,
    isAddress,
    isUser,
    isOrders,
  };
}

/**
 * Check if this is a product-related operation (excluding marketplace products)
 * Matches: products, product, createProduct, updateProduct, deleteProduct, 
 *         publishMarketplaceProduct, bulkPublishMarketplaceProducts, etc.
 */
function isProductOperation(query: string): { 
  isProduct: boolean; 
  isCreate: boolean; 
  isUpdate: boolean;
  isDelete: boolean;
  isQuery: boolean;
  isBulkPublish: boolean;
  isPublish: boolean;
  isOtherMutation: boolean;
} {
  const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase();
  
  // Exclude marketplace product operations
  if (/\bmarketplaceproducts\b/.test(normalizedQuery) || 
      /\bmobilemarketplaceproducts\b/.test(normalizedQuery)) {
    return { isProduct: false, isCreate: false, isUpdate: false, isDelete: false, isQuery: false, isBulkPublish: false, isPublish: false, isOtherMutation: false };
  }
  
  // Product mutations
  const createProductPattern = /\bcreateproduct\s*\(/;
  const updateProductPattern = /\bupdateproduct\s*\(/;
  const deleteProductPattern = /\bdeleteproduct\s*\(/;
  const publishMarketplaceProductPattern = /\bpublishmarketplaceproduct\s*\(/;
  const bulkPublishMarketplaceProductsPattern = /\bbulkpublishmarketplaceproducts\s*\(/;
  const resetOriginalPricesPattern = /\bresetoriginalprices\s*\(/;
  const applyOffersToAllProductsPattern = /\bapplyofferstoallproducts\s*\(/;
  const forceUpdatePricesPattern = /\bforceupdateprices\s*\(/;
  const resetProductPricesPattern = /\bresetproductprices\s*\(/;
  
  // Product queries - match "products(" or "product(" (but not "marketplaceproducts" or "mobilemarketplaceproducts")
  const productsQueryPattern = /\bproducts\s*\(/;
  const productQueryPattern = /\bproduct\s*\(/;
  
  const isPublish = publishMarketplaceProductPattern.test(normalizedQuery);
  const isOtherMutation = resetOriginalPricesPattern.test(normalizedQuery) ||
                          applyOffersToAllProductsPattern.test(normalizedQuery) ||
                          forceUpdatePricesPattern.test(normalizedQuery) ||
                          resetProductPricesPattern.test(normalizedQuery);
  
  const isProduct = createProductPattern.test(normalizedQuery) ||
                    updateProductPattern.test(normalizedQuery) ||
                    deleteProductPattern.test(normalizedQuery) ||
                    publishMarketplaceProductPattern.test(normalizedQuery) ||
                    bulkPublishMarketplaceProductsPattern.test(normalizedQuery) ||
                    resetOriginalPricesPattern.test(normalizedQuery) ||
                    applyOffersToAllProductsPattern.test(normalizedQuery) ||
                    forceUpdatePricesPattern.test(normalizedQuery) ||
                    resetProductPricesPattern.test(normalizedQuery) ||
                    productsQueryPattern.test(normalizedQuery) ||
                    productQueryPattern.test(normalizedQuery);
  
  return {
    isProduct,
    isCreate: createProductPattern.test(normalizedQuery),
    isUpdate: updateProductPattern.test(normalizedQuery),
    isDelete: deleteProductPattern.test(normalizedQuery),
    isQuery: productsQueryPattern.test(normalizedQuery) || productQueryPattern.test(normalizedQuery),
    isBulkPublish: bulkPublishMarketplaceProductsPattern.test(normalizedQuery),
    isPublish,
    isOtherMutation,
  };
}

/**
 * Check if this is a client-related operation (buyers/suppliers)
 * Matches: buyers, buyer, createBuyer, updateBuyer, deleteBuyer,
 *         suppliers, supplier, createSupplier, updateSupplier, deleteSupplier
 * Excludes: marketplace operations that might contain "buyer" or "supplier" in their data
 */
function isClientOperation(query: string): { 
  isClient: boolean; 
  isCreate: boolean; 
  isUpdate: boolean; 
  isQuery: boolean;
} {
  const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase();
  
  // Exclude marketplace operations by matching specific operation names
  const marketplaceOpPattern = /\b(marketplace\w*|mobile\w*)\s*\(/;
  if (marketplaceOpPattern.test(normalizedQuery)) {
    return { isClient: false, isCreate: false, isUpdate: false, isQuery: false };
  }
  
  // Buyer operations
  const buyersPattern = /\bbuyers\s*\(/;
  const buyerPattern = /\bbuyer\s*\(/;
  const createBuyerPattern = /\bcreatebuyer\s*\(/;
  const updateBuyerPattern = /\bupdatebuyer\s*\(/;
  const deleteBuyerPattern = /\bdeletebuyer\s*\(/;
  
  // Supplier operations
  const suppliersPattern = /\bsuppliers\s*\(/;
  const supplierPattern = /\bsupplier\s*\(/;
  const createSupplierPattern = /\bcreatesupplier\s*\(/;
  const updateSupplierPattern = /\bupdatesupplier\s*\(/;
  const deleteSupplierPattern = /\bdeletesupplier\s*\(/;
  
  const isCreate = createBuyerPattern.test(normalizedQuery) ||
                   createSupplierPattern.test(normalizedQuery);
  const isUpdate = updateBuyerPattern.test(normalizedQuery) ||
                   deleteBuyerPattern.test(normalizedQuery) ||
                   updateSupplierPattern.test(normalizedQuery) ||
                   deleteSupplierPattern.test(normalizedQuery);
  const isQuery = buyersPattern.test(normalizedQuery) ||
                  buyerPattern.test(normalizedQuery) ||
                  suppliersPattern.test(normalizedQuery) ||
                  supplierPattern.test(normalizedQuery);
  
  return {
    isClient: isCreate || isUpdate || isQuery,
    isCreate,
    isUpdate,
    isQuery,
  };
}

/**
 * Check if this is an order-related operation
 * Matches: orders, marketplaceOrders, createOrder, updateOrder
 */
function isOrderOperation(query: string): { 
  isOrder: boolean; 
  isQuery: boolean; 
  isCreate: boolean; 
  isUpdate: boolean;
} {
  const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase();
  
  const ordersPattern = /\borders\s*\(/;
  const marketplaceOrdersPattern = /\bmarketplaceorders\s*\(/;
  const createOrderPattern = /\bcreateorder\s*\(/;
  const updateOrderPattern = /\bupdateorder\s*\(/;
  
  return {
    isOrder: ordersPattern.test(normalizedQuery) || 
             marketplaceOrdersPattern.test(normalizedQuery) ||
             createOrderPattern.test(normalizedQuery) ||
             updateOrderPattern.test(normalizedQuery),
    isQuery: ordersPattern.test(normalizedQuery) || marketplaceOrdersPattern.test(normalizedQuery),
    isCreate: createOrderPattern.test(normalizedQuery),
    isUpdate: updateOrderPattern.test(normalizedQuery),
  };
}

/**
 * Check if this is a sales-related operation
 * Matches: salesAgents, salesAgent, createSalesAgent, updateSalesAgent, deleteSalesAgent,
 *         salesTeams, salesTeam, createSalesTeam, updateSalesTeam, deleteSalesTeam
 */
function isSalesOperation(query: string): boolean {
  const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase();
  
  const salesAgentsPattern = /\bsalesagents\s*\(/;
  const salesAgentPattern = /\bsalesagent\s*\(/;
  const createSalesAgentPattern = /\bcreatesalesagent\s*\(/;
  const updateSalesAgentPattern = /\bupdatesalesagent\s*\(/;
  const deleteSalesAgentPattern = /\bdeletesalesagent\s*\(/;
  const salesTeamsPattern = /\bsalesteams\s*\(/;
  const salesTeamPattern = /\bsalesteam\s*\(/;
  const createSalesTeamPattern = /\bcreatesalesteam\s*\(/;
  const updateSalesTeamPattern = /\bupdatesalesteam\s*\(/;
  const deleteSalesTeamPattern = /\bdeletesalesteam\s*\(/;
  const salesJobPattern = /\b(salesjobs|unresolvedsalesjobs|salesjobdayaggregates|salesjobsettings|salesjobformoptions|salesjoborders|suggestsalesjobs|createsalesjobs|createsalesjob|updatesalesjobs|deletesalesjobs|reviewsalesjob|completesalesjob|marksalesjobspending|updatesalesjobsettings|clientmatchcandidates|clientmatchpendingcount|clientmatchqueuecounts|clientmatchsettings|searchordersforclientmatch|resolveclientmatch|undoclientmatch|manualmergeclient|updateclientmatchsettings)\s*\(/;
  
  return salesAgentsPattern.test(normalizedQuery) ||
         salesJobPattern.test(normalizedQuery) ||
         salesAgentPattern.test(normalizedQuery) ||
         createSalesAgentPattern.test(normalizedQuery) ||
         updateSalesAgentPattern.test(normalizedQuery) ||
         deleteSalesAgentPattern.test(normalizedQuery) ||
         salesTeamsPattern.test(normalizedQuery) ||
         salesTeamPattern.test(normalizedQuery) ||
         createSalesTeamPattern.test(normalizedQuery) ||
         updateSalesTeamPattern.test(normalizedQuery) ||
         deleteSalesTeamPattern.test(normalizedQuery);
}

/**
 * Check if this is a dashboard-related operation
 * Matches: dashboardSnapshot
 */
function isDashboardOperation(query: string): boolean {
  const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase();
  
  const dashboardSnapshotPattern = /\bdashboardsnapshot\s*\(/;
  
  return dashboardSnapshotPattern.test(normalizedQuery);
}

// Wrapper to handle errors and rate limiting
async function handler(request: NextRequest) {
  try {
    const isPost = request.method === 'POST';
    let parsedBody: unknown = null;
    if (isPost) {
      try {
        parsedBody = await request.json();
      } catch {
        parsedBody = null;
      }
    }

    // Extract GraphQL operation details from the single body read (POST only)
    const operation = isPost ? extractGraphQLOperation(parsedBody) : null;
    
    if (operation) {
      const { query } = operation;
      
      // Extract authenticated user ID from JWT token only
      // Requests without valid JWT are treated as anonymous (no user-based rate limiting)
      // Resolvers must enforce authentication requirements for protected operations
      const userId = extractAuthenticatedUserId(request);
      
      // Set database security context for audit logging. Skip per-query Redis rate limiting
      // because GraphQL applies its own multi-tier route and complexity rate limiters below.
      await setDbSecurityContextFromRequest(request, userId, { skipRateLimit: true });
      
      // Apply GraphQL query complexity rate limiting FIRST (before other checks)
      const complexityCheck = await graphQLComplexityRateLimiter(request, query, userId);
      if (complexityCheck) {
        return complexityCheck;
      }
      
      // Determine operation type early for all operations
      const opType = getOperationType(query);
      
      // Check for product operations
      const productOp = isProductOperation(query);
      
      // Check for marketplace search operations (IP-based, applies to all users including anonymous)
      const marketplaceOp = isMarketplaceOperation(query);
      if (marketplaceOp.isSearch) {
        const rateLimitResponse = await marketplaceSearchRateLimiter(request);
        if (rateLimitResponse) {
          return NextResponse.json(
            { errors: [{ message: 'Too many marketplace searches. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
            { status: 429, headers: rateLimitResponse.headers }
          );
        }
      }
      
      // Apply product rate limiting (works with or without userId - uses IP if userId is null)
      if (productOp.isProduct) {
        // Bulk publish operations (highest priority check)
        if (opType === 'mutation' && productOp.isBulkPublish) {
          const rateLimitResponse = await productBulkPublishRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many bulk publish operations. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
        // Single product publish/unpublish operations
        else if (opType === 'mutation' && productOp.isPublish) {
          const rateLimitResponse = await productUpdateRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many product publish operations. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
        // Create product operations
        else if (opType === 'mutation' && productOp.isCreate) {
          const rateLimitResponse = await productCreationRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many products created. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
        // Update product operations
        else if (opType === 'mutation' && productOp.isUpdate) {
          const rateLimitResponse = await productUpdateRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many product updates. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
        // Delete product operations
        else if (opType === 'mutation' && productOp.isDelete) {
          const rateLimitResponse = await productUpdateRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many product deletions. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
        // Other product mutations (reset prices, apply offers, etc.)
        else if (opType === 'mutation' && productOp.isOtherMutation) {
          const rateLimitResponse = await productUpdateRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many product operations. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
        // Product queries
        else if (opType === 'query' && productOp.isQuery) {
          const rateLimitResponse = await productQueryRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many product queries. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
      }
      
      // Check for client operations (buyers/suppliers) (works with or without userId - uses IP if userId is null)
      const clientOp = isClientOperation(query);
      if (clientOp.isClient) {
        if (opType === 'mutation' && clientOp.isCreate) {
          const rateLimitResponse = await clientCreationRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many clients created. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        } else if (opType === 'mutation' && clientOp.isUpdate) {
          const rateLimitResponse = await clientUpdateRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many client updates. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        } else if (opType === 'query' && clientOp.isQuery) {
          const rateLimitResponse = await clientQueryRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many client queries. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
      }
      
      // Check for offer operations (works with or without userId - uses IP if userId is null)
      const offerOp = isOfferOperation(query);
      if (offerOp.isOffer) {
        if (opType === 'mutation' && offerOp.isCreate) {
          const rateLimitResponse = await offerCreationRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many offers created. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        } else if (opType === 'mutation' && offerOp.isUpdate) {
          const rateLimitResponse = await offerUpdateRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many offer updates. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        } else if (opType === 'query' && offerOp.isQuery) {
          const rateLimitResponse = await offerQueryRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many offer queries. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
      }
      
      // Check for sales operations (works with or without userId - uses IP if userId is null)
      if (isSalesOperation(query)) {
        const rateLimitResponse = await salesOperationRateLimiter(request, userId);
        if (rateLimitResponse) {
          return NextResponse.json(
            { errors: [{ message: 'Too many sales operations. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
            { status: 429, headers: rateLimitResponse.headers }
          );
        }
      }
      
      // Check for dashboard operations (works with or without userId - uses IP if userId is null)
      if (isDashboardOperation(query)) {
        const rateLimitResponse = await dashboardQueryRateLimiter(request, userId);
        if (rateLimitResponse) {
          return NextResponse.json(
            { errors: [{ message: 'Too many dashboard queries. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
            { status: 429, headers: rateLimitResponse.headers }
          );
        }
      }
      
      // Apply rate limiting based on operation type (only if we have a valid userId)
      if (userId) {
        // Check for marketplace operations (excluding search, which is handled above)
        // IMPORTANT: Only rate limit MUTATIONS (user actions), not queries (initialization/loading)
        if (marketplaceOp.isMarketplace && !marketplaceOp.isSearch) {
          // Cart operations: Only rate limit mutations (addToCart, updateCartItem, removeCartItem, clearCart)
          if (marketplaceOp.isCart && opType === 'mutation') {
            const rateLimitResponse = await cartOperationRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many cart operations. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          }
          // Activity operations: Only rate limit mutations (addUserActivity, deleteUserActivity)
          else if (marketplaceOp.isActivity && opType === 'mutation') {
            const rateLimitResponse = await userActivityRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many activity tracking requests. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          }
          // Address operations: Only rate limit mutations (createMarketplaceAddress, updateMarketplaceAddress, deleteMarketplaceAddress)
          else if (marketplaceOp.isAddress && opType === 'mutation') {
            const rateLimitResponse = await addressOperationRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many address operations. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          }
          // User operations: Only rate limit mutations (updateMarketplaceUser)
          else if (marketplaceOp.isUser && opType === 'mutation') {
            const rateLimitResponse = await addressOperationRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many marketplace user operations. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          }
          // Order queries: Don't rate limit (they're just loading data)
          // Note: mobileOrders is handled in order operations below
        }
        
        // Check for order operations
        // IMPORTANT: Only rate limit mutations (createOrder, updateOrder), not queries (loading orders)
        const orderOp = isOrderOperation(query);
        if (orderOp.isOrder) {
          if (opType === 'mutation' && orderOp.isCreate) {
            const rateLimitResponse = await orderCreationRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many orders created. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          } else if (opType === 'mutation' && orderOp.isUpdate) {
            const rateLimitResponse = await orderUpdateRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many order updates. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          }
          // Don't rate limit order queries - they're just loading data
        }
      }
    }
    
    const requestForApollo = isPost
      ? parsedBody !== null
        ? createApolloRequest(request, parsedBody)
        : new NextRequest(request.url, { method: 'POST', headers: request.headers, body: '' })
      : request;
    return await apolloHandler(requestForApollo);
  } catch (error) {
    // Handle JSON parsing errors that escape Apollo Server
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      error instanceof SyntaxError ||
      errorMessage.includes('JSON') ||
      errorMessage.includes('Unexpected end') ||
      errorMessage.includes('Unexpected token')
    ) {
      return NextResponse.json(
        { errors: [{ message: 'Invalid or empty request body' }] },
        { status: 400 }
      );
    }
    // Re-throw other errors
    throw error;
  }
}

export { handler as GET, handler as POST };

