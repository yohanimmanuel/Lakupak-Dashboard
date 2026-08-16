import { NextRequest, NextResponse } from 'next/server';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import {
  resolveWhatsAppCloudCredentials,
  sendTextMessage,
  WhatsAppCloudApiError,
} from '@/lib/whatsapp/cloudApi';

async function getSessionUserId(): Promise<number | null> {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth-options');
  const session = await getServerSession(authOptions);
  const raw = session?.user?.id;
  if (!raw) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

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
  const to = String(record.to ?? '').trim();
  const text = String(record.text ?? '').trim();

  const creds = resolveWhatsAppCloudCredentials({
    accessToken: String(record.accessToken ?? '').trim() || null,
    phoneNumberId: String(record.phoneNumberId ?? '').trim() || null,
    wabaId: String(record.wabaId ?? '').trim() || null,
  });

  if (!creds?.accessToken || !creds.phoneNumberId) {
    return NextResponse.json(
      {
        error:
          'WhatsApp Cloud credentials required (accessToken and phoneNumberId), or set WHATSAPP_CLOUD_* env vars.',
      },
      { status: 400 },
    );
  }
  if (!to) {
    return NextResponse.json({ error: 'Recipient phone (to) is required.' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: 'Message text is required.' }, { status: 400 });
  }

  try {
    const result = await sendTextMessage({
      accessToken: creds.accessToken,
      phoneNumberId: creds.phoneNumberId,
      to,
      body: text,
    });
    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      contacts: result.contacts ?? [],
    });
  } catch (err) {
    if (err instanceof WhatsAppCloudApiError) {
      return NextResponse.json(
        { error: err.message, code: err.code, fbtraceId: err.fbtraceId },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to send WhatsApp message.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
