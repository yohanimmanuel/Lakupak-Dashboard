import { NextRequest, NextResponse } from 'next/server';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import { isWhatsAppCloudConfigured } from '@/lib/whatsapp/cloudApi';

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

  const configured = isWhatsAppCloudConfigured();
  if (!configured) {
    return NextResponse.json(
      {
        configured: false,
        error: 'WhatsApp Cloud API is not configured on the server.',
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ configured: true });
}
