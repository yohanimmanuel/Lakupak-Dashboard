import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders, sanitizeCompanyData } from '../../../../utils/auth-security';
import { getAuthenticatedUserId } from '../../../../utils/auth-helpers';

class ConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

class NotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    // Authenticate — never trust userId from the request body
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
    
    const { userId: bodyUserId, name, businessAddress } = body;

    // If a userId was supplied in the body, it must match the authenticated user
    if (bodyUserId !== undefined && Number(bodyUserId) !== authenticatedUserId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers }
      );    }

    const userId = authenticatedUserId;
    
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Company name is required' }, 
        { status: 400, headers }
      );
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
    
    // Check if user already has a company
    if (existingUser.companyId) {
      return NextResponse.json(
        { error: 'User already has a company' }, 
        { status: 409, headers }
      );
    }
    
    // Create company and update user atomically
    const newCompany = await prisma.$transaction(async (tx) => {
      // Re-check user hasn't been assigned a company (prevent race condition)
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { companyId: true }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (user.companyId) {
        throw new ConflictError('User already has a company');
      }
      
      const company = await tx.company.create({
        data: {
          name: name.trim(),
          businessAddress: businessAddress?.trim() || null,
          documentVerification: false,
          businessLicenseVerification: false,
          complianceStatus: 'Pending',
          pickupAddress: null,
        }
      });
      
      await tx.user.update({
        where: { id: userId },
        data: { companyId: company.id }
      });
      
      return company;
    });    
    // Return sanitized company data
    const companyData = sanitizeCompanyData(newCompany);
    
    return NextResponse.json(companyData, { 
      status: 201, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers }
      );
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers }
      );
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}
