import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../../generated/prisma';
import { hash } from 'bcryptjs';
import { 
  validateAuthInput, 
  getSecurityHeaders 
} from '../../../../utils/auth-security';

const prisma = new PrismaClient();

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
    
    const { userId, newPassword } = body;
    
    if (!userId || typeof userId !== 'number') {
      return NextResponse.json(
        { error: 'Valid user ID is required' }, 
        { status: 400, headers }
      );
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

