import { NextRequest, NextResponse } from 'next/server';
import { loadNavbarGlance } from '@/lib/navbar/glance';
import { setDbSecurityContextFromRequest } from '@/lib/db';

async function getSessionUserId(): Promise<number | null> {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth-options');
  const session = await getServerSession(authOptions);
  const raw = session?.user?.id;
  if (!raw) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await setDbSecurityContextFromRequest(request, userId);

  try {
    const glance = await loadNavbarGlance(userId);
    return NextResponse.json(glance);
  } catch (err) {
    console.error('[navbar-glance]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not load navbar glance.' }, { status: 500 });
  }
}
