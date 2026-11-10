/**
 * Rate-limit quantities only — windows, caps, burst, messages.
 * The engine lives in `rateLimitSetup.ts`; preset wrappers in `rateLimiter.ts`.
 */

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;

export type RateLimitQuantity = {
  windowMs: number;
  maxRequests: number;
  message: string;
  progressivePenalty?: boolean;
  burstLimit?: number;
  burstWindowMs?: number;
};

export const RATE_LIMIT_QUANTITIES = {
  /** Auth login attempts (dashboard / mobile / driver / admin). */
  login: {
    windowMs: 15 * MINUTE_MS,
    maxRequests: 20,
    message: 'Too many login attempts. Please try again in 15 minutes.',
    progressivePenalty: true,
    burstLimit: 10,
    burstWindowMs: SECOND_MS,
  },
  /** New account registration. */
  register: {
    windowMs: HOUR_MS,
    maxRequests: 20,
    message: 'Too many registration attempts. Please try again later.',
    progressivePenalty: true,
    burstLimit: 10,
    burstWindowMs: SECOND_MS,
  },
  /** Unauthenticated NIB/NPWP uploads during distributor registration. */
  kycRegisterUpload: {
    windowMs: HOUR_MS,
    maxRequests: 20,
    message: 'Too many document uploads. Please try again later.',
    progressivePenalty: true,
    burstLimit: 10,
    burstWindowMs: 2 * SECOND_MS,
  },
  /** KYC document resubmit after rejection. */
  kycResubmit: {
    windowMs: 15 * MINUTE_MS,
    maxRequests: 20,
    message: 'Too many document resubmit attempts. Please try again later.',
    progressivePenalty: true,
    burstLimit: 10,
    burstWindowMs: 2 * SECOND_MS,
  },
  /** OTP send requests (Twilio cost amplifier). */
  otp: {
    windowMs: 5 * MINUTE_MS,
    maxRequests: 10,
    message: 'Too many OTP requests. Please try again in 5 minutes.',
  },
  /** Password-reset email / code request. */
  passwordReset: {
    windowMs: HOUR_MS,
    maxRequests: 10,
    message: 'Too many password reset requests. Please try again in 1 hour.',
  },
  /** Password-reset code verification attempts. */
  passwordResetVerify: {
    windowMs: 15 * MINUTE_MS,
    maxRequests: 20,
    message: 'Too many verification attempts. Please try again in a few minutes.',
  },
  /** Creating distributor / marketplace orders. */
  orderCreate: {
    windowMs: HOUR_MS,
    maxRequests: 200,
    message: 'Too many orders created. Please try again later.',
  },
  /** Listing or reading orders. */
  orderQuery: {
    windowMs: MINUTE_MS,
    maxRequests: 200,
    message: 'Too many order queries. Please slow down.',
  },
  /** Updating or cancelling orders. */
  orderUpdate: {
    windowMs: MINUTE_MS,
    maxRequests: 100,
    message: 'Too many order updates. Please slow down.',
  },
  /** Creating catalog offers / campaigns. */
  offerCreate: {
    windowMs: HOUR_MS,
    maxRequests: 200,
    message: 'Too many offers created. Please try again later.',
  },
  /** Updating existing offers / campaigns. */
  offerUpdate: {
    windowMs: MINUTE_MS,
    maxRequests: 200,
    message: 'Too many offer updates. Please try again later.',
  },
  /** Reading offers / campaigns. */
  offerQuery: {
    windowMs: MINUTE_MS,
    maxRequests: 200,
    message: 'Too many offer queries. Please slow down.',
  },
  /** Public marketplace product search (per IP). */
  marketplaceSearch: {
    windowMs: MINUTE_MS,
    maxRequests: 1000,
    message: 'Too many marketplace searches. Please slow down.',
    progressivePenalty: true,
    burstLimit: 20,
    burstWindowMs: SECOND_MS,
  },
  /** Marketplace cart add / update / remove. */
  cartOperation: {
    windowMs: MINUTE_MS,
    maxRequests: 100,
    message: 'Too many cart operations. Please slow down.',
  },
  /** Checkout lookup of a seller’s bank details. */
  checkoutSellerBank: {
    windowMs: MINUTE_MS,
    maxRequests: 60,
    message: 'Too many bank detail lookups. Please slow down.',
    progressivePenalty: true,
    burstLimit: 10,
    burstWindowMs: SECOND_MS,
  },
  /** Marketplace user-activity / analytics pings. */
  userActivity: {
    windowMs: SECOND_MS,
    maxRequests: 200,
    message: 'Too many activity tracking requests. Please slow down.',
  },
  /** Buyer address create / update / delete. */
  addressOperation: {
    windowMs: HOUR_MS,
    maxRequests: 200,
    message: 'Too many address operations. Please try again later.',
  },
  /** Image / media uploads. */
  imageUpload: {
    windowMs: HOUR_MS,
    maxRequests: 200,
    message: 'Too many image uploads. Please try again later.',
  },
  /** Image / media deletions. */
  imageDelete: {
    windowMs: HOUR_MS,
    maxRequests: 200,
    message: 'Too many image deletions. Please try again later.',
  },
  /** Creating catalog products. */
  productCreate: {
    windowMs: HOUR_MS,
    maxRequests: 200,
    message: 'Too many products created. Please try again later.',
  },
  /** Updating catalog products. */
  productUpdate: {
    windowMs: HOUR_MS,
    maxRequests: 200,
    message: 'Too many product updates. Please try again later.',
  },
  /** Reading / listing catalog products. */
  productQuery: {
    windowMs: MINUTE_MS,
    maxRequests: 200,
    message: 'Too many product queries. Please slow down.',
  },
  /** Bulk publish of catalog products. */
  productBulkPublish: {
    windowMs: HOUR_MS,
    maxRequests: 200,
    message: 'Too many bulk publish operations. Please try again later.',
  },
  /** Buyers/suppliers list, refresh, and match dropdowns. */
  clientQuery: {
    windowMs: MINUTE_MS,
    maxRequests: 300,
    message: 'Too many client queries. Please slow down.',
  },
  /** Creating buyers/suppliers (including imports and sync). */
  clientCreate: {
    windowMs: MINUTE_MS,
    maxRequests: 200,
    message: 'Too many clients created. Please try again later.',
  },
  /** Updating or deleting buyers/suppliers. */
  clientUpdate: {
    windowMs: MINUTE_MS,
    maxRequests: 200,
    message: 'Too many client updates. Please try again later.',
  },
  /** Company / user settings mutations. */
  settingsOperation: {
    windowMs: HOUR_MS,
    maxRequests: 200,
    message: 'Too many settings updates. Please try again later.',
  },
  /** Sales jobs / CRM sales operations. */
  salesOperation: {
    windowMs: MINUTE_MS,
    maxRequests: 200,
    message: 'Too many sales operations. Please try again later.',
  },
  /** Dashboard analytics / metrics reads. */
  dashboardQuery: {
    windowMs: HOUR_MS,
    maxRequests: 200,
    message: 'Too many dashboard queries. Please slow down.',
  },
  /** Marketplace “I will pay” intent (fanout-heavy). */
  marketplacePayIntent: {
    windowMs: MINUTE_MS,
    maxRequests: 20,
    message: 'Too many payment intent requests. Please slow down.',
    progressivePenalty: true,
    burstLimit: 10,
    burstWindowMs: SECOND_MS,
  },
  /** Marketplace return / refund requests. */
  marketplaceReturnRequest: {
    windowMs: MINUTE_MS,
    maxRequests: 20,
    message: 'Too many return requests. Please slow down.',
    progressivePenalty: true,
    burstLimit: 10,
    burstWindowMs: SECOND_MS,
  },
  /** Authenticated Mapbox geocode proxy. */
  mapboxGeocode: {
    windowMs: MINUTE_MS,
    maxRequests: 300,
    message: 'Too many geocoding requests. Please slow down.',
    progressivePenalty: true,
    burstLimit: 30,
    burstWindowMs: SECOND_MS,
  },
  /** Mobile geocode for signed-in marketplace users. */
  mobileGeocodeAuthenticated: {
    windowMs: MINUTE_MS,
    maxRequests: 180,
    message: 'Too many geocoding requests. Please slow down.',
    progressivePenalty: true,
    burstLimit: 10,
    burstWindowMs: SECOND_MS,
  },
  /** Mobile geocode during signup (no auth). */
  mobileGeocodeAnonymous: {
    windowMs: MINUTE_MS,
    maxRequests: 90,
    message: 'Too many geocoding requests. Please slow down.',
    progressivePenalty: true,
    burstLimit: 10,
    burstWindowMs: SECOND_MS,
  },
  /** Dashboard telemetry session samples. */
  telemetrySession: {
    windowMs: MINUTE_MS,
    maxRequests: 60,
    message: 'Too many telemetry requests. Please slow down.',
    burstLimit: 30,
    burstWindowMs: SECOND_MS,
  },
  /** Driver app telemetry session samples. */
  driverTelemetrySession: {
    windowMs: MINUTE_MS,
    maxRequests: 60,
    message: 'Too many telemetry requests. Please slow down.',
    burstLimit: 30,
    burstWindowMs: SECOND_MS,
  },
  /** Marketplace push-token register / update / delete. */
  marketplacePushToken: {
    windowMs: MINUTE_MS,
    maxRequests: 30,
    message: 'Too many push token operations. Please slow down.',
    burstLimit: 5,
    burstWindowMs: SECOND_MS,
  },
  /** Generic marketplace write mutations without a dedicated limiter. */
  marketplaceMutation: {
    windowMs: MINUTE_MS,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.',
    burstLimit: 30,
    burstWindowMs: SECOND_MS,
  },
  /** Generic driver-authenticated write mutations. */
  driverMutation: {
    windowMs: MINUTE_MS,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.',
    burstLimit: 30,
    burstWindowMs: SECOND_MS,
  },
  /** OTP code verification attempts. */
  otpVerify: {
    windowMs: 5 * MINUTE_MS,
    maxRequests: 20,
    message: 'Too many verification attempts. Please try again in a few minutes.',
    progressivePenalty: true,
    burstLimit: 10,
    burstWindowMs: SECOND_MS,
  },
  /** Platform-admin write operations. */
  platformAdminMutation: {
    windowMs: MINUTE_MS,
    maxRequests: 60,
    message: 'Too many admin operations. Please slow down.',
    burstLimit: 20,
    burstWindowMs: SECOND_MS,
  },
  /** Platform-admin analytics / search / user reads. */
  platformAdminRead: {
    windowMs: MINUTE_MS,
    maxRequests: 120,
    message: 'Too many requests. Please slow down.',
    burstLimit: 30,
    burstWindowMs: SECOND_MS,
  },
  /** Issuing WebSocket / access tokens. */
  tokenIssue: {
    windowMs: MINUTE_MS,
    maxRequests: 20,
    message: 'Too many token requests. Please slow down.',
    progressivePenalty: true,
    burstLimit: 8,
    burstWindowMs: SECOND_MS,
  },
  /** Driver push-token register / update / delete. */
  driverPushToken: {
    windowMs: MINUTE_MS,
    maxRequests: 10,
    message: 'Too many push token operations. Please slow down.',
    burstLimit: 5,
    burstWindowMs: SECOND_MS,
  },
  /** New WebSocket connections per user/IP. */
  websocketConnection: {
    windowMs: MINUTE_MS,
    maxRequests: 10,
    message: 'Too many WebSocket connections',
  },
  /** WebSocket messages per connection. */
  websocketMessage: {
    windowMs: SECOND_MS,
    maxRequests: 100,
    message: 'Too many WebSocket messages',
  },
  /** GraphQL query complexity / depth / field caps. */
  graphqlComplexity: {
    windowMs: MINUTE_MS,
    baseLimit: 5000,
    absoluteLimit: 500,
    maxDepth: 15,
    maxFields: 200,
    complexityPerRequest: 200,
    progressivePenalty: false,
    burstLimit: 50,
    burstWindowMs: SECOND_MS,
  },
} as const;
