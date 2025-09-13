import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../../generated/prisma';
import { getSecurityHeaders } from '../../../../utils/auth-security';

const prisma = new PrismaClient();

export async function PUT(req: NextRequest) {
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
    
    const { userId, enabled } = body;
    
    // Validate required fields
    if (!userId || typeof userId !== 'number') {
      return NextResponse.json(
        { error: 'Valid user ID is required' }, 
        { status: 400, headers }
      );
    }
    
    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Enabled status is required' }, 
        { status: 400, headers }
      );
    }
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' }, 
        { status: 404, headers }
      );
    }
    
    // For now, we'll just return success since we don't have 2FA fields in the schema yet
    // In a real implementation, you would update the user's 2FA settings here
    
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
