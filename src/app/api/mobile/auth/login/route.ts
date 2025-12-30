import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { 
  validateAuthInput, 
  getSecurityHeaders, 
  sanitizeUserData 
} from '../../../../../utils/auth-security';
import { loginRateLimiter } from '../../../../../utils/rateLimiter';

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
    
    const { username, password } = body;
    
    // Validate input - username can be email or username
    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username or email is required' }, 
        { status: 400, headers }
      );
    }
    
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required' }, 
        { status: 400, headers }
      );
    }
    
    // Check if username is an email
    const isEmail = username.includes('@');
    let user;
    
    if (isEmail) {
      // Login with email
      const emailValidation = validateAuthInput.email(username);
      if (!emailValidation.valid) {
        return NextResponse.json(
          { error: emailValidation.error }, 
          { status: 400, headers }
        );
      }
      
      const normalizedEmail = username.trim().toLowerCase();
      user = await prisma.marketplaceUser.findUnique({ 
        where: { email: normalizedEmail } 
      });
    } else {
      // Login with username
      user = await prisma.marketplaceUser.findUnique({ 
        where: { username: username.trim() } 
      });
    }
    
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' }, 
        { status: 401, headers }
      );
    }
    
    // Verify password
    if (!user.password) {
      return NextResponse.json(
        { error: 'Invalid username or password' }, 
        { status: 401, headers }
      );
    }
    
    const valid = await compare(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid username or password' }, 
        { status: 401, headers }
      );
    }
    
    // Generate JWT token
    const { signAccessToken } = await import('../../../../../lib/jwt');
    const token = signAccessToken({ 
      sub: user.id, 
      phone: user.phone 
    }, '30d');
    
    return NextResponse.json({
      token,
      user: {
        id: user.id,
        name: user.name || 'User',
        email: user.email || '',
        address: user.chosenAddress || ''
      }
    }, { 
      status: 200, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}
