import crypto from 'node:crypto';
import { after, NextRequest, NextResponse } from 'next/server';
import {
  dispatchInboundWhatsAppMessages,
  parseWhatsAppWebhookMessages,
} from '@/lib/automations/whatsappInbound';
import {
  dispatchWhatsAppStatusWebhooks,
  parseWhatsAppWebhookStatuses,
} from '@/lib/automations/whatsappStatusWebhook';

const VERIFY_TOKEN =
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ||
  process.env.WHATSAPP_CLOUD_VERIFY_TOKEN?.trim() ||
  '';

const APP_SECRET = process.env.META_APP_SECRET?.trim() || '';

function isValidSignature(raw: string, header: string | null): boolean {
  if (!APP_SECRET || !header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', APP_SECRET).update(raw, 'utf8').digest('hex');
  const received = header.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!isValidSignature(raw, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messages = parseWhatsAppWebhookMessages(body);
  const statuses = parseWhatsAppWebhookStatuses(body);
  if (messages.length > 0 || statuses.length > 0) {
    after(async () => {
      if (statuses.length > 0) {
        try {
          await dispatchWhatsAppStatusWebhooks(statuses);
        } catch (err) {
          console.error('[whatsapp-webhook] status dispatch failed', err);
        }
      }
      if (messages.length > 0) {
        try {
          await dispatchInboundWhatsAppMessages(messages);
        } catch (err) {
          console.error('[whatsapp-webhook] inbound dispatch failed', err);
        }
      }
    });
  }

  return NextResponse.json({ ok: true });
}
