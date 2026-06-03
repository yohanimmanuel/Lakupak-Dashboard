import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { 
  validateAuthInput, 
  getSecurityHeaders, 
  sanitizeUserData 
} from '../../../../utils/auth-security';
import { getAuthenticatedUserId } from '../../../../utils/auth-helpers';
import { settingsOperationRateLimiter } from '../../../../utils/rateLimiter';
import { auditAccount } from '@/lib/audit';

export async function PUT(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    // Authenticate user (supports both JWT and NextAuth session)
    const authenticatedUserId = await getAuthenticatedUserId(req);
    if (!authenticatedUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers }
      );
    }
    
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
    
    const { userId, firstName, lastName, email, phone, bio, location, avatar, region, currency, language } = body;
    
    // Validate userId from request body
    if (!userId || typeof userId !== 'number') {
      return NextResponse.json(
        { error: 'Valid user ID is required' }, 
        { status: 400, headers }
      );
    }
    
    // Authorization check: verify the authenticated user matches the requested userId
    // (no admin override - users can only update their own profile)
    if (authenticatedUserId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized access to user data' },
        { status: 403, headers }
      );
    }
    
    // Apply rate limiting with the VERIFIED authenticated user ID
    const rateLimitResponse = await settingsOperationRateLimiter(req, authenticatedUserId);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    
    // Validate inputs
    if (firstName) {
      const firstNameValidation = validateAuthInput.name(firstName, 'First name');
      if (!firstNameValidation.valid) {
        return NextResponse.json(
          { error: firstNameValidation.error }, 
          { status: 400, headers }
        );
      }
    }
    
    if (lastName) {
      const lastNameValidation = validateAuthInput.name(lastName, 'Last name');
      if (!lastNameValidation.valid) {
        return NextResponse.json(
          { error: lastNameValidation.error }, 
          { status: 400, headers }
        );
      }
    }
    
    if (email) {
      const emailValidation = validateAuthInput.email(email);
      if (!emailValidation.valid) {
        return NextResponse.json(
          { error: emailValidation.error }, 
          { status: 400, headers }
        );
      }
    }
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found' }, 
        { status: 404, headers }
      );
    }
    
    // Check for email conflicts if email is being updated
    if (email && email !== existingUser.email) {
      const normalizedEmail = email.trim().toLowerCase();
      const emailExists = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });
      
      if (emailExists) {
        return NextResponse.json(
          { error: 'An account with this email already exists' }, 
          { status: 409, headers }
        );
      }
    }

    
    // Update user data
    const updateData: Record<string, unknown> = {};
    
    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (bio !== undefined) updateData.bio = bio?.trim() || null;
    if (location !== undefined) updateData.location = location?.trim() || null;
    if (avatar !== undefined) updateData.avatar = avatar?.trim() || null;
    if (region !== undefined) updateData.region = region?.trim() || null;
    if (currency !== undefined) updateData.currency = currency?.trim() || null;
    if (language !== undefined) updateData.language = language?.trim() || null;
    
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        company: true
      }
    });
    
    auditAccount(req, {
      action: 'profile.update',
      actorType: 'dashboard',
      actorId: authenticatedUserId,
      resourceType: 'User',
      resourceId: String(userId),
      metadata: { fields: Object.keys(updateData), emailChanged: email !== undefined && email !== existingUser.email },
    });

    // Return sanitized user data
    const userData = sanitizeUserData(updatedUser);
    
    return NextResponse.json(userData, { 
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
