import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
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
    if (typeof payload.sub === 'number') sub = payload.sub;
    else if (typeof payload.sub === 'string') sub = parseInt(payload.sub, 10);
    else return null;
    if (!Number.isFinite(sub) || Math.floor(sub) !== sub) return null;
    return { sub, type: payload.type };
  } catch {
    return null;
  }
}

type Body = { startedAt: string; endedAt: string; durationSec: number };

const MERGE_GAP_SEC = 90;

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  const payload = verifyDriverToken(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (payload.type !== 'driver') return NextResponse.json({ error: 'Invalid token type' }, { status: 403, headers });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  if (
    typeof body.startedAt !== 'string' ||
    typeof body.endedAt !== 'string' ||
    (typeof body.durationSec !== 'number' && typeof body.durationSec !== 'string')
  ) {
    return NextResponse.json({ error: 'Invalid body structure' }, { status: 400, headers });
  }

  const startedAt = new Date(body.startedAt);
  const endedAt = new Date(body.endedAt);
  const durationSec = Number(body.durationSec);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return NextResponse.json({ error: 'durationSec must be > 0' }, { status: 400, headers });
  }
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return NextResponse.json({ error: 'Invalid timestamps' }, { status: 400, headers });
  }
  if (startedAt.getTime() > endedAt.getTime()) {
    return NextResponse.json({ error: 'startedAt must be <= endedAt' }, { status: 400, headers });
  }

  const safeDuration = Math.min(Math.floor(durationSec), 6 * 60 * 60);

  try {
    const p = prisma as unknown as {
      appSessionSample: {
        findFirst: (args: {
          where: { app: 'DRIVER'; actorType: 'DRIVER'; actorId: number };
          orderBy: { endedAt: 'desc' };
          select: { id: true; startedAt: true; endedAt: true; durationSec: true };
        }) => Promise<{ id: string; startedAt: Date; endedAt: Date; durationSec: number } | null>;
        create: (args: {
          data: {
            app: 'DRIVER';
            actorType: 'DRIVER';
            actorId: number;
            startedAt: Date;
            endedAt: Date;
            durationSec: number;
          };
        }) => Promise<unknown>;
        update: (args: { where: { id: string }; data: { endedAt: Date; durationSec: number } }) => Promise<unknown>;
      };
    };

    const last = await p.appSessionSample.findFirst({
      where: { app: 'DRIVER', actorType: 'DRIVER', actorId: payload.sub },
      orderBy: { endedAt: 'desc' },
      select: { id: true, startedAt: true, endedAt: true, durationSec: true },
    });
    const gapSec = last ? Math.floor((startedAt.getTime() - last.endedAt.getTime()) / 1000) : null;
    if (last && gapSec !== null && gapSec >= 0 && gapSec <= MERGE_GAP_SEC) {
      const CAP_SEC = 6 * 60 * 60;
      const mergedEndedAt = new Date(Math.max(last.endedAt.getTime(), endedAt.getTime()));
      const spanFromStartSec = Math.max(
        0,
        Math.floor((mergedEndedAt.getTime() - last.startedAt.getTime()) / 1000)
      );
      const mergedDurationSec = Math.min(Math.max(spanFromStartSec, last.durationSec + safeDuration), CAP_SEC);
      await p.appSessionSample.update({
        where: { id: last.id },
        data: { endedAt: mergedEndedAt, durationSec: mergedDurationSec },
      });
    } else {
      await p.appSessionSample.create({
        data: {
          app: 'DRIVER',
          actorType: 'DRIVER',
          actorId: payload.sub,
          startedAt,
          endedAt,
          durationSec: safeDuration,
        },
      });
    }

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to record session' }, { status: 500, headers });
  }
}

