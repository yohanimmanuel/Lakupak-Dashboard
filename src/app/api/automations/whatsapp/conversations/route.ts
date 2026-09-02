import { NextRequest, NextResponse } from 'next/server';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import { listBuyerCsSessionsForWorkflow } from '@/lib/automations/buyerCsSession';
import { getOwnedWhatsAppCsWorkflow } from '@/lib/automations/whatsappCsReply';

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

  const workflowId = request.nextUrl.searchParams.get('workflowId')?.trim() ?? '';
  if (!workflowId) {
    return NextResponse.json({ error: 'workflowId is required.' }, { status: 400 });
  }

  const workflow = await getOwnedWhatsAppCsWorkflow(workflowId, userId);
  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });
  }

  const humanOnly = request.nextUrl.searchParams.get('humanOnly') !== 'false';
  const conversations = await listBuyerCsSessionsForWorkflow(workflowId, { humanOnly });

  return NextResponse.json({ conversations });
}
