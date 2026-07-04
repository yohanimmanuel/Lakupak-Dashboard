import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAuthInput, getSecurityHeaders } from '@/utils/auth-security';
import { passwordResetVerifyRateLimiter } from '@/utils/rateLimiter';
import { resetCodeHashCandidates } from '@/lib/passwordResetCode';

/**
 * POST /api/mobile/auth/verify-reset-code
 * Body: { email: string, token: string }
 * For marketplace users. Confirms a reset code is valid and unexpired
 * WITHOUT consuming it — the code is consumed later by /api/mobile/auth/reset-password.
 * Used by the multi-step forgot-password flow to validate the code (step 2)
 * before the user sets a new password (step 3).
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    let body: { email?: unknown; token?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400, headers }
      );
    }

    const { email, token } = body;

    if (typeof email !== 'string' || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Email and verification code are required' },
        { status: 400, headers }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const tokenStr = token.trim();

    // Apply rate limiting EARLY to throttle brute-forcing the 6-digit code.
    if (normalizedEmail) {
      const rateLimitResponse = await passwordResetVerifyRateLimiter(req, normalizedEmail);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }

    if (!normalizedEmail || !tokenStr) {
      return NextResponse.json(
        { error: 'Email and verification code are required' },
        { status: 400, headers }
      );
    }

    const emailValidation = validateAuthInput.email(normalizedEmail);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.error },
        { status: 400, headers }
      );
    }

    if (!tokenStr) {
      return NextResponse.json(
        { error: 'Verification code is required' },
        { status: 400, headers }
      );
    }

    const user = await prisma.marketplaceUser.findUnique({
      where: { email: normalizedEmail },
    })

    // Single generic error for unknown-email and bad/expired code, so the endpoint
    // cannot be used to enumerate accounts or probe which part is wrong.
    const invalidResponse = () =>
      NextResponse.json(
        { error: 'Invalid or expired verification code. Please request a new password reset.', code: 'INVALID_OR_EXPIRED_CODE' },
        { status: 400, headers }
      );

    if (!user) {
      return invalidResponse();
    }

    const resetRecord = await prisma.marketplacePasswordResetToken.findFirst({
      where: {
        marketplaceUserId: user.id,
        tokenHash: { in: resetCodeHashCandidates(tokenStr) },
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetRecord) {
      return invalidResponse();
    }

    // Valid — but do NOT delete the token; reset-password consumes it.
    return NextResponse.json(
      { valid: true },
      {
        status: 200,
        headers: {
          ...headers,
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500, headers }
    );
  }
}
