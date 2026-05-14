import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { mergeTourBlobs, type TourProgressBlob } from '@/lib/dashboardTourProgress';

function parseUserId(session: { user?: { id?: string } } | null): number | null {
  const raw = session?.user?.id;
  if (!raw) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

/** GET current tour blob from DB (for cross-device merge). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = parseUserId(session);
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
  const session = await getServerSession(authOptions);
  const userId = parseUserId(session);
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

  return NextResponse.json({ ok: true, tours: merged });
}
