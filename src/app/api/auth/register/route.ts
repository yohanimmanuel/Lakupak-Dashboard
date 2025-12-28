import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { 
  validateAuthInput, 
  getSecurityHeaders, 
  sanitizeUserData 
} from '../../../../utils/auth-security';
import { getRegionByCode } from '@/config/regionConfig';


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
    
    const { firstName, lastName, email, password, company, address, region } = body;
    
    // Helper function to return validation errors
    const returnValidationError = (error: string) => 
      NextResponse.json({ error }, { status: 400, headers });
    
    // Validate all inputs
    const validations = [
      validateAuthInput.name(firstName, 'First name'),
      validateAuthInput.name(lastName, 'Last name'),
      validateAuthInput.email(email),
      validateAuthInput.password(password),
      validateAuthInput.company(company)
    ];
    
    for (const validation of validations) {
      if (!validation.valid && validation.error) {
        return returnValidationError(validation.error);
      }
    }
    
    // Validate address
    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      return returnValidationError('Company address is required');
    }
    
    // Validate region and get currency
    if (!region || typeof region !== 'string') {
      return returnValidationError('Business region is required');
    }
    
    const selectedRegion = getRegionByCode(region);
    if (!selectedRegion) {
      return returnValidationError('Invalid region selected');
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
    // Hash password with stronger salt rounds for production
    const hashed = await hash(password, 12);
    
    // Use transaction to ensure atomicity - both checks and creation happen together
    const result = await prisma.$transaction(async (tx) => {
      // Check for existing user WITHIN transaction to prevent race conditions
      // This is the only check we need since User.email has a unique constraint
      const existingUser = await tx.user.findUnique({ 
        where: { email: normalizedEmail } 
      });
      
      if (existingUser) {
        throw new Error('USER_EXISTS');
      }
      
      // Check for orphaned companies (companies with this businessEmail but no users)
      // This handles cases where a previous registration created a company but failed to create the user
      const orphanedCompany = await tx.company.findFirst({
        where: { 
          businessEmail: normalizedEmail,
          users: { none: {} }
        }
      });
      
      // Clean up orphaned company if it exists
      if (orphanedCompany) {
        await tx.company.delete({
          where: { id: orphanedCompany.id }
        });
      }
      
      // Create company first
      const companyData = await tx.company.create({
        data: {
          name: company.trim(),
          businessAddress: address.trim(),
          businessEmail: normalizedEmail,
          businessPhone: '', // Will be updated later
          industryType: '',
          businessDescription: '',
          yearsInOperation: '',
          companySize: '',
          documentVerification: false,
          businessLicenseVerification: false,
          complianceStatus: 'Pending',
          shippingPreferences: JSON.stringify([]),
          deliveryTimeSlots: JSON.stringify([]),
          preferredDeliveryDays: JSON.stringify([]),
          specialInstructions: '',
          baseShippingRadius: 50,
          baseShippingPrice: 15000,
          additionalPricePerKm: 500,
          maxShippingRadius: 200,
          freeShippingThreshold: 100000
        }
      });

      // Create user with company relationship
      const user = await tx.user.create({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: normalizedEmail,
          password: hashed,
          companyId: companyData.id,
          region: region,
          currency: selectedRegion.currency
        },
        include: {
          company: true
        }
      });
      
      return user;
    });
    
    // Return sanitized user data
    const userData = sanitizeUserData(result);
    
    return NextResponse.json(userData, { 
      status: 201, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    // Handle email conflict errors (user exists or unique constraint violation)
    if (error instanceof Error && (
      error.message === 'USER_EXISTS' ||
      error.message.includes('Unique constraint') ||
      error.message.includes('duplicate key')
    )) {
      return NextResponse.json(
        { error: 'An account with this email already exists' }, 
        { status: 409, headers }
      );
    }
    
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}
