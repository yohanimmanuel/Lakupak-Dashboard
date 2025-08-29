import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { PrismaClient } from '../../../../generated/prisma';
import { 
  validateAuthInput, 
  getSecurityHeaders, 
  sanitizeUserData 
} from '../../../../utils/auth-security';

const prisma = new PrismaClient();

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
    
    const { email, password } = body;
    
    // Validate input
    const emailValidation = validateAuthInput.email(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.error }, 
        { status: 400, headers }
      );
    }
    
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required' }, 
        { status: 400, headers }
      );
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
    // Find user
    const user = await prisma.user.findUnique({ 
      where: { email: normalizedEmail } 
    });
    
    if (!user) {
      // Don't reveal whether email exists
      return NextResponse.json(
        { error: 'Invalid email or password' }, 
        { status: 401, headers }
      );
    }
    
    // Verify password
    const valid = await compare(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid email or password' }, 
        { status: 401, headers }
      );
    }
    
    // Return sanitized user data
    const userData = sanitizeUserData(user);
    
    return NextResponse.json(userData, { 
      status: 200, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}
