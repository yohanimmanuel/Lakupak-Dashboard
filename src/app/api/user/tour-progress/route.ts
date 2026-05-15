import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { mergeTourBlobs, type TourProgressBlob } from '@/lib/dashboardTourProgress';

async function getSessionUserId(): Promise<number | null> {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth-options');
  const session = await getServerSession(authOptions);
  return parseUserId(session);
}

function parseUserId(session: { user?: { id?: string } } | null): number | null {
  const raw = session?.user?.id;
  if (!raw) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

/** GET current tour blob from DB (for cross-device merge). */
export async function GET() {
  const userId = await getSessionUserId();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dashboardTourState: true },
  });

  const tours = (user?.dashboardTourState ?? {}) as unknown;
  return NextResponse.json({ tours });
}

/** PATCH merge client tours blob into User.dashboardTourState */
export async function PATCH(request: Request) {
  const userId = await getSessionUserId();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const incoming = (body as { tours?: unknown }).tours;
  if (!incoming || typeof incoming !== 'object') {
    return NextResponse.json({ error: 'Missing tours' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dashboardTourState: true },
  });

  const existing = (user?.dashboardTourState ?? {}) as unknown as TourProgressBlob;
  const merged = mergeTourBlobs(existing, incoming);

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { dashboardTourState: merged as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true, tours: merged });
}
