import { NextRequest, NextResponse } from 'next/server';
import { handleWhatsAppReply, parseSalesJobWhatsAppPayload } from '@/lib/salesJobs/whatsapp';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const secret =
    process.env.SALES_JOB_WEBHOOK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    '';
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

/**
 * Swappable inbound point. Accepts either a Meta Cloud webhook body
 * or `{ jobId, fromPhone, action, amount, note }`.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const replies = parseSalesJobWhatsAppPayload(body);
  const results = [];
  for (const reply of replies) {
    results.push(await handleWhatsAppReply(reply));
  }
  if (replies.length === 0 && body && typeof body === 'object') {
    const row = body as { fromPhone?: unknown; text?: unknown };
    const fromPhone = typeof row.fromPhone === 'string' ? row.fromPhone : '';
    const text = typeof row.text === 'string' ? row.text : '';
    if (fromPhone && text) {
      const { handleFreeformAgentReply } = await import('@/lib/salesJobs/agentReply');
      const outcome = await handleFreeformAgentReply({ fromPhone, text });
      return NextResponse.json({ ok: true, handled: outcome.handled ? 1 : 0, results: [outcome] });
    }
  }
  return NextResponse.json({ ok: true, handled: results.filter((row) => row.handled).length, results });
}
