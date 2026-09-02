import { prisma } from '@/lib/db';
import {
  credentialsFromWhatsAppAppConfig,
  normalizeE164Phone,
  sendTextMessage,
} from '@/lib/whatsapp/cloudApi';

type JsonRecord = Record<string, unknown>;

export const SALES_REP_ROLE = 'Sales Rep';

export type SalesRepAgent = {
  id: string;
  name: string;
  phone: string;
  territory: string | null;
};

const DEFAULT_INLINE_SAME_CHAT_HANDOFF_TEMPLATE =
  'For {{territory}}, your sales rep is *{{agentName}}*. They will reply to you here in this chat shortly. Please stay on this number.';

function interpolate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

/** Active sales reps only (excludes manager, support, lead gen, account manager). */
export async function listActiveSalesReps(userId: number): Promise<SalesRepAgent[]> {
  return prisma.salesAgent.findMany({
    where: { userId, status: 'active', role: SALES_REP_ROLE },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, phone: true, territory: true },
  });
}

/** Distinct non-empty territories covered by active sales reps. */
export async function listSalesRepTerritories(userId: number): Promise<string[]> {
  const reps = await listActiveSalesReps(userId);
  const territories = new Set<string>();
  for (const rep of reps) {
    const territory = String(rep.territory ?? '').trim();
    if (territory) territories.add(territory);
  }
  return [...territories].sort((a, b) => a.localeCompare(b));
}

export function matchTerritoryFromBuyerReply(
  buyerText: string,
  territories: string[],
): string | null {
  const normalized = buyerText.trim().toLowerCase();
  if (!normalized || territories.length === 0) return null;

  for (const territory of territories) {
    if (territory.toLowerCase() === normalized) return territory;
  }
  for (const territory of territories) {
    const tl = territory.toLowerCase();
    if (normalized.includes(tl) || tl.includes(normalized)) return territory;
  }
  for (const territory of territories) {
    const words = territory.toLowerCase().split(/[\s,/]+/).filter((w) => w.length > 2);
    if (words.some((word) => normalized.includes(word))) return territory;
  }
  return null;
}

async function pickSalesRepInTerritory(
  userId: number,
  territory: string,
): Promise<SalesRepAgent | null> {
  const reps = await listActiveSalesReps(userId);
  const matched = reps.filter((rep) => {
    const t = String(rep.territory ?? '').trim();
    if (!t) return false;
    return t.toLowerCase() === territory.toLowerCase();
  });
  if (matched.length === 0) return null;

  const { salesAgentRoundRobinCursor } = await prisma.user.update({
    where: { id: userId },
    data: { salesAgentRoundRobinCursor: { increment: 1 } },
    select: { salesAgentRoundRobinCursor: true },
  });
  const index = (salesAgentRoundRobinCursor - 1) % matched.length;
  return matched[index] ?? matched[0] ?? null;
}

export async function resolveSalesRepForTerritoryReply(
  userId: number,
  buyerText: string,
): Promise<{ agent: SalesRepAgent; territory: string } | null> {
  const territories = await listSalesRepTerritories(userId);
  const territory = matchTerritoryFromBuyerReply(buyerText, territories);
  if (!territory) return null;
  const agent = await pickSalesRepInTerritory(userId, territory);
  if (!agent) return null;
  return { agent, territory };
}

export function buildTerritoryAskPrompt(
  territories: string[],
  locale: 'en' | 'id' = 'en',
): string {
  const list = territories.map((t) => `• ${t}`).join('\n');
  if (locale === 'id') {
    return [
      'Tentu! Saya bisa menghubungkan Anda dengan sales rep di chat ini.',
      '',
      'Anda dari wilayah mana?',
      '',
      'Sales rep kami melayani:',
      list,
      '',
      'Balas dengan wilayah Anda dan saya akan assign sales rep yang tepat.',
    ].join('\n');
  }
  return [
    'Of course! I can connect you with a sales rep on this chat.',
    '',
    'Which territory are you from?',
    '',
    'Our sales reps cover:',
    list,
    '',
    'Reply with your territory and I will assign the right sales rep.',
  ].join('\n');
}

export function buildTerritoryRetryPrompt(
  territories: string[],
  locale: 'en' | 'id' = 'en',
): string {
  const list = territories.map((t) => `• ${t}`).join('\n');
  if (locale === 'id') {
    return [
      'Maaf, wilayah itu belum ada di daftar sales rep kami.',
      '',
      'Berikut area yang saat ini dilayani sales rep kami:',
      list,
      '',
      'Anda di wilayah yang mana?',
    ].join('\n');
  }
  return [
    "Sorry, that territory isn't on our sales rep list yet.",
    '',
    'These are the areas our sales reps currently cover:',
    list,
    '',
    'Which one are you in?',
  ].join('\n');
}

export function buildSameChatHandoffBody(args: {
  config: JsonRecord;
  workflowName: string;
  agent: SalesRepAgent;
  buyerName?: string;
  territory?: string;
}): string {
  const custom = String(args.config.messageTemplate ?? '').trim();
  const core = interpolate(DEFAULT_INLINE_SAME_CHAT_HANDOFF_TEMPLATE, {
    agentName: args.agent.name,
    agentPhone: args.agent.phone,
    buyerName: args.buyerName?.trim() || 'there',
    workflowName: args.workflowName || 'Lakupak',
    territory: args.territory?.trim() || 'your area',
  });

  if (!custom) return core;

  const prefix = interpolate(custom, {
    agentName: args.agent.name,
    agentPhone: args.agent.phone,
    buyerName: args.buyerName?.trim() || 'there',
    workflowName: args.workflowName || 'Lakupak',
    territory: args.territory ?? '',
  });
  return `${prefix}\n\n${core}`;
}

export async function buildAssignAgentHandoffText(args: {
  userId: number;
  workflowName: string;
  config: JsonRecord;
  buyerName?: string;
  inline?: boolean;
  sameChat?: boolean;
  territory?: string;
  agent?: SalesRepAgent;
}): Promise<{ body: string; agentName: string; agentId: string; territory?: string }> {
  const sameChat = args.sameChat ?? Boolean(args.inline);
  if (!sameChat) {
    throw new Error('External-phone assign is no longer supported; use same-chat handoff.');
  }

  let agent = args.agent ?? null;
  let territory = args.territory;

  if (!agent && territory) {
    agent = await pickSalesRepInTerritory(args.userId, territory);
  }

  if (!agent) {
    const reps = await listActiveSalesReps(args.userId);
    agent = reps[0] ?? null;
  }

  if (!agent) {
    throw new Error('assign_agent_whatsapp needs at least one active sales rep.');
  }

  const body = buildSameChatHandoffBody({
    config: args.config,
    workflowName: args.workflowName,
    agent,
    buyerName: args.buyerName,
    territory,
  });

  return {
    body,
    agentName: agent.name,
    agentId: agent.id,
    territory,
  };
}

export async function executeAssignAgentWhatsApp(args: {
  userId: number;
  workflowName: string;
  config: JsonRecord;
  whatsappAppConfig: JsonRecord | null;
  buyerPhone: string;
  buyerName?: string;
  territory?: string;
}): Promise<string> {
  const creds = credentialsFromWhatsAppAppConfig(args.whatsappAppConfig);
  if (!creds?.accessToken || !creds.phoneNumberId) {
    throw new Error(
      'assign_agent_whatsapp needs Cloud API credentials on the WhatsApp app node (accessToken + phoneNumberId), or WHATSAPP_CLOUD_* env vars.',
    );
  }

  const phone = normalizeE164Phone(args.buyerPhone);
  if (!phone) {
    throw new Error('assign_agent_whatsapp needs a valid buyer phone number.');
  }

  const { body, agentName } = await buildAssignAgentHandoffText({
    ...args,
    inline: true,
    sameChat: true,
  });

  const result = await sendTextMessage({
    accessToken: creds.accessToken,
    phoneNumberId: creds.phoneNumberId,
    to: phone,
    body,
  });

  return `assign_agent_whatsapp sent welcome to ${phone} via agent ${agentName} (${result.messageId}).`;
}
