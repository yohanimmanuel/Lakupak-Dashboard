import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { 
  validateAuthInput, 
  getSecurityHeaders 
} from '../../../../utils/auth-security';
import { passwordResetRateLimiter } from '../../../../utils/rateLimiter';
import { auditAuth } from '@/lib/audit';

/**
 * POST /api/auth/reset-password
 * Body: { email: string, token: string, password: string }
 * For dashboard (distributor) users. Requires a valid, unexpired verification
 * code previously issued by /api/auth/forgot-password.
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400, headers }
      );
    }
    
    const { email, password, token } = body;
    
    // Apply rate limiting EARLY: 3 requests per hour per email
    if (email) {
      const rateLimitResponse = await passwordResetRateLimiter(req, email);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
    
    // Validate required fields
    if (!email || !password || !token) {
      return NextResponse.json(
        { error: 'Email, verification code, and new password are required' }, 
        { status: 400, headers }
      );
    }
    
    // Validate email input
    const emailValidation = validateAuthInput.email(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.error }, 
        { status: 400, headers }
      );
    }
    
    // Validate password input
    const passwordValidation = validateAuthInput.password(password);
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
    
    const normalizedEmail = email.trim().toLowerCase();
    const tokenHash = createHash('sha256').update(tokenStr).digest('hex');
    
    // Find user
    const user = await prisma.user.findUnique({ 
      where: { email: normalizedEmail } 
    });
    
    // Use a single generic error for both "no user" and "bad/expired code" so the
    // endpoint cannot be used to enumerate accounts or probe code validity.
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired verification code. Please request a new password reset.', code: 'INVALID_OR_EXPIRED_CODE' }, 
        { status: 400, headers }
      );
    }

    const resetRecord = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
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
    
    // Hash new password with 12 rounds (production strength)
    const hashedPassword = await hash(password, 12);
    
    // Update password and consume the token so it cannot be replayed.
    await prisma.user.update({ 
      where: { id: user.id }, 
      data: { password: hashedPassword } 
    });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    auditAuth(req, {
      action: 'password.reset',
      actorType: 'dashboard',
      actorId: user.id,
      success: true,
      metadata: { scope: 'dashboard' },
    });
    
    return NextResponse.json(
      { message: 'Password has been reset successfully. You can now login with your new password.' }, 
      { 
        status: 200, 
        headers: {
          ...headers,
          'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        }
      }
    );
    
  } catch (error) {
    // Reset password error occurred
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}
