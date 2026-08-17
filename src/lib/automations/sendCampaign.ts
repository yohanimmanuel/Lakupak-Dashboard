import { prisma } from '@/lib/db';
import type { AutomationWorkflow } from '@/lib/prisma-generated';
import {
  credentialsFromWhatsAppAppConfig,
  normalizeE164Phone,
  sendTextMessage,
} from '@/lib/whatsapp/cloudApi';
import { credentialsFromGmailAppConfig, sendGmailMessageBatch } from '@/lib/gmail/smtp';
import { buildCampaignEmailHtml } from '@/lib/automations/campaignEmailHtml';
import { orderBuyersWithContactOverrides } from '@/lib/automations/buyerContacts';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function canvasNodes(workflow: AutomationWorkflow): Array<{
  kind?: string;
  catalogType?: string;
  config?: JsonRecord;
}> {
  const root = asRecord(workflow.agentConfig);
  const canvas = asRecord(root?.__canvas);
  const nodes = canvas?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => {
    const row = asRecord(n);
    const data = asRecord(row?.data);
    return {
      kind: typeof data?.kind === 'string' ? data.kind : undefined,
      catalogType: typeof data?.catalogType === 'string' ? data.catalogType : undefined,
      config: asRecord(data?.config) ?? undefined,
    };
  });
}

function appConfig(
  workflow: AutomationWorkflow,
  catalogType: 'app_webhook' | 'app_email',
): JsonRecord | null {
  return canvasNodes(workflow).find((n) => n.kind === 'app' && n.catalogType === catalogType)
    ?.config ?? null;
}

function pickedCampaignIds(config: JsonRecord | null | undefined): string[] {
  const raw = config?.selectedCampaigns;
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  if (list.length > 0) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const row = item as JsonRecord;
        return String(row.campaignId ?? row.id ?? '').trim();
      })
      .filter(Boolean);
  }
  const campaignId = String(config?.campaignId ?? '').trim();
  return campaignId ? [campaignId] : [];
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function campaignIdsForSend(workflow: AutomationWorkflow, config: JsonRecord): string[] {
  const fromConfig = uniqueIds(pickedCampaignIds(config));
  if (fromConfig.length > 0) return fromConfig;
  const fromCanvas = canvasNodes(workflow)
    .filter((n) => n.kind === 'action' && n.catalogType === 'send_campaign')
    .flatMap((n) => pickedCampaignIds(n.config));
  return uniqueIds(fromCanvas);
}

function campaignShareUrl(campaignKey: string): string {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    'https://laku-dashboard.vercel.app'
  ).replace(/\/$/, '');
  return `${base}/campaigns/share/${encodeURIComponent(campaignKey)}`;
}

function interpolate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function buildCampaignBody(
  template: string,
  vars: Record<string, string>,
): string {
  let body = interpolate(template, vars).trim();
  if (
    vars.campaignUrl &&
    !template.includes('{{campaignUrl}}') &&
    !body.includes(vars.campaignUrl)
  ) {
    body = [body, vars.campaignUrl].filter(Boolean).join('\n\n').trim();
  }
  return body;
}

function pickedBuyerIds(config: JsonRecord | null | undefined): string[] {
  const list = config?.selectedBuyers;
  if (Array.isArray(list) && list.length > 0) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        return String((item as JsonRecord).buyerId ?? '').trim();
      })
      .filter(Boolean);
  }
  const buyerId = String(config?.buyerId ?? '').trim();
  return buyerId ? [buyerId] : [];
}

async function loadSelectedBuyers(
  userId: number,
  buyerIds: string[],
  config?: JsonRecord | null,
): Promise<Array<{ buyerId: string; email: string; phone: string; owner: string; storeName: string }>> {
  const buyers = await prisma.buyer.findMany({
    where: {
      userId,
      buyerId: { in: buyerIds },
    },
    select: {
      buyerId: true,
      email: true,
      phone: true,
      owner: true,
      storeName: true,
    },
  });
  if (buyers.length === 0) {
    throw new Error('No matching buyers found for send_campaign.');
  }
  return orderBuyersWithContactOverrides(buyerIds, buyers, config, { prefer: 'config' });
}

async function loadSelectedCampaigns(
  userId: number,
  campaignIds: string[],
): Promise<
  Array<{
    id: string;
    campaignId: string;
    name: string;
    description: string | null;
    contentBlocks: unknown;
  }>
> {
  const campaigns = await prisma.campaign.findMany({
    where: {
      userId,
      OR: campaignIds.flatMap((id) => [{ id }, { campaignId: id }]),
    },
    select: {
      id: true,
      campaignId: true,
      name: true,
      description: true,
      contentBlocks: true,
    },
  });
  const byKey = new Map<string, (typeof campaigns)[number]>();
  for (const campaign of campaigns) {
    byKey.set(campaign.id, campaign);
    byKey.set(campaign.campaignId, campaign);
  }
  const ordered: typeof campaigns = [];
  const seen = new Set<string>();
  for (const id of campaignIds) {
    const campaign = byKey.get(id);
    if (!campaign || seen.has(campaign.id)) continue;
    seen.add(campaign.id);
    ordered.push(campaign);
  }
  if (ordered.length === 0) {
    throw new Error('No matching campaigns found for send_campaign.');
  }
  return ordered;
}

export async function executeSendCampaign(
  workflow: AutomationWorkflow,
  config: JsonRecord,
  options?: { testMode?: boolean },
): Promise<string> {
  const testMode = Boolean(options?.testMode);
  const latest =
    (await prisma.automationWorkflow.findUnique({ where: { id: workflow.id } })) ??
    workflow;
  const channel = String(config.channel ?? 'email').trim() || 'email';
  const wantsEmail = channel === 'email' || channel === 'both';
  const wantsWhatsApp = channel === 'whatsapp' || channel === 'both';

  const campaignIds = campaignIdsForSend(latest, config);
  if (campaignIds.length === 0) {
    throw new Error('send_campaign needs a campaign.');
  }

  const campaigns = await loadSelectedCampaigns(workflow.userId, campaignIds);

  const buyerIds = pickedBuyerIds(config);
  if (buyerIds.length === 0) {
    throw new Error('send_campaign needs at least one buyer.');
  }

  const buyers = await loadSelectedBuyers(workflow.userId, buyerIds, config);
  const messageTemplate = String(config.messageTemplate ?? '').trim();
  if (!messageTemplate) {
    throw new Error('send_campaign needs a message template.');
  }

  const emailCreds = wantsEmail
    ? credentialsFromGmailAppConfig(appConfig(latest, 'app_email'))
    : null;
  if (wantsEmail && !emailCreds) {
    throw new Error(
      'send_campaign email needs Gmail SMTP configured (SMTP_USER / SMTP_PASS or GMAIL_SMTP_* env vars).',
    );
  }

  const waCreds = wantsWhatsApp
    ? credentialsFromWhatsAppAppConfig(appConfig(latest, 'app_webhook'))
    : null;

  const summaries: string[] = [];
  let emailSent = 0;
  let emailFailed = 0;
  const buyersMissingEmail = wantsEmail
    ? buyers.filter((buyer) => !buyer.email.includes('@'))
    : [];
  const missingEmailLabels = buyersMissingEmail.map(
    (buyer) => buyer.storeName || buyer.owner || buyer.buyerId,
  );
  let waSent = 0;
  let waFailed = 0;

  for (const campaign of campaigns) {
    const shareUrl = campaignShareUrl(campaign.id);
    const campaignVars = {
      campaignName: campaign.name,
      campaignDescription: String(campaign.description ?? '').trim(),
      campaignUrl: shareUrl,
    };
    let campaignEmailSent = 0;
    let campaignWaSent = 0;

    if (wantsEmail && emailCreds) {
      const emailable = buyers.filter((buyer) => buyer.email.includes('@'));
      if (testMode) {
        campaignEmailSent += emailable.length;
        emailSent += emailable.length;
      } else if (emailable.length > 0) {
        try {
          const results = await sendGmailMessageBatch({
            creds: emailCreds,
            messages: emailable.map((buyer) => {
              const text = buildCampaignBody(messageTemplate, {
                ...campaignVars,
                buyerName: buyer.owner || buyer.storeName || buyer.buyerId,
                storeName: buyer.storeName || '',
              });
              return {
                to: buyer.email,
                subject: campaign.name,
                text,
                html: buildCampaignEmailHtml({
                  introText: text,
                  campaignName: campaign.name,
                  shareUrl,
                  contentBlocks: campaign.contentBlocks,
                }),
              };
            }),
          });
          for (const result of results) {
            if (result.ok) {
              campaignEmailSent += 1;
              emailSent += 1;
            } else {
              emailFailed += 1;
            }
          }
        } catch {
          emailFailed += emailable.length;
        }
      }
    }

    if (wantsWhatsApp) {
      if (!waCreds?.accessToken || !waCreds.phoneNumberId) {
        if (campaign === campaigns[0]) {
          summaries.push(
            'WhatsApp skipped (Cloud API credentials missing on the WhatsApp app node).',
          );
        }
      } else {
        for (const buyer of buyers) {
          const phone = normalizeE164Phone(buyer.phone);
          if (!phone) continue;
          const body = buildCampaignBody(messageTemplate, {
            ...campaignVars,
            buyerName: buyer.owner || buyer.storeName || buyer.buyerId,
            storeName: buyer.storeName || '',
          });
          if (testMode) {
            campaignWaSent += 1;
            waSent += 1;
            continue;
          }
          try {
            await sendTextMessage({
              accessToken: waCreds.accessToken,
              phoneNumberId: waCreds.phoneNumberId,
              to: phone,
              body,
            });
            campaignWaSent += 1;
            waSent += 1;
          } catch {
            waFailed += 1;
            // Keep email success if WhatsApp is still in review / test-recipient limited.
          }
        }
      }
    }

    if (campaignEmailSent + campaignWaSent > 0) {
      if (!testMode) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: 'Sent',
            sentDate: new Date(),
          },
        });
      }
      summaries.push(`"${campaign.name}"`);
    }
  }

  if (!testMode && wantsEmail && emailSent === 0) {
    throw new Error('Gmail sent 0 messages for the selected campaigns.');
  }
  if (!testMode && wantsWhatsApp && !wantsEmail && waSent === 0) {
    throw new Error('WhatsApp sent 0 messages for the selected campaigns.');
  }

  const parts: string[] = [];
  if (wantsEmail) {
    parts.push(
      testMode
        ? `Gmail preview ${emailSent} (${campaigns.length} campaign(s) × ${buyers.length} buyer(s), not sent)`
        : `Gmail sent ${emailSent} (${campaigns.length} campaign(s) × ${buyers.length} buyer(s))`,
    );
    if (buyersMissingEmail.length > 0) {
      const names = missingEmailLabels.slice(0, 3).join(', ');
      parts.push(
        `Gmail skipped ${buyersMissingEmail.length} buyer(s) with no email${names ? ` (${names})` : ''}`,
      );
    }
    if (emailFailed) parts.push(`Gmail failed ${emailFailed}`);
    const emailableCount = buyers.length - buyersMissingEmail.length;
    if (!testMode && emailableCount > 0) {
      parts.push(`to ${emailableCount} buyer(s)`);
    }
  }
  if (wantsWhatsApp && waCreds?.accessToken && waCreds.phoneNumberId) {
    parts.push(testMode ? `WhatsApp preview ${waSent} (not sent)` : `WhatsApp sent ${waSent}`);
    if (waFailed) parts.push(`WhatsApp failed ${waFailed}`);
  }

  return `${testMode ? 'send_campaign test (not sent)' : 'send_campaign'} ${summaries.join(', ')}: ${parts.join('; ')}.`;
}
