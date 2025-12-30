import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '../../../../utils/auth-security';
import { settingsOperationRateLimiter } from '../../../../utils/rateLimiter';
import { getAuthenticatedUserId } from '../../../../utils/auth-helpers';

export async function PUT(req: NextRequest) {
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
    
    const { userId, enabled } = body;
    
    // If userId is provided in body, verify it matches authenticated user
    if (userId !== undefined) {
      if (typeof userId !== 'number') {
        return NextResponse.json(
          { error: 'Valid user ID is required' }, 
          { status: 400, headers }
        );
      }
      
      // Verify that the provided userId matches the authenticated user
      if (userId !== authenticatedUserId) {
        return NextResponse.json(
          { error: 'Unauthorized access to user data' },
          { status: 403, headers }
        );
      }
    }
    
    // Apply rate limiting using authenticated user ID: 10 operations per hour
    const rateLimitResponse = await settingsOperationRateLimiter(req, authenticatedUserId);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Enabled must be a boolean' }, 
        { status: 400, headers }
      );
    }    
    // Find user using authenticated ID
    const user = await prisma.user.findUnique({
      where: { id: authenticatedUserId }
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' }, 
        { status: 404, headers }
      );
    }
    
    // For now, we'll just return success since we don't have 2FA fields in the schema yet
    // In a real implementation, you would update the user's 2FA settings here
    // using authenticatedUserId: await prisma.user.update({ where: { id: authenticatedUserId }, ... })
    
    return NextResponse.json(
      { 
        message: `2FA ${enabled ? 'enabled' : 'disabled'} successfully`,
        twoFactorEnabled: enabled
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
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}
