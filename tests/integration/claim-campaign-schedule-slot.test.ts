import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/prisma-generated';
import { prisma } from '@/lib/db';
import { claimCampaignScheduleSlot } from '@/lib/automations/engine';
import { SCHEDULE_CLAIM_KEY } from '@/lib/automations/scheduleTime';
import { resetDb } from './helpers';

const SEND_AT_UTC = '2026-08-17T11:00:00.000Z';
const SEND_AT_LOCAL = '2026-08-17T19:00';

function scheduleConfig(campaigns: string[]) {
  return {
    sendAt: SEND_AT_LOCAL,
    sendAtUtc: SEND_AT_UTC,
    selectedCampaigns: campaigns,
  };
}

function agentConfigWithCampaigns(campaigns: string[]) {
  return {
    note: '',
    __canvas: {
      nodes: [
        {
          id: 'trigger_1',
          data: {
            kind: 'trigger',
            catalogType: 'campaign_schedule',
            config: scheduleConfig(campaigns),
          },
        },
      ],
      edges: [],
    },
  };
}

describe('claimCampaignScheduleSlot concurrent save', () => {
  let otherPool: Pool | null = null;
  let otherPrisma: PrismaClient | null = null;

  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    if (otherPrisma) {
      await otherPrisma.$disconnect();
      otherPrisma = null;
    }
    if (otherPool) {
      await otherPool.end();
      otherPool = null;
    }
  });

  it('preserves a schedule save that lands after the claim read', async () => {
    const user = await prisma.user.create({
      data: { email: 'claim-race@example.com', password: 'x' },
      select: { id: true },
    });

    const workflow = await prisma.automationWorkflow.create({
      data: {
        userId: user.id,
        name: 'Claim race',
        type: 'marketing',
        status: 'active',
        triggerType: 'campaign_schedule',
        triggerConfig: scheduleConfig(['old-campaign']),
        actionType: 'send_campaign',
        agentConfig: agentConfigWithCampaigns(['old-campaign']),
      },
      select: { id: true },
    });

    const sendAtMs = Date.parse(SEND_AT_UTC);
    const runKey = `campaign_schedule:${workflow.id}:${new Date(sendAtMs).toISOString()}`;

    otherPool = new Pool({ connectionString: process.env.DATABASE_URL });
    otherPrisma = new PrismaClient({ adapter: new PrismaPg(otherPool) });
    const other = otherPrisma;
    let savedOnce = false;

    const claimed = await claimCampaignScheduleSlot(
      workflow.id,
      runKey,
      SEND_AT_UTC,
      {
        afterWorkflowRead: async () => {
          if (savedOnce) return;
          savedOnce = true;
          await other.automationWorkflow.update({
            where: { id: workflow.id },
            data: {
              triggerConfig: scheduleConfig(['saved-campaign']),
              agentConfig: agentConfigWithCampaigns(['saved-campaign']),
            },
          });
        },
      },
    );

    expect(claimed).toBe(true);
    expect(savedOnce).toBe(true);

    const row = await prisma.automationWorkflow.findUnique({
      where: { id: workflow.id },
    });
    expect(row).toBeTruthy();

    const triggerConfig = row?.triggerConfig as Record<string, unknown>;
    expect(triggerConfig.selectedCampaigns).toEqual(['saved-campaign']);
    expect(triggerConfig[SCHEDULE_CLAIM_KEY]).toBe(runKey);
    expect(triggerConfig.sendAtUtc).toBe(SEND_AT_UTC);

    const canvas = (row?.agentConfig as { __canvas?: { nodes?: Array<{ data?: { config?: Record<string, unknown> } }> } })
      ?.__canvas;
    const nodeConfig = canvas?.nodes?.[0]?.data?.config;
    expect(nodeConfig?.selectedCampaigns).toEqual(['saved-campaign']);
    expect(nodeConfig?.[SCHEDULE_CLAIM_KEY]).toBe(runKey);
  });
});
