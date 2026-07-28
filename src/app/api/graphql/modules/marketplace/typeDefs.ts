export const marketplaceTypeDefs = /* GraphQL */ `
  type MarketplaceUserProfile {
    id: Int!
    username: String!
    name: String
    storeName: String
    email: String
    bio: String
    phone: String
    image: String
    bannerImage: String
    chosenAddress: String
    country: String
    createdAt: String!
    updatedAt: String!
  }

  type MarketplaceAddress {
    id: Int!
    userId: Int!
    fullName: String
    phone: String
    address: String
    latitude: Float
    longitude: Float
    geocodePrecision: String
    label: String
    isDefault: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type MarketplaceAddressList {
    success: Boolean!
    addresses: [MarketplaceAddress!]!
  }

  type MarketplaceAddressResult {
    success: Boolean!
    message: String
    address: MarketplaceAddress
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
    salesChannel: String!
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
    selfPickup: ShippingOption!
    sellerDelivery: ShippingOption!
    buyerCourier: ShippingOption!
    leadTimeMinDays: Int
    leadTimeMaxDays: Int
  }

  type ShippingOption {
    available: Boolean!
    minDays: Int
    maxDays: Int
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
    facets: MarketplaceSearchFacets!
    didYouMean: String
    "Engine that actually served this response: meili | pg_trgm | js_score | prisma | cache."
    engine: String
    "Requested search mode contract: auto | meili."
    engineRequested: String
    "True when strict 'meili' mode was requested but a fallback engine served the query."
    degraded: Boolean
    timestamp: String!
  }

  type MarketplaceFacetValue {
    value: String!
    count: Int!
  }

  type MarketplaceSearchFacets {
    productTypes: [MarketplaceFacetValue!]!
    productCategories: [MarketplaceFacetValue!]!
  }

  type CartItem {
    id: Int!
    userId: Int!
    productId: String!
    productData: JSONObject!
    activityType: ActivityType!
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

  type SearchHistory {
    id: Int!
    userId: Int!
    query: String!
    createdAt: String!
    updatedAt: String!
  }

  type SearchHistoryConnection {
    success: Boolean!
    searches: [SearchHistory!]!
  }

  type SearchHistoryResult {
    success: Boolean!
    message: String!
    search: SearchHistory
  }

  input CreateMarketplaceAddressInput {
    fullName: String!
    phone: String!
    address: String!
    label: String
    isDefault: Boolean
  }

  input UpdateMarketplaceAddressInput {
    fullName: String
    phone: String
    address: String
    label: String
    isDefault: Boolean
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
    
    marketplaceAddresses(userId: Int!): MarketplaceAddressList!

    mobileMarketplaceProducts(
      page: Int = 1
      limit: Int = 20
      category: String
      search: String
      productId: String
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
    
    mobileSearchHistory(
      userId: Int!
      limit: Int = 10
    ): SearchHistoryConnection!
  }

  extend type Mutation {
    updateMarketplaceUser(
      userId: Int!
      input: UpdateMarketplaceUserInput!
    ): MarketplaceUserProfile!

    createMarketplaceAddress(
      userId: Int!
      input: CreateMarketplaceAddressInput!
    ): MarketplaceAddressResult!

    updateMarketplaceAddress(
      userId: Int!
      addressId: Int!
      input: UpdateMarketplaceAddressInput!
    ): MarketplaceAddressResult!

    deleteMarketplaceAddress(
      userId: Int!
      addressId: Int!
    ): MarketplaceAddressResult!
    
    addToCart(input: AddToCartInput!): CartItemResult!
    
    updateCartItem(input: UpdateCartItemInput!): CartItemResult!
    
    removeCartItem(cartItemId: Int!): CartItemResult!
    clearCart(userId: Int!, trackAbandonment: Boolean): CartItemResult!
    
    addUserActivity(input: AddUserActivityInput!): UserActivityResult!
    
    deleteUserActivity(
      userId: Int!
      productId: String!
      type: ActivityType!
    ): DeleteActivityResult!
    
    addSearchHistory(
      userId: Int!
      query: String!
    ): SearchHistoryResult!
    
    removeSearchHistory(
      userId: Int!
      query: String!
    ): SearchHistoryResult!
    
    clearSearchHistory(
      userId: Int!
    ): SearchHistoryResult!
  }
`;

