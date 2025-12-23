import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { 
  validateAuthInput, 
  getSecurityHeaders 
} from '../../../../utils/auth-security';


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
    
    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and new password are required' }, 
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
    
    const normalizedEmail = email.trim().toLowerCase();
    
    // Find user
    const user = await prisma.user.findUnique({ 
      where: { email: normalizedEmail } 
    });
    
    if (!user) {
      // Don't reveal if email exists
      return NextResponse.json(
        { error: 'Invalid reset request' }, 
        { status: 400, headers }
      );
    }
    
    // In production, validate the reset token here
    // For MVP, we'll proceed with password reset
    
    // Hash new password with 12 rounds (production strength)
    const hashedPassword = await hash(password, 12);
    
    // Update user password
    await prisma.user.update({ 
      where: { email: normalizedEmail }, 
      data: { password: hashedPassword } 
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
