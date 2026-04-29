import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { 
  validateAuthInput, 
  getSecurityHeaders
} from '../../../../../utils/auth-security';
import { otpVerifyRateLimiter } from '@/utils/rateLimiter';


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
    
    const { phone, countryCode, code, profile, mode } = body;
    
    // Validate required fields
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: 'Phone number is required' }, 
        { status: 400, headers }
      );
    }
    
    if (!countryCode || typeof countryCode !== 'string') {
      return NextResponse.json(
        { error: 'Country code is required' }, 
        { status: 400, headers }
      );
    }
    
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Verification code is required' }, 
        { status: 400, headers }
      );
    }
    
    // Validate OTP code format
    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
      return NextResponse.json(
        { error: 'Invalid verification code format' }, 
        { status: 400, headers }
      );
    }

    const rateLimitResponse = await otpVerifyRateLimiter(req, String(phone));
    if (rateLimitResponse) return rateLimitResponse;
    
    // For now, accept any 6-digit code (in production, you'd verify against stored OTP)
    // TODO: Implement proper OTP storage and verification with expiration
    const isValidCode = true;
    
    if (!isValidCode) {
      return NextResponse.json(
        { error: 'Invalid verification code' }, 
        { status: 400, headers }
      );
    }
    
    // Handle signup mode with complete profile
    if (mode === 'signup' && profile) {
      const { name, email, storeName, bio, username, password } = profile;
      
      // Validate profile data
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json(
          { error: 'Name is required' }, 
          { status: 400, headers }
        );
      }
      
      if (!email || typeof email !== 'string' || !email.trim()) {
        return NextResponse.json(
          { error: 'Email is required' }, 
          { status: 400, headers }
        );
      }
      
      if (!password || typeof password !== 'string' || password.length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters long' }, 
          { status: 400, headers }
        );
      }

      if (!username || typeof username !== 'string' || !username.trim()) {
        return NextResponse.json(
          { error: 'Username is required' }, 
          { status: 400, headers }
        );
      }
      
      // Validate email format
      const emailValidation = validateAuthInput.email(email);
      if (!emailValidation.valid) {
        return NextResponse.json(
          { error: emailValidation.error }, 
          { status: 400, headers }
        );
      }
      
      const normalizedEmail = email.trim().toLowerCase();
      
      // Check if marketplace user already exists by email, username, or phone
      const existingUserByEmail = await prisma.marketplaceUser.findUnique({ 
        where: { email: normalizedEmail } 
      });
      
      if (existingUserByEmail) {
        return NextResponse.json(
          { error: 'User with this email is already registered. Please log in.' }, 
          { status: 409, headers }
        );
      }

      // Check if username already exists
      const existingUserByUsername = await prisma.marketplaceUser.findUnique({ 
        where: { username: username.trim() } 
      });
      
      if (existingUserByUsername) {
        return NextResponse.json(
          { error: 'Username is already taken. Please choose a different username.' }, 
          { status: 409, headers }
        );
      }

      // Check if phone already exists (skip check for dummy phone numbers used to skip verification)
      const phoneWithPlus = phone.startsWith('+') ? phone : `+${phone}`;
      const isDummyPhone = phoneWithPlus === '+0000000000' || phoneWithPlus === '+1234567890';
      
      let finalPhone = phoneWithPlus;
      
      if (isDummyPhone) {
        // Generate a unique dummy phone number for users who skip verification
        const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
        finalPhone = `+1000000${timestamp}`; // Use +1000000XXXXXX format for dummy phones
      } else {
        // Check if real phone number already exists
        const existingUserByPhone = await prisma.marketplaceUser.findUnique({ 
          where: { phone: phoneWithPlus } 
        });
        
        if (existingUserByPhone) {
          return NextResponse.json(
            { error: 'Phone number is already registered. Please log in or use a different phone number.' }, 
            { status: 409, headers }
          );
        }
      }
          
      // Create new marketplace user with complete profile
      const hashedPassword = await hash(password, 12);
      
      const user = await prisma.marketplaceUser.create({
        data: {
          username: username.trim(),
          name: name.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          storeName: storeName?.trim() || null,
          bio: bio?.trim() || null,
          phone: finalPhone, // Use the final phone (real or generated dummy)
          country: isDummyPhone ? null : countryCode // Set country to null for dummy phones
        }
      });
      
      // Generate JWT token
      const { signAccessToken } = await import('../../../../../lib/jwt');
      const token = signAccessToken({ 
        sub: user.id, 
        phone: user.phone || undefined // Handle null phone case
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
        status: 201, 
        headers: {
          ...headers,
          'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        }
      });
    }
    
    // Handle login mode (existing user verification)
    // Check if marketplace user exists by phone
    // Try both formats: with + and without +
    const cleanPhone = phone.replace(/\D/g, ''); // Remove all non-digits
    const phoneWithPlus = phone.startsWith('+') ? phone : `+${phone}`;
    
    
    // Try to find user with either format
    let existingUser = await prisma.marketplaceUser.findUnique({
      where: { phone: phoneWithPlus }
    });
    
    if (!existingUser) {
      existingUser = await prisma.marketplaceUser.findUnique({
        where: { phone: cleanPhone }
      });
    }
    
    if (existingUser) {
      if (existingUser.isSuspended) {
        return NextResponse.json(
          { error: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended for a moment.' },
          { status: 403, headers }
        );
      }
      // Generate JWT token
      const { signAccessToken } = await import('../../../../../lib/jwt');
      const token = signAccessToken({ 
        sub: existingUser.id, 
        phone: existingUser.phone 
      }, '30d');
      
      return NextResponse.json({
        token,
        user: {
          id: existingUser.id,
          name: existingUser.name || 'User',
          email: existingUser.email || '',
          address: existingUser.chosenAddress || ''
        }
      }, { 
        status: 200, 
        headers: {
          ...headers,
          'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        }
      });
    }
    
    // User not found - return error for login mode
    return NextResponse.json(
      { error: 'No account found with this phone number. Please sign up first.' }, 
      { status: 404, headers }
    );
    
  } catch (error) {
    console.error('OTP verification failed:', error);
    return NextResponse.json(
      { error: 'Verification failed. Please try again.' }, 
      { status: 500, headers }
    );
  }
}