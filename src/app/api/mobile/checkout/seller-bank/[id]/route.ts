import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';
import { buildMobileBuyerId } from '@/utils/buyerSync';
import { checkoutSellerBankRateLimiter, getClientIp } from '@/utils/rateLimiter';

function maskBankAccountNumber(accountNumber: string | null | undefined): string | null {
  if (!accountNumber) return null;
  const raw = String(accountNumber);
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length <= 4) return digits;
  const last4 = digits.slice(-4);
  return `•••• ${last4}`;
}

/**
 * GET /api/mobile/checkout/seller-bank/[id]
 * Authenticated endpoint for checkout-only seller bank details.
 *
 * NOTE: This intentionally avoids leaking bank details in the public marketplace product listing.
 * For now we require a valid Marketplace JWT (buyer session). Further restrictions (e.g. verified
 * checkout/order context) can be added later.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const headers = getSecurityHeaders();

  try {
    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }

    const marketplaceUserId = auth.userId;

    const { id } = await params;
    const sellerUserId = id ? parseInt(id, 10) : NaN;
    if (!Number.isFinite(sellerUserId) || sellerUserId < 1) {
      return NextResponse.json({ error: 'Invalid seller id' }, { status: 400, headers });
    }

    // Rate limit to mitigate enumeration
    const rateLimitResponse = await checkoutSellerBankRateLimiter(request, marketplaceUserId, sellerUserId);
    if (rateLimitResponse) return rateLimitResponse;

    // Authorization:
    // Allow only buyers that are linked to this seller via an existing order.
    // (Sellers themselves are dashboard users; marketplace JWT cannot reliably represent them here.)
    const baseBuyerId = buildMobileBuyerId(marketplaceUserId);
    const linkedOrder = await prisma.order.findFirst({
      where: {
        userId: sellerUserId,
        isDeleted: false,
        buyerId: { startsWith: baseBuyerId },
      },
      select: { orderId: true, orderStatus: true, paymentStatus: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!linkedOrder) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
    }

    const seller = await prisma.user.findUnique({
      where: { id: sellerUserId },
      select: {
        id: true,
        company: {
          select: {
            name: true,
            billingBankName: true,
            billingBankAccountName: true,
            billingBankAccountNumber: true,
            buyerPaymentTermDays: true,
          },
        },
      },
    });

    if (!seller?.company) {
      return NextResponse.json({ error: 'Seller not found' }, { status: 404, headers });
    }

    const full = request.nextUrl.searchParams.get('full') === '1';

    // Access log (server-side): who accessed which seller and why.
    // This is intentionally logged only when data is returned.
    try {
      console.info('[checkout/seller-bank] access_granted', {
        at: new Date().toISOString(),
        requesterMarketplaceUserId: marketplaceUserId,
        targetSellerUserId: sellerUserId,
        ip: getClientIp(request),
        rationale: full ? 'buyer_has_linked_order_full_audited' : 'buyer_has_linked_order_masked',
        linkedOrderId: linkedOrder.orderId,
        linkedOrderStatus: linkedOrder.orderStatus,
        linkedPaymentStatus: linkedOrder.paymentStatus,
        returnedAccountNumber: full ? 'full' : 'masked',
      });
    } catch {
      // best-effort logging
    }

    return NextResponse.json(
      {
        sellerUserId: seller.id,
        companyName: seller.company.name,
        billingBankName: seller.company.billingBankName ?? null,
        billingBankAccountName: seller.company.billingBankAccountName ?? null,
        billingBankAccountNumber: full
          ? (seller.company.billingBankAccountNumber ?? null)
          : maskBankAccountNumber(seller.company.billingBankAccountNumber),
        buyerPaymentTermDays: seller.company.buyerPaymentTermDays ?? null,
      },
      { status: 200, headers }
    );
  } catch (e) {
    console.error('Checkout seller bank fetch error:', e);
    return NextResponse.json({ error: 'Failed to load seller bank details.' }, { status: 500, headers });
  }
}

