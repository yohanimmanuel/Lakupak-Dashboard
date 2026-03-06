import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '../../../../../utils/auth-security';
import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

function verifyDriverToken(req: NextRequest): { sub: number; type: string } | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.slice(7), getJwtSecret());
    if (!decoded || typeof decoded !== 'object') return null;
    const payload = decoded as Record<string, unknown>;
    if (typeof payload.type !== 'string') return null;
    let sub: number;
    if (typeof payload.sub === 'number') {
      sub = payload.sub;
    } else if (typeof payload.sub === 'string') {
      sub = parseInt(payload.sub, 10);
    } else {
      return null;
    }
    if (!Number.isFinite(sub) || Math.floor(sub) !== sub) return null;
    return { sub, type: payload.type };
  } catch {
    return null;
  }
}

const ALLOWED_STATUSES = ['Available', 'Unavailable', 'Checking', 'In Transit'] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ fleetId: string }> }
) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  const { fleetId: fleetIdParam } = await params;
  const fleetId = parseInt(fleetIdParam, 10);
  if (!Number.isFinite(fleetId) || fleetId < 1) {
    return NextResponse.json({ error: 'Invalid fleet ID' }, { status: 400, headers });
  }

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const status = typeof body.status === 'string' ? body.status.trim() : undefined;
  if (!status || !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
    return NextResponse.json(
      { error: 'status must be one of: Available, Unavailable, Checking, In Transit' },
      { status: 400, headers }
    );
  }

  try {
    const fleet = await prisma.fleet.findFirst({
      where: { id: fleetId, driverId: payload.sub },
      select: { id: true },
    });
    if (!fleet) {
      return NextResponse.json({ error: 'Fleet not found or access denied' }, { status: 404, headers });
    }

    await prisma.fleet.update({
      where: { id: fleetId },
      data: { status },
    });

    return NextResponse.json({ ok: true, status }, { status: 200, headers });
  } catch (error) {
    console.error('[DriverFleets] PATCH fleet status failed', fleetId, error);
    return NextResponse.json({ error: 'Failed to update fleet status' }, { status: 500, headers });
  }
}
