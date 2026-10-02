import { NextRequest, NextResponse } from 'next/server';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import { appendConversationTurn, createConversation, deleteConversation, getConversation, listConversations, renameConversation, setConversationPinned } from '@/lib/lakuAi/conversationStore';
import type { StoredTurn } from '@/lib/lakuAi/conversationStore';

async function getSessionUserId(): Promise<number | null> {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth-options');
  const session = await getServerSession(authOptions);
  const raw = session?.user?.id;
  if (!raw) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function turnsFromBody(value: unknown): StoredTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null;
    if (!role) return [];
    return [{ role, content: String(item.content ?? ''), recipeId: typeof item.recipeId === 'string' ? item.recipeId : null }];
  });
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (userId == null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setDbSecurityContextFromRequest(request, userId);

  const id = request.nextUrl.searchParams.get('id');
  if (id) {
    const conversation = await getConversation(userId, id);
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ conversation });
  }

  const automationId = request.nextUrl.searchParams.get('automationId');
  const scope = request.nextUrl.searchParams.get('scope');
  if (automationId) {
    const conversations = await listConversations(userId, { kind: 'automation', automationId });
    return NextResponse.json({ conversations });
  }
  if (scope === 'general') {
    const conversations = await listConversations(userId, { kind: 'general' });
    return NextResponse.json({ conversations });
  }
  return NextResponse.json({ error: 'Missing scope' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (userId == null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setDbSecurityContextFromRequest(request, userId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const automationId = typeof record.automationId === 'string' && record.automationId.trim() ? record.automationId.trim() : null;
  const result = await createConversation(userId, automationId, turnsFromBody(record.messages));
  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest) {
  const userId = await getSessionUserId();
  if (userId == null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setDbSecurityContextFromRequest(request, userId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const conversationId = String(record.conversationId ?? '').trim();
  if (typeof record.pinned === 'boolean') {
    const result = await setConversationPinned(userId, conversationId, record.pinned);
    if ('error' in result) {
      const status = result.error === 'not_found' ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result);
  }
  if (typeof record.title === 'string') {
    const result = await renameConversation(userId, conversationId, record.title);
    if ('error' in result) {
      const status = result.error === 'not_found' ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result);
  }
  const recipeId = typeof record.recipeId === 'string' ? record.recipeId : null;
  const result = await appendConversationTurn(
    userId,
    conversationId,
    String(record.userContent ?? ''),
    String(record.assistantContent ?? ''),
    recipeId,
  );
  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (userId == null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setDbSecurityContextFromRequest(request, userId);

  const id = request.nextUrl.searchParams.get('id')?.trim() ?? '';
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const result = await deleteConversation(userId, id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json(result);
}
