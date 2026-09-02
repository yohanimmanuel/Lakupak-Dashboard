import { NextRequest, NextResponse } from 'next/server';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import {
  decodeBuyerPhoneParam,
  getOwnedWhatsAppCsWorkflow,
  sendWhatsAppCsAgentReply,
} from '@/lib/automations/whatsappCsReply';
import { WhatsAppCsOutboundInProgressError } from '@/lib/automations/whatsappCsOutbound';
import { WhatsAppCloudApiError } from '@/lib/whatsapp/cloudApi';

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

export async function POST(request: NextRequest, context: RouteContext) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = String(record.text ?? '').trim();
  const senderName = String(record.senderName ?? '').trim() || undefined;
  const idempotencyKey = String(record.idempotencyKey ?? '').trim() || undefined;

  if (!text) {
    return NextResponse.json({ error: 'Message text is required.' }, { status: 400 });
  }

  const buyerPhone = decodeBuyerPhoneParam(buyerPhoneRaw);

  try {
    const result = await sendWhatsAppCsAgentReply({
      workflow,
      buyerPhone,
      text,
      senderName,
      idempotencyKey,
    });
    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      idempotencyKey: result.idempotencyKey,
      session: result.session,
    });
  } catch (err) {
    if (err instanceof WhatsAppCloudApiError) {
      return NextResponse.json(
        { error: err.message, code: err.code, fbtraceId: err.fbtraceId },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    if (err instanceof WhatsAppCsOutboundInProgressError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'Failed to send reply.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
