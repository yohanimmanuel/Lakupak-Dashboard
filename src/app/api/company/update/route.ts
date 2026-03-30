import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders, sanitizeCompanyData } from '../../../../utils/auth-security';
import { broadcastProductUpdate, broadcastOrderUpdate } from '../../../../utils/websocketBroadcast';

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
      pickupAddress,
      defaultDeliveryLeadTimeMinDays,
      defaultDeliveryLeadTimeMaxDays,
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
    const updateData: Record<string, unknown> = {};
    
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
    if (pickupAddress !== undefined) updateData.pickupAddress = pickupAddress?.trim() || null;

    const parseDays = (val: unknown): number | null => {
      const n = val === null || val === '' ? null : Number(val);
      return n != null && !Number.isNaN(n) && n >= 0 ? n : null;
    };

    if (defaultDeliveryLeadTimeMinDays !== undefined || defaultDeliveryLeadTimeMaxDays !== undefined) {
      const minVal = defaultDeliveryLeadTimeMinDays !== undefined 
        ? parseDays(defaultDeliveryLeadTimeMinDays) 
        : existingCompany.defaultDeliveryLeadTimeMinDays;
      const maxVal = defaultDeliveryLeadTimeMaxDays !== undefined 
        ? parseDays(defaultDeliveryLeadTimeMaxDays) 
        : existingCompany.defaultDeliveryLeadTimeMaxDays;
      if (minVal != null && maxVal != null && minVal > maxVal) {
        return NextResponse.json(
          { error: `Default delivery lead time: min days (${minVal}) cannot be greater than max days (${maxVal}). Please use a valid range.` },
          { status: 400, headers }
        );
      }
      if (defaultDeliveryLeadTimeMinDays !== undefined) updateData.defaultDeliveryLeadTimeMinDays = minVal;
      if (defaultDeliveryLeadTimeMaxDays !== undefined) updateData.defaultDeliveryLeadTimeMaxDays = maxVal;
    }

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: updateData
    });
    
    // Check if shipping-related fields were updated
    const shippingFieldsChanged = 
      shippingPreferences !== undefined ||
      pickupAddress !== undefined;
    
    // Check if company info fields were updated (businessDescription, yearsInOperation, industryType, etc.)
    const companyInfoFieldsChanged = 
      businessDescription !== undefined ||
      yearsInOperation !== undefined ||
      industryType !== undefined ||
      name !== undefined ||
      logo !== undefined ||
      bannerImage !== undefined ||
      businessAddress !== undefined ||
      businessPhone !== undefined ||
      businessEmail !== undefined;
    
    // Get company users for broadcasting updates
    const companyUsers = await prisma.user.findMany({
      where: { companyId: companyId },
      select: { id: true }
    });
    
    const userIds = companyUsers.map(u => u.id);
    
    // If shipping fees changed, broadcast product update to refresh marketplace
    if (shippingFieldsChanged && userIds.length > 0) {
      try {
        const products = await prisma.product.findMany({
          where: {
            userId: { in: userIds }
          },
          select: { productId: true }
        });
        
        const productIds = products.map(p => p.productId);
        
        // Broadcast product update so mobile app refreshes with new shipping fees
        if (productIds.length > 0) {
          await broadcastProductUpdate(productIds);
        }
      } catch (error) {
        // Silently fail if broadcast fails
      }
    }
    
    // If company info fields changed, broadcast updates so distributor details refresh
    if (companyInfoFieldsChanged && userIds.length > 0) {
      try {
        // Broadcast product update to refresh seller company info in products (primary source)
        const products = await prisma.product.findMany({
          where: {
            userId: { in: userIds }
          },
          select: { productId: true }
        });
        
        const productIds = products.map(p => p.productId);
        if (productIds.length > 0) {
          await broadcastProductUpdate(productIds);
        }
        
        // Also broadcast order updates for orders where this company's users are distributors (sellers)
        // This ensures order.user.company data is refreshed in the mobile app
        // The mobile app will refresh orders that belong to the current user and have this company as the seller
        const orders = await prisma.order.findMany({
          where: {
            userId: { in: userIds },
            isDeleted: false
          },
          select: { orderId: true }
        });
        
        const orderIds = orders.map(o => o.orderId);
        if (orderIds.length > 0) {
          await broadcastOrderUpdate(orderIds);
        }
      } catch (error) {
        // Silently fail if broadcast fails
      }
    }
    
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
