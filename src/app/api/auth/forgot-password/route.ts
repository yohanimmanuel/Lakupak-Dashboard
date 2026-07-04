import { NextRequest, NextResponse } from 'next/server';
import { randomInt, createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { 
  validateAuthInput, 
  getSecurityHeaders 
} from '../../../../utils/auth-security';
import { passwordResetRateLimiter } from '../../../../utils/rateLimiter';
import { sendPasswordResetEmail } from '@/lib/email';

const RESET_TOKEN_EXPIRY_HOURS = 1;

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 * For dashboard (distributor) users. Never reveals whether the email exists.
 * If the user exists: generates a 6-digit code, stores its hash + expiry, and emails it.
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400, headers }
      );
    }
    
    const { email } = body;
    
    // Apply rate limiting EARLY: 3 requests per hour per email
    if (email) {
      const rateLimitResponse = await passwordResetRateLimiter(req, email);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
    
    const emailValidation = validateAuthInput.email(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.error }, 
        { status: 400, headers }
      );
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
    const user = await prisma.user.findUnique({ 
      where: { email: normalizedEmail } 
    });
    
    // Only issue a token for real accounts, but keep the response identical
    // either way so the endpoint cannot be used to enumerate registered emails.
    if (user) {
      try {
        // Cryptographically secure 6-digit verification code.
        const verificationCode = String(randomInt(100000, 1000000));
        const tokenHash = createHash('sha256').update(verificationCode).digest('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

        // Invalidate any outstanding codes before issuing a new one.
        await prisma.passwordResetToken.deleteMany({
          where: { userId: user.id },
        });
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });

        const baseUrl =
          process.env.DASHBOARD_RESET_PASSWORD_BASE_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.NEXTAUTH_URL ||
          '';
        const resetLink = baseUrl
          ? `${baseUrl.replace(/\/$/, '')}/forgotpassword?code=${encodeURIComponent(verificationCode)}&email=${encodeURIComponent(normalizedEmail)}`
          : '';

        await sendPasswordResetEmail(
          normalizedEmail,
          resetLink || 'Enter the code in the app',
          verificationCode
        );
      } catch {
        // Keep the response generic; never leak token/email delivery outcome.
      }
    }
    
    return NextResponse.json(
      { 
        message: 'If this email exists in our system, a password reset code will be sent shortly.' 
      }, 
      { 
        status: 200, 
        headers: {
          ...headers,
          'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        }
      }
    );
    
  } catch (error) {
    // Forgot password error occurred
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}
