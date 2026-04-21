import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';

type Body = {
  startedAt: string;
  endedAt: string;
  durationSec: number;
};

const MERGE_GAP_SEC = 90;

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });

    if (typeof body.startedAt !== 'string' || typeof body.endedAt !== 'string' || typeof body.durationSec !== 'number') {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400, headers });
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
    if (startedAt >= endedAt) {
      return NextResponse.json({ error: 'startedAt must be before endedAt' }, { status: 400, headers });
    }

    // Guardrails: ignore pathological values (e.g. stuck tab).
    const safeDuration = Math.min(Math.floor(durationSec), 6 * 60 * 60); // cap at 6h

    const p = prisma as unknown as {
      appSessionSample: {
        findFirst: (args: {
          where: { app: 'DASHBOARD'; actorType: 'DASHBOARD_USER'; actorId: number };
          orderBy: { endedAt: 'desc' };
          select: { id: true; startedAt: true; endedAt: true; durationSec: true };
        }) => Promise<{ id: string; startedAt: Date; endedAt: Date; durationSec: number } | null>;
        create: (args: {
          data: {
            app: 'DASHBOARD';
            actorType: 'DASHBOARD_USER';
            actorId: number;
            startedAt: Date;
            endedAt: Date;
            durationSec: number;
          };
        }) => Promise<unknown>;
        update: (args: {
          where: { id: string };
          data: { endedAt: Date; durationSec: number };
        }) => Promise<unknown>;
      };
    };

    const last = await p.appSessionSample.findFirst({
      where: { app: 'DASHBOARD', actorType: 'DASHBOARD_USER', actorId: userId },
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
          app: 'DASHBOARD',
          actorType: 'DASHBOARD_USER',
          actorId: userId,
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

