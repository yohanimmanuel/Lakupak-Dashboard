import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { compare, hash } from 'bcryptjs';
import { 
  validateAuthInput, 
  getSecurityHeaders 
} from '../../../../utils/auth-security';

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
    
    const { userId, currentPassword, newPassword } = body;
    
    // Validate required fields
    if (!userId || typeof userId !== 'number') {
      return NextResponse.json(
        { error: 'Valid user ID is required' }, 
        { status: 400, headers }
      );
    }
    
    if (!currentPassword || typeof currentPassword !== 'string') {
      return NextResponse.json(
        { error: 'Current password is required' }, 
        { status: 400, headers }
      );
    }
    
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { error: 'New password is required' }, 
        { status: 400, headers }
      );
    }
    
    // Validate password input using the same validation as reset-password
    const passwordValidation = validateAuthInput.password(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error }, 
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
    
    if (!user.password) {
      return NextResponse.json(
        { error: 'No password set for this account' }, 
        { status: 400, headers }
      );
    }
    
    // Verify current password
    const isCurrentPasswordValid = await compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' }, 
        { status: 401, headers }
      );
    }
    
    // Hash new password with same strength as reset-password (12 rounds)
    const hashedNewPassword = await hash(newPassword, 12);
    
    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });
    
    return NextResponse.json(
      { message: 'Password has been changed successfully. You can now login with your new password.' }, 
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
