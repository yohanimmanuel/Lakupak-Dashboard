import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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
import { campaignsTypeDefs, campaignsResolvers } from './modules/campaigns';
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
  campaignOperationRateLimiter,
  clientOperationRateLimiter
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
  campaignsTypeDefs,
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
  campaignsResolvers,
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

const apolloHandler = startServerAndCreateNextHandler<NextRequest>(server);

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
    const { verifyAccessToken } = require('@/lib/jwt');
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
 * Extract GraphQL operation details from request
 */
async function extractGraphQLOperation(request: NextRequest): Promise<{
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
} | null> {
  try {
    const clonedRequest = request.clone();
    const body = await clonedRequest.json();
    return {
      query: body.query || '',
      operationName: body.operationName,
      variables: body.variables || {},
    };
  } catch {
    return null;
  }
}


/**
 * Determine operation type for rate limiting
 */
function getOperationType(query: string): 'query' | 'mutation' | 'unknown' {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.startsWith('query') || trimmed.startsWith('{')) return 'query';
  if (trimmed.startsWith('mutation')) return 'mutation';
  return 'unknown';
}

/**
 * Check if this is an offer-related operation
 */
function isOfferOperation(query: string): { isOffer: boolean; isCreate: boolean; isUpdate: boolean; isQuery: boolean } {
  const lowerQuery = query.toLowerCase();
  
  return {
    isOffer: lowerQuery.includes('offer'),
    isCreate: lowerQuery.includes('createoffer'),
    isUpdate: lowerQuery.includes('updateoffer'),
    isQuery: lowerQuery.includes('offers(') || lowerQuery.includes('offer('),
  };
}

/**
 * Check if this is a marketplace-related operation
 */
function isMarketplaceOperation(query: string): { 
  isMarketplace: boolean; 
  isSearch: boolean; 
  isCart: boolean; 
  isActivity: boolean;
  isAddress: boolean;
} {
  const lowerQuery = query.toLowerCase();
  
  return {
    isMarketplace: lowerQuery.includes('marketplace') || lowerQuery.includes('mobile'),
    isSearch: lowerQuery.includes('marketplaceproducts') || lowerQuery.includes('mobilemarketplaceproducts'),
    isCart: lowerQuery.includes('cart') && (lowerQuery.includes('add') || lowerQuery.includes('update') || lowerQuery.includes('remove') || lowerQuery.includes('clear')),
    isActivity: lowerQuery.includes('adduseractivity') || lowerQuery.includes('deleteuseractivity'),
    isAddress: lowerQuery.includes('marketplaceaddress') && (lowerQuery.includes('create') || lowerQuery.includes('update') || lowerQuery.includes('delete')),
  };
}

/**
 * Check if this is a product-related operation
 */
function isProductOperation(query: string): { 
  isProduct: boolean; 
  isCreate: boolean; 
  isUpdate: boolean;
  isQuery: boolean;
  isBulkPublish: boolean;
} {
  const lowerQuery = query.toLowerCase();
  
  return {
    isProduct: lowerQuery.includes('product') && !lowerQuery.includes('marketplace'),
    isCreate: lowerQuery.includes('createproduct'),
    isUpdate: lowerQuery.includes('updateproduct'),
    isQuery: lowerQuery.includes('products(') || lowerQuery.includes('product('),
    isBulkPublish: lowerQuery.includes('bulkpublish'),
  };
}

/**
 * Check if this is a campaign-related operation
 */
function isCampaignOperation(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return lowerQuery.includes('campaign');
}

/**
 * Check if this is a client-related operation (buyers/suppliers)
 */
function isClientOperation(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return lowerQuery.includes('buyer') || lowerQuery.includes('supplier');
}

// Wrapper to handle errors and rate limiting
async function handler(request: NextRequest) {
  try {
    // Extract GraphQL operation details
    const operation = await extractGraphQLOperation(request);
    
    if (operation) {
      const { query, variables = {} } = operation;
      
      // Extract authenticated user ID from JWT token (primary source)
      let userId = extractAuthenticatedUserId(request);
      
      // Fall back to variables.userId if no authenticated user
      if (!userId) {
        const variableUserId = variables.userId as number | null | undefined;
        // Validate that variableUserId is a positive integer
        if (
          typeof variableUserId === 'number' && 
          variableUserId > 0 && 
          Number.isInteger(variableUserId)
        ) {
          userId = variableUserId;
        }
      }
      
      // Apply rate limiting based on operation type (only if we have a valid userId)
      if (userId) {
        const opType = getOperationType(query);
        
        // Check for product operations
        const productOp = isProductOperation(query);
        if (productOp.isProduct) {
          if (opType === 'mutation' && productOp.isBulkPublish) {
            const rateLimitResponse = await productBulkPublishRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many bulk publish operations. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          } else if (opType === 'mutation' && productOp.isCreate) {
            const rateLimitResponse = await productCreationRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many products created. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          } else if (opType === 'mutation' && productOp.isUpdate) {
            const rateLimitResponse = await productUpdateRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many product updates. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          } else if (opType === 'query' && productOp.isQuery) {
            const rateLimitResponse = await productQueryRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many product queries. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          }
        }
        
        // Check for campaign operations
        if (isCampaignOperation(query)) {
          const rateLimitResponse = await campaignOperationRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many campaign operations. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
        
        // Check for client operations (buyers/suppliers)
        if (isClientOperation(query)) {
          const rateLimitResponse = await clientOperationRateLimiter(request, userId);
          if (rateLimitResponse) {
            return NextResponse.json(
              { errors: [{ message: 'Too many client operations. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
              { status: 429, headers: rateLimitResponse.headers }
            );
          }
        }
        
        // Check for offer operations
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
        
        // Check for marketplace operations
        const marketplaceOp = isMarketplaceOperation(query);
        if (marketplaceOp.isMarketplace) {
          if (marketplaceOp.isSearch) {
            // Use IP-based limiting for public search
            const rateLimitResponse = await marketplaceSearchRateLimiter(request);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many marketplace searches. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          } else if (marketplaceOp.isCart) {
            const rateLimitResponse = await cartOperationRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many cart operations. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          } else if (marketplaceOp.isActivity) {
            const rateLimitResponse = await userActivityRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many activity tracking requests. Please slow down.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          } else if (marketplaceOp.isAddress) {
            const rateLimitResponse = await addressOperationRateLimiter(request, userId);
            if (rateLimitResponse) {
              return NextResponse.json(
                { errors: [{ message: 'Too many address operations. Please try again later.', extensions: { code: 'RATE_LIMITED' } }] },
                { status: 429, headers: rateLimitResponse.headers }
              );
            }
          }
        }
      }
    }
    
    return await apolloHandler(request);
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

