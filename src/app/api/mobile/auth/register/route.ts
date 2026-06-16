import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import {
  validateAuthInput,
  getSecurityHeaders,
} from '../../../../../utils/auth-security';
import { registerRateLimiter } from '@/utils/rateLimiter';
import { auditAuth } from '@/lib/audit';
import { syncMarketplaceUserToBuyerProfiles } from '@/utils/buyerSync';
import { normalizeMarketplacePhone } from '@/utils/marketplacePhone';
import { isDuplicateAddressIdError, resetAddressIdSequence } from '@/utils/addressSequence';
import { attachGeocodeToAddress, normalizeAddressKey } from '@/utils/addressGeocodeCache';
import { Prisma } from '@/lib/prisma-generated';

type RegisterUserWithAddressParams = {
  username: string;
  name: string;
  normalizedEmail: string;
  hashedPassword: string;
  storeName?: string | null;
  bio?: string | null;
  finalPhone: string;
  finalCountry: string | null;
  resolvedIsDefault: boolean;
  trimmedAddress: string;
  trimmedAddressFullName: string;
  resolvedLabel: string;
};

async function createMarketplaceUserWithAddress(
  tx: Prisma.TransactionClient,
  params: RegisterUserWithAddressParams,
) {
  const createdUser = await tx.marketplaceUser.create({
    data: {
      username: params.username,
      name: params.name,
      email: params.normalizedEmail,
      password: params.hashedPassword,
      storeName: params.storeName?.trim() || null,
      bio: params.bio?.trim() || null,
      phone: params.finalPhone,
      country: params.finalCountry,
      chosenAddress: params.resolvedIsDefault ? params.trimmedAddress : null,
    },
  });

  await tx.address.create({
    data: {
      userId: createdUser.id,
      fullName: params.trimmedAddressFullName,
      phone: params.finalPhone,
      address: params.trimmedAddress,
      addressNormalized: normalizeAddressKey(params.trimmedAddress),
      isDefault: params.resolvedIsDefault,
      label: params.resolvedLabel,
    },
  });

  return createdUser;
}

export async function POST(req: NextRequest) {
  const rateLimitResponse = await registerRateLimiter(req);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const headers = getSecurityHeaders();

  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400, headers },
      );
    }

    const { name, email, storeName, bio, username, password, phone, countryCode, countryDialCode, address, addressFullName, addressLabel, addressIsDefault } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required', code: 'NAME_REQUIRED' }, { status: 400, headers });
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required', code: 'EMAIL_REQUIRED' }, { status: 400, headers });
    }

    if (!address || typeof address !== 'string' || !address.trim()) {
      return NextResponse.json({ error: 'Delivery address is required', code: 'ADDRESS_REQUIRED' }, { status: 400, headers });
    }

    const trimmedAddressFullName = typeof addressFullName === 'string' ? addressFullName.trim() : '';
    if (!trimmedAddressFullName) {
      return NextResponse.json({ error: 'Recipient full name is required', code: 'ADDRESS_FULL_NAME_REQUIRED' }, { status: 400, headers });
    }

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json({ error: 'Phone number is required', code: 'PHONE_REQUIRED' }, { status: 400, headers });
    }

    const normalizedPhone = normalizeMarketplacePhone(phone, { countryCode, countryDialCode });
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Phone number is invalid', code: 'PHONE_INVALID' }, { status: 400, headers });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400, headers },
      );
    }

    if (!username || typeof username !== 'string' || !username.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400, headers });
    }

    const emailValidation = validateAuthInput.email(email);
    if (!emailValidation.valid) {
      return NextResponse.json({ error: emailValidation.error }, { status: 400, headers });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUserByEmail = await prisma.marketplaceUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUserByEmail) {
      return NextResponse.json(
        { error: 'User with this email is already registered. Please log in.', code: 'EMAIL_ALREADY_REGISTERED' },
        { status: 409, headers },
      );
    }

    const existingUserByUsername = await prisma.marketplaceUser.findUnique({
      where: { username: username.trim() },
    });

    if (existingUserByUsername) {
      return NextResponse.json(
        { error: 'Username is already taken. Please choose a different username.', code: 'USERNAME_ALREADY_TAKEN' },
        { status: 409, headers },
      );
    }

    const existingUserByPhone = await prisma.marketplaceUser.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingUserByPhone) {
      return NextResponse.json(
        { error: 'Phone number is already registered. Please log in or use a different phone number.', code: 'PHONE_ALREADY_REGISTERED' },
        { status: 409, headers },
      );
    }

    const finalPhone = normalizedPhone;
    const finalCountry = typeof countryCode === 'string' && countryCode.trim() ? countryCode.trim() : null;

    const hashedPassword = await hash(password, 12);
    const trimmedAddress = address.trim();
    const resolvedLabel = addressLabel === 'work' || addressLabel === 'store' || addressLabel === 'home'
      ? addressLabel
      : 'home';
    const resolvedIsDefault = addressIsDefault !== false;

    const registerParams: RegisterUserWithAddressParams = {
      username: username.trim(),
      name: name.trim(),
      normalizedEmail,
      hashedPassword,
      storeName,
      bio,
      finalPhone,
      finalCountry,
      resolvedIsDefault,
      trimmedAddress,
      trimmedAddressFullName,
      resolvedLabel,
    };

    const user = await prisma.$transaction((tx) =>
      createMarketplaceUserWithAddress(tx, registerParams),
    ).catch(async (error) => {
      if (isDuplicateAddressIdError(error)) {
        await resetAddressIdSequence();
        return prisma.$transaction((tx) =>
          createMarketplaceUserWithAddress(tx, registerParams),
        );
      }
      throw error;
    });

    try {
      await syncMarketplaceUserToBuyerProfiles(user.id);
    } catch (syncError) {
      console.error('Buyer profile sync after registration failed:', syncError);
    }

    const registeredAddress = await prisma.address.findFirst({
      where: { userId: user.id, address: trimmedAddress },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (registeredAddress) {
      void attachGeocodeToAddress(registeredAddress.id, trimmedAddress).catch((err) => {
        console.error('Geocode attach after registration failed:', err);
      });
    }

    auditAuth(req, {
      action: 'register',
      actorType: 'marketplace',
      actorId: user.id,
      resourceType: 'MarketplaceUser',
      resourceId: String(user.id),
      success: true,
      metadata: { scope: 'marketplace', via: 'credentials' },
    });

    const { signAccessToken } = await import('../../../../../lib/jwt');
    const token = signAccessToken({
      sub: user.id,
      phone: user.phone || undefined,
      type: 'marketplace',
    }, '30d');

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        name: user.name || 'User',
        email: user.email || '',
        chosenAddress: user.chosenAddress || '',
        address: user.chosenAddress || '',
      },
    }, {
      status: 201,
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      },
    });
  } catch (error) {
    console.error('Marketplace registration failed:', error);
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500, headers },
    );
  }
}
