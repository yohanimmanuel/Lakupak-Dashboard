import { prisma } from '@/lib/db';
import {
  credentialsFromWhatsAppAppConfig,
  normalizeE164Phone,
  sendTextMessage,
} from '@/lib/whatsapp/cloudApi';

type JsonRecord = Record<string, unknown>;

function interpolate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

async function pickSalesAgent(
  userId: number,
  rule: string,
): Promise<{ id: string; name: string; phone: string } | null> {
  const agents = await prisma.salesAgent.findMany({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, phone: true, territory: true },
  });
  if (agents.length === 0) return null;

  if (rule === 'round_robin') {
    const { salesAgentRoundRobinCursor } = await prisma.user.update({
      where: { id: userId },
      data: { salesAgentRoundRobinCursor: { increment: 1 } },
      select: { salesAgentRoundRobinCursor: true },
    });
    const index = (salesAgentRoundRobinCursor - 1) % agents.length;
    return agents[index] ?? agents[0] ?? null;
  }
  if (rule === 'load') {
    return agents[0] ?? null;
  }
  return agents[0] ?? null;
}

export async function executeAssignAgentWhatsApp(args: {
  userId: number;
  workflowName: string;
  config: JsonRecord;
  whatsappAppConfig: JsonRecord | null;
  buyerPhone: string;
  buyerName?: string;
}): Promise<string> {
  const creds = credentialsFromWhatsAppAppConfig(args.whatsappAppConfig);
  if (!creds?.accessToken || !creds.phoneNumberId) {
    throw new Error(
      'assign_agent_whatsapp needs Cloud API credentials on the WhatsApp app node (accessToken + phoneNumberId), or WHATSAPP_CLOUD_* env vars.',
    );
  }

  const messageTemplate = String(args.config.messageTemplate ?? '').trim();
  if (!messageTemplate) {
    throw new Error('assign_agent_whatsapp needs a messageTemplate.');
  }

  const phone = normalizeE164Phone(args.buyerPhone);
  if (!phone) {
    throw new Error('assign_agent_whatsapp needs a valid buyer phone number.');
  }

  const rule = String(args.config.assignmentRule ?? 'round_robin').trim() || 'round_robin';
  const agent = await pickSalesAgent(args.userId, rule);
  if (!agent) {
    throw new Error('assign_agent_whatsapp needs at least one active sales agent.');
  }

  const body = interpolate(messageTemplate, {
    buyerName: args.buyerName?.trim() || 'there',
    agentName: agent.name,
    agentPhone: agent.phone,
    workflowName: args.workflowName || 'Lakupak',
  });

  const result = await sendTextMessage({
    accessToken: creds.accessToken,
    phoneNumberId: creds.phoneNumberId,
    to: phone,
    body,
  });

  return `assign_agent_whatsapp sent welcome to ${phone} via agent ${agent.name} (${result.messageId}).`;
}
