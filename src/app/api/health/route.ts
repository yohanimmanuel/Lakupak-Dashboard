import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload: {
    ok: boolean;
    db: 'up' | 'down';
    ts: string;
  } = {
    ok: false,
    db: 'down',
    ts: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    payload.ok = true;
    payload.db = 'up';
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(payload, { status: 503 });
  }
}
