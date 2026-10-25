import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { 
  validateAuthInput, 
  getSecurityHeaders
} from '../../../../../utils/auth-security';
import { otpVerifyRateLimiter } from '@/utils/rateLimiter';
import { auditAuth } from '@/lib/audit';
import { verifyMobileOtp } from '@/lib/mobileOtp';
import {
  ensureMarketplaceMembership,
  findDistributorByReferralCode,
  joinOrRequireMembership,
  normalizeReferralCode,
  validateJoinOrRequireMembership,
} from '@/lib/marketplace/access';

const DUMMY_PHONE_ALLOWLIST = new Set(['+0000000000', '+1234567890']);

/** Dev/test-only: skip OTP verification for fixed placeholder numbers. Never enabled in production. */
function isDummyPhoneBypassAllowed(phoneWithPlus: string): boolean {
  if (!DUMMY_PHONE_ALLOWLIST.has(phoneWithPlus)) return false;
  if (process.env.NODE_ENV === 'production') return false;
  const flag = process.env.MOBILE_OTP_ALLOW_DUMMY_PHONES?.trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

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

    const phoneWithPlus = phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`;
    const cleanPhone = phone.replace(/\D/g, '');

    // Referral checks must run before verifyMobileOtp (it consumes the OTP on success).
    let signupInvitingDistributor: { id: number } | null = null;
    if (mode === 'signup' && profile) {
      const referralCode = profile.referralCode ?? body.referralCode;
      const invitingDistributor = normalizeReferralCode(referralCode)
        ? await findDistributorByReferralCode(referralCode)
        : null;
      if (!invitingDistributor) {
        return NextResponse.json(
          normalizeReferralCode(referralCode)
            ? { error: 'This referral code is not valid. Check it with your distributor.', code: 'REFERRAL_CODE_INVALID' }
            : { error: 'Enter the referral code from your distributor', code: 'REFERRAL_CODE_REQUIRED' },
          { status: 400, headers },
        );
      }
      signupInvitingDistributor = invitingDistributor;
    } else {
      let existingUserForReferral = await prisma.marketplaceUser.findUnique({
        where: { phone: phoneWithPlus },
      });
      if (!existingUserForReferral) {
        existingUserForReferral = await prisma.marketplaceUser.findUnique({
          where: { phone: cleanPhone },
        });
      }
      if (existingUserForReferral) {
        const referralPrecheck = await validateJoinOrRequireMembership(
          existingUserForReferral.id,
          body.referralCode,
        );
        if ('error' in referralPrecheck) {
          return NextResponse.json(referralPrecheck, {
            status: referralPrecheck.status,
            headers,
          });
        }
      }
    }

    if (!isDummyPhoneBypassAllowed(phoneWithPlus)) {
      const otpResult = await verifyMobileOtp(phoneWithPlus, code);

      if (!otpResult.ok) {
        const messages: Record<typeof otpResult.reason, string> = {
          not_found: 'No verification code found. Please request a new code.',
          expired: 'Verification code has expired. Please request a new code.',
          invalid: 'Invalid verification code.',
          too_many_attempts: 'Too many failed attempts. Please request a new code.',
        };
        return NextResponse.json(
          { error: messages[otpResult.reason] },
          { status: 400, headers },
        );
      }
    }
    
    // Handle signup mode with complete profile
    if (mode === 'signup' && profile) {
      const { name, email, storeName, bio, username, password } = profile;
      const invitingDistributor = signupInvitingDistributor!;
      
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

      // Check if phone already exists (skip dummy placeholders used to skip verification)
      const dummyPhone = isDummyPhoneBypassAllowed(phoneWithPlus);

      let finalPhone: string | null = null;
      let finalCountry: string | null = null;

      if (!dummyPhone) {
        finalPhone = phoneWithPlus;
        finalCountry = countryCode || null;

        const existingUserByPhone = await prisma.marketplaceUser.findUnique({
          where: { phone: phoneWithPlus },
        });

        if (existingUserByPhone) {
          return NextResponse.json(
            { error: 'Phone number is already registered. Please log in or use a different phone number.' },
            { status: 409, headers },
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
          phone: finalPhone,
          country: finalCountry
        }
      });
      await ensureMarketplaceMembership(user.id, invitingDistributor.id);
      
      auditAuth(req, {
        action: 'register',
        actorType: 'marketplace',
        actorId: user.id,
        resourceType: 'MarketplaceUser',
        resourceId: String(user.id),
        success: true,
        metadata: { scope: 'marketplace', via: 'otp' },
      });

      // Generate JWT token
      const { signAccessToken } = await import('../../../../../lib/jwt');
      const token = signAccessToken({
        sub: user.id,
        phone: user.phone || undefined,
        type: 'marketplace',
        distributorId: invitingDistributor.id,
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
      const membership = await joinOrRequireMembership(existingUser.id, body.referralCode);
      if ('error' in membership) {
        return NextResponse.json(membership, { status: membership.status, headers });
      }
      auditAuth(req, {
        action: 'login',
        actorType: 'marketplace',
        actorId: existingUser.id,
        success: true,
        metadata: { scope: 'marketplace', via: 'otp', distributorId: membership.distributorId },
      });

      // Generate JWT token
      const { signAccessToken } = await import('../../../../../lib/jwt');
      const token = signAccessToken({
        sub: existingUser.id,
        phone: existingUser.phone || undefined,
        type: 'marketplace',
        distributorId: membership.distributorId,
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