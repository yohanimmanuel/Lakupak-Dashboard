import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/jwt';

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
    isUpdate: updateOfferPattern.test(normalizedQuery),
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
  
  return {
    isMarketplace: isSearch || isCart || isActivity || isAddress ||
                   marketplaceUserPattern.test(normalizedQuery) ||
                   updateMarketplaceUserPattern.test(normalizedQuery) ||
                   mobileOrdersPattern.test(normalizedQuery),
    isSearch,
    isCart,
    isActivity,
    isAddress,
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
  isQuery: boolean;
  isBulkPublish: boolean;
} {
  const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase();
  
  // Exclude marketplace product operations
  if (/\bmarketplaceproducts\b/.test(normalizedQuery) || 
      /\bmobilemarketplaceproducts\b/.test(normalizedQuery)) {
    return { isProduct: false, isCreate: false, isUpdate: false, isQuery: false, isBulkPublish: false };
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
  
  // Product queries
  const productsQueryPattern = /\bproducts\s*\(/;
  const productQueryPattern = /\bproduct\s*\(/;
  
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
    isQuery: productsQueryPattern.test(normalizedQuery) || productQueryPattern.test(normalizedQuery),
    isBulkPublish: bulkPublishMarketplaceProductsPattern.test(normalizedQuery),
  };
}

/**
 * Check if this is a campaign-related operation
 * Matches: campaigns, campaign, createCampaign, updateCampaign, deleteCampaign
 */
function isCampaignOperation(query: string): boolean {
  const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase();
  
  const campaignsPattern = /\bcampaigns\s*\(/;
  const campaignPattern = /\bcampaign\s*\(/;
  const createCampaignPattern = /\bcreatecampaign\s*\(/;
  const updateCampaignPattern = /\bupdatecampaign\s*\(/;
  const deleteCampaignPattern = /\bdeletecampaign\s*\(/;
  
  return campaignsPattern.test(normalizedQuery) ||
         campaignPattern.test(normalizedQuery) ||
         createCampaignPattern.test(normalizedQuery) ||
         updateCampaignPattern.test(normalizedQuery) ||
         deleteCampaignPattern.test(normalizedQuery);
}

/**
 * Check if this is a client-related operation (buyers/suppliers)
 * Matches: buyers, buyer, createBuyer, updateBuyer, deleteBuyer,
 *         suppliers, supplier, createSupplier, updateSupplier, deleteSupplier
 * Excludes: marketplace operations that might contain "buyer" or "supplier" in their data
 */
function isClientOperation(query: string): boolean {
  const normalizedQuery = query.replace(/\s+/g, ' ').toLowerCase();
  
  // Exclude marketplace operations by matching specific operation names
  const marketplaceOpPattern = /\b(marketplace\w*|mobile\w*)\s*\(/;
  if (marketplaceOpPattern.test(normalizedQuery)) {
    return false;
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
  
  return buyersPattern.test(normalizedQuery) ||
         buyerPattern.test(normalizedQuery) ||
         createBuyerPattern.test(normalizedQuery) ||
         updateBuyerPattern.test(normalizedQuery) ||
         deleteBuyerPattern.test(normalizedQuery) ||
         suppliersPattern.test(normalizedQuery) ||
         supplierPattern.test(normalizedQuery) ||
         createSupplierPattern.test(normalizedQuery) ||
         updateSupplierPattern.test(normalizedQuery) ||
         deleteSupplierPattern.test(normalizedQuery);
}

// Wrapper to handle errors and rate limiting
async function handler(request: NextRequest) {
  try {
    // Extract GraphQL operation details
    const operation = await extractGraphQLOperation(request);
    
    if (operation) {
      const { query, variables = {} } = operation;
      
      // Extract authenticated user ID from JWT token only
      // Requests without valid JWT are treated as anonymous (no user-based rate limiting)
      // Resolvers must enforce authentication requirements for protected operations
      const userId = extractAuthenticatedUserId(request);
      
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
        
        // Check for marketplace operations (excluding search, which is handled above)
        if (marketplaceOp.isMarketplace && !marketplaceOp.isSearch) {
          if (marketplaceOp.isCart) {
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

