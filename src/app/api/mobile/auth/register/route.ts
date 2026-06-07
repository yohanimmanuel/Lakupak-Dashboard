import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import {
  validateAuthInput,
  getSecurityHeaders,
} from '../../../../../utils/auth-security';
import { registerRateLimiter } from '@/utils/rateLimiter';
import { auditAuth } from '@/lib/audit';

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

    const { name, email, storeName, bio, username, password, phone, countryCode } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers });
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400, headers });
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
        { error: 'User with this email is already registered. Please log in.' },
        { status: 409, headers },
      );
    }

    const existingUserByUsername = await prisma.marketplaceUser.findUnique({
      where: { username: username.trim() },
    });

    if (existingUserByUsername) {
      return NextResponse.json(
        { error: 'Username is already taken. Please choose a different username.' },
        { status: 409, headers },
      );
    }

    let finalPhone: string | null = null;
    let finalCountry: string | null = null;

    if (phone && typeof phone === 'string' && phone.trim()) {
      const phoneWithPlus = phone.startsWith('+') ? phone.trim() : `+${phone.trim()}`;
      const existingUserByPhone = await prisma.marketplaceUser.findUnique({
        where: { phone: phoneWithPlus },
      });

      if (existingUserByPhone) {
        return NextResponse.json(
          { error: 'Phone number is already registered. Please log in or use a different phone number.' },
          { status: 409, headers },
        );
      }

      finalPhone = phoneWithPlus;
      finalCountry = typeof countryCode === 'string' && countryCode.trim() ? countryCode.trim() : null;
    }

    const hashedPassword = await hash(password, 12);

    const user = await prisma.marketplaceUser.create({
      data: {
        username: username.trim(),
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        storeName: storeName?.trim() || null,
        bio: bio?.trim() || null,
        phone: finalPhone,
        country: finalCountry,
      },
    });

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
