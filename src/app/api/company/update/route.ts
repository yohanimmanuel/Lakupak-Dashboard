import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders, sanitizeCompanyData } from '../../../../utils/auth-security';
import { getAuthenticatedUserId } from '../../../../utils/auth-helpers';
import { broadcastProductUpdate, broadcastOrderUpdate } from '../../../../utils/websocketBroadcast';
import { settingsOperationRateLimiter } from '@/utils/rateLimiter';
import { auditAccount } from '@/lib/audit';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  return value.trim();
}

function readOptionalTrimmedStringOrNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PUT(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    const authenticatedUserId = await getAuthenticatedUserId(req);
    if (!authenticatedUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers }
      );
    }

    const rateLimitResponse = await settingsOperationRateLimiter(req, authenticatedUserId);
    if (rateLimitResponse) return rateLimitResponse;

    // Parse and validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400, headers }
      );
    }

    if (!isPlainObject(body)) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400, headers }
      );
    }

    const bodyRecord = body;
    
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
      billingBankName,
      billingBankAccountName,
      billingBankAccountNumber,
      billingCompanyName,
      billingAddressLine1,
      billingCity,
      billingState,
      billingPostalCode,
      billingCountry,
      billingContactPhone,
      billingContactEmail,
    } = bodyRecord;

    const companyIdParsed =
      typeof companyId === 'number' && Number.isInteger(companyId) && companyId > 0
        ? companyId
        : typeof companyId === 'string' && /^\d+$/.test(companyId)
          ? (() => { const n = parseInt(companyId, 10); return n > 0 ? n : null; })()
          : null;

    // Validate companyId
    if (companyIdParsed === null) {
      return NextResponse.json(
        { error: 'Valid company ID is required' }, 
        { status: 400, headers }
      );
    }

    const owningUser = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: { companyId: true },
    });

    if (!owningUser?.companyId || owningUser.companyId !== companyIdParsed) {
      return NextResponse.json(
        { error: 'You can only update your own company profile' },
        { status: 403, headers }
      );
    }
    
    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id: companyIdParsed }
    });
    
    if (!existingCompany) {
      return NextResponse.json(
        { error: 'Company not found' }, 
        { status: 404, headers }
      );
    }
    
    // Check for email conflicts if business email is being updated
    if (typeof businessEmail === 'string' && businessEmail && businessEmail !== existingCompany.businessEmail) {
      const normalizedEmail = businessEmail.trim().toLowerCase();
      const emailExists = await prisma.company.findFirst({
        where: { 
          businessEmail: normalizedEmail,
          id: { not: companyIdParsed }
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
    
    if (name !== undefined) {
      const n = readOptionalTrimmedString(name);
      if (n === undefined) {
        return NextResponse.json({ error: 'Company name must be a string' }, { status: 400, headers });
      }
      updateData.name = n;
    }
    if (businessRegistrationNumber !== undefined) {
      updateData.businessRegistrationNumber = readOptionalTrimmedStringOrNull(businessRegistrationNumber) ?? null;
    }
    if (taxId !== undefined) updateData.taxId = readOptionalTrimmedStringOrNull(taxId) ?? null;
    if (logo !== undefined) updateData.logo = readOptionalTrimmedStringOrNull(logo) ?? null;
    if (bannerImage !== undefined) updateData.bannerImage = readOptionalTrimmedStringOrNull(bannerImage) ?? null;
    if (industryType !== undefined) updateData.industryType = readOptionalTrimmedStringOrNull(industryType) ?? null;
    if (businessDescription !== undefined) updateData.businessDescription = readOptionalTrimmedStringOrNull(businessDescription) ?? null;
    if (yearsInOperation !== undefined) updateData.yearsInOperation = readOptionalTrimmedStringOrNull(yearsInOperation) ?? null;
    if (companySize !== undefined) updateData.companySize = readOptionalTrimmedStringOrNull(companySize) ?? null;
    if (businessAddress !== undefined) updateData.businessAddress = readOptionalTrimmedStringOrNull(businessAddress) ?? null;
    if (businessPhone !== undefined) updateData.businessPhone = readOptionalTrimmedStringOrNull(businessPhone) ?? null;
    if (businessEmail !== undefined) {
      const e = readOptionalTrimmedStringOrNull(businessEmail);
      updateData.businessEmail = e ? e.toLowerCase() : e;
    }
    if (shippingPreferences !== undefined) updateData.shippingPreferences = Array.isArray(shippingPreferences) ? JSON.stringify(shippingPreferences) : shippingPreferences;
    if (deliveryTimeSlots !== undefined) updateData.deliveryTimeSlots = Array.isArray(deliveryTimeSlots) ? JSON.stringify(deliveryTimeSlots) : deliveryTimeSlots;
    if (preferredDeliveryDays !== undefined) updateData.preferredDeliveryDays = Array.isArray(preferredDeliveryDays) ? JSON.stringify(preferredDeliveryDays) : preferredDeliveryDays;
    if (specialInstructions !== undefined) updateData.specialInstructions = readOptionalTrimmedStringOrNull(specialInstructions) ?? null;
    if (pickupAddress !== undefined) updateData.pickupAddress = readOptionalTrimmedStringOrNull(pickupAddress) ?? null;
    if (billingBankName !== undefined) updateData.billingBankName = readOptionalTrimmedStringOrNull(billingBankName) ?? null;
    if (billingBankAccountName !== undefined) updateData.billingBankAccountName = readOptionalTrimmedStringOrNull(billingBankAccountName) ?? null;
    if (billingBankAccountNumber !== undefined) updateData.billingBankAccountNumber = readOptionalTrimmedStringOrNull(billingBankAccountNumber) ?? null;

    if (billingCompanyName !== undefined) updateData.billingCompanyName = readOptionalTrimmedStringOrNull(billingCompanyName) ?? null;
    if (billingAddressLine1 !== undefined) updateData.billingAddressLine1 = readOptionalTrimmedStringOrNull(billingAddressLine1) ?? null;
    if (billingCity !== undefined) updateData.billingCity = readOptionalTrimmedStringOrNull(billingCity) ?? null;
    if (billingState !== undefined) updateData.billingState = readOptionalTrimmedStringOrNull(billingState) ?? null;
    if (billingPostalCode !== undefined) updateData.billingPostalCode = readOptionalTrimmedStringOrNull(billingPostalCode) ?? null;
    if (billingCountry !== undefined) updateData.billingCountry = readOptionalTrimmedStringOrNull(billingCountry) ?? null;
    if (billingContactPhone !== undefined) updateData.billingContactPhone = readOptionalTrimmedStringOrNull(billingContactPhone) ?? null;
    if (billingContactEmail !== undefined) {
      const be = readOptionalTrimmedStringOrNull(billingContactEmail);
      updateData.billingContactEmail = be ? be.toLowerCase() : be;
    }

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
      where: { id: companyIdParsed },
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
      businessEmail !== undefined ||
      billingBankName !== undefined ||
      billingBankAccountName !== undefined ||
      billingBankAccountNumber !== undefined ||
      billingCompanyName !== undefined ||
      billingAddressLine1 !== undefined ||
      billingCity !== undefined ||
      billingState !== undefined ||
      billingPostalCode !== undefined ||
      billingCountry !== undefined ||
      billingContactPhone !== undefined ||
      billingContactEmail !== undefined;
    
    // Get company users for broadcasting updates
    const companyUsers = await prisma.user.findMany({
      where: { companyId: companyIdParsed },
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
    
    const billingFieldsChanged =
      billingBankName !== undefined ||
      billingBankAccountName !== undefined ||
      billingBankAccountNumber !== undefined ||
      billingCompanyName !== undefined ||
      billingAddressLine1 !== undefined ||
      billingCity !== undefined ||
      billingState !== undefined ||
      billingPostalCode !== undefined ||
      billingCountry !== undefined ||
      billingContactPhone !== undefined ||
      billingContactEmail !== undefined;

    auditAccount(req, {
      action: 'company.update',
      actorType: 'dashboard',
      actorId: authenticatedUserId,
      resourceType: 'Company',
      resourceId: String(companyIdParsed),
      metadata: { fields: Object.keys(updateData), billingChanged: billingFieldsChanged },
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
