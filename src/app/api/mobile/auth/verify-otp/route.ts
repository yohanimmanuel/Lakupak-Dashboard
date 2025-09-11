import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../../../../../generated/prisma';
import { 
  validateAuthInput, 
  getSecurityHeaders, 
  sanitizeUserData 
} from '../../../../../utils/auth-security';

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
      
      console.log('Signup profile received:', { name, email, storeName, bio, username, password: password ? '***' : 'missing' });
      
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
      
      // Validate email format
      const emailValidation = validateAuthInput.email(email);
      if (!emailValidation.valid) {
        return NextResponse.json(
          { error: emailValidation.error }, 
          { status: 400, headers }
        );
      }
      
      const normalizedEmail = email.trim().toLowerCase();
      
      console.log(`Checking for existing marketplace user with email: ${normalizedEmail}`);
      
      // Check if marketplace user already exists
      const existingUser = await prisma.marketplaceUser.findUnique({ 
        where: { email: normalizedEmail } 
      });
      
      if (existingUser) {
        console.log(`Marketplace user already exists:`, { id: existingUser.id, email: existingUser.email, name: existingUser.name });
        return NextResponse.json(
          { error: 'User is registered. Please Log in.' }, 
          { status: 409, headers }
        );
      }
      
      console.log(`No existing marketplace user found, proceeding with account creation for: ${normalizedEmail}`);
      
      // Create new marketplace user with complete profile
      const hashedPassword = await hash(password, 12);
      
      // Extract phone number from the phone parameter (it includes country code)
      // Store phone with + prefix for consistency
      const phoneWithPlus = phone.startsWith('+') ? phone : `+${phone}`;
      
      const user = await prisma.marketplaceUser.create({
        data: {
          username: username.trim(),
          name: name.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          storeName: storeName?.trim() || null,
          bio: bio?.trim() || null,
          phone: phoneWithPlus,
          country: countryCode
        }
      });
      
      // Return user data with token
      const token = `mobile_token_${user.id}_${Date.now()}`;
      
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
    
    console.log(`Looking for user with phone: ${phone} (clean: ${cleanPhone}, with+: ${phoneWithPlus})`);
    
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
      const token = `mobile_token_${existingUser.id}_${Date.now()}`;
      
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
    console.error('OTP verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed. Please try again.' }, 
      { status: 500, headers }
    );
  }
}

// Helper function to verify OTP with external service
async function verifyOtpWithService(phone: string, countryCode: string, code: string): Promise<boolean> {
  // In production, integrate with WhatsApp/SMS service
  // For now, return true for development
  return true;
}

// Helper function to get currency by country code
function getCurrencyByCountryCode(countryCode: string): string {
  const currencyMap: { [key: string]: string } = {
    'SG': 'SGD',
    'ID': 'IDR',
    'MY': 'MYR',
    'PH': 'PHP',
    'TH': 'THB',
    'VN': 'VND',
    'US': 'USD'
  };
  return currencyMap[countryCode] || 'IDR';
}