import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { validateAuthInput, getSecurityHeaders } from '@/utils/auth-security';
import { passwordResetRateLimiter } from '@/utils/rateLimiter';
import { sendPasswordResetEmail } from '@/lib/email';

const RESET_TOKEN_EXPIRY_HOURS = 1;

/**
 * POST /api/mobile/auth/forgot-password
 * Body: { email: string }
 * For marketplace users. Does not reveal if email exists (always same response).
 * If user exists: generates token, stores hash + expiry, sends reset link by email.
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    let body: { email?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400, headers }
      );
    }

    const email = body.email;

    if (email && typeof email === 'string') {
      const rateLimitResponse = await passwordResetRateLimiter(req, email);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }

    const emailValidation = validateAuthInput.email(email as string);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.error },
        { status: 400, headers }
      );
    }

    const normalizedEmail = (email as string).trim().toLowerCase();

    const marketplaceUser = await prisma.marketplaceUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (marketplaceUser) {
      try {
        // 6-digit OTP for in-app entry and link
        const verificationCode = String(
          Math.floor(100000 + Math.random() * 900000)
        );
        const otpHash = createHash('sha256').update(verificationCode).digest('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

        await prisma.marketplacePasswordResetToken.deleteMany({
          where: { marketplaceUserId: marketplaceUser.id },
        });
        await prisma.marketplacePasswordResetToken.create({
          data: {
            marketplaceUserId: marketplaceUser.id,
            tokenHash: otpHash,
            expiresAt,
          },
        });

        const baseUrl =
          process.env.MARKETPLACE_RESET_PASSWORD_BASE_URL ||
          process.env.NEXT_PUBLIC_MARKETPLACE_URL ||
          '';
        const resetLink = baseUrl
          ? `${baseUrl.replace(/\/$/, '')}/reset-password?code=${encodeURIComponent(verificationCode)}&email=${encodeURIComponent(normalizedEmail)}`
          : '';

        await sendPasswordResetEmail(
          normalizedEmail,
          resetLink || 'Enter the code in the app',
          verificationCode
        );
      } catch {
        // Keep response generic; do not leak success/failure of token or email
      }
    }

    return NextResponse.json(
      {
        message:
          'If this email is registered, we will send you instructions to reset your password. Please check your email.',
      },
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
