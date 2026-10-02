import { countBuyerMatchesForReview } from '@/lib/clientMatching/service';
import { prisma } from '@/lib/db';
import {
  WHATSAPP_GRAPH_VERSION,
  resolveWhatsAppCloudCredentials,
} from '@/lib/whatsapp/cloudApi';

export type AppConnection = 'connected' | 'disconnected' | 'unused';

export type NavbarGlance = {
  salesJobs: number;
  clientMatches: number;
  draftAutomations: number;
  whatsapp: AppConnection;
  gmail: AppConnection;
};

const REVIEW_JOB_STATUSES = ['pending', 'suggested', 'approved'] as const;

const WHATSAPP_TTL_MS = 2 * 60 * 1000;

let whatsappApiCache: { at: number; status: 'connected' | 'disconnected' } | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

type AppPresence = 'unused' | 'disconnected' | 'ready';

function canvasAppPresence(
  agentConfig: unknown,
  catalogType: 'app_webhook' | 'app_email',
  field: 'phone' | 'email',
): AppPresence {
  const canvas = asRecord(asRecord(agentConfig)?.__canvas);
  const nodes = canvas?.nodes;
  if (!Array.isArray(nodes)) return 'unused';
  let presence: AppPresence = 'unused';
  for (const node of nodes) {
    const data = asRecord(asRecord(node)?.data);
    if (data?.kind !== 'app' || data.catalogType !== catalogType) continue;
    const config = asRecord(data.config);
    if (String(config?.[field] ?? '').trim()) return 'ready';
    presence = 'disconnected';
  }
  return presence;
}

function strongerPresence(current: AppPresence, next: AppPresence): AppPresence {
  if (current === 'ready' || next === 'ready') return 'ready';
  if (current === 'disconnected' || next === 'disconnected') return 'disconnected';
  return 'unused';
}

async function appsOnWorkflows(userId: number): Promise<{ whatsapp: AppPresence; gmail: AppPresence }> {
  const workflows = await prisma.automationWorkflow.findMany({
    where: { userId },
    select: { whatsappPhone: true, gmailEmail: true, agentConfig: true },
  });
  let whatsapp: AppPresence = 'unused';
  let gmail: AppPresence = 'unused';
  for (const workflow of workflows) {
    const whatsappNext = String(workflow.whatsappPhone ?? '').trim()
      ? 'ready'
      : canvasAppPresence(workflow.agentConfig, 'app_webhook', 'phone');
    const gmailNext = String(workflow.gmailEmail ?? '').trim()
      ? 'ready'
      : canvasAppPresence(workflow.agentConfig, 'app_email', 'email');
    whatsapp = strongerPresence(whatsapp, whatsappNext);
    gmail = strongerPresence(gmail, gmailNext);
    if (whatsapp === 'ready' && gmail === 'ready') break;
  }
  return { whatsapp, gmail };
}

/** Live token check. Only used after this distributor has a filled WhatsApp app. */
async function whatsappApiStatus(): Promise<'connected' | 'disconnected'> {
  const now = Date.now();
  if (whatsappApiCache && now - whatsappApiCache.at < WHATSAPP_TTL_MS) return whatsappApiCache.status;

  const creds = resolveWhatsAppCloudCredentials();
  if (!creds?.accessToken || !creds.phoneNumberId) {
    whatsappApiCache = { at: now, status: 'disconnected' };
    return 'disconnected';
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(creds.phoneNumberId)}?fields=id`,
      {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
        signal: AbortSignal.timeout(4000),
      },
    );
    const status = res.ok ? 'connected' : 'disconnected';
    whatsappApiCache = { at: now, status };
    return status;
  } catch {
    const status = whatsappApiCache?.status ?? 'disconnected';
    whatsappApiCache = { at: now, status };
    return status;
  }
}

/** Counts that need a distributor decision, plus WhatsApp and Gmail health. */
export async function loadNavbarGlance(userId: number): Promise<NavbarGlance> {
  const [salesJobs, clientMatches, draftAutomations, workflowApps] = await Promise.all([
    prisma.salesJob.count({
      where: {
        distributorId: userId,
        createdBy: 'ai',
        status: { in: [...REVIEW_JOB_STATUSES] },
      },
    }),
    countBuyerMatchesForReview(userId),
    prisma.automationWorkflow.count({
      where: { userId, status: 'draft' },
    }),
    appsOnWorkflows(userId),
  ]);

  const whatsapp =
    workflowApps.whatsapp === 'ready'
      ? await whatsappApiStatus()
      : workflowApps.whatsapp === 'disconnected'
        ? 'disconnected'
        : 'unused';
  const gmail =
    workflowApps.gmail === 'ready'
      ? 'connected'
      : workflowApps.gmail === 'disconnected'
        ? 'disconnected'
        : 'unused';

  return { salesJobs, clientMatches, draftAutomations, whatsapp, gmail };
}
