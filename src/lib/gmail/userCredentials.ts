import { prisma } from '@/lib/db';
import {
  credentialsFromGmailAppConfig,
  resolveGmailSmtpCredentials,
  type GmailSmtpCredentials,
} from '@/lib/gmail/smtp';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function gmailConfigFromAgentConfig(agentConfig: unknown): JsonRecord | null {
  const root = asRecord(agentConfig);
  const canvas = asRecord(root?.__canvas);
  const nodes = canvas?.nodes;
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    const data = asRecord(asRecord(node)?.data);
    if (data?.kind === 'app' && data.catalogType === 'app_email') {
      return asRecord(data.config);
    }
  }
  return null;
}

/** Env SMTP first, then the latest Gmail app node on this user's automations. */
export async function resolveGmailCredentialsForUser(
  userId: number,
): Promise<GmailSmtpCredentials | null> {
  const fromEnv = resolveGmailSmtpCredentials();
  if (fromEnv) return fromEnv;

  const workflows = await prisma.automationWorkflow.findMany({
    where: { userId },
    select: { agentConfig: true },
    orderBy: { updatedAt: 'desc' },
    take: 40,
  });
  for (const workflow of workflows) {
    const creds = credentialsFromGmailAppConfig(gmailConfigFromAgentConfig(workflow.agentConfig));
    if (creds) return creds;
  }
  return null;
}
