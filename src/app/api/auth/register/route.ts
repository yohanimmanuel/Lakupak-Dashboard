import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { 
  validateAuthInput, 
  getSecurityHeaders, 
  sanitizeUserData 
} from '../../../../utils/auth-security';
import { getRegionByCode } from '@/config/regionConfig';
import { registerRateLimiter } from '../../../../utils/rateLimiter';
import { auditAuth } from '@/lib/audit';
import { isAllowedKycStoredUrl, sanitizeKycFilename } from '@/lib/kyc/documents';
import { buildLoginUrl } from '@/lib/emailVerification';
import { sendRegistrationPendingEmail } from '@/lib/email';
import { consumeGoogleRegisterProof } from '@/lib/googleRegisterProof';

export async function POST(req: NextRequest) {
  // Apply rate limiting: 3 registrations per hour
  const rateLimitResponse = await registerRateLimiter(req);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  
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
      firstName,
      lastName,
      email,
      phone,
      bio,
      password,
      company,
      address,
      region,
      yearsInOperation,
      businessPhone,
      businessEmail,
      businessRegistrationNumber,
      taxId,
      industryType,
      companySize,
      billingBankName,
      billingBankAccountName,
      billingBankAccountNumber,
      buyerPaymentTermDays,
      shippingPreferences,
      pickupAddress,
      deliveryTimeSlots,
      preferredDeliveryDays,
      specialInstructions,
      defaultDeliveryLeadTimeMinDays,
      defaultDeliveryLeadTimeMaxDays,
      nibDocumentUrl,
      nibDocumentName,
      nibDocumentPublicId,
      npwpDocumentUrl,
      npwpDocumentName,
      npwpDocumentPublicId,
      googleProof,
    } = body;
    
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
      return returnValidationError('Business address is required');
    }

    // Required phone number validation
    if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
      return returnValidationError('Phone number is required');
    }
    if (phone.trim().length > 30) {
      return returnValidationError('Invalid phone number');
    }
    if (bio && (typeof bio !== 'string' || bio.trim().length > 200)) {
      return returnValidationError('Bio is too long');
    }

    // Validate additional company credentials
    if (!yearsInOperation || typeof yearsInOperation !== 'string' || yearsInOperation.trim().length === 0) {
      return returnValidationError('Years in operation is required');
    }
    if (!businessPhone || typeof businessPhone !== 'string' || businessPhone.trim().length === 0) {
      return returnValidationError('Business phone number is required');
    }
    if (businessPhone.trim().length > 30) {
      return returnValidationError('Invalid business phone number');
    }
    const businessEmailValidation = validateAuthInput.email(businessEmail);
    if (!businessEmailValidation.valid && businessEmailValidation.error) {
      return returnValidationError(businessEmailValidation.error);
    }
    const normalizedBusinessEmail = String(businessEmail).trim().toLowerCase();
    if (!businessRegistrationNumber || typeof businessRegistrationNumber !== 'string' || businessRegistrationNumber.trim().length === 0) {
      return returnValidationError('Business registration number is required');
    }
    if (taxId && (typeof taxId !== 'string' || taxId.length > 80)) {
      return returnValidationError('Invalid Tax ID');
    }
    if (!isAllowedKycStoredUrl(nibDocumentUrl)) {
      return returnValidationError('NIB document upload is required');
    }
    if (!isAllowedKycStoredUrl(npwpDocumentUrl)) {
      return returnValidationError('NPWP document upload is required');
    }
    const nibName = sanitizeKycFilename(typeof nibDocumentName === 'string' ? nibDocumentName : 'NIB');
    const npwpName = sanitizeKycFilename(typeof npwpDocumentName === 'string' ? npwpDocumentName : 'NPWP');
    const nibPublicId =
      typeof nibDocumentPublicId === 'string' && nibDocumentPublicId.trim()
        ? nibDocumentPublicId.trim().slice(0, 200)
        : null;
    const npwpPublicId =
      typeof npwpDocumentPublicId === 'string' && npwpDocumentPublicId.trim()
        ? npwpDocumentPublicId.trim().slice(0, 200)
        : null;

    if (!industryType || typeof industryType !== 'string' || industryType.trim().length === 0) {
      return returnValidationError('Industry type is required');
    }
    if (!companySize || typeof companySize !== 'string' || companySize.trim().length === 0) {
      return returnValidationError('Company size is required');
    }

    if (!billingBankName || typeof billingBankName !== 'string' || billingBankName.trim().length === 0) {
      return returnValidationError('Bank name is required');
    }
    if (!billingBankAccountName || typeof billingBankAccountName !== 'string' || billingBankAccountName.trim().length === 0) {
      return returnValidationError('Bank account holder name is required');
    }
    if (!billingBankAccountNumber || typeof billingBankAccountNumber !== 'string' || billingBankAccountNumber.trim().length === 0) {
      return returnValidationError('Bank account number is required');
    }
    if (billingBankName.trim().length > 120) {
      return returnValidationError('Bank name is too long');
    }
    if (billingBankAccountName.trim().length > 120) {
      return returnValidationError('Bank account holder name is too long');
    }
    if (billingBankAccountNumber.trim().length > 80) {
      return returnValidationError('Bank account number is too long');
    }

    const allowedShippingOptions = new Set([
      'Self Pickup',
      'Seller/Distributor Delivery',
      'Buyer-arranged Courier',
    ]);
    if (!Array.isArray(shippingPreferences) || shippingPreferences.length === 0) {
      return returnValidationError('Select at least one shipping option');
    }
    const normalizedShippingPreferences = shippingPreferences
      .filter((opt): opt is string => typeof opt === 'string')
      .map((opt) => opt.trim())
      .filter((opt) => allowedShippingOptions.has(opt));
    if (normalizedShippingPreferences.length === 0) {
      return returnValidationError('Select at least one valid shipping option');
    }

    const includesSelfPickup = normalizedShippingPreferences.includes('Self Pickup');
    const trimmedPickupAddress =
      typeof pickupAddress === 'string' ? pickupAddress.trim() : '';
    if (includesSelfPickup && !trimmedPickupAddress) {
      return returnValidationError('Pickup address is required when Self Pickup is selected');
    }
    if (trimmedPickupAddress.length > 500) {
      return returnValidationError('Pickup address is too long');
    }

    const allowedDeliveryTimeSlots = new Set([
      'Morning (8:00 AM - 12:00 PM)',
      'Afternoon (12:00 PM - 5:00 PM)',
      'Evening (5:00 PM - 8:00 PM)',
      'Flexible',
    ]);
    const normalizedDeliveryTimeSlots = Array.isArray(deliveryTimeSlots)
      ? deliveryTimeSlots
          .filter((slot): slot is string => typeof slot === 'string')
          .map((slot) => slot.trim())
          .filter((slot) => allowedDeliveryTimeSlots.has(slot))
      : [];

    const allowedDeliveryDays = new Set([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    const normalizedPreferredDeliveryDays = Array.isArray(preferredDeliveryDays)
      ? preferredDeliveryDays
          .filter((day): day is string => typeof day === 'string')
          .map((day) => day.trim())
          .filter((day) => allowedDeliveryDays.has(day))
      : [];

    const trimmedSpecialInstructions =
      typeof specialInstructions === 'string' ? specialInstructions.trim() : '';
    if (trimmedSpecialInstructions.length > 2000) {
      return returnValidationError('Special delivery instructions are too long');
    }

    const parseLeadTimeDays = (val: unknown): number | null => {
      if (val === null || val === undefined || val === '') return null;
      const n = Number(val);
      if (!Number.isInteger(n) || n < 0 || n > 90) return null;
      return n;
    };
    const leadTimeMin = parseLeadTimeDays(defaultDeliveryLeadTimeMinDays);
    const leadTimeMax = parseLeadTimeDays(defaultDeliveryLeadTimeMaxDays);
    if (
      defaultDeliveryLeadTimeMinDays !== undefined &&
      defaultDeliveryLeadTimeMinDays !== null &&
      defaultDeliveryLeadTimeMinDays !== '' &&
      leadTimeMin === null
    ) {
      return returnValidationError('Default delivery lead time min must be a whole number between 0 and 90');
    }
    if (
      defaultDeliveryLeadTimeMaxDays !== undefined &&
      defaultDeliveryLeadTimeMaxDays !== null &&
      defaultDeliveryLeadTimeMaxDays !== '' &&
      leadTimeMax === null
    ) {
      return returnValidationError('Default delivery lead time max must be a whole number between 0 and 90');
    }
    if (leadTimeMin != null && leadTimeMax != null && leadTimeMin > leadTimeMax) {
      return returnValidationError('Default delivery lead time: min cannot be greater than max');
    }

    let parsedPaymentTermDays: number | null = null;
    if (buyerPaymentTermDays !== undefined && buyerPaymentTermDays !== null && buyerPaymentTermDays !== '') {
      const days = Number(buyerPaymentTermDays);
      if (!Number.isInteger(days) || days < 1) {
        return returnValidationError('Payment term must be a whole number of days (1 or more), or left empty');
      }
      parsedPaymentTermDays = days;
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
        const canResumeIncomplete =
          !existingUser.password &&
          existingUser.companyId == null &&
          (existingUser.accountStatus ?? 'active') === 'pending';
        const proof =
          typeof googleProof === 'string' ? googleProof : '';
        const proofOk =
          canResumeIncomplete &&
          (await consumeGoogleRegisterProof(tx, proof, normalizedEmail));
        if (!proofOk) {
          throw new Error('USER_EXISTS');
        }
      }

      const existingCompanyWithEmail = await tx.company.findFirst({
        where: { businessEmail: normalizedBusinessEmail },
        include: { users: { select: { id: true }, take: 1 } },
      });
      if (existingCompanyWithEmail && existingCompanyWithEmail.users.length > 0) {
        throw new Error('COMPANY_EMAIL_EXISTS');
      }
      
      // Check for orphaned companies (companies with this businessEmail but no users)
      // This handles cases where a previous registration created a company but failed to create the user
      const orphanedCompany = existingCompanyWithEmail;
      
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
        businessEmail: normalizedBusinessEmail,
        businessPhone: String(businessPhone).trim(),
        industryType: String(industryType).trim(),
        businessDescription: '',
        yearsInOperation: String(yearsInOperation).trim(),
        companySize: String(companySize).trim(),
        businessRegistrationNumber: String(businessRegistrationNumber).trim(),
        taxId: String(taxId ?? '').trim(),
        billingBankName: billingBankName.trim(),
        billingBankAccountName: billingBankAccountName.trim(),
        billingBankAccountNumber: billingBankAccountNumber.trim(),
        buyerPaymentTermDays: parsedPaymentTermDays,
        documentVerification: false,
        businessLicenseVerification: false,
        complianceStatus: 'Pending',
        nibDocumentUrl: String(nibDocumentUrl).trim(),
        nibDocumentName: nibName,
        nibDocumentPublicId: nibPublicId,
        npwpDocumentUrl: String(npwpDocumentUrl).trim(),
        npwpDocumentName: npwpName,
        npwpDocumentPublicId: npwpPublicId,
        shippingPreferences: JSON.stringify(normalizedShippingPreferences),
        deliveryTimeSlots: JSON.stringify(normalizedDeliveryTimeSlots),
        preferredDeliveryDays: JSON.stringify(normalizedPreferredDeliveryDays),
        specialInstructions: trimmedSpecialInstructions || null,
        pickupAddress: includesSelfPickup ? trimmedPickupAddress : null,
        defaultDeliveryLeadTimeMinDays: leadTimeMin ?? 3,
        defaultDeliveryLeadTimeMaxDays: leadTimeMax ?? 7
      }
    });

    const userPayload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        phone: String(phone ?? '').trim() || null,
        bio: String(bio ?? '').trim() || null,
        password: hashed,
        companyId: companyData.id,
        region: region,
        currency: selectedRegion.currency,
        accountStatus: 'pending' as const,
        emailVerified: null,
      };

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: userPayload,
            include: { company: true },
          })
        : await tx.user.create({
            data: userPayload,
            include: { company: true },
          });
      
      return user;
    });
    
    // Return sanitized user data
    const userData = sanitizeUserData(result);

    await sendRegistrationPendingEmail({
      to: normalizedEmail,
      firstName: result.firstName,
      loginUrl: buildLoginUrl(),
    });

    auditAuth(req, {
      action: 'register',
      actorType: 'dashboard',
      actorId: result.id,
      resourceType: 'User',
      resourceId: String(result.id),
      success: true,
      metadata: { scope: 'dashboard', companyId: result.companyId, region, accountStatus: 'pending' },
    });
    
    return NextResponse.json({ ...userData, accountStatus: 'pending', pending: true }, { 
      status: 201, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    if (error instanceof Error && error.message === 'COMPANY_EMAIL_EXISTS') {
      return NextResponse.json(
        { error: 'A company with this business email already exists' }, 
        { status: 409, headers }
      );
    }
    
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
