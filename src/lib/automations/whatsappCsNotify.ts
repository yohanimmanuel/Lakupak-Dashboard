import { prisma } from '@/lib/db';
import { broadcastDashboardNotification } from '@/utils/websocketBroadcast';

export async function notifyWhatsAppCsHandoff(args: {
  userId: number;
  workflowId: string;
  workflowName: string;
  buyerPhone: string;
  agentName: string;
  buyerMessage: string;
}): Promise<void> {
  const preview = args.buyerMessage.trim().slice(0, 100);
  const message = preview
    ? `${args.buyerPhone} requested ${args.agentName}. "${preview}"`
    : `${args.buyerPhone} requested ${args.agentName}.`;

  await prisma.notification.create({
    data: {
      userId: args.userId,
      type: 'sales',
      title: args.workflowName || 'WhatsApp CS handoff',
      message,
      metadata: {
        source: 'whatsapp_cs',
        kind: 'handoff',
        workflowId: args.workflowId,
        buyerPhone: args.buyerPhone,
        agentName: args.agentName,
      },
      actionUrl: `/automation/details?id=${encodeURIComponent(args.workflowId)}`,
    },
  });
  broadcastDashboardNotification(args.userId).catch(() => {
    /* best-effort */
  });
}

export async function notifyWhatsAppCsBuyerMessage(args: {
  userId: number;
  workflowId: string;
  workflowName: string;
  buyerPhone: string;
  agentName?: string;
  buyerMessage: string;
}): Promise<void> {
  const preview = args.buyerMessage.trim().slice(0, 100);
  const agentLabel = args.agentName ? ` (${args.agentName})` : '';
  const message = `${args.buyerPhone}${agentLabel}: "${preview}"`;

  await prisma.notification.create({
    data: {
      userId: args.userId,
      type: 'sales',
      title: args.workflowName || 'WhatsApp CS message',
      message,
      metadata: {
        source: 'whatsapp_cs',
        kind: 'buyer_message',
        workflowId: args.workflowId,
        buyerPhone: args.buyerPhone,
        agentName: args.agentName ?? null,
      },
      actionUrl: `/automation/details?id=${encodeURIComponent(args.workflowId)}`,
    },
  });
  broadcastDashboardNotification(args.userId).catch(() => {
    /* best-effort */
  });
}
