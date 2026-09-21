import { prisma } from '@/lib/db';
import type { AutomationWorkflow } from '@/lib/prisma-generated';
import {
  credentialsFromWhatsAppAppConfig,
  normalizeE164Phone,
  sendTextMessage,
} from '@/lib/whatsapp/cloudApi';
import { credentialsFromGmailAppConfig, sendGmailMessage } from '@/lib/gmail/smtp';
import { orderBuyersWithContactOverrides } from '@/lib/automations/buyerContacts';

type JsonRecord = Record<string, unknown>;

export const CHANNEL_MESSAGE_ACTIONS = new Set<string>([
  'share_product_whatsapp',
  'return_confirm_whatsapp',
  'cart_winback',
]);

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
  return (
    canvasNodes(workflow).find((n) => n.kind === 'app' && n.catalogType === catalogType)?.config ??
    null
  );
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

function pickedProducts(config: JsonRecord | null | undefined): Array<{
  productId: string;
  variantId: string;
}> {
  const list = config?.selectedProducts;
  if (Array.isArray(list) && list.length > 0) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as JsonRecord;
        const productId = String(row.productId ?? '').trim();
        if (!productId) return null;
        return {
          productId,
          variantId: String(row.variantId ?? '').trim(),
        };
      })
      .filter((row): row is { productId: string; variantId: string } => row != null);
  }
  const productId = String(config?.productId ?? '').trim();
  if (!productId) return [];
  return [{ productId, variantId: String(config?.variantId ?? '').trim() }];
}

function interpolate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkifyText(text: string): string {
  const urlRe = /(https?:\/\/[^\s<>"']+)/g;
  let last = 0;
  let out = '';
  for (const match of text.matchAll(urlRe)) {
    const url = match[0];
    const index = match.index ?? 0;
    out += escapeHtml(text.slice(last, index)).replace(/\n/g, '<br/>');
    const escapedUrl = escapeHtml(url);
    out += `<a href="${escapedUrl}" style="color:#0a61d7;word-break:break-all;">${escapedUrl}</a>`;
    last = index + url.length;
  }
  out += escapeHtml(text.slice(last)).replace(/\n/g, '<br/>');
  return out;
}

function textToHtml(text: string, imageUrls: string[] = []): string {
  const images = imageUrls
    .filter((url) => /^https?:\/\//i.test(url.trim()))
    .map(
      (url) =>
        `<img src="${escapeHtml(url.trim())}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:8px;margin:16px 0;" />`,
    )
    .join('');
  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111111;"><p>${linkifyText(text)}</p>${images}</body></html>`;
}

function marketplaceBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MARKETPLACE_URL ||
    process.env.MARKETPLACE_PUBLIC_URL ||
    'https://laku.id'
  ).replace(/\/$/, '');
}

function marketplaceProductUrl(productId: string): string {
  return `${marketplaceBaseUrl()}/product/${encodeURIComponent(productId)}`;
}

function marketplaceDistributorUrl(distributorUserId: number): string {
  return `${marketplaceBaseUrl()}/distributor/${distributorUserId}`;
}

function pickedOfferIds(config: JsonRecord | null | undefined): string[] {
  const list = config?.selectedOffers;
  if (Array.isArray(list) && list.length > 0) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const row = item as JsonRecord;
        return String(row.offerId ?? row.id ?? '').trim();
      })
      .filter(Boolean);
  }
  const offerId = String(config?.offerId ?? '').trim();
  return offerId ? [offerId] : [];
}

async function loadOfferVars(
  userId: number,
  config: JsonRecord,
  extraVars?: Record<string, string>,
): Promise<Record<string, string>> {
  if (extraVars?.offerName || extraVars?.offerUrl) {
    return {
      offerName: extraVars.offerName || '',
      offerId: extraVars.offerId || '',
      offerUrl: extraVars.offerUrl || '',
    };
  }
  const ids = pickedOfferIds(config);
  if (ids.length === 0) {
    return { offerName: '', offerId: '', offerUrl: '' };
  }
  const offer = await prisma.offer.findFirst({
    where: {
      userId,
      OR: [{ id: { in: ids } }, { offerId: { in: ids } }],
    },
    select: { id: true, offerId: true, name: true },
  });
  if (!offer) {
    return { offerName: '', offerId: ids[0] ?? '', offerUrl: '' };
  }
  return {
    offerName: offer.name,
    offerId: offer.offerId || offer.id,
    offerUrl: marketplaceDistributorUrl(userId),
  };
}

function resolveChannel(config: JsonRecord): string {
  const channel = String(config.channel ?? '').trim();
  return channel || 'whatsapp';
}

type LoadedBuyer = {
  buyerId: string;
  email: string;
  phone: string;
  owner: string;
  storeName: string;
};

async function loadSelectedBuyers(
  userId: number,
  buyerIds: string[],
  config?: JsonRecord | null,
  options?: { fallbackToAllBuyers?: boolean },
): Promise<LoadedBuyer[]> {
  const fallbackToAllBuyers = options?.fallbackToAllBuyers !== false;
  let buyers =
    buyerIds.length === 0
      ? []
      : await prisma.buyer.findMany({
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
  if (buyers.length === 0 && fallbackToAllBuyers) {
    buyers = await prisma.buyer.findMany({
      where: { userId },
      select: {
        buyerId: true,
        email: true,
        phone: true,
        owner: true,
        storeName: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (buyers.length === 0) {
    throw new Error('No matching buyers found in database.');
  }
  return orderBuyersWithContactOverrides(
    buyers.map((b) => b.buyerId),
    buyers,
    config,
    { prefer: 'db' },
  );
}

async function loadShareProductVars(
  userId: number,
  config: JsonRecord,
  extraVars?: Record<string, string>,
): Promise<Record<string, string>> {
  const picked = pickedProducts(config);
  const ids = picked.map((p) => p.productId);
  const products =
    ids.length === 0
      ? []
      : await prisma.product.findMany({
          where: { userId, productId: { in: ids } },
          select: { productId: true, name: true, images: true },
        });
  const names = products.map((p) => p.name).filter(Boolean);
  const urls = products.map((p) => marketplaceProductUrl(p.productId));
  const imageUrl = products
    .map((p) => (Array.isArray(p.images) ? p.images[0] : ''))
    .find((url) => /^https?:\/\//i.test(String(url ?? '').trim()));
  return {
    productName: extraVars?.productName || names.join(', ') || '',
    productId: extraVars?.productId || ids.join(', ') || '',
    productUrl: extraVars?.productUrl || urls.join('\n') || '',
    productImage: extraVars?.productImage || String(imageUrl ?? '').trim(),
  };
}

function defaultSubject(actionType: string, vars: Record<string, string>): string {
  if (actionType === 'share_product_whatsapp') {
    return vars.productName ? `Product: ${vars.productName}` : 'Product share from Lakupak';
  }
  if (actionType === 'return_confirm_whatsapp') {
    return 'Your return has been confirmed';
  }
  return 'Your cart is waiting';
}

function buildBody(
  actionType: string,
  template: string,
  vars: Record<string, string>,
): string {
  let body = interpolate(template, vars).trim();
  if (
    actionType === 'share_product_whatsapp' &&
    vars.productUrl &&
    !template.includes('{{productUrl}}') &&
    !body.includes(vars.productUrl)
  ) {
    const productBlock = [vars.productName, vars.productUrl].filter(Boolean).join('\n');
    body = [body, productBlock].filter(Boolean).join('\n\n').trim();
  }
  if (
    actionType === 'cart_winback' &&
    vars.cartProducts &&
    !template.includes('{{cartProducts}}') &&
    !body.includes(vars.cartProducts)
  ) {
    body = [body, vars.cartProducts].filter(Boolean).join('\n\n').trim();
  }
  if (actionType === 'cart_winback') {
    const offerParts: string[] = [];
    if (
      vars.offerName &&
      !template.includes('{{offerName}}') &&
      !body.includes(vars.offerName)
    ) {
      offerParts.push(vars.offerName);
    }
    if (
      vars.offerUrl &&
      !template.includes('{{offerUrl}}') &&
      !body.includes(vars.offerUrl)
    ) {
      offerParts.push(vars.offerUrl);
    }
    if (offerParts.length > 0) {
      body = [body, offerParts.join('\n')].filter(Boolean).join('\n\n').trim();
    }
  }
  return body;
}

async function deliverToBuyers(args: {
  workflow: AutomationWorkflow;
  actionType: string;
  channel: string;
  buyers: LoadedBuyer[];
  subject: string;
  textForBuyer: (buyer: LoadedBuyer) => string;
  imageUrls?: string[];
  testMode?: boolean;
}): Promise<string> {
  const wantsEmail = args.channel === 'email' || args.channel === 'both';
  const wantsWhatsApp = args.channel === 'whatsapp' || args.channel === 'both';
  if (!wantsEmail && !wantsWhatsApp) {
    throw new Error(`${args.actionType} needs channel WhatsApp, Email, or both.`);
  }

  const testMode = Boolean(args.testMode);
  const parts: string[] = [];

  if (wantsEmail) {
    const creds = credentialsFromGmailAppConfig(appConfig(args.workflow, 'app_email'));
    if (!creds) {
      throw new Error(
        `${args.actionType} email needs Gmail SMTP configured (SMTP_USER / SMTP_PASS or GMAIL_SMTP_* env vars).`,
      );
    }
    let sent = 0;
    const failed: string[] = [];
    for (const buyer of args.buyers) {
      if (!buyer.email.includes('@')) {
        failed.push(`${buyer.buyerId} (no email)`);
        continue;
      }
      const text = args.textForBuyer(buyer);
      if (testMode) {
        sent += 1;
        continue;
      }
      try {
        await sendGmailMessage({
          creds,
          to: buyer.email,
          subject: args.subject,
          text,
          html: textToHtml(text, args.imageUrls),
        });
        sent += 1;
      } catch (err) {
        failed.push(
          `${buyer.email} (${err instanceof Error ? err.message : String(err)})`,
        );
      }
    }
    if (!testMode && sent === 0) {
      throw new Error(
        `Gmail sent 0 messages.${failed.length ? ` ${failed[0]}` : ''}`,
      );
    }
    parts.push(
      testMode
        ? `Gmail preview ${sent}/${args.buyers.length} (not sent)`
        : `Gmail sent ${sent}/${args.buyers.length}`,
    );
    if (failed.length) parts.push(`Gmail failed ${failed.length}`);
  }

  if (wantsWhatsApp) {
    const creds = credentialsFromWhatsAppAppConfig(appConfig(args.workflow, 'app_webhook'));
    if (!creds?.accessToken || !creds.phoneNumberId) {
      if (!wantsEmail) {
        throw new Error(
          `${args.actionType} WhatsApp needs Cloud API credentials on the WhatsApp app node (accessToken + phoneNumberId), or WHATSAPP_CLOUD_* env vars.`,
        );
      }
      parts.push('WhatsApp skipped (Cloud API credentials missing on the WhatsApp app node).');
    } else {
      let sent = 0;
      const waFailed: string[] = [];
      for (const buyer of args.buyers) {
        const phone = normalizeE164Phone(buyer.phone);
        if (!phone) {
          waFailed.push(`${buyer.buyerId} (invalid phone)`);
          continue;
        }
        if (testMode) {
          args.textForBuyer(buyer);
          sent += 1;
          continue;
        }
        try {
          await sendTextMessage({
            accessToken: creds.accessToken,
            phoneNumberId: creds.phoneNumberId,
            to: phone,
            body: args.textForBuyer(buyer),
          });
          sent += 1;
        } catch (err) {
          // Keep email success if WhatsApp is still in review / test-recipient limited.
          waFailed.push(`${buyer.buyerId} (${err instanceof Error ? err.message : String(err)})`);
        }
      }
      if (!testMode && sent === 0 && !wantsEmail) {
        throw new Error(
          `WhatsApp sent 0 messages.${waFailed.length ? ` ${waFailed[0]}` : ''}`,
        );
      }
      parts.push(testMode ? `WhatsApp preview ${sent} (not sent)` : `WhatsApp sent ${sent}`);
      if (waFailed.length) parts.push(`WhatsApp failed ${waFailed.length}`);
    }
  }

  return `${testMode ? `${args.actionType} test (not sent)` : args.actionType}: ${parts.join('; ')}.`;
}

export type ChannelMessageRecipient = {
  buyerId: string;
  email: string;
  phone: string;
  owner: string;
  storeName: string;
};

export async function executeChannelBuyerMessage(
  workflow: AutomationWorkflow,
  actionType: string,
  config: JsonRecord,
  extraVars?: Record<string, string>,
  options?: {
    testMode?: boolean;
    recipients?: ChannelMessageRecipient[];
    fallbackToAllBuyers?: boolean;
  },
): Promise<string> {
  const messageTemplate = String(config.messageTemplate ?? '').trim();
  if (!messageTemplate) {
    throw new Error(`${actionType} needs a messageTemplate.`);
  }

  const fallbackToAllBuyers =
    options?.fallbackToAllBuyers ?? actionType !== 'cart_winback';
  const injected = options?.recipients?.filter((row) => String(row.buyerId ?? '').trim()) ?? [];
  let buyers: LoadedBuyer[];
  if (injected.length > 0) {
    buyers = injected.map((row) => ({
      buyerId: row.buyerId,
      email: String(row.email ?? '').trim(),
      phone: String(row.phone ?? '').trim(),
      owner: String(row.owner ?? '').trim(),
      storeName: String(row.storeName ?? '').trim(),
    }));
  } else {
    const buyerIds = pickedBuyerIds(config);
    if (buyerIds.length === 0 && !fallbackToAllBuyers) {
      throw new Error(`${actionType} needs at least one buyer.`);
    }
    buyers = await loadSelectedBuyers(workflow.userId, buyerIds, config, {
      fallbackToAllBuyers,
    });
  }
  const shareVars =
    actionType === 'share_product_whatsapp'
      ? await loadShareProductVars(workflow.userId, config, extraVars)
      : {};
  const offerVars =
    actionType === 'cart_winback'
      ? await loadOfferVars(workflow.userId, config, extraVars)
      : {};

  const baseVars: Record<string, string> = {
    workflowName: workflow.name || 'Lakupak',
    offerId: offerVars.offerId || String(config.offerId ?? extraVars?.offerId ?? '').trim(),
    ...shareVars,
    ...offerVars,
    ...(extraVars ?? {}),
  };

  const sampleText = buildBody(actionType, messageTemplate, {
    ...baseVars,
    buyerName: buyers[0]?.owner || buyers[0]?.storeName || '',
    storeName: buyers[0]?.storeName || '',
  });
  if (!sampleText) {
    throw new Error(`${actionType} message is empty after filling the template.`);
  }

  return deliverToBuyers({
    workflow,
    actionType,
    channel: resolveChannel(config),
    buyers,
    subject: defaultSubject(actionType, baseVars),
    imageUrls: baseVars.productImage ? [baseVars.productImage] : [],
    testMode: Boolean(options?.testMode),
    textForBuyer: (buyer) =>
      buildBody(actionType, messageTemplate, {
        ...baseVars,
        buyerName: buyer.owner || buyer.storeName || buyer.buyerId,
        storeName: buyer.storeName || '',
      }),
  });
}
