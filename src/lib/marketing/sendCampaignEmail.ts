import { prisma } from '@/lib/db';
import { GmailSmtpError, sendGmailMessageBatch, type GmailSmtpCredentials } from '@/lib/gmail/smtp';
import { resolveGmailCredentialsForUser } from '@/lib/gmail/userCredentials';
import { buildCampaignEmailHtml } from '@/lib/automations/campaignEmailHtml';

export const MAX_CAMPAIGN_EMAIL_BUYERS = 100;

export type MarketingCampaignSendErrorCode =
  | 'empty_buyers'
  | 'too_many_buyers'
  | 'campaign_not_found'
  | 'buyers_not_found'
  | 'gmail_not_connected'
  | 'zero_sent';

const SEND_ERROR_STATUS: Record<MarketingCampaignSendErrorCode, number> = {
  empty_buyers: 400,
  too_many_buyers: 400,
  campaign_not_found: 404,
  buyers_not_found: 400,
  gmail_not_connected: 400,
  zero_sent: 400,
};

const SEND_ERROR_MESSAGE: Record<MarketingCampaignSendErrorCode, string> = {
  empty_buyers: 'Select at least one buyer for email.',
  too_many_buyers: `Too many buyers. Maximum is ${MAX_CAMPAIGN_EMAIL_BUYERS} per send.`,
  campaign_not_found: 'Campaign not found.',
  buyers_not_found: 'No matching buyers found.',
  gmail_not_connected: 'Gmail is not connected.',
  zero_sent: 'Gmail sent 0 messages. Check that selected buyers have email addresses.',
};

export class MarketingCampaignSendError extends Error {
  readonly code: MarketingCampaignSendErrorCode;
  readonly status: number;

  constructor(code: MarketingCampaignSendErrorCode) {
    super(SEND_ERROR_MESSAGE[code]);
    this.name = 'MarketingCampaignSendError';
    this.code = code;
    this.status = SEND_ERROR_STATUS[code];
  }
}

const PARTIAL_SEND_INTERRUPTION =
  'Email sending was interrupted. Some messages may have been delivered.';

type RecipientDeliveryStatus = 'sent' | 'failed' | 'unattempted';

type RecipientDelivery = {
  buyerId: string;
  email: string | null;
  status: RecipientDeliveryStatus;
  error?: string;
};

export type MarketingCampaignSendResult = {
  campaignName: string;
  recipients: number;
  sent: number;
  failed: number;
  unattempted: number;
  fatal?: string;
};

function campaignShareUrl(campaignKey: string): string {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    'https://laku-dashboard.vercel.app'
  ).replace(/\/$/, '');
  return `${base}/campaigns/share/${encodeURIComponent(campaignKey)}`;
}

async function persistEmailDelivery(
  campaignId: string,
  deliveries: RecipientDelivery[],
  markSent: boolean,
) {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      emailDelivery: { recipients: deliveries },
      ...(markSent ? { status: 'Sent', sentDate: new Date() } : {}),
    },
  });
}

async function deliverMarketingCampaignEmails(args: {
  campaignId: string;
  campaignName: string;
  contentBlocks: unknown;
  intro: string;
  shareUrl: string;
  creds: GmailSmtpCredentials;
  buyers: Array<{ buyerId: string; email: string | null }>;
  unmatchedIds: string[];
}): Promise<{
  sent: number;
  failed: number;
  unattempted: number;
  smtpError?: GmailSmtpError;
}> {
  const deliveries: RecipientDelivery[] = args.unmatchedIds.map((buyerId) => ({
    buyerId,
    email: null,
    status: 'failed',
    error: 'unmatched',
  }));

  const queued: Array<{ buyerId: string; email: string }> = [];
  for (const buyer of args.buyers) {
    const email = String(buyer.email ?? '').trim();
    if (!email.includes('@')) {
      deliveries.push({
        buyerId: buyer.buyerId,
        email: email || null,
        status: 'failed',
        error: 'invalid_email',
      });
      continue;
    }
    queued.push({ buyerId: buyer.buyerId, email });
  }

  let smtpError: GmailSmtpError | undefined;
  if (queued.length > 0) {
    const html = buildCampaignEmailHtml({
      introText: args.intro,
      campaignName: args.campaignName,
      shareUrl: args.shareUrl,
      contentBlocks: args.contentBlocks,
    });
    try {
      const results = await sendGmailMessageBatch({
        creds: args.creds,
        messages: queued.map((row) => ({
          to: row.email,
          subject: args.campaignName,
          text: args.intro,
          html,
        })),
      });
      let anySmtp = false;
      for (let i = 0; i < queued.length; i += 1) {
        const row = queued[i];
        const result = results[i];
        if (result?.ok) {
          deliveries.push({ buyerId: row.buyerId, email: row.email, status: 'sent' });
        } else {
          anySmtp = true;
          deliveries.push({
            buyerId: row.buyerId,
            email: row.email,
            status: 'failed',
            error: 'send_failed',
          });
        }
      }
      if (anySmtp && results.every((r) => !r.ok)) {
        smtpError = new GmailSmtpError('Gmail SMTP failed for all recipients.', 502);
      }
    } catch (err) {
      console.error('[marketing/campaigns/send] Gmail batch failed', args.campaignId, err);
      if (err instanceof GmailSmtpError) {
        smtpError = err;
      }
      for (const row of queued) {
        deliveries.push({
          buyerId: row.buyerId,
          email: row.email,
          status: 'failed',
          error: 'smtp',
        });
      }
    }
  }

  const sent = deliveries.filter((row) => row.status === 'sent').length;
  const failed = deliveries.filter((row) => row.status === 'failed').length;
  const unattempted = deliveries.filter((row) => row.status === 'unattempted').length;
  const fullyAccounted = unattempted === 0;

  await persistEmailDelivery(args.campaignId, deliveries, sent > 0 && fullyAccounted);

  if (sent === 0 && !smtpError) {
    throw new MarketingCampaignSendError('zero_sent');
  }

  return { sent, failed, unattempted, smtpError };
}

export async function sendMarketingCampaignEmail(args: {
  userId: number;
  campaignId: string;
  buyerIds: string[];
}): Promise<MarketingCampaignSendResult> {
  if (args.buyerIds.length === 0) {
    throw new MarketingCampaignSendError('empty_buyers');
  }

  const buyerIds = [...new Set(args.buyerIds.map((id) => String(id).trim()).filter(Boolean))];
  if (buyerIds.length > MAX_CAMPAIGN_EMAIL_BUYERS) {
    throw new MarketingCampaignSendError('too_many_buyers');
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      userId: args.userId,
      OR: [{ id: args.campaignId }, { campaignId: args.campaignId }],
    },
    select: {
      id: true,
      name: true,
      description: true,
      contentBlocks: true,
    },
  });
  if (!campaign) {
    throw new MarketingCampaignSendError('campaign_not_found');
  }

  const buyers = await prisma.buyer.findMany({
    where: {
      userId: args.userId,
      buyerId: { in: buyerIds },
    },
    select: {
      buyerId: true,
      email: true,
    },
  });
  if (buyers.length === 0) {
    throw new MarketingCampaignSendError('buyers_not_found');
  }

  const foundIds = new Set(buyers.map((buyer) => buyer.buyerId));
  const unmatchedIds = buyerIds.filter((id) => !foundIds.has(id));

  const creds = await resolveGmailCredentialsForUser(args.userId);
  if (!creds) {
    throw new MarketingCampaignSendError('gmail_not_connected');
  }

  const shareUrl = campaignShareUrl(campaign.id);
  const intro = [campaign.name, campaign.description?.trim() || '', shareUrl]
    .filter(Boolean)
    .join('\n\n');

  const result = await deliverMarketingCampaignEmails({
    campaignId: campaign.id,
    campaignName: campaign.name,
    contentBlocks: campaign.contentBlocks,
    intro,
    shareUrl,
    creds,
    buyers,
    unmatchedIds,
  });

  return {
    campaignName: campaign.name,
    recipients: buyers.length,
    sent: result.sent,
    failed: result.failed,
    unattempted: result.unattempted,
    fatal: result.smtpError ? PARTIAL_SEND_INTERRUPTION : undefined,
  };
}
