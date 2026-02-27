import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { compare } from 'bcryptjs';
import { getSecurityHeaders } from '../../../../utils/auth-security';
import { getAuthenticatedUserId } from '../../../../utils/auth-helpers';

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const authenticatedUserId = await getAuthenticatedUserId(req);
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
    }

    let body: { fleetId?: unknown; currentPassword?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });
    }

    const { fleetId, currentPassword } = body;

    if (!fleetId || typeof fleetId !== 'string') {
      return NextResponse.json({ error: 'Fleet ID is required' }, { status: 400, headers });
    }
    if (!currentPassword || typeof currentPassword !== 'string') {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400, headers });
    }

    const fleetIdNum = parseInt(fleetId, 10);
    if (!Number.isInteger(fleetIdNum) || fleetIdNum <= 0) {
      return NextResponse.json({ error: 'Invalid fleet ID' }, { status: 400, headers });
    }

    // Ensure the fleet belongs to the authenticated distributor
    const fleet = await prisma.fleet.findFirst({
      where: { id: fleetIdNum, userId: authenticatedUserId },
      select: { driverPasswordHash: true },
    });

    if (!fleet) {
      return NextResponse.json({ error: 'Fleet not found' }, { status: 404, headers });
    }

    if (!fleet.driverPasswordHash) {
      return NextResponse.json({ error: 'No password set for this driver' }, { status: 400, headers });
    }

    const isValid = await compare(currentPassword, fleet.driverPasswordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401, headers });
    }

    return NextResponse.json(
      { message: 'Password verified successfully' },
      { status: 200, headers: { ...headers, 'Cache-Control': 'no-store, no-cache, must-revalidate, private' } }
    );
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred. Please try again.' }, { status: 500, headers });
  }
}
