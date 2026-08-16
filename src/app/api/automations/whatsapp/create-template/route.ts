import { NextRequest, NextResponse } from 'next/server';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import {
  createMessageTemplate,
  resolveWhatsAppCloudCredentials,
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

const CATEGORIES = new Set(['UTILITY', 'MARKETING', 'AUTHENTICATION']);

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
  const name = String(record.name ?? '').trim();
  const language = String(record.language ?? 'en_US').trim() || 'en_US';
  const categoryRaw = String(record.category ?? 'UTILITY').trim().toUpperCase();
  const bodyText = String(record.bodyText ?? '').trim();

  const creds = resolveWhatsAppCloudCredentials({
    accessToken: String(record.accessToken ?? '').trim() || null,
    phoneNumberId: String(record.phoneNumberId ?? '').trim() || null,
    wabaId: String(record.wabaId ?? '').trim() || null,
  });

  if (!creds?.accessToken) {
    return NextResponse.json(
      {
        error:
          'WhatsApp Cloud access token required, or set WHATSAPP_CLOUD_ACCESS_TOKEN.',
      },
      { status: 400 },
    );
  }
  if (!creds.wabaId) {
    return NextResponse.json(
      {
        error:
          'WhatsApp Business Account ID (wabaId) is required to create a message template.',
      },
      { status: 400 },
    );
  }
  if (!CATEGORIES.has(categoryRaw)) {
    return NextResponse.json(
      { error: 'category must be UTILITY, MARKETING, or AUTHENTICATION.' },
      { status: 400 },
    );
  }

  try {
    const result = await createMessageTemplate({
      accessToken: creds.accessToken,
      wabaId: creds.wabaId,
      name,
      language,
      category: categoryRaw as 'UTILITY' | 'MARKETING' | 'AUTHENTICATION',
      bodyText,
    });
    return NextResponse.json({
      ok: true,
      id: result.id,
      status: result.status,
      category: result.category,
      name: name.toLowerCase(),
      language,
    });
  } catch (err) {
    if (err instanceof WhatsAppCloudApiError) {
      return NextResponse.json(
        { error: err.message, code: err.code, fbtraceId: err.fbtraceId },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to create message template.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
