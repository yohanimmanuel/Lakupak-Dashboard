import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders, sanitizeCompanyData } from '../../../../utils/auth-security';

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
    
    const { userId, name, businessAddress } = body;
    
    // Validate required fields
    if (!userId || typeof userId !== 'number') {
      return NextResponse.json(
        { error: 'Valid user ID is required' }, 
        { status: 400, headers }
      );
    }
    
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
    
    // Create new company
    const newCompany = await prisma.company.create({
      data: {
        name: name.trim(),
        businessAddress: businessAddress?.trim() || null,
        documentVerification: false,
        businessLicenseVerification: false,
        complianceStatus: 'Pending',
        baseShippingRadius: 50,
        baseShippingPrice: 15000,
        additionalPricePerKm: 500,
        maxShippingRadius: 200,
        freeShippingThreshold: 100000,
        expressShippingPrice: 25000,
        sameDayShippingPrice: 35000,
        nextDayShippingPrice: 20000,
        scheduledDeliveryPrice: null,
        pickupAddress: null,
      }
    });
    
    // Update user with company ID
    await prisma.user.update({
      where: { id: userId },
      data: { companyId: newCompany.id }
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
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}
