import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '../../../../utils/auth-security';
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

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  const driver = await prisma.driver.findUnique({
    where: { id: payload.sub },
    select: { id: true, userId: true, name: true, username: true, phone: true, avatar: true, experience: true, status: true, createdAt: true },
  });

  if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404, headers });

  return NextResponse.json(
    {
      id: driver.id,
      name: driver.name,
      username: driver.username,
      phone: driver.phone ?? null,
      avatar: driver.avatar ?? null,
      distributorId: driver.userId,
      experience: driver.experience ?? null,
      status: driver.status ?? null,
      createdAt: driver.createdAt.toISOString(),
    },
    { status: 200, headers },
  );
}

export async function PATCH(req: NextRequest) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });
  }

  const { name, username, phone, avatar, experience, status } = body as { name?: unknown; username?: unknown; phone?: unknown; avatar?: unknown; experience?: unknown; status?: unknown };
  const data: Record<string, string | null> = {};
  if (typeof name === 'string' && name.trim()) data.name = name.trim();
  if (typeof username === 'string' && username.trim()) data.username = username.trim().toLowerCase();
  if (phone !== undefined) data.phone = typeof phone === 'string' && phone.trim() ? phone.trim() : null;
  if (avatar !== undefined) data.avatar = typeof avatar === 'string' && avatar.trim() ? avatar.trim() : null;
  if (experience !== undefined) data.experience = typeof experience === 'string' && experience.trim() ? experience.trim() : null;
  if (status !== undefined) data.status = typeof status === 'string' && status.trim() ? status.trim() : null;

  // Check username uniqueness before update
  if (data.username) {
    const existing = await prisma.driver.findFirst({ where: { username: data.username, NOT: { id: payload.sub } } });
    if (existing) {
      return NextResponse.json({ error: 'Username is already taken.' }, { status: 409, headers });
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400, headers });
  }

  let driver;
  try {
    driver = await prisma.driver.update({
      where: { id: payload.sub },
      data,
      select: { id: true, userId: true, name: true, username: true, phone: true, avatar: true, experience: true, status: true, createdAt: true },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404, headers });
    }
    throw err;
  }

  return NextResponse.json(
    {
      id: driver.id,
      name: driver.name,
      username: driver.username,
      phone: driver.phone ?? null,
      avatar: driver.avatar ?? null,
      distributorId: driver.userId,
      experience: driver.experience ?? null,
      status: driver.status ?? null,
      createdAt: driver.createdAt.toISOString(),
    },
    { status: 200, headers },
  );
}
