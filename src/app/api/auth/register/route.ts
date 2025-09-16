import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../../../../generated/prisma';
import { 
  validateAuthInput, 
  getSecurityHeaders, 
  sanitizeUserData 
} from '../../../../utils/auth-security';
import { getRegionByCode } from '@/config/regionConfig';

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
    
    const { firstName, lastName, email, password, company, address, region } = body;
    
    // Validate all inputs
    const firstNameValidation = validateAuthInput.name(firstName, 'First name');
    if (!firstNameValidation.valid) {
      return NextResponse.json(
        { error: firstNameValidation.error }, 
        { status: 400, headers }
      );
    }
    
    const lastNameValidation = validateAuthInput.name(lastName, 'Last name');
    if (!lastNameValidation.valid) {
      return NextResponse.json(
        { error: lastNameValidation.error }, 
        { status: 400, headers }
      );
    }
    
    const emailValidation = validateAuthInput.email(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.error }, 
        { status: 400, headers }
      );
    }
    
    const passwordValidation = validateAuthInput.password(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error }, 
        { status: 400, headers }
      );
    }
    
    const companyValidation = validateAuthInput.company(company);
    if (!companyValidation.valid) {
      return NextResponse.json(
        { error: companyValidation.error }, 
        { status: 400, headers }
      );
    }
    
    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      return NextResponse.json(
        { error: 'Company address is required' }, 
        { status: 400, headers }
      );
    }
    
    // Validate region and get currency
    if (!region || typeof region !== 'string') {
      return NextResponse.json(
        { error: 'Business region is required' }, 
        { status: 400, headers }
      );
    }
    
    const selectedRegion = getRegionByCode(region);
    if (!selectedRegion) {
      return NextResponse.json(
        { error: 'Invalid region selected' }, 
        { status: 400, headers }
      );
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
    // Check for existing user
    const existing = await prisma.user.findUnique({ 
      where: { email: normalizedEmail } 
    });
    
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' }, 
        { status: 409, headers }
      );
    }
    
    // Hash password with stronger salt rounds for production
    const hashed = await hash(password, 12);
    
    // Create company first
    const companyData = await prisma.company.create({
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
    const user = await prisma.user.create({
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
    
    // Return sanitized user data
    const userData = sanitizeUserData(user);
    
    return NextResponse.json(userData, { 
      status: 201, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    // Registration error occurred
    
    // Handle known database errors gracefully
    if (error instanceof Error && error.message.includes('Unique constraint')) {
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
