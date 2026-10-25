import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { settingsOperationRateLimiter } from '@/utils/rateLimiter';
import { auditAccount } from '@/lib/audit';
import { isValidReferralCodeFormat, normalizeReferralCode } from '@/lib/marketplace/access';

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' };

/** The distributor's own marketplace referral code. */
export async function GET(req: NextRequest) {
  const headers = { ...getSecurityHeaders(), ...noStore };
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { marketplaceReferralCode: true },
  });
  return NextResponse.json({ referralCode: user?.marketplaceReferralCode ?? null }, { headers });
}

/** Sets or clears the code. Clearing it stops new retailers from joining; existing ones keep access. */
export async function PUT(req: NextRequest) {
  const headers = { ...getSecurityHeaders(), ...noStore };
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  }

  const rateLimitResponse = await settingsOperationRateLimiter(req, userId);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });
  }

  const code = normalizeReferralCode((body as { referralCode?: unknown } | null)?.referralCode);
  if (code && !isValidReferralCodeFormat(code)) {
    return NextResponse.json(
      { error: 'Use 4 to 24 letters, numbers, or dashes.', code: 'REFERRAL_CODE_FORMAT' },
      { status: 400, headers },
    );
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { marketplaceReferralCode: code || null },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'This code is already used by another distributor.', code: 'REFERRAL_CODE_TAKEN' },
        { status: 409, headers },
      );
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500, headers },
    );
  }

  auditAccount(req, {
    action: 'marketplace.referral_code.update',
    actorType: 'dashboard',
    actorId: userId,
    resourceType: 'User',
    resourceId: String(userId),
    metadata: { cleared: !code },
  });

  return NextResponse.json({ referralCode: code || null }, { headers });
}
