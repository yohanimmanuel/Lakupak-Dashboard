import { NextRequest, NextResponse } from 'next/server';
import { runDistributorAppAssistant } from '@/lib/lakuAi/runDistributorAppAssistant';
import { validateWorkflowPlan } from '@/lib/lakuAi/workflowPlan';
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

/** Same Lakupak AI as the navbar. Workflow drafts are one thing it can do. */
export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await setDbSecurityContextFromRequest(request, userId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = String(record.message ?? '').trim();
  const locale = typeof record.locale === 'string' ? record.locale : null;
  const history = (Array.isArray(record.history) ? record.history : [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as Record<string, unknown>;
      const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null;
      const content = String(item.content ?? '').trim();
      if (!role || !content) return null;
      return { role, content } as const;
    })
    .filter((row): row is { role: 'user' | 'assistant'; content: string } => Boolean(row));

  const result = await runDistributorAppAssistant({
    userId,
    message,
    history,
    locale,
    onCanvas: record.onCanvas === true,
    canvas: validateWorkflowPlan(record.canvas),
  });
  if (!result.ok) {
    const status = result.code === 'bad_request' ? 400 : result.code === 'not_configured' ? 503 : 502;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }
  return NextResponse.json({
    reply: result.reply,
    recipeId: result.recipeId,
    plan: result.plan,
    unavailable: result.unavailable,
    name: result.name,
    description: result.description,
    updates: result.updates,
    model: result.model,
    source: 'model',
  });
}
