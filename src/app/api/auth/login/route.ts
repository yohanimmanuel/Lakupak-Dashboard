import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { 
  validateAuthInput, 
  getSecurityHeaders, 
  sanitizeUserData 
} from '../../../../utils/auth-security';
import { loginRateLimiter } from '../../../../utils/rateLimiter';

export async function POST(req: NextRequest) {
  // Apply rate limiting: 5 attempts per 15 minutes
  const rateLimitResponse = await loginRateLimiter(req);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  
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
    
    // Find user with company data
    const user = await prisma.user.findUnique({ 
      where: { email: normalizedEmail },
      include: {
        company: true
      }
    });
    
    if (!user) {
      // Don't reveal whether email exists
      return NextResponse.json(
        { error: 'Invalid email or password' }, 
        { status: 401, headers }
      );
    }
    
    // Verify password
    if (!user.password) {
      return NextResponse.json(
        { error: 'Invalid email or password' }, 
        { status: 401, headers }
      );
    }
    
    const valid = await compare(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid email or password' }, 
        { status: 401, headers }
      );
    }
    
    // Return sanitized user data with user's currency (no server override)
    const userData = sanitizeUserData(user);
    
    return NextResponse.json(userData, { 
      status: 200, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    // Login error occurred
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}
