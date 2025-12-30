import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { 
  getSecurityHeaders 
} from '../../../../utils/auth-security';
import { getAuthenticatedUserId } from '../../../../utils/auth-helpers';

export async function GET(req: NextRequest) {
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
    
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    // Validate userId from query params
    if (!userId || isNaN(Number(userId))) {
      return NextResponse.json(
        { error: 'Valid user ID is required' }, 
        { status: 400, headers }
      );
    }
    
    const userIdNum = Number(userId);

    // Authorization check: verify the authenticated user matches the requested userId
    if (authenticatedUserId !== userIdNum) {
      return NextResponse.json(
        { error: 'Unauthorized access to user data' },
        { status: 403, headers }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userIdNum },
      select: { password: true }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' }, 
        { status: 404, headers }
      );
    }

    return NextResponse.json(
      { hasPassword: !!user.password }, 
      { status: 200, headers }
    );
    
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}

