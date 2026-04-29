import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '../../../../utils/auth-security';
import { broadcastDashboardNotification } from '@/utils/websocketBroadcast';
import { getClientIp, rateLimit } from '@/utils/rateLimiter';

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });
  }

  // Public endpoint: rate limit early to prevent spam/abuse
  const ip = getClientIp(req);
  const rateLimitResponse = await rateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many requests. Please try again shortly.',
    keyGenerator: () => `driver-request:${ip}`,
    progressivePenalty: true,
    burstLimit: 3,
    burstWindowMs: 1000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const { name, phone, distributorEmail, message } = body as {
    name?: unknown;
    phone?: unknown;
    distributorEmail?: unknown;
    message?: unknown;
  };

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400, headers });
  }
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400, headers });
  }
  if (!distributorEmail || typeof distributorEmail !== 'string' || !distributorEmail.trim()) {
    return NextResponse.json({ error: 'Distributor email is required' }, { status: 400, headers });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(distributorEmail.trim())) {
    return NextResponse.json({ error: 'Invalid distributor email address' }, { status: 400, headers });
  }

  try {
    // Look up the distributor by email
    const distributor = await prisma.user.findFirst({
      where: { email: distributorEmail.trim().toLowerCase() },
      select: { id: true },
    });

    // Create the driver request regardless of whether distributor is found
    // (to prevent email enumeration)
    const driverRequest = await prisma.driverRequest.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        distributorEmail: distributorEmail.trim().toLowerCase(),
        message: typeof message === 'string' && message.trim() ? message.trim() : null,
        status: 'pending',
      },
    });

    // Only create a notification if the distributor exists
    if (distributor) {
      await prisma.notification.create({
        data: {
          userId: distributor.id,
          type: 'driver_request',
          title: 'New driver access request',
          message: `${name.trim()} is requesting access to your fleet.`,
          metadata: {
            driverRequestId: driverRequest.id,
            driverName: name.trim(),
            driverPhone: phone.trim(),
            message: typeof message === 'string' && message.trim() ? message.trim() : null,
          },
          actionUrl: '/logistics',
        },
      });
      // Push the badge update to the distributor's browser in real time
      broadcastDashboardNotification(distributor.id).catch(() => { /* best-effort */ });
    }

    return NextResponse.json(
      { ok: true, message: 'Request sent. Your distributor will review and contact you with login credentials.' },
      { status: 200, headers },
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to submit request. Please try again.' },
      { status: 500, headers },
    );
  }
}
