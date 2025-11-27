import { type Prisma, Prisma as PrismaClient } from '@/generated/prisma';
import { prisma } from '../common/prisma';
import { safeParsePrice } from '@/utils/currencyUtils';
import { calculateSoldCounts, updateProductPricesFromOffers } from '@/utils/marketplaceMetrics';
import { sanitizePagination, buildPaginationInfo } from '../common/utils';
import { getSecurityHeaders } from '@/utils/auth-security';
import { verifyAccessToken } from '@/lib/jwt';
import { validateOfferForProduct, trackOfferUsage as trackOfferUsageUtil, trackOfferUsageForAllTypes, updateOfferStatusesBasedOnLimits } from '@/utils/offerValidation';
import { parseNumberByCurrency } from '@/config/currencyConfig';
import { validateVariant } from '@/services/variantService';
import { syncOrderToBuyerProfile, buildMobileBuyerId } from '@/utils/buyerSync';
import { broadcastOrderUpdate } from '@/utils/websocketBroadcast';

interface OfferDiscountType {
  id: string;
  discountType: string;
  discountValue: number;
  minQuantity: number | null;
  freeQuantity?: number | null;
  isActive: boolean;
  description: string | null;
}

interface OrderItemInput {
  productId: string;
  quantity: number;
  priceAtPurchase: string;
  subtotal: string;
  packageType?: string;
  piecesPerPackage?: number;
  packageQuantity?: number;
  pricePerPackage?: string;
  productName?: string;
  productSku?: string;
  variantId?: number;
  variantName?: string;
  category?: string;
}

export const marketplaceTypeDefs = /* GraphQL */ `
  type MarketplaceUserProfile {
    id: Int!
    username: String!
    name: String
    storeName: String
    email: String
    bio: String
    phone: String!
    image: String
    bannerImage: String
    chosenAddress: String
    country: String
    createdAt: String!
    updatedAt: String!
  }

  type MobileMarketplaceProduct {
    id: String!
    name: String!
    description: String!
    userId: Int
    sellingPrice: Float!
    originalSellingPrice: Float
    price: Float!
    originalPrice: Float!
    offerBadge: String
    hasActiveOffer: Boolean!
    offerId: String
    offerName: String
    discountType: String
    discountValue: Float
    promotionDetails: JSONObject
    rating: Float!
    reviewCount: Int!
    soldCount: String!
    stock: Int!
    stockStatus: String!
    variants: [JSONObject!]!
    variantOptions: [JSONObject!]!
    variantOptionsFormatted: [JSONObject!]!
    images: [String!]!
    category: String!
    productCategory: String!
    brand: String
    unit: String!
    sku: String!
    supplier: String
    publishedAt: String
    lastSyncAt: String
    piecesPerPackage: Int!
    packageType: String!
    seller: MarketplaceSeller!
    shipping: MarketplaceShipping!
    shippingInfo: MarketplaceShippingInfo!
    assurance: MarketplaceAssurance!
    reviews: MarketplaceReviews!
  }

  type MarketplaceSeller {
    name: String!
    avatar: String!
    rating: Float!
    reviewCount: Int!
    isOfficial: Boolean!
    responseTime: String!
    deliverySpeed: String!
    returnPolicy: String!
    company: MarketplaceCompany
  }

  type MarketplaceCompany {
    name: String!
    businessAddress: String
    businessPhone: String
    businessEmail: String
    industryType: String
    pickupAddress: String
    logo: String
    bannerImage: String
  }

  type MarketplaceShipping {
    preferences: [String!]!
    standard: ShippingOption!
    express: ShippingOption!
    sameDay: ShippingOption!
    nextDay: ShippingOption!
    scheduled: ShippingOption!
    pickup: ShippingOption!
  }

  type ShippingOption {
    price: Float!
    free: Boolean!
    available: Boolean!
  }

  type MarketplaceShippingInfo {
    location: String!
  }

  type MarketplaceAssurance {
    halalCertified: Boolean!
    bpomApproved: Boolean!
    returnPolicyDays: Int!
    originalProduct: Boolean!
  }

  type MarketplaceReviews {
    overallRating: Float!
    totalReviews: Int!
    breakdown: JSONObject!
    sampleReview: JSONObject
    hasReviews: Boolean!
  }

  type MobileMarketplaceProductConnection {
    nodes: [MobileMarketplaceProduct!]!
    pagination: PaginationInfo!
    timestamp: String!
  }

  type CartItem {
    id: Int!
    userId: Int!
    productId: String!
    productData: JSONObject!
    activityType: String!
    metadata: JSONObject
    createdAt: String!
    updatedAt: String!
  }

  type CartConnection {
    items: [CartItem!]!
    success: Boolean!
  }

  type CartItemResult {
    success: Boolean!
    cartItem: CartItem
    message: String!
  }


  type UserActivityConnection {
    success: Boolean!
    activities: [UserActivity!]!
  }

  type UserActivityResult {
    success: Boolean!
    activity: UserActivity
    action: String!
  }

  type DeleteActivityResult {
    success: Boolean!
    deletedCount: Int!
  }

  input UpdateMarketplaceUserInput {
    username: String
    name: String
    storeName: String
    email: String
    bio: String
    phone: String
    image: String
    bannerImage: String
    chosenAddress: String
    country: String
  }

  input AddToCartInput {
    userId: Int!
    productId: String!
    productData: JSONObject!
    quantity: Int
    variant: String
  }

  input UpdateCartItemInput {
    cartItemId: Int!
    quantity: Int
    selected: Boolean
  }

  input AddUserActivityInput {
    userId: Int!
    productId: String!
    productData: JSONObject!
    activityType: ActivityType!
    metadata: JSONObject
  }

  extend type Query {
    marketplaceUser(userId: Int!): MarketplaceUserProfile
    
    mobileMarketplaceProducts(
      page: Int = 1
      limit: Int = 20
      category: String
      search: String
      marketplaceUserId: Int
    ): MobileMarketplaceProductConnection!
    
    mobileCart(userId: Int!): CartConnection!
    
    mobileUserActivity(
      userId: Int!
      type: ActivityType!
    ): UserActivityConnection!
    
    mobileOrders(
      userId: Int!
      page: Int = 1
      limit: Int = 10
    ): OrderConnection!
  }

  extend type Mutation {
    updateMarketplaceUser(
      userId: Int!
      input: UpdateMarketplaceUserInput!
    ): MarketplaceUserProfile!
    
    addToCart(input: AddToCartInput!): CartItemResult!
    
    updateCartItem(input: UpdateCartItemInput!): CartItemResult!
    
    removeCartItem(cartItemId: Int): CartItemResult!
    clearCart(userId: Int!): CartItemResult!
    
    addUserActivity(input: AddUserActivityInput!): UserActivityResult!
    
    deleteUserActivity(
      userId: Int!
      productId: String!
      type: ActivityType!
    ): DeleteActivityResult!
    
    createMobileOrder(
      userId: Int!
      orderId: String!
      orderDate: String
      distributorUserId: Int
      orderItems: [JSONObject!]!
      subtotal: Float!
      discounts: Float
      shippingFee: Float
      totalAmount: Float!
      totalOrders: Int
      contactPerson: String
      storeName: String
      contactPhone: String
      customerEmail: String
      deliveryAddress: String
      deliveryMethod: String
      deliveryOption: String
      orderStatus: String
      paymentStatus: String
      paymentTerms: String
      preferredDeliveryDate: String
      preferredDeliveryTime: String
      preferredPickupDate: String
      preferredPickupTime: String
      shippingMethodLabel: String
      shippingMethod: String
    ): Order!
  }
`;

// Helper function to cleanup old viewed products
async function cleanupOldViewedProducts(userId: number) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const deletedCount = await prisma.userActivity.deleteMany({
    where: {
      userId: userId,
      activityType: 'viewed',
      createdAt: {
        lt: startOfDay
      }
    }
  });
  
  return deletedCount.count;
}

const fetchMarketplaceUserProfile = async (userId: number) => {
  const user = await prisma.marketplaceUser.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    storeName: user.storeName,
    email: user.email,
    bio: user.bio,
    phone: user.phone,
    image: user.image,
    bannerImage: user.bannerImage,
    chosenAddress: user.chosenAddress,
    country: user.country,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
};

const updateMarketplaceUser = async (args: { userId: number; input: {
  username?: string;
  name?: string;
  storeName?: string;
  email?: string;
  bio?: string;
  phone?: string;
  image?: string;
  bannerImage?: string;
  chosenAddress?: string;
  country?: string;
} }) => {
  const { userId, input } = args;
  
  // Check if user exists
  const existingUser = await prisma.marketplaceUser.findUnique({
    where: { id: userId }
  });
  
  if (!existingUser) {
    throw new Error('User not found');
  }
  
  // Check for unique constraints if updating username or email
  if (input.username && input.username !== existingUser.username) {
    const usernameExists = await prisma.marketplaceUser.findUnique({
      where: { username: input.username.trim() }
    });
    if (usernameExists) {
      throw new Error('Username already taken');
    }
  }
  
  if (input.email && input.email !== existingUser.email) {
    const emailExists = await prisma.marketplaceUser.findUnique({
      where: { email: input.email.trim().toLowerCase() }
    });
    if (emailExists) {
      throw new Error('Email already taken');
    }
  }
  
  // Update user
  const updatedUser = await prisma.marketplaceUser.update({
    where: { id: userId },
    data: {
      ...(input.username && { username: input.username.trim() }),
      ...(input.name && { name: input.name.trim() }),
      ...(input.storeName && { storeName: input.storeName.trim() }),
      ...(input.email && { email: input.email.trim().toLowerCase() }),
      ...(input.bio && { bio: input.bio.trim() }),
      ...(input.phone && { phone: input.phone.trim() }),
      ...(input.image && { image: input.image.trim() }),
      ...(input.bannerImage && { bannerImage: input.bannerImage.trim() }),
      ...(input.chosenAddress && { chosenAddress: input.chosenAddress.trim() }),
      ...(input.country && { country: input.country.trim() })
    }
  });
  
  return {
    id: updatedUser.id,
    username: updatedUser.username,
    name: updatedUser.name,
    storeName: updatedUser.storeName,
    email: updatedUser.email,
    bio: updatedUser.bio,
    phone: updatedUser.phone,
    image: updatedUser.image,
    bannerImage: updatedUser.bannerImage,
    chosenAddress: updatedUser.chosenAddress,
    country: updatedUser.country,
    createdAt: updatedUser.createdAt.toISOString(),
    updatedAt: updatedUser.updatedAt.toISOString(),
  };
};

const fetchMarketplaceProducts = async (args: {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  marketplaceUserId?: number;
}) => {
  const { page = 1, limit = 20, category, search } = args;
  
  // Build where clause for published products only
  const whereClause: Record<string, unknown> = {
    marketplaceStatus: 'Published',
    status: 'Published'
  };
  
  // Build OR conditions for filtering
  const orConditions: Record<string, unknown>[] = [];
  
  if (category && category !== 'All') {
    orConditions.push({ productType: category });
  }
  
  if (search) {
    orConditions.push(
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
      { productType: { contains: search, mode: 'insensitive' } },
    );
  }
  
  if (orConditions.length > 0) {
    whereClause.OR = orConditions;
  }
  
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);
  const skip = (safePage - 1) * safeLimit;
  const take = safeLimit;
  
  // Get published products with user info, ordered by lastSyncAt to get most recent changes
  const products = await prisma.product.findMany({
    where: whereClause,
    include: {
      variants: true,
      variantOptions: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          company: {
            select: {
              name: true,
              businessAddress: true,
              businessPhone: true,
              businessEmail: true,
              industryType: true,
              shippingPreferences: true,
              baseShippingPrice: true,
              expressShippingPrice: true,
              sameDayShippingPrice: true,
              nextDayShippingPrice: true,
              pickupAddress: true,
              logo: true,
              bannerImage: true,
            }
          }
        }
      }
    },
    skip,
    take,
    orderBy: [
      { lastSyncAt: 'desc' },
      { publishedAt: 'desc' }
    ]
  });
  
  // Get active offers for all products
  const productIds = products.map(p => p.productId);
  const userIds = [...new Set(products.map(p => p.userId).filter((id): id is number => id !== null))];
  const soldCountMap = await calculateSoldCounts(prisma, productIds);
  
  // Get only ACTIVE offers to check real-time status
  const allOffers = await prisma.offer.findMany({
    where: {
      userId: { in: userIds },
      status: 'active',
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
      offerProducts: {
        some: {
          productId: { in: productIds }
        }
      }
    },
    include: {
      offerProducts: true,
      offerDiscountTypes: true
    }
  });

  // Filter offers - keep offer if at least one discount type is still usable
  const validOffers = [];
  for (const offer of allOffers) {
    let hasValidDiscountType = false;
    
    for (const discountType of offer.offerDiscountTypes) {
      let isDiscountTypeValid = true;
      
      if (discountType.isActive !== true) {
        isDiscountTypeValid = false;
      }
      
      if (isDiscountTypeValid) {
        hasValidDiscountType = true;
        break;
      }
    }
    
    if (!hasValidDiscountType) {
      await prisma.offer.update({
        where: { id: offer.id },
        data: { status: 'inactive' }
      });
    } else {
      validOffers.push(offer);
    }
  }
  
  // Update product prices after deactivating offers
  for (const userId of userIds) {
    await updateProductPricesFromOffers(prisma, userId);
  }
  
  // Create a map of product offers using only valid offers
  const productOffersMap = new Map();
  validOffers.forEach((offer) => {
    offer.offerProducts.forEach((op) => {
      if (!productOffersMap.has(op.productId)) {
        productOffersMap.set(op.productId, []);
      }
      productOffersMap.get(op.productId).push(offer);
    });
  });
  
  // Transform products for marketplace format
  const marketplaceProducts = await Promise.all(products.map(async (product) => {
    const variantOptions = product.variantOptions || [];
    
    if (variantOptions.length === 0) {
      return null;
    }
    
    const firstVariantOption = variantOptions.find(vo => vo.isDefault) || variantOptions[0];
    const sellingPrice = safeParsePrice(firstVariantOption.sellingPrice);
    const purchasePrice = safeParsePrice(firstVariantOption.purchasePrice);
    const originalSellingPriceValue = safeParsePrice(firstVariantOption.originalSellingPrice) || sellingPrice;
    const hasActiveDiscountInMainSystem = originalSellingPriceValue > sellingPrice;
    
    const productOffers = productOffersMap.get(product.productId) || [];
    let offerBadge = undefined;
    let hasActiveOffer = false;
    let offerId = undefined;
    let offerName = undefined;
    let originalSellingPrice = undefined;
    let discountType = undefined;
    let discountValue = undefined;
    let hasPriceDiscounts = false;
    let promotionDetails = undefined;
    
    if (productOffers.length > 0) {
      const primaryOffer = productOffers[0];
      
      const activeDiscountTypes = [];
      for (const dt of primaryOffer.offerDiscountTypes) {
        if (dt.isActive === true) {
          activeDiscountTypes.push(dt);
        }
      }
      
      if (activeDiscountTypes.length === 0) {
        await prisma.offer.update({
          where: { id: primaryOffer.id },
          data: { status: 'inactive' }
        });
      }
      
      if (activeDiscountTypes.length > 0) {
        hasPriceDiscounts = activeDiscountTypes.some((dt: OfferDiscountType) => 
          dt.discountType === 'percentage' || dt.discountType === 'fixed'
        );
        const hasPromotions = activeDiscountTypes.some((dt: OfferDiscountType) => 
          dt.discountType === 'buy_x_get_y'
        );
        
        const shouldShowOffer = activeDiscountTypes.length > 0 && (
          (hasPriceDiscounts && hasActiveDiscountInMainSystem) || 
          (hasPromotions && !hasPriceDiscounts) ||
          (hasPriceDiscounts && hasPromotions)
        );
      
        if (shouldShowOffer) {
          if (hasPriceDiscounts && hasPromotions) {
            offerBadge = 'All Offers';
          } else if (hasPromotions) {
            offerBadge = 'Promotion';
          } else if (hasPriceDiscounts) {
            offerBadge = 'Discount';
          } else {
            offerBadge = 'Offer';
          }
          
          if (hasPriceDiscounts) {
            const fixedDiscount = activeDiscountTypes.find((dt: OfferDiscountType) => dt.discountType === 'fixed');
            const percentageDiscount = activeDiscountTypes.find((dt: OfferDiscountType) => dt.discountType === 'percentage');
            discountType = fixedDiscount ? 'fixed' : (percentageDiscount ? 'percentage' : undefined);
            discountValue = fixedDiscount ? fixedDiscount.discountValue : (percentageDiscount ? percentageDiscount.discountValue : undefined);
            
            if (hasActiveDiscountInMainSystem) {
              originalSellingPrice = originalSellingPriceValue;
            }
          }
          
          const buyXGetYPromo = activeDiscountTypes.find((dt: OfferDiscountType) => dt.discountType === 'buy_x_get_y');
          if (buyXGetYPromo) {
            promotionDetails = {
              minQuantity: buyXGetYPromo.minQuantity,
              freeQuantity: buyXGetYPromo.discountValue,
              description: buyXGetYPromo.description || `Buy ${buyXGetYPromo.minQuantity} Get ${buyXGetYPromo.discountValue} Free`
            };
          }
        
          hasActiveOffer = true;
          offerId = primaryOffer.id;
          offerName = primaryOffer.name;
          originalSellingPrice = hasPriceDiscounts ? originalSellingPriceValue : undefined;
        }
      }
    }
    
    const totalStock = variantOptions.reduce((sum, vo) => sum + (vo.stockQuantity || 0), 0);
    const totalLowStockThreshold = variantOptions.reduce((max, vo) => Math.max(max, vo.lowStockThreshold || 0), 0);
    
    let stockStatus = 'In Stock';
    if (totalStock === 0) stockStatus = 'Out of Stock';
    else if (totalLowStockThreshold > 0 && totalStock <= totalLowStockThreshold) stockStatus = 'Low Stock';
    
    return {
      id: product.productId,
      name: product.name,
      description: product.description,
      userId: product.userId,
      sellingPrice: hasActiveOffer && hasPriceDiscounts ? sellingPrice : originalSellingPriceValue,
      originalSellingPrice: hasActiveOffer && hasPriceDiscounts ? originalSellingPriceValue : undefined,
      price: hasActiveOffer && hasPriceDiscounts ? sellingPrice : originalSellingPriceValue,
      originalPrice: purchasePrice,
      offerBadge,
      hasActiveOffer,
      offerId,
      offerName,
      discountType,
      discountValue,
      promotionDetails,
      rating: 0,
      reviewCount: 0,
      soldCount: soldCountMap.get(product.productId) || '0',
      stock: totalStock,
      stockStatus,
      variants: product.variants || [],
      variantOptions: product.variantOptions || [],
      variantOptionsFormatted: variantOptions.map(vo => ({
        id: vo.id,
        sku: vo.sku,
        purchasePrice: safeParsePrice(vo.purchasePrice),
        sellingPrice: safeParsePrice(vo.sellingPrice),
        originalSellingPrice: safeParsePrice(vo.originalSellingPrice),
        moq: vo.moq,
        stockQuantity: vo.stockQuantity || 0,
        lowStockThreshold: vo.lowStockThreshold || 0,
        stockStatus: vo.stockStatus || 'In Stock',
        attributes: vo.attributes,
        isDefault: vo.isDefault,
        isActive: vo.isActive
      })),
      images: product.images || [],
      category: product.productType || 'Uncategorized',
      productCategory: product.productCategory || 'Uncategorized',
      brand: product.brand,
      unit: 'Piece',
      sku: product.sku,
      supplier: product.supplier,
      publishedAt: product.publishedAt?.toISOString() || null,
      lastSyncAt: product.lastSyncAt?.toISOString() || null,
      piecesPerPackage: 1,
      packageType: 'Piece',
      seller: {
        name: product.user?.company?.name || 'Unknown Company',
        avatar: '/default-avatar.png',
        rating: 0,
        reviewCount: 0,
        isOfficial: true,
        responseTime: 'N/A',
        deliverySpeed: 'N/A',
        returnPolicy: `${product.returnPolicyDays || 7} days return policy`,
        company: product.user?.company ? {
          name: product.user.company.name,
          businessAddress: product.user.company.businessAddress,
          businessPhone: product.user.company.businessPhone,
          businessEmail: product.user.company.businessEmail,
          industryType: product.user.company.industryType,
          pickupAddress: product.user.company.pickupAddress,
          logo: product.user.company.logo || null,
          bannerImage: product.user.company.bannerImage || null,
        } : undefined
      },
      shipping: {
        preferences: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences) : [],
        standard: { 
          price: product.user?.company?.baseShippingPrice || 0, 
          free: false,
          available: true
        },
        express: { 
          price: product.user?.company?.expressShippingPrice || 0, 
          free: false,
          available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Express Shipping') : false
        },
        sameDay: { 
          price: product.user?.company?.sameDayShippingPrice || 0, 
          free: false,
          available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Same-day Delivery') : false
        },
        nextDay: { 
          price: product.user?.company?.nextDayShippingPrice || 0, 
          free: false,
          available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Next-day Delivery') : false
        },
        scheduled: {
          price: product.user?.company?.baseShippingPrice || 0,
          free: false,
          available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Scheduled Delivery') : false
        },
        pickup: {
          price: 0,
          free: true,
          available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Pickup Available') : false
        }
      },
      shippingInfo: {
        location: 'Indonesia'
      },
      assurance: {
        halalCertified: product.halalCertified || false,
        bpomApproved: product.bpomApproved || false,
        returnPolicyDays: product.returnPolicyDays || 7,
        originalProduct: product.originalProduct !== false
      },
      reviews: {
        overallRating: 0,
        totalReviews: 0,
        breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        sampleReview: null,
        hasReviews: false
      }
    };
  }));
  
  const totalCount = await prisma.product.count({ where: whereClause });
  const pagination = buildPaginationInfo(page, limit, totalCount);
  
  return {
    nodes: marketplaceProducts.filter(product => product !== null),
    pagination,
    timestamp: new Date().toISOString()
  };
};

const fetchMobileCart = async (userId: number) => {
  const cartItems = await prisma.userActivity.findMany({
    where: { 
      userId,
      activityType: 'cart'
    },
    orderBy: { createdAt: 'desc' }
  });

  return {
    items: cartItems.map(item => ({
      id: item.id,
      userId: item.userId,
      productId: item.productId,
      productData: item.productData as Prisma.InputJsonValue,
      activityType: item.activityType,
      metadata: item.metadata as Prisma.InputJsonValue | null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    success: true
  };
};

const addToCart = async (args: {
  userId: number;
  productId: string;
  productData: Record<string, unknown>;
  quantity?: number;
  variant?: string;
}) => {
  const { userId, productId, productData, quantity = 1, variant = 'Default' } = args;

  const existingItem = await prisma.userActivity.findFirst({
    where: {
      userId,
      productId,
      activityType: 'cart',
      metadata: {
        path: ['variant'],
        equals: variant
      }
    }
  });

  if (existingItem) {
    const metadata = (existingItem.metadata as { quantity?: number; variant?: string; selected?: boolean }) || {};
    const currentQuantity = metadata.quantity || 1;
    const updatedItem = await prisma.userActivity.update({
      where: { id: existingItem.id },
      data: { 
        productData: productData as Prisma.InputJsonValue,
        metadata: {
          quantity: currentQuantity + quantity,
          variant: variant,
          selected: true
        },
        updatedAt: new Date()
      }
    });

    return {
      success: true,
      cartItem: {
        id: updatedItem.id,
        userId: updatedItem.userId,
        productId: updatedItem.productId,
        productData: updatedItem.productData as Prisma.InputJsonValue,
        activityType: updatedItem.activityType,
        metadata: updatedItem.metadata as Prisma.InputJsonValue | null,
        createdAt: updatedItem.createdAt.toISOString(),
        updatedAt: updatedItem.updatedAt.toISOString(),
      },
      message: 'Cart item quantity updated'
    };
  } else {
    const newItem = await prisma.userActivity.create({
      data: {
        userId,
        productId,
        productData: productData as Prisma.InputJsonValue,
        activityType: 'cart',
        metadata: {
          quantity,
          variant,
          selected: true
        } as Prisma.InputJsonValue
      }
    });

    return {
      success: true,
      cartItem: {
        id: newItem.id,
        userId: newItem.userId,
        productId: newItem.productId,
        productData: newItem.productData as Prisma.InputJsonValue,
        activityType: newItem.activityType,
        metadata: newItem.metadata as Prisma.InputJsonValue | null,
        createdAt: newItem.createdAt.toISOString(),
        updatedAt: newItem.updatedAt.toISOString(),
      },
      message: 'Item added to cart'
    };
  }
};

const updateCartItem = async (args: {
  cartItemId: number;
  quantity?: number;
  selected?: boolean;
}) => {
  const { cartItemId, quantity, selected } = args;

  const updateData: Record<string, unknown> = {
    updatedAt: new Date()
  };

  if (quantity !== undefined) {
    updateData.quantity = quantity;
  }

  if (selected !== undefined) {
    updateData.selected = selected;
  }

  const existingItem = await prisma.userActivity.findUnique({
    where: { id: cartItemId }
  });

  if (!existingItem) {
    throw new Error('Cart item not found');
  }

  const metadata = (existingItem.metadata as Record<string, unknown>) || {};
  const updatedMetadata = { ...metadata };
  if (quantity !== undefined) updatedMetadata.quantity = quantity;
  if (selected !== undefined) updatedMetadata.selected = selected;

  const updatedItem = await prisma.userActivity.update({
    where: { id: cartItemId },
    data: {
      metadata: updatedMetadata as Prisma.InputJsonValue,
      updatedAt: new Date()
    }
  });

  return {
    success: true,
    cartItem: {
      id: updatedItem.id,
      userId: updatedItem.userId,
      productId: updatedItem.productId,
      productData: updatedItem.productData as Record<string, unknown>,
      activityType: updatedItem.activityType,
      metadata: updatedItem.metadata as Record<string, unknown> | null,
      createdAt: updatedItem.createdAt.toISOString(),
      updatedAt: updatedItem.updatedAt.toISOString(),
    },
    message: 'Cart item updated'
  };
};

const removeCartItem = async (cartItemId: number) => {
  await prisma.userActivity.delete({
    where: { id: cartItemId }
  });

  return {
    success: true,
    cartItem: null,
    message: 'Cart item removed'
  };
};

const clearCart = async (userId: number) => {
  await prisma.userActivity.deleteMany({
    where: { 
      userId,
      activityType: 'cart'
    }
  });

  return {
    success: true,
    cartItem: null,
    message: 'Cart cleared'
  };
};

const fetchMobileUserActivity = async (args: {
  userId: number;
  type: string;
}) => {
  const { userId, type } = args;

  let whereClause: Record<string, unknown> = { 
    userId,
    activityType: type
  };

  if (type === 'viewed') {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    
    whereClause.createdAt = {
      gte: startOfDay,
      lte: endOfDay
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

const addUserActivity = async (args: {
  userId: number;
  productId: string;
  productData: Record<string, unknown>;
  activityType: string;
  metadata?: Record<string, unknown>;
}) => {
  const { userId, productId, productData, activityType, metadata } = args;

  const existingActivity = await prisma.userActivity.findFirst({
    where: {
      userId,
      productId,
      activityType
    }
  });

  if (existingActivity) {
    const updatedActivity = await prisma.userActivity.update({
      where: { id: existingActivity.id },
      data: {
        productData: productData as Prisma.InputJsonValue,
        metadata: (metadata || existingActivity.metadata) as Prisma.InputJsonValue,
        updatedAt: new Date()
      }
    });

    if (activityType === 'viewed') {
      await cleanupOldViewedProducts(userId);
    }

    return {
      success: true,
      activity: {
        id: updatedActivity.id,
        userId: updatedActivity.userId,
        productId: updatedActivity.productId,
        productData: updatedActivity.productData as Prisma.InputJsonValue,
        activityType: updatedActivity.activityType as 'favorite' | 'viewed' | 'purchased' | 'cart',
        metadata: updatedActivity.metadata as Prisma.InputJsonValue | null,
        createdAt: updatedActivity.createdAt.toISOString(),
        updatedAt: updatedActivity.updatedAt.toISOString(),
      },
      action: 'updated'
    };
  } else {
    const newActivity = await prisma.userActivity.create({
      data: {
        userId,
        productId,
        productData: productData as Prisma.InputJsonValue,
        activityType,
        metadata: (metadata || {}) as Prisma.InputJsonValue
      }
    });

    if (activityType === 'viewed') {
      await cleanupOldViewedProducts(userId);
    }

    return {
      success: true,
      activity: {
        id: newActivity.id,
        userId: newActivity.userId,
        productId: newActivity.productId,
        productData: newActivity.productData as Prisma.InputJsonValue,
        activityType: newActivity.activityType as 'favorite' | 'viewed' | 'purchased' | 'cart',
        metadata: newActivity.metadata as Prisma.InputJsonValue | null,
        createdAt: newActivity.createdAt.toISOString(),
        updatedAt: newActivity.updatedAt.toISOString(),
      },
      action: 'created'
    };
  }
};

const deleteUserActivity = async (args: {
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

// Mobile orders - reuse the existing orders module logic
// This will be handled by the orders module, but we need to add a query here
const fetchMobileOrders = async (args: {
  userId: number;
  page?: number;
  limit?: number;
}) => {
  // This will be implemented by calling the orders module
  // For now, return empty result - will be implemented in next step
  const { page = 1, limit = 10 } = args;
  
  const marketplaceUser = await prisma.marketplaceUser.findUnique({
    where: { id: args.userId }
  });
  
  if (!marketplaceUser) {
    throw new Error('User not found');
  }
  
  const baseBuyerId = buildMobileBuyerId(marketplaceUser.id);
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);
  const skip = (safePage - 1) * safeLimit;
  const take = safeLimit;
  
  const orders = await prisma.order.findMany({
    where: {
      buyerId: {
        startsWith: baseBuyerId
      }
    },
    skip,
    take,
    orderBy: { orderDate: 'desc' },
    include: {
      user: {
        include: {
          company: true
        }
      },
      orderItemsRel: {
        include: {
          product: {
            include: {
              user: {
                include: {
                  company: true
                }
              }
            }
          }
        }
      }
    }
  });
  
  const total = await prisma.order.count({
    where: {
      buyerId: {
        startsWith: baseBuyerId
      }
    }
  });
  
  const ordersWithItems = orders.map(order => {
    const orderItems = (order.orderItemsRel || []).map((oi) => ({
      productId: oi.productId ?? null,
      subtotal: oi.subtotal,
      packageType: oi.packageType,
      piecesPerPackage: oi.piecesPerPackage,
      packageQuantity: oi.packageQuantity,
      pricePerPackage: oi.pricePerPackage,
      productName: oi.product?.name || oi.productNameSnapshot || 'Unknown Product',
      category: oi.product?.productType || oi.productTypeSnapshot || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || [],
      productDeleted: !oi.product,
      productNameSnapshot: oi.productNameSnapshot || null,
      productSkuSnapshot: oi.productSkuSnapshot || null,
      productTypeSnapshot: oi.productTypeSnapshot || null,
      variantNameSnapshot: oi.variantNameSnapshot || null,
      offerApplied: oi.offerApplied || false,
      offerBadgeSnapshot: oi.offerBadgeSnapshot || null,
      offerNameSnapshot: oi.offerNameSnapshot || null,
      originalPriceSnapshot: oi.originalPriceSnapshot || null,
      discountPercentage: oi.discountPercentage || null,
      discountAmount: oi.discountAmount || null,
      promotionDetailsSnapshot: oi.promotionDetailsSnapshot || null,
      moqSnapshot: oi.moqSnapshot || null,
      product: oi.product ? {
        userId: oi.product.userId ?? null,
        name: oi.product.name ?? null,
      } : null
    }));
    
    return {
      ...order,
      orderDate: order.orderDate?.toISOString() ?? '',
      createdAt: order.createdAt?.toISOString() ?? null,
      updatedAt: order.updatedAt?.toISOString() ?? null,
      preferredDeliveryDate: order.preferredDeliveryDate?.toISOString() ?? null,
      preferredPickupDate: order.preferredPickupDate?.toISOString() ?? null,
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      orderItems: orderItems
    };
  });
  
  const pagination = buildPaginationInfo(page, limit, total);
  
  return {
    nodes: ordersWithItems,
    pagination
  };
};

// Create mobile order - this is a complex operation that mirrors the REST endpoint
const createMobileOrder = async (args: {
  userId: number;
  orderId: string;
  orderDate?: string;
  distributorUserId?: number;
  orderItems: unknown[];
  subtotal: number;
  discounts?: number;
  shippingFee?: number;
  totalAmount: number;
  totalOrders?: number;
  contactPerson?: string;
  storeName?: string;
  contactPhone?: string;
  customerEmail?: string;
  deliveryAddress?: string;
  deliveryMethod?: string;
  deliveryOption?: string;
  orderStatus?: string;
  paymentStatus?: string;
  paymentTerms?: string;
  preferredDeliveryDate?: string;
  preferredDeliveryTime?: string;
  preferredPickupDate?: string;
  preferredPickupTime?: string;
  shippingMethodLabel?: string;
  shippingMethod?: string;
}) => {
  const {
    userId,
    orderId,
    orderDate,
    distributorUserId: distributorUserIdFromClient,
    orderItems,
    subtotal,
    discounts,
    shippingFee,
    totalAmount,
    totalOrders,
    contactPerson,
    storeName,
    contactPhone,
    customerEmail,
    deliveryAddress,
    deliveryMethod,
    deliveryOption,
    orderStatus,
    paymentStatus,
    paymentTerms,
    preferredDeliveryDate,
    preferredDeliveryTime,
    preferredPickupDate,
    preferredPickupTime,
    shippingMethodLabel,
    shippingMethod,
  } = args;

  if (!orderId || !userId) {
    throw new Error('Order ID and User ID are required');
  }

  const userIdNum = Number(userId);
  if (isNaN(userIdNum)) {
    throw new Error('Invalid user ID format');
  }

  const marketplaceUser = await prisma.marketplaceUser.findUnique({
    where: { id: userIdNum }
  });

  if (!marketplaceUser) {
    throw new Error('User not found');
  }

  const normalizeDeliveryOption = (value: unknown) => {
    if (!value) return null;
    const trimmed = String(value).trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  };

  const parseOptionalDate = (value: unknown) => {
    if (!value) return null;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const normalizeTimeValue = (value: unknown) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const normalizedDeliveryOption = normalizeDeliveryOption(deliveryOption);
  const normalizedShippingLabel = typeof shippingMethodLabel === 'string' && shippingMethodLabel.trim().length > 0
    ? shippingMethodLabel.trim()
    : null;
  const normalizedShippingMethod = typeof shippingMethod === 'string' && shippingMethod.trim().length > 0
    ? shippingMethod.trim()
    : normalizedShippingLabel;
  const normalizedPreferredDeliveryDate = parseOptionalDate(preferredDeliveryDate);
  const normalizedPreferredPickupDate = parseOptionalDate(preferredPickupDate);
  const normalizedPreferredDeliveryTime = normalizeTimeValue(preferredDeliveryTime);
  const normalizedPreferredPickupTime = normalizeTimeValue(preferredPickupTime);

  // Validate stock availability BEFORE creating order
  const orderItemsArray = Array.isArray(orderItems) ? orderItems as OrderItemInput[] : [];
  if (orderItemsArray.length === 0) {
    throw new Error('Order items required');
  }

  for (const item of orderItemsArray) {
    const product = await prisma.product.findFirst({
      where: { productId: String(item.productId || '') },
      include: { 
        variants: true,
        variantOptions: true
      }
    });
    
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }
    
    const variantOption = product.variantOptions?.find(vo => vo.id === item.variantId) || product.variantOptions?.[0];
    if (!variantOption) {
      throw new Error(`No variant options found for product: ${item.productId}`);
    }
    const packageQuantity = item.packageQuantity || 1;
    const piecesPerPackage = item.piecesPerPackage || 1;
    const totalPieces = packageQuantity * piecesPerPackage;
    
    const variantValidation = await validateVariant(String(item.productId || ''), item.variantId, totalPieces, packageQuantity);
    
    if (!variantValidation.isValid) {
      throw new Error(variantValidation.error || 'Invalid variant');
    }
    
    const orderedQty = parseInt(String(item.packageQuantity || 1));
    let totalQtyNeeded = orderedQty;
    
    const productOffers = await prisma.offer.findMany({
      where: {
        userId: product.userId || undefined,
        status: 'active',
        offerProducts: {
          some: {
            productId: product.productId
          }
        }
      },
      include: {
        offerDiscountTypes: {
          where: { isActive: true, discountType: 'buy_x_get_y' }
        }
      }
    });
    
    if (productOffers.length > 0) {
      const buyXGetYPromo = productOffers[0].offerDiscountTypes.find(
        (dt) => dt.discountType === 'buy_x_get_y'
      );
      
      if (buyXGetYPromo) {
        const minQty = buyXGetYPromo.minQuantity || 1;
        const freeQty = buyXGetYPromo.discountValue || 0;
        const qualifyingSets = Math.floor(orderedQty / minQty);
        const totalFreeItems = qualifyingSets * freeQty;
        totalQtyNeeded = orderedQty + totalFreeItems;
      }
    }
    
    if (variantOption.stockQuantity < totalQtyNeeded) {
      const variantName = variantOption.attributes 
        ? Object.entries(variantOption.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')
        : 'Default';
      
      throw new Error(
        `Insufficient stock for ${product.name} (${variantName}). Available: ${variantOption.stockQuantity}, Required: ${totalQtyNeeded} (including ${totalQtyNeeded - orderedQty} free items)`
      );
    }
  }

  // If client specifies distributorUserId, treat payload as a single-distributor order
  if (typeof distributorUserIdFromClient === 'number') {
    const productIds = orderItemsArray.map((i: OrderItemInput) => String(i.productId));
    const products = await prisma.product.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, userId: true }
    });
    const mismatched = products.find(p => p.userId !== distributorUserIdFromClient);
    if (mismatched) {
      throw new Error(`Product ${mismatched.productId} does not belong to distributor ${distributorUserIdFromClient}`);
    }

    const buyerPerDistributorId = buildMobileBuyerId(marketplaceUser.id, distributorUserIdFromClient);

    await prisma.buyer.upsert({
      where: { buyerId: buyerPerDistributorId },
      update: {
        owner: marketplaceUser.name || 'Mobile User',
        email: marketplaceUser.email || '',
        phone: marketplaceUser.phone || '',
        storeName: marketplaceUser.storeName || 'Mobile Store',
        address: marketplaceUser.chosenAddress || '',
        userId: distributorUserIdFromClient,
      },
      create: {
        buyerId: buyerPerDistributorId,
        owner: marketplaceUser.name || 'Mobile User',
        email: marketplaceUser.email || '',
        phone: marketplaceUser.phone || '',
        storeName: marketplaceUser.storeName || 'Mobile Store',
        businessType: 'Retailer',
        address: marketplaceUser.chosenAddress || '',
        status: 'Active',
        userId: distributorUserIdFromClient,
      }
    });

    const groupSubtotal = orderItemsArray.reduce((sum: number, it: OrderItemInput) => sum + parseFloat(String(it.subtotal || 0)), 0);
    const groupTotalOrders = orderItemsArray.reduce((sum: number, it: OrderItemInput) => sum + parseInt(String(it.packageQuantity || 1)), 0);
    const groupShipping = parseFloat(String(shippingFee || 0));
    const groupDiscounts = parseFloat(String(discounts || 0));
    const groupTotalAmount = groupSubtotal + groupShipping - groupDiscounts;

    const groupOrderId = String(orderId);
    const orderData = {
      orderId: groupOrderId,
      buyerId: buyerPerDistributorId,
      buyerIdSnapshot: buyerPerDistributorId,
      orderDate: new Date(orderDate || new Date()),
      orderDateSnapshot: new Date(orderDate || new Date()),
      orderStatus: String(orderStatus || 'Pending'),
      paymentStatus: String(paymentStatus || 'Unpaid'),
      deliveryMethod: String(deliveryMethod || 'Distributor Fleet'),
      deliveryOption: normalizedDeliveryOption,
      subtotal: groupSubtotal,
      discounts: groupDiscounts,
      shippingFee: groupShipping,
      totalAmount: groupTotalAmount,
      paymentTerms: String(paymentTerms || 'Cash on Delivery'),
      totalOrders: groupTotalOrders,
      contactPerson: String(contactPerson || marketplaceUser.name || ''),
      contactPersonSnapshot: String(contactPerson || marketplaceUser.name || ''),
      storeName: String(storeName || marketplaceUser.storeName || ''),
      storeNameSnapshot: String(storeName || marketplaceUser.storeName || ''),
      contactPhone: String(contactPhone || marketplaceUser.phone || ''),
      contactPhoneSnapshot: String(contactPhone || marketplaceUser.phone || ''),
      customerEmail: customerEmail ? String(customerEmail) : (marketplaceUser.email || ''),
      customerEmailSnapshot: customerEmail ? String(customerEmail) : (marketplaceUser.email || ''),
      deliveryAddress: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
      deliveryAddressSnapshot: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
      preferredDeliveryDate: normalizedPreferredDeliveryDate,
      preferredDeliveryTime: normalizedPreferredDeliveryTime,
      preferredPickupDate: normalizedPreferredPickupDate,
      preferredPickupTime: normalizedPreferredPickupTime,
      shippingMethodLabel: normalizedShippingLabel,
      shippingMethod: normalizedShippingMethod,
      userId: distributorUserIdFromClient
    };
    const order = await prisma.order.create({ data: orderData });

    if (orderItemsArray.length > 0) {
      const usedOfferIds: string[] = [];
      await prisma.$transaction(async (tx) => {
        const orderItemPromises = orderItemsArray.map(async (item: OrderItemInput) => {
          const product = await tx.product.findFirst({
            where: { productId: String(item.productId || '') },
            include: { variants: true, variantOptions: true }
          });
          if (!product) throw new Error(`Product not found: ${item.productId}`);
          const variantOption = item.variantId ? (product.variantOptions?.find(vo => vo.id === item.variantId) || product.variantOptions?.[0]) : product.variantOptions?.[0];
          if (!variantOption) throw new Error(`No variant options found for product: ${item.productId}.`);
          const packageQuantity = parseInt(String(item.packageQuantity || 1));
          const piecesPerPackage = parseInt(String(item.piecesPerPackage || 1));
          const totalQuantity = packageQuantity * piecesPerPackage;
          const orderTotal = groupTotalAmount;
          const offerValidation = await validateOfferForProduct(
            product.productId,
            userIdNum,
            orderTotal,
            totalQuantity,
            tx,
            packageQuantity,
            variantOption
          );
          let orderItemData = {
            orderId: order.orderId,
            productId: String(item.productId || ''),
            subtotal: parseFloat(String(item.subtotal || 0)),
            packageType: String(item.packageType || 'Box'),
            piecesPerPackage: piecesPerPackage,
            packageQuantity: packageQuantity,
            pricePerPackage: parseFloat(String(item.pricePerPackage || 0)),
            productNameSnapshot: String(item.productName || 'Unknown Product'),
            productSkuSnapshot: String(item.productSku || ''),
            productTypeSnapshot: String(item.category || 'Uncategorized'),
            variantNameSnapshot: String(item.variantName || 'Default'),
            offerApplied: false,
            offerBadgeSnapshot: null as string | null,
            offerNameSnapshot: null as string | null,
            originalPriceSnapshot: null as string | null,
            discountPercentage: null as number | null,
            discountAmount: null as number | null,
            promotionDetailsSnapshot: null as string | null,
            moqSnapshot: variantOption.moq || null
          };
          if (offerValidation.isValid && offerValidation.offerId) {
            if (!usedOfferIds.includes(offerValidation.offerId)) usedOfferIds.push(offerValidation.offerId);
            if (offerValidation.applicableDiscountTypes && offerValidation.applicableDiscountTypes.length > 0) {
              await trackOfferUsageForAllTypes(offerValidation.offerId, offerValidation.applicableDiscountTypes, userIdNum, tx);
            } else if (offerValidation.discountTypeId) {
              await trackOfferUsageUtil(offerValidation.offerId, offerValidation.discountTypeId, userIdNum, offerValidation.discountAmount || 0, tx);
            }
            orderItemData = {
              ...orderItemData,
              offerApplied: true,
              offerBadgeSnapshot: offerValidation.offerBadge || null,
              offerNameSnapshot: offerValidation.offerName || null,
              originalPriceSnapshot: offerValidation.originalPrice?.toString() || null,
              discountPercentage: offerValidation.discountPercentage || null,
              discountAmount: offerValidation.discountAmount || null,
              promotionDetailsSnapshot: offerValidation.promotionDetails ? JSON.stringify(offerValidation.promotionDetails) : null
            };
          }
          return tx.orderItem.create({ data: orderItemData });
        });
        await Promise.all(orderItemPromises);
      });
      if (usedOfferIds.length > 0) {
        await updateOfferStatusesBasedOnLimits(usedOfferIds);
      }
    }

    try { await syncOrderToBuyerProfile(buyerPerDistributorId, distributorUserIdFromClient); } catch {}

    const createdOrder = await prisma.order.findUnique({
      where: { orderId: order.orderId },
      include: { 
        orderItemsRel: { include: { product: true } },
        buyer: true,
        user: { include: { company: true } }
      }
    });

    if (!createdOrder) {
      throw new Error('Failed to retrieve created order');
    }

    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch {
      // Ignore broadcast errors
    }

    // Map to Order type format
    const orderItemsMapped = (createdOrder.orderItemsRel || []).map((oi) => ({
      productId: oi.productId ?? null,
      productName: oi.product?.name ?? oi.productNameSnapshot ?? 'Unknown Product',
      category: oi.product?.productType ?? oi.productTypeSnapshot ?? 'Uncategorized',
      brand: oi.product?.brand ?? 'Unknown Brand',
      description: oi.product?.description ?? '',
      images: oi.product?.images ?? [],
      productDeleted: !oi.product,
      packageQuantity: oi.packageQuantity ?? 1,
      packageType: oi.packageType,
      piecesPerPackage: oi.piecesPerPackage ?? 1,
      pricePerPackage: oi.pricePerPackage ?? null,
      subtotal: oi.subtotal,
      variantId: oi.variantId ?? null,
      variantOptionId: oi.variantOptionId ?? null,
      offerApplied: oi.offerApplied ?? false,
      offerBadgeSnapshot: oi.offerBadgeSnapshot,
      offerNameSnapshot: oi.offerNameSnapshot,
      promotionDetailsSnapshot: oi.promotionDetailsSnapshot,
      variantNameSnapshot: oi.variantNameSnapshot,
      productNameSnapshot: oi.productNameSnapshot ?? null,
      productSkuSnapshot: oi.productSkuSnapshot ?? null,
      productTypeSnapshot: oi.productTypeSnapshot ?? null,
      originalPriceSnapshot: oi.originalPriceSnapshot ?? null,
      discountPercentage: oi.discountPercentage,
      discountAmount: oi.discountAmount,
      moqSnapshot: oi.moqSnapshot ?? null
    }));

    return {
      id: createdOrder.id?.toString() || null,
      orderId: createdOrder.orderId,
      buyerId: createdOrder.buyerId,
      orderStatus: createdOrder.orderStatus,
      paymentStatus: createdOrder.paymentStatus,
      deliveryMethod: createdOrder.deliveryMethod,
      deliveryOption: createdOrder.deliveryOption,
      shippingMethodLabel: createdOrder.shippingMethodLabel,
      shippingMethod: createdOrder.shippingMethod,
      subtotal: createdOrder.subtotal,
      discounts: createdOrder.discounts,
      shippingFee: createdOrder.shippingFee,
      totalAmount: createdOrder.totalAmount,
      paymentTerms: createdOrder.paymentTerms,
      totalOrders: createdOrder.totalOrders,
      contactPerson: createdOrder.contactPerson,
      storeName: createdOrder.storeName,
      contactPhone: createdOrder.contactPhone,
      customerEmail: createdOrder.customerEmail,
      deliveryAddress: createdOrder.deliveryAddress,
      preferredDeliveryDate: createdOrder.preferredDeliveryDate?.toISOString() || null,
      preferredDeliveryTime: createdOrder.preferredDeliveryTime,
      preferredPickupDate: createdOrder.preferredPickupDate?.toISOString() || null,
      preferredPickupTime: createdOrder.preferredPickupTime,
      assignedLogistics: createdOrder.assignedLogistics,
      trackingNumber: createdOrder.trackingNumber,
      deliveryNote: createdOrder.deliveryNote,
      deliveryConfirmation: createdOrder.deliveryConfirmation,
      pod: createdOrder.pod,
      orderDate: createdOrder.orderDate.toISOString(),
      createdAt: createdOrder.createdAt?.toISOString() || null,
      updatedAt: createdOrder.updatedAt?.toISOString() || null,
      acceptedBy: createdOrder.acceptedBy,
      acceptedAt: createdOrder.acceptedAt?.toISOString() || null,
      buyer: createdOrder.buyer ? {
        buyerId: createdOrder.buyer.buyerId,
        storeName: createdOrder.buyer.storeName,
        owner: createdOrder.buyer.owner,
        email: createdOrder.buyer.email,
        phone: createdOrder.buyer.phone,
      } : null,
      seller: createdOrder.user ? {
        name: [createdOrder.user.firstName, createdOrder.user.lastName].filter(Boolean).join(' ').trim() || null,
        companyName: createdOrder.user.company?.name ?? null,
        companyAddress: createdOrder.user.company?.businessAddress ?? null,
        companyPhone: createdOrder.user.company?.businessPhone ?? null,
        companyEmail: createdOrder.user.company?.businessEmail ?? null,
        shippingPreferences: createdOrder.user.company?.shippingPreferences ?? null,
        logo: createdOrder.user.company?.logo ?? null,
        bannerImage: createdOrder.user.company?.bannerImage ?? null,
      } : null,
      orderItems: orderItemsMapped
    };
  }

  // Group items by distributor userId (seller) so each seller receives their own order
  const distributorToItems: Map<number, OrderItemInput[]> = new Map();
  const productIds = orderItemsArray.map(item => String(item.productId));
  const products = await prisma.product.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, userId: true }
  });
  const productIdToUserId = new Map<string, number>();
  products.forEach(p => { if (p.userId) productIdToUserId.set(p.productId, p.userId); });
  
  for (const item of orderItemsArray) {
    const ownerId = productIdToUserId.get(String(item.productId));
    if (!ownerId) {
      throw new Error(`Unable to resolve distributor for product ${String(item.productId)}. Please retry.`);
    }
    if (!distributorToItems.has(ownerId)) distributorToItems.set(ownerId, []);
    distributorToItems.get(ownerId)!.push(item as OrderItemInput);
  }
  
  if (distributorToItems.size === 0) {
    throw new Error('Unable to determine distributors for products');
  }
  
  // Create one order per distributor group
  const createdOrders: Array<{ orderId: string }> = [];
  let groupIndex = 0;
  for (const [distributorUserId, itemsForDistributor] of distributorToItems.entries()) {
    groupIndex += 1;
    const baseBuyerId = buildMobileBuyerId(marketplaceUser.id);
    const buyerPerDistributorId = buildMobileBuyerId(marketplaceUser.id, distributorUserId);
    
    await prisma.buyer.upsert({
      where: { buyerId: buyerPerDistributorId },
      update: {
        owner: marketplaceUser.name || 'Mobile User',
        email: marketplaceUser.email || '',
        phone: marketplaceUser.phone || '',
        storeName: marketplaceUser.storeName || 'Mobile Store',
        address: marketplaceUser.chosenAddress || '',
        userId: distributorUserId,
      },
      create: {
        buyerId: buyerPerDistributorId,
        owner: marketplaceUser.name || 'Mobile User',
        email: marketplaceUser.email || '',
        phone: marketplaceUser.phone || '',
        storeName: marketplaceUser.storeName || 'Mobile Store',
        businessType: 'Retailer',
        address: marketplaceUser.chosenAddress || '',
        status: 'Active',
        userId: distributorUserId,
      }
    });
    
    const groupSubtotal = itemsForDistributor.reduce((sum: number, it: OrderItemInput) => sum + parseFloat(String(it.subtotal || 0)), 0);
    const groupTotalOrders = itemsForDistributor.reduce((sum: number, it: OrderItemInput) => sum + parseInt(String(it.packageQuantity || 1)), 0);
    const groupsCount = distributorToItems.size;
    const groupShipping = parseFloat(String(shippingFee || 0)) / groupsCount;
    const groupDiscounts = parseFloat(String(discounts || 0)) / groupsCount;
    const groupTotalAmount = groupSubtotal + groupShipping - groupDiscounts;
    
    const groupOrderId = distributorToItems.size > 1 ? `${String(orderId)}-${groupIndex}` : String(orderId);
    const orderData = {
      orderId: groupOrderId,
      buyerId: buyerPerDistributorId,
      buyerIdSnapshot: buyerPerDistributorId,
      orderDate: new Date(orderDate || new Date()),
      orderDateSnapshot: new Date(orderDate || new Date()),
      orderStatus: String(orderStatus || 'Pending'),
      paymentStatus: String(paymentStatus || 'Unpaid'),
      deliveryMethod: String(deliveryMethod || 'Distributor Fleet'),
      deliveryOption: normalizedDeliveryOption,
      subtotal: groupSubtotal,
      discounts: groupDiscounts,
      shippingFee: groupShipping,
      totalAmount: groupTotalAmount,
      paymentTerms: String(paymentTerms || 'Cash on Delivery'),
      totalOrders: groupTotalOrders,
      contactPerson: String(contactPerson || marketplaceUser.name || ''),
      contactPersonSnapshot: String(contactPerson || marketplaceUser.name || ''),
      storeName: String(storeName || marketplaceUser.storeName || ''),
      storeNameSnapshot: String(storeName || marketplaceUser.storeName || ''),
      contactPhone: String(contactPhone || marketplaceUser.phone || ''),
      contactPhoneSnapshot: String(contactPhone || marketplaceUser.phone || ''),
      customerEmail: customerEmail ? String(customerEmail) : (marketplaceUser.email || ''),
      customerEmailSnapshot: customerEmail ? String(customerEmail) : (marketplaceUser.email || ''),
      deliveryAddress: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
      deliveryAddressSnapshot: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
      preferredDeliveryDate: normalizedPreferredDeliveryDate,
      preferredDeliveryTime: normalizedPreferredDeliveryTime,
      preferredPickupDate: normalizedPreferredPickupDate,
      preferredPickupTime: normalizedPreferredPickupTime,
      shippingMethodLabel: normalizedShippingLabel,
      shippingMethod: normalizedShippingMethod,
      userId: distributorUserId
    };
    const order = await prisma.order.create({ data: orderData });
    createdOrders.push({ orderId: order.orderId });
    
    if (itemsForDistributor.length > 0) {
      const usedOfferIds: string[] = [];
      await prisma.$transaction(async (tx) => {
        const orderItemPromises = itemsForDistributor.map(async (item: OrderItemInput) => {
          const product = await tx.product.findFirst({
            where: { productId: String(item.productId || '') },
            include: { variants: true, variantOptions: true }
          });
          if (!product) throw new Error(`Product not found: ${item.productId}`);
          const variantOption = item.variantId ? (product.variantOptions?.find(vo => vo.id === item.variantId) || product.variantOptions?.[0]) : product.variantOptions?.[0];
          if (!variantOption) throw new Error(`No variant options found for product: ${item.productId}.`);
          const packageQuantity = parseInt(String(item.packageQuantity || 1));
          const piecesPerPackage = parseInt(String(item.piecesPerPackage || 1));
          const totalQuantity = packageQuantity * piecesPerPackage;
          const orderTotal = groupTotalAmount;
          const offerValidation = await validateOfferForProduct(
            product.productId,
            userIdNum,
            orderTotal,
            totalQuantity,
            tx,
            packageQuantity,
            variantOption
          );
          let orderItemData = {
            orderId: order.orderId,
            productId: String(item.productId || ''),
            subtotal: parseFloat(String(item.subtotal || 0)),
            packageType: String(item.packageType || 'Box'),
            piecesPerPackage: piecesPerPackage,
            packageQuantity: packageQuantity,
            pricePerPackage: parseFloat(String(item.pricePerPackage || 0)),
            productNameSnapshot: String(item.productName || 'Unknown Product'),
            productSkuSnapshot: String(item.productSku || ''),
            productTypeSnapshot: String(item.category || 'Uncategorized'),
            variantNameSnapshot: String(item.variantName || 'Default'),
            offerApplied: false,
            offerBadgeSnapshot: null as string | null,
            offerNameSnapshot: null as string | null,
            originalPriceSnapshot: null as string | null,
            discountPercentage: null as number | null,
            discountAmount: null as number | null,
            promotionDetailsSnapshot: null as string | null,
            moqSnapshot: variantOption.moq || null
          };
          if (offerValidation.isValid && offerValidation.offerId) {
            if (!usedOfferIds.includes(offerValidation.offerId)) usedOfferIds.push(offerValidation.offerId);
            if (offerValidation.applicableDiscountTypes && offerValidation.applicableDiscountTypes.length > 0) {
              await trackOfferUsageForAllTypes(offerValidation.offerId, offerValidation.applicableDiscountTypes, userIdNum, tx);
            } else if (offerValidation.discountTypeId) {
              await trackOfferUsageUtil(offerValidation.offerId, offerValidation.discountTypeId, userIdNum, offerValidation.discountAmount || 0, tx);
            }
            orderItemData = {
              ...orderItemData,
              offerApplied: true,
              offerBadgeSnapshot: offerValidation.offerBadge || null,
              offerNameSnapshot: offerValidation.offerName || null,
              originalPriceSnapshot: offerValidation.originalPrice?.toString() || null,
              discountPercentage: offerValidation.discountPercentage || null,
              discountAmount: offerValidation.discountAmount || null,
              promotionDetailsSnapshot: offerValidation.promotionDetails ? JSON.stringify(offerValidation.promotionDetails) : null
            };
          }
          return tx.orderItem.create({ data: orderItemData });
        });
        await Promise.all(orderItemPromises);
      });
      if (usedOfferIds.length > 0) {
        await updateOfferStatusesBasedOnLimits(usedOfferIds);
      }
    }
    
    try {
      await syncOrderToBuyerProfile((await prisma.order.findUnique({ where: { orderId: order.orderId } }))!.buyerId!, distributorUserId);
    } catch {
      // Ignore sync errors
    }
  }
  
  const createdOrdersFull = await prisma.order.findMany({
    where: { orderId: { in: createdOrders.map(o => o.orderId) } },
    include: { 
      orderItemsRel: { include: { product: true } },
      buyer: true,
      user: { include: { company: true } }
    }
  });

  if (createdOrdersFull.length === 0) {
    throw new Error('Failed to create orders');
  }

  if (createdOrders.length > 0) {
    try {
      await broadcastOrderUpdate(createdOrders.map(o => o.orderId));
    } catch {
      // Ignore broadcast errors
    }
  }

  // Return the first order (for backward compatibility)
  const firstOrder = createdOrdersFull[0];
  const orderItemsMapped = (firstOrder.orderItemsRel || []).map((oi) => ({
    productId: oi.productId ?? null,
    productName: oi.product?.name ?? oi.productNameSnapshot ?? 'Unknown Product',
    category: oi.product?.productType ?? oi.productTypeSnapshot ?? 'Uncategorized',
    brand: oi.product?.brand ?? 'Unknown Brand',
    description: oi.product?.description ?? '',
    images: oi.product?.images ?? [],
    productDeleted: !oi.product,
    packageQuantity: oi.packageQuantity ?? 1,
    packageType: oi.packageType,
    piecesPerPackage: oi.piecesPerPackage ?? 1,
    pricePerPackage: oi.pricePerPackage ?? null,
    subtotal: oi.subtotal,
    variantId: oi.variantId ?? null,
    variantOptionId: oi.variantOptionId ?? null,
    offerApplied: oi.offerApplied ?? false,
    offerBadgeSnapshot: oi.offerBadgeSnapshot,
    offerNameSnapshot: oi.offerNameSnapshot,
    promotionDetailsSnapshot: oi.promotionDetailsSnapshot,
    variantNameSnapshot: oi.variantNameSnapshot,
    productNameSnapshot: oi.productNameSnapshot ?? null,
    productSkuSnapshot: oi.productSkuSnapshot ?? null,
    productTypeSnapshot: oi.productTypeSnapshot ?? null,
    originalPriceSnapshot: oi.originalPriceSnapshot ?? null,
    discountPercentage: oi.discountPercentage,
    discountAmount: oi.discountAmount,
    moqSnapshot: oi.moqSnapshot ?? null
  }));

  return {
    id: firstOrder.id?.toString() || null,
    orderId: firstOrder.orderId,
    buyerId: firstOrder.buyerId,
    orderStatus: firstOrder.orderStatus,
    paymentStatus: firstOrder.paymentStatus,
    deliveryMethod: firstOrder.deliveryMethod,
    deliveryOption: firstOrder.deliveryOption,
    shippingMethodLabel: firstOrder.shippingMethodLabel,
    shippingMethod: firstOrder.shippingMethod,
    subtotal: firstOrder.subtotal,
    discounts: firstOrder.discounts,
    shippingFee: firstOrder.shippingFee,
    totalAmount: firstOrder.totalAmount,
    paymentTerms: firstOrder.paymentTerms,
    totalOrders: firstOrder.totalOrders,
    contactPerson: firstOrder.contactPerson,
    storeName: firstOrder.storeName,
    contactPhone: firstOrder.contactPhone,
    customerEmail: firstOrder.customerEmail,
    deliveryAddress: firstOrder.deliveryAddress,
    preferredDeliveryDate: firstOrder.preferredDeliveryDate?.toISOString() || null,
    preferredDeliveryTime: firstOrder.preferredDeliveryTime,
    preferredPickupDate: firstOrder.preferredPickupDate?.toISOString() || null,
    preferredPickupTime: firstOrder.preferredPickupTime,
    assignedLogistics: firstOrder.assignedLogistics,
    trackingNumber: firstOrder.trackingNumber,
    deliveryNote: firstOrder.deliveryNote,
    deliveryConfirmation: firstOrder.deliveryConfirmation,
    pod: firstOrder.pod,
    orderDate: firstOrder.orderDate.toISOString(),
    createdAt: firstOrder.createdAt?.toISOString() || null,
    updatedAt: firstOrder.updatedAt?.toISOString() || null,
    acceptedBy: firstOrder.acceptedBy,
    acceptedAt: firstOrder.acceptedAt?.toISOString() || null,
    buyer: firstOrder.buyer ? {
      buyerId: firstOrder.buyer.buyerId,
      storeName: firstOrder.buyer.storeName,
      owner: firstOrder.buyer.owner,
      email: firstOrder.buyer.email,
      phone: firstOrder.buyer.phone,
    } : null,
    seller: firstOrder.user ? {
      name: [firstOrder.user.firstName, firstOrder.user.lastName].filter(Boolean).join(' ').trim() || null,
      companyName: firstOrder.user.company?.name ?? null,
      companyAddress: firstOrder.user.company?.businessAddress ?? null,
      companyPhone: firstOrder.user.company?.businessPhone ?? null,
      companyEmail: firstOrder.user.company?.businessEmail ?? null,
      shippingPreferences: firstOrder.user.company?.shippingPreferences ?? null,
      logo: firstOrder.user.company?.logo ?? null,
      bannerImage: firstOrder.user.company?.bannerImage ?? null,
    } : null,
    orderItems: orderItemsMapped
  };
};

export const marketplaceResolvers = {
  Query: {
    marketplaceUser: (_: unknown, args: { userId: number }) => fetchMarketplaceUserProfile(args.userId),
    mobileMarketplaceProducts: (_: unknown, args: Parameters<typeof fetchMarketplaceProducts>[0]) => fetchMarketplaceProducts(args),
    mobileCart: (_: unknown, args: { userId: number }) => fetchMobileCart(args.userId),
    mobileUserActivity: (_: unknown, args: Parameters<typeof fetchMobileUserActivity>[0]) => fetchMobileUserActivity(args),
    mobileOrders: (_: unknown, args: Parameters<typeof fetchMobileOrders>[0]) => fetchMobileOrders(args),
  },
  Mutation: {
    updateMarketplaceUser: (_: unknown, args: Parameters<typeof updateMarketplaceUser>[0]) => updateMarketplaceUser(args),
    addToCart: (_: unknown, args: { input: Parameters<typeof addToCart>[0] }) => addToCart(args.input),
    updateCartItem: (_: unknown, args: { input: Parameters<typeof updateCartItem>[0] }) => updateCartItem(args.input),
    removeCartItem: (_: unknown, args: { cartItemId: number }) => removeCartItem(args.cartItemId),
    clearCart: (_: unknown, args: { userId: number }) => clearCart(args.userId),
    addUserActivity: (_: unknown, args: { input: Parameters<typeof addUserActivity>[0] }) => addUserActivity(args.input),
    deleteUserActivity: (_: unknown, args: Parameters<typeof deleteUserActivity>[0]) => deleteUserActivity(args),
    createMobileOrder: (_: unknown, args: Parameters<typeof createMobileOrder>[0]) => createMobileOrder(args),
  },
};
