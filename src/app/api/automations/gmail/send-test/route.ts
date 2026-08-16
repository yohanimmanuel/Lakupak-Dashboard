import { NextRequest, NextResponse } from 'next/server';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import {
  GmailSmtpError,
  resolveGmailSmtpCredentials,
  sendGmailMessage,
} from '@/lib/gmail/smtp';

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
  const subject = String(record.subject ?? '').trim() || 'Laku Automations test';
  const text = String(record.text ?? '').trim();

  const creds = resolveGmailSmtpCredentials({
    email: String(record.email ?? '').trim() || null,
    appPassword: String(record.appPassword ?? '').trim() || null,
  });

  if (!creds) {
    return NextResponse.json(
      {
        error:
          'Gmail address and App Password are required, or set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.',
      },
      { status: 400 },
    );
  }
  if (!to) {
    return NextResponse.json({ error: 'Recipient email (to) is required.' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: 'Message text is required.' }, { status: 400 });
  }

  try {
    const result = await sendGmailMessage({ creds, to, subject, text });
    return NextResponse.json({ ok: true, messageId: result.messageId ?? null });
  } catch (err) {
    if (err instanceof GmailSmtpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to send Gmail message.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
