import { NextRequest, NextResponse } from 'next/server';
import { RATE_LIMIT_QUANTITIES } from '@/utils/rateLimitQuantities';
import {
  calculateGraphQLComplexity,
  createRateLimiter,
  getClientIp,
  GraphQLComplexityParseError,
  rateLimit,
} from '@/utils/rateLimitSetup';

export type { RateLimitConfig } from '@/utils/rateLimitSetup';
export {
  blacklistIp,
  calculateGraphQLComplexity,
  clearAllRateLimits,
  clearRateLimit,
  createRateLimiter,
  getClientIp,
  getRateLimitStatus,
  GraphQLComplexityParseError,
  rateLimit,
  unblacklistIp,
  websocketConnectionRateLimiter,
  websocketMessageRateLimiter,
} from '@/utils/rateLimitSetup';
export { RATE_LIMIT_QUANTITIES, HOUR_MS, MINUTE_MS, SECOND_MS } from '@/utils/rateLimitQuantities';
export type { RateLimitQuantity } from '@/utils/rateLimitQuantities';

// ============================================================================
// PREDEFINED RATE LIMITERS (quantities come from rateLimitQuantities.ts)
// ============================================================================

/** Auth login attempts (dashboard / mobile / driver / admin). */
export const loginRateLimiter = createRateLimiter({
  ...RATE_LIMIT_QUANTITIES.login,
  keyGenerator: (req) => `login:${getClientIp(req)}`,
});

/** New account registration. */
export const registerRateLimiter = createRateLimiter({
  ...RATE_LIMIT_QUANTITIES.register,
  keyGenerator: (req) => `register:${getClientIp(req)}`,
});

/** Unauthenticated NIB/NPWP uploads during distributor registration. */
export const kycRegisterUploadRateLimiter = createRateLimiter({
  ...RATE_LIMIT_QUANTITIES.kycRegisterUpload,
  keyGenerator: (req) => `kyc-register-upload:${getClientIp(req)}`,
});

/** KYC document resubmit after rejection. */
export const kycResubmitRateLimiter = createRateLimiter({
  ...RATE_LIMIT_QUANTITIES.kycResubmit,
  keyGenerator: (req) => `kyc-resubmit:${getClientIp(req)}`,
});

/** OTP send requests (Twilio cost amplifier). */
export async function otpRateLimiter(
  req: NextRequest,
  phone: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.otp,
    keyGenerator: () => `otp:${phone}:${ip}`,
  });
}

/** Password-reset email / code request. */
export async function passwordResetRateLimiter(
  req: NextRequest,
  email: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.passwordReset,
    keyGenerator: () => `password-reset:${email}:${ip}`,
  });
}

/** Password-reset code verification attempts. */
export async function passwordResetVerifyRateLimiter(
  req: NextRequest,
  email: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.passwordResetVerify,
    keyGenerator: () => `password-reset-verify:${email}:${ip}`,
  });
}

/** Creating distributor / marketplace orders. */
export async function orderCreationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.orderCreate,
    keyGenerator: () => (userId ? `order-create:${userId}:${ip}` : `order-create:${ip}`),
  });
}

/** Listing or reading orders. */
export async function orderQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.orderQuery,
    keyGenerator: () => (userId ? `order-query:${userId}:${ip}` : `order-query:${ip}`),
  });
}

/** Updating or cancelling orders. */
export async function orderUpdateRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.orderUpdate,
    keyGenerator: () => (userId ? `order-update:${userId}:${ip}` : `order-update:${ip}`),
  });
}

/** Creating catalog offers / campaigns. */
export async function offerCreationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.offerCreate,
    keyGenerator: () => (userId ? `offer-create:${userId}:${ip}` : `offer-create:${ip}`),
  });
}

/** Updating existing offers / campaigns. */
export async function offerUpdateRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.offerUpdate,
    keyGenerator: () => (userId ? `offer-update:${userId}:${ip}` : `offer-update:${ip}`),
  });
}

/** Reading offers / campaigns. */
export async function offerQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.offerQuery,
    keyGenerator: () => (userId ? `offer-query:${userId}:${ip}` : `offer-query:${ip}`),
  });
}

/** Public marketplace product search (per IP). */
export async function marketplaceSearchRateLimiter(
  req: NextRequest
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.marketplaceSearch,
    keyGenerator: () => `marketplace-search:${ip}`,
  });
}

/** Marketplace cart add / update / remove. */
export async function cartOperationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.cartOperation,
    keyGenerator: () => `cart-operation:${userId}:${ip}`,
  });
}

/** Checkout lookup of a seller’s bank details. */
export async function checkoutSellerBankRateLimiter(
  req: NextRequest,
  marketplaceUserId: number,
  sellerUserId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.checkoutSellerBank,
    keyGenerator: () => `checkout-seller-bank:${marketplaceUserId}:${sellerUserId}:${ip}`,
  });
}

/** Marketplace user-activity / analytics pings. */
export async function userActivityRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.userActivity,
    keyGenerator: () => `user-activity:${userId}:${ip}`,
  });
}

/** Buyer address create / update / delete. */
export async function addressOperationRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.addressOperation,
    keyGenerator: () => `address-operation:${userId}:${ip}`,
  });
}

/** Image / media uploads. */
export async function imageUploadRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.imageUpload,
    keyGenerator: () => (userId ? `image-upload:${userId}:${ip}` : `image-upload:${ip}`),
  });
}

/** Image / media deletions. */
export async function imageDeleteRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.imageDelete,
    keyGenerator: () => (userId ? `image-delete:${userId}:${ip}` : `image-delete:${ip}`),
  });
}

/** Creating catalog products. */
export async function productCreationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.productCreate,
    keyGenerator: () => (userId ? `product-create:${userId}:${ip}` : `product-create:${ip}`),
  });
}

/** Updating catalog products. */
export async function productUpdateRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.productUpdate,
    keyGenerator: () => (userId ? `product-update:${userId}:${ip}` : `product-update:${ip}`),
  });
}

/** Reading / listing catalog products. */
export async function productQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.productQuery,
    keyGenerator: () => (userId ? `product-query:${userId}:${ip}` : `product-query:${ip}`),
  });
}

/** Bulk publish of catalog products. */
export async function productBulkPublishRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.productBulkPublish,
    keyGenerator: () =>
      userId ? `product-bulk-publish:${userId}:${ip}` : `product-bulk-publish:${ip}`,
  });
}

/** Buyers/suppliers list, refresh, and match dropdowns. */
export async function clientQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.clientQuery,
    keyGenerator: () => (userId ? `client-query:${userId}:${ip}` : `client-query:${ip}`),
  });
}

/** Creating buyers/suppliers (including imports and sync). */
export async function clientCreationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.clientCreate,
    keyGenerator: () => (userId ? `client-create:${userId}:${ip}` : `client-create:${ip}`),
  });
}

/** Updating or deleting buyers/suppliers. */
export async function clientUpdateRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.clientUpdate,
    keyGenerator: () => (userId ? `client-update:${userId}:${ip}` : `client-update:${ip}`),
  });
}

/** Company / user settings mutations. */
export async function settingsOperationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.settingsOperation,
    keyGenerator: () =>
      userId ? `settings-operation:${userId}:${ip}` : `settings-operation:${ip}`,
  });
}

/** Sales jobs / CRM sales operations. */
export async function salesOperationRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.salesOperation,
    keyGenerator: () => (userId ? `sales-operation:${userId}:${ip}` : `sales-operation:${ip}`),
  });
}

/** Dashboard analytics / metrics reads. */
export async function dashboardQueryRateLimiter(
  req: NextRequest,
  userId: number | null
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.dashboardQuery,
    keyGenerator: () => (userId ? `dashboard-query:${userId}:${ip}` : `dashboard-query:${ip}`),
  });
}

/** Marketplace “I will pay” intent (fanout-heavy). */
export async function marketplacePayIntentRateLimiter(
  req: NextRequest,
  marketplaceUserId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.marketplacePayIntent,
    keyGenerator: () => `marketplace-pay-intent:${marketplaceUserId}:${ip}`,
  });
}

/** Marketplace return / refund requests. */
export async function marketplaceReturnRequestRateLimiter(
  req: NextRequest,
  marketplaceUserId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.marketplaceReturnRequest,
    keyGenerator: () => `marketplace-return-request:${marketplaceUserId}:${ip}`,
  });
}

/** Authenticated Mapbox geocode proxy. */
export async function mapboxGeocodeRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.mapboxGeocode,
    keyGenerator: () => `mapbox-geocode:${userId}:${ip}`,
  });
}

/** Mobile address geocode (authenticated or signup). */
export async function mobileGeocodeRateLimiter(
  req: NextRequest,
  userId?: number | null,
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const quantity = userId
    ? RATE_LIMIT_QUANTITIES.mobileGeocodeAuthenticated
    : RATE_LIMIT_QUANTITIES.mobileGeocodeAnonymous;
  return rateLimit(req, {
    ...quantity,
    keyGenerator: () =>
      userId ? `mobile-geocode:user:${userId}:${ip}` : `mobile-geocode:ip:${ip}`,
  });
}

/** Dashboard telemetry session samples. */
export async function telemetrySessionRateLimiter(
  req: NextRequest,
  userId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.telemetrySession,
    keyGenerator: () => `telemetry-session:${userId}:${ip}`,
  });
}

/** Driver app telemetry session samples. */
export async function driverTelemetrySessionRateLimiter(
  req: NextRequest,
  driverId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.driverTelemetrySession,
    keyGenerator: () => `driver-telemetry-session:${driverId}:${ip}`,
  });
}

/** Marketplace push-token register / update / delete. */
export async function marketplacePushTokenRateLimiter(
  req: NextRequest,
  marketplaceUserId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.marketplacePushToken,
    keyGenerator: () => `marketplace-push-token:${marketplaceUserId}:${ip}`,
  });
}

/** Generic marketplace write mutations without a dedicated limiter. */
export async function marketplaceMutationRateLimiter(
  req: NextRequest,
  marketplaceUserId: number,
  action: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const safeAction = String(action || 'mutation').slice(0, 64);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.marketplaceMutation,
    keyGenerator: () => `marketplace-mutation:${safeAction}:${marketplaceUserId}:${ip}`,
  });
}

/** Generic driver-authenticated write mutations. */
export async function driverMutationRateLimiter(
  req: NextRequest,
  driverId: number,
  action: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const safeAction = String(action || 'mutation').slice(0, 64);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.driverMutation,
    keyGenerator: () => `driver-mutation:${safeAction}:${driverId}:${ip}`,
  });
}

/** OTP code verification attempts. */
export async function otpVerifyRateLimiter(
  req: NextRequest,
  phone: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const safePhone = String(phone || '').trim().slice(0, 32);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.otpVerify,
    keyGenerator: () => `otp-verify:${safePhone}:${ip}`,
  });
}

/** Platform-admin write operations. */
export async function platformAdminMutationRateLimiter(
  req: NextRequest,
  adminId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.platformAdminMutation,
    keyGenerator: () => `platform-admin-mutation:${adminId}:${ip}`,
  });
}

/** Platform-admin analytics / search / user reads. */
export async function platformAdminReadRateLimiter(
  req: NextRequest,
  adminId: number,
  action: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const safeAction = String(action || 'read').slice(0, 64);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.platformAdminRead,
    keyGenerator: () => `platform-admin-read:${safeAction}:${adminId}:${ip}`,
  });
}

/** Issuing WebSocket / access tokens. */
export async function tokenIssueRateLimiter(
  req: NextRequest,
  subjectId: number,
  kind: 'dashboard' | 'platform-admin'
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.tokenIssue,
    keyGenerator: () => `token-issue:${kind}:${subjectId}:${ip}`,
  });
}

/** Driver push-token register / update / delete. */
export async function driverPushTokenRateLimiter(
  req: NextRequest,
  driverId: number
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  return rateLimit(req, {
    ...RATE_LIMIT_QUANTITIES.driverPushToken,
    keyGenerator: () => `driver-push-token:${driverId}:${ip}`,
  });
}

/** GraphQL query complexity / depth / field caps. */
export async function graphQLComplexityRateLimiter(
  req: NextRequest,
  query: string,
  userId: number | null,
  baseLimit: number = RATE_LIMIT_QUANTITIES.graphqlComplexity.baseLimit
): Promise<NextResponse | null> {
  const {
    absoluteLimit,
    maxDepth,
    maxFields,
    complexityPerRequest,
    windowMs,
    progressivePenalty,
    burstLimit,
    burstWindowMs,
  } = RATE_LIMIT_QUANTITIES.graphqlComplexity;

  let complexity: number;
  let depth: number;
  let fieldCount: number;
  try {
    ({ complexity, depth, fieldCount } = calculateGraphQLComplexity(query));
  } catch (error) {
    if (error instanceof GraphQLComplexityParseError) {
      return NextResponse.json(
        {
          errors: [{
            message: 'Invalid GraphQL document',
            extensions: { code: 'QUERY_PARSE_FAILED' },
          }],
        },
        { status: 400 }
      );
    }
    throw error;
  }

  if (depth > maxDepth) {
    return NextResponse.json(
      {
        errors: [{
          message: `Query depth exceeds maximum allowed (${maxDepth} levels)`,
          extensions: { code: 'QUERY_TOO_DEEP', depth, maxDepth },
        }],
      },
      { status: 400 }
    );
  }

  if (fieldCount > maxFields) {
    return NextResponse.json(
      {
        errors: [{
          message: `Query contains too many fields (maximum ${maxFields})`,
          extensions: { code: 'QUERY_TOO_LARGE', fieldCount, maxFields },
        }],
      },
      { status: 400 }
    );
  }

  const complexityMultiplier = Math.ceil(complexity / complexityPerRequest);
  const complexityAdjustedLimit = Math.floor(baseLimit / Math.max(1, complexityMultiplier));
  const requestLimit = Math.min(complexityAdjustedLimit, absoluteLimit);
  const ip = getClientIp(req);

  return rateLimit(req, {
    windowMs,
    maxRequests: requestLimit,
    message: `Query complexity too high. Please simplify your query. (Complexity: ${complexity}, Limit: ${requestLimit})`,
    keyGenerator: () =>
      userId ? `graphql-complexity:${userId}:${ip}` : `graphql-complexity:${ip}`,
    progressivePenalty,
    burstLimit,
    burstWindowMs,
  });
}
