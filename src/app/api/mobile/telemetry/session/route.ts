import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';

type Body = {
  startedAt: string;
  endedAt: string;
  durationSec: number;
};

const MERGE_GAP_SEC = 90;
/** Serializes merge/create per marketplace user (see pg_advisory_xact_lock in POST). */
const SESSION_MERGE_ADVISORY_KEY1 = 872_001;

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const auth = await getAuthenticatedMarketplaceUserId(req);
    if (!auth.ok) {
      if (auth.reason === 'suspended') return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });

    const startedAt = new Date(body.startedAt);
    const endedAt = new Date(body.endedAt);
    const durationSec = Number(body.durationSec);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      return NextResponse.json({ error: 'durationSec must be > 0' }, { status: 400, headers });
    }
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid timestamps' }, { status: 400, headers });
    }
    if (endedAt.getTime() < startedAt.getTime()) {
      return NextResponse.json({ error: 'endedAt must be >= startedAt' }, { status: 400, headers });
    }

    const safeDuration = Math.min(Math.floor(durationSec), 6 * 60 * 60);
    const CAP_SEC = 6 * 60 * 60;

    type SessionDelegate = {
      create: (args: {
        data: {
          app: 'MARKETPLACE';
          actorType: 'MARKETPLACE_USER';
          actorId: number;
          startedAt: Date;
          endedAt: Date;
          durationSec: number;
        };
      }) => Promise<unknown>;
      update: (args: { where: { id: string }; data: { endedAt: Date; durationSec: number } }) => Promise<unknown>;
    };

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${SESSION_MERGE_ADVISORY_KEY1}, ${auth.userId})
      `;

      const locked = await tx.$queryRaw<
        Array<{ id: string; startedAt: Date; endedAt: Date; durationSec: number }>
      >`
        SELECT s."id", s."startedAt", s."endedAt", s."durationSec"
        FROM "AppSessionSample" s
        WHERE s."app" = 'MARKETPLACE'::"AppName"
          AND s."actorType" = 'MARKETPLACE_USER'::"AppActorType"
          AND s."actorId" = ${auth.userId}
        ORDER BY s."endedAt" DESC
        LIMIT 1
        FOR UPDATE
      `;

      const last = locked[0] ?? null;
      const gapSec = last ? Math.floor((startedAt.getTime() - last.endedAt.getTime()) / 1000) : null;

      const p = tx as unknown as { appSessionSample: SessionDelegate };

      if (last && gapSec !== null && gapSec >= 0 && gapSec <= MERGE_GAP_SEC) {
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
            app: 'MARKETPLACE',
            actorType: 'MARKETPLACE_USER',
            actorId: auth.userId,
            startedAt,
            endedAt,
            durationSec: safeDuration,
          },
        });
      }
    });

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: 'Failed to record session' }, { status: 500, headers });
  }
}

