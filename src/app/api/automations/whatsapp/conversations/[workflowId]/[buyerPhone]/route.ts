import { NextRequest, NextResponse } from 'next/server';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import { loadBuyerCsSession } from '@/lib/automations/buyerCsSession';
import {
  decodeBuyerPhoneParam,
  getOwnedWhatsAppCsWorkflow,
  releaseWhatsAppCsToAi,
} from '@/lib/automations/whatsappCsReply';

async function getSessionUserId(): Promise<number | null> {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth-options');
  const session = await getServerSession(authOptions);
  const raw = session?.user?.id;
  if (!raw) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

type RouteContext = { params: Promise<{ workflowId: string; buyerPhone: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const userId = await getSessionUserId();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await setDbSecurityContextFromRequest(request, userId);

  const { workflowId, buyerPhone: buyerPhoneRaw } = await context.params;
  const workflow = await getOwnedWhatsAppCsWorkflow(workflowId, userId);
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });
  }

  const buyerPhone = decodeBuyerPhoneParam(buyerPhoneRaw);
  const session = await loadBuyerCsSession(workflowId, buyerPhone);
  if (!session) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  return NextResponse.json({ buyerPhone, session });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const userId = await getSessionUserId();
  if (userId == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await setDbSecurityContextFromRequest(request, userId);

  const { workflowId, buyerPhone: buyerPhoneRaw } = await context.params;
  const workflow = await getOwnedWhatsAppCsWorkflow(workflowId, userId);
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });
  }

  const buyerPhone = decodeBuyerPhoneParam(buyerPhoneRaw);

  try {
    const session = await releaseWhatsAppCsToAi({ workflow, buyerPhone });
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to release chat to AI.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
