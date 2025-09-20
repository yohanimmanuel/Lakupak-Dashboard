import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../../generated/prisma';
import { getSecurityHeaders, sanitizeCompanyData } from '../../../../utils/auth-security';
import { parseNumberByCurrency } from '../../../../config/currencyConfig';

const prisma = new PrismaClient();

export async function PUT(req: NextRequest) {
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
    
    const { 
      companyId, 
      name, 
      businessRegistrationNumber, 
      taxId, 
      logo, 
      bannerImage,
      industryType, 
      businessDescription, 
      yearsInOperation, 
      companySize, 
      businessAddress, 
      businessPhone, 
      businessEmail,
      shippingPreferences,
      deliveryTimeSlots,
      preferredDeliveryDays,
      specialInstructions,
      baseShippingRadius,
      baseShippingPrice,
      additionalPricePerKm,
      maxShippingRadius,
      freeShippingThreshold,
      expressShippingPrice,
      sameDayShippingPrice,
      nextDayShippingPrice
    } = body;
    
    // Validate companyId
    if (!companyId || typeof companyId !== 'number') {
      return NextResponse.json(
        { error: 'Valid company ID is required' }, 
        { status: 400, headers }
      );
    }
    
    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id: companyId }
    });
    
    if (!existingCompany) {
      return NextResponse.json(
        { error: 'Company not found' }, 
        { status: 404, headers }
      );
    }
    
    // Check for email conflicts if business email is being updated
    if (businessEmail && businessEmail !== existingCompany.businessEmail) {
      const normalizedEmail = businessEmail.trim().toLowerCase();
      const emailExists = await prisma.company.findFirst({
        where: { 
          businessEmail: normalizedEmail,
          id: { not: companyId }
        }
      });
      
      if (emailExists) {
        return NextResponse.json(
          { error: 'A company with this email already exists' }, 
          { status: 409, headers }
        );
      }
    }

    
    // Update company data
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name.trim();
    if (businessRegistrationNumber !== undefined) updateData.businessRegistrationNumber = businessRegistrationNumber?.trim() || null;
    if (taxId !== undefined) updateData.taxId = taxId?.trim() || null;
    if (logo !== undefined) updateData.logo = logo?.trim() || null;
    if (bannerImage !== undefined) updateData.bannerImage = bannerImage?.trim() || null;
    if (industryType !== undefined) updateData.industryType = industryType?.trim() || null;
    if (businessDescription !== undefined) updateData.businessDescription = businessDescription?.trim() || null;
    if (yearsInOperation !== undefined) updateData.yearsInOperation = yearsInOperation?.trim() || null;
    if (companySize !== undefined) updateData.companySize = companySize?.trim() || null;
    if (businessAddress !== undefined) updateData.businessAddress = businessAddress?.trim() || null;
    if (businessPhone !== undefined) updateData.businessPhone = businessPhone?.trim() || null;
    if (businessEmail !== undefined) updateData.businessEmail = businessEmail?.trim().toLowerCase() || null;
    if (shippingPreferences !== undefined) updateData.shippingPreferences = Array.isArray(shippingPreferences) ? JSON.stringify(shippingPreferences) : shippingPreferences;
    if (deliveryTimeSlots !== undefined) updateData.deliveryTimeSlots = Array.isArray(deliveryTimeSlots) ? JSON.stringify(deliveryTimeSlots) : deliveryTimeSlots;
    if (preferredDeliveryDays !== undefined) updateData.preferredDeliveryDays = Array.isArray(preferredDeliveryDays) ? JSON.stringify(preferredDeliveryDays) : preferredDeliveryDays;
    if (specialInstructions !== undefined) updateData.specialInstructions = specialInstructions?.trim() || null;
    if (baseShippingRadius !== undefined) updateData.baseShippingRadius = baseShippingRadius ? Number(baseShippingRadius) : null;
    if (baseShippingPrice !== undefined) updateData.baseShippingPrice = baseShippingPrice ? parseNumberByCurrency(baseShippingPrice.toString()) || null : null;
    if (additionalPricePerKm !== undefined) updateData.additionalPricePerKm = additionalPricePerKm ? parseNumberByCurrency(additionalPricePerKm.toString()) || null : null;
    if (maxShippingRadius !== undefined) updateData.maxShippingRadius = maxShippingRadius ? Number(maxShippingRadius) : null;
    if (freeShippingThreshold !== undefined) updateData.freeShippingThreshold = freeShippingThreshold ? parseNumberByCurrency(freeShippingThreshold.toString()) || null : null;
    if (expressShippingPrice !== undefined) updateData.expressShippingPrice = expressShippingPrice ? parseNumberByCurrency(expressShippingPrice.toString()) || null : null;
    if (sameDayShippingPrice !== undefined) updateData.sameDayShippingPrice = sameDayShippingPrice ? parseNumberByCurrency(sameDayShippingPrice.toString()) || null : null;
    if (nextDayShippingPrice !== undefined) updateData.nextDayShippingPrice = nextDayShippingPrice ? parseNumberByCurrency(nextDayShippingPrice.toString()) || null : null;
    
    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: updateData
    });
    
    // Return sanitized company data
    const companyData = sanitizeCompanyData(updatedCompany);
    
    return NextResponse.json(companyData, { 
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
