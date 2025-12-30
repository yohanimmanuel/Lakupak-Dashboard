import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hash } from 'bcryptjs';
import { 
  validateAuthInput, 
  getSecurityHeaders 
} from '../../../../utils/auth-security';
import { getAuthenticatedUserId } from '../../../../utils/auth-helpers';
import { settingsOperationRateLimiter } from '../../../../utils/rateLimiter';

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    // Authenticate user (supports both JWT and NextAuth session)
    const authenticatedUserId = await getAuthenticatedUserId(req);
    if (!authenticatedUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers }
      );
    }
    
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400, headers }
      );
    }
    
    const { userId, newPassword } = body;
    
    // Validate userId from request body
    if (!userId || typeof userId !== 'number') {
      return NextResponse.json(
        { error: 'Valid user ID is required' }, 
        { status: 400, headers }
      );
    }
    
    // Authorization check: verify the authenticated user matches the requested userId
    if (authenticatedUserId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized access to user data' },
        { status: 403, headers }
      );
    }
    
    // Apply rate limiting with the VERIFIED authenticated user ID
    const rateLimitResponse = await settingsOperationRateLimiter(req, authenticatedUserId);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { error: 'New password is required' }, 
        { status: 400, headers }
      );
    }
    
    const passwordValidation = validateAuthInput.password(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error }, 
        { status: 400, headers }
      );
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' }, 
        { status: 404, headers }
      );
    }
    
    if (user.password) {
      return NextResponse.json(
        { error: 'Password already set. Use change-password endpoint instead.' }, 
        { status: 400, headers }
      );
    }
    
    const hashedPassword = await hash(newPassword, 12);
    
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });
    
    return NextResponse.json(
      { message: 'Password has been set successfully. You can now login with your password.' }, 
      { 
        status: 200, 
        headers: {
          ...headers,
          'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        }
      }
    );
    
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}

