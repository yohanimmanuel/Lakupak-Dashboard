import { NextRequest, NextResponse } from 'next/server';
import { setDbSecurityContextFromRequest } from '@/lib/db';
import { GmailSmtpError } from '@/lib/gmail/smtp';
import {
  MAX_CAMPAIGN_EMAIL_BUYERS,
  MarketingCampaignSendError,
  sendMarketingCampaignEmail,
} from '@/lib/marketing/sendCampaignEmail';
import { campaignSendRateLimiter } from '@/utils/rateLimiter';

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
  const campaignId = String(record.campaignId ?? '').trim();
  const buyerIds = Array.isArray(record.buyerIds)
    ? record.buyerIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
  }

  const rateLimitResponse = await campaignSendRateLimiter(request, userId);
  if (rateLimitResponse) return rateLimitResponse;

  const uniqueBuyerCount = new Set(buyerIds).size;
  if (uniqueBuyerCount > MAX_CAMPAIGN_EMAIL_BUYERS) {
    return NextResponse.json(
      {
        error: `Too many buyers. Maximum is ${MAX_CAMPAIGN_EMAIL_BUYERS} per send.`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await sendMarketingCampaignEmail({ userId, campaignId, buyerIds });
    return NextResponse.json({
      ok: true,
      ...result,
      ...(result.fatal ? { error: result.fatal } : {}),
    });
  } catch (err) {
    if (err instanceof MarketingCampaignSendError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof GmailSmtpError) {
      console.error('[marketing/campaigns/send] Gmail SMTP error', err);
      return NextResponse.json({ error: 'Could not send campaign email.' }, { status: 502 });
    }
    console.error('[marketing/campaigns/send]', err);
    return NextResponse.json({ error: 'Could not send campaign email.' }, { status: 500 });
  }
}
