import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { 
  getSecurityHeaders 
} from '../../../../utils/auth-security';

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId || isNaN(Number(userId))) {
      return NextResponse.json(
        { error: 'Valid user ID is required' }, 
        { status: 400, headers }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
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

