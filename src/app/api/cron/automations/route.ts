import { NextResponse } from 'next/server';
import { tickAutomations } from '@/lib/automations/scheduler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function run(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const result = await tickAutomations();
  let salesJobs: { suggested: number; dispatched: number; failed: number } | { error: string } | null = null;
  try {
    const { tickSalesJobs } = await import('@/lib/salesJobs/tick');
    salesJobs = await tickSalesJobs();
  } catch (error) {
    salesJobs = { error: error instanceof Error ? error.message : 'sales jobs tick failed' };
  }
  return NextResponse.json({ ok: true, ...result, salesJobs, ts: new Date().toISOString() });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
