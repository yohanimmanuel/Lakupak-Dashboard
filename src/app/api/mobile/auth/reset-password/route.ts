import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { validateAuthInput, getSecurityHeaders } from '@/utils/auth-security';
import { passwordResetRateLimiter } from '@/utils/rateLimiter';

/**
 * POST /api/mobile/auth/reset-password
 * Body: { email: string, token: string, password: string }
 * For marketplace users. Requires valid verification token from forgot-password.
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    let body: { email?: unknown; token?: unknown; password?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400, headers }
      );
    }

    const { email, token, password } = body;

    if (email && typeof email === 'string') {
      const rateLimitResponse = await passwordResetRateLimiter(req, email);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }

    if (!email || !token || !password) {
      return NextResponse.json(
        { error: 'Email, verification code, and new password are required' },
        { status: 400, headers }
      );
    }

    const emailValidation = validateAuthInput.email(email as string);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.error },
        { status: 400, headers }
      );
    }

    const passwordValidation = validateAuthInput.password(password as string);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error },
        { status: 400, headers }
      );
    }

    const tokenStr = typeof token === 'string' ? token.trim() : '';
    if (!tokenStr) {
      return NextResponse.json(
        { error: 'Verification code is required' },
        { status: 400, headers }
      );
    }

    const normalizedEmail = (email as string).trim().toLowerCase();
    const tokenHash = createHash('sha256').update(tokenStr).digest('hex');

    const user = await prisma.marketplaceUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link. Please request a new password reset.', code: 'INVALID_OR_EXPIRED_CODE' },
        { status: 400, headers }
      );
    }

    const resetRecord = await prisma.marketplacePasswordResetToken.findFirst({
      where: {
        marketplaceUserId: user.id,
        tokenHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetRecord) {
      return NextResponse.json(
        { error: 'Invalid or expired verification code. Please request a new password reset.', code: 'INVALID_OR_EXPIRED_CODE' },
        { status: 400, headers }
      );
    }

    const hashedPassword = await hash(password as string, 12);
    await prisma.marketplaceUser.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });
    await prisma.marketplacePasswordResetToken.delete({
      where: { id: resetRecord.id },
    });

    const successHeaders = {
      ...headers,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    };
    return NextResponse.json(
      {
        message:
          'Password has been reset successfully. You can now log in with your new password.',
      },
      { status: 200, headers: successHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500, headers }
    );
  }
}
