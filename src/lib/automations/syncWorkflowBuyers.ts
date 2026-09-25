import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/prisma-generated';
import type { AutomationWorkflow } from '@/lib/prisma-generated';

type JsonRecord = Record<string, unknown>;

function asRecord(val: unknown): JsonRecord | null {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as JsonRecord;
  }
  return null;
}

export type DbBuyerSummary = {
  id: number;
  buyerId: string;
  owner: string;
  storeName: string;
  email: string | null;
  phone: string | null;
};

export type PickedBuyerRecord = {
  buyerId: string;
  buyerLabel: string;
  buyerPhone: string;
  buyerEmail: string;
};

export function toPickedBuyerRecord(b: DbBuyerSummary): PickedBuyerRecord {
  return {
    buyerId: b.buyerId,
    buyerLabel: b.storeName || b.owner || b.buyerId,
    buyerPhone: b.phone || '',
    buyerEmail: String(b.email ?? '').trim(),
  };
}

const ACTIONS_WITH_BUYERS = new Set([
  'cart_winback',
  'share_product_whatsapp',
  'return_confirm_whatsapp',
  'whatsapp_buyer',
]);

function hasBuyerFields(catalogType?: string, config?: JsonRecord | null): boolean {
  if (!config) return false;
  if (catalogType && ACTIONS_WITH_BUYERS.has(catalogType)) return true;
  if (Array.isArray(config.selectedBuyers)) return true;
  if (typeof config.buyerId === 'string' && config.buyerId.trim() !== '') return true;
  return false;
}

/**
 * Synchronizes a single action config's selectedBuyers and single buyerId fields with
 * the database buyers:
 * 1. Removes any deleted buyers that no longer exist in the database.
 * 2. Updates remaining buyers with fresh label, email, and phone from the database.
 * 3. If all previously selected buyers were deleted from the database, picks the
 *    buyers that are still available.
 */
export function syncBuyerConfig(
  config: JsonRecord,
  dbBuyers: DbBuyerSummary[],
): { config: JsonRecord; changed: boolean } {
  const byId = new Map<string, DbBuyerSummary>();
  for (const b of dbBuyers) {
    byId.set(b.buyerId, b);
    byId.set(String(b.id), b);
  }

  const prevList = Array.isArray(config.selectedBuyers) ? (config.selectedBuyers as unknown[]) : [];
  const prevBuyerIds: string[] = [];
  for (const item of prevList) {
    if (item && typeof item === 'object') {
      const row = item as JsonRecord;
      const id = String(row.buyerId ?? row.id ?? '').trim();
      if (id && !prevBuyerIds.includes(id)) {
        prevBuyerIds.push(id);
      }
    }
  }
  const singleId = String(config.buyerId ?? '').trim();
  if (singleId && !prevBuyerIds.includes(singleId)) {
    prevBuyerIds.push(singleId);
  }

  // Find which of the previously selected buyers still exist in the database
  const validExisting: DbBuyerSummary[] = [];
  const seen = new Set<string>();
  for (const id of prevBuyerIds) {
    const found = byId.get(id);
    if (found && !seen.has(found.buyerId)) {
      seen.add(found.buyerId);
      validExisting.push(found);
    }
  }

  // If valid buyers remain from previous selection, keep them (deleted buyers removed).
  // If buyers were previously selected, but ALL were deleted from DB:
  // fall back to picking the available buyers from DB ("pick the ones available at most").
  let nextBuyers: DbBuyerSummary[] = [];
  if (validExisting.length > 0) {
    nextBuyers = validExisting;
  } else if (prevBuyerIds.length > 0 && dbBuyers.length > 0) {
    nextBuyers = dbBuyers;
  } else {
    nextBuyers = [];
  }

  const nextPickedList: PickedBuyerRecord[] = nextBuyers.map(toPickedBuyerRecord);
  const primary = nextPickedList[0];

  const prevJson = JSON.stringify(config.selectedBuyers ?? []);
  const nextJson = JSON.stringify(nextPickedList);
  const prevBuyerId = String(config.buyerId ?? '').trim();
  const nextBuyerId = primary?.buyerId ?? '';
  const prevBuyerEmail = String(config.buyerEmail ?? '').trim();
  const nextBuyerEmail = primary?.buyerEmail ?? '';
  const prevBuyerPhone = String(config.buyerPhone ?? '').trim();
  const nextBuyerPhone = primary?.buyerPhone ?? '';
  const prevBuyerLabel = String(config.buyerLabel ?? '').trim();
  const nextBuyerLabel = primary?.buyerLabel ?? '';

  const changed =
    prevJson !== nextJson ||
    prevBuyerId !== nextBuyerId ||
    prevBuyerEmail !== nextBuyerEmail ||
    prevBuyerPhone !== nextBuyerPhone ||
    prevBuyerLabel !== nextBuyerLabel;

  if (!changed) {
    return { config, changed: false };
  }

  return {
    config: {
      ...config,
      selectedBuyers: nextPickedList,
      buyerId: nextBuyerId,
      buyerLabel: nextBuyerLabel,
      buyerPhone: nextBuyerPhone,
      buyerEmail: nextBuyerEmail,
    },
    changed: true,
  };
}

/**
 * Synchronizes agentConfig (__canvas.nodes) and actionConfig with database buyers.
 */
export function syncWorkflowConfigsBuyers(
  agentConfig: unknown,
  actionConfig: unknown,
  actionType: string | null | undefined,
  dbBuyers: DbBuyerSummary[],
): { agentConfig: JsonRecord | null; actionConfig: JsonRecord; changed: boolean } {
  let changed = false;

  // 1. Sync flat actionConfig
  let nextActionConfig = asRecord(actionConfig) ?? {};
  if (hasBuyerFields(actionType ?? undefined, nextActionConfig)) {
    const res = syncBuyerConfig(nextActionConfig, dbBuyers);
    if (res.changed) {
      nextActionConfig = res.config;
      changed = true;
    }
  }

  // 2. Sync agentConfig canvas nodes
  const root = asRecord(agentConfig);
  let nextAgentConfig: JsonRecord | null = root ? { ...root } : null;

  if (root) {
    const canvas = asRecord(root.__canvas);
    if (canvas && Array.isArray(canvas.nodes)) {
      let canvasChanged = false;
      const nextNodes = canvas.nodes.map((n) => {
        const row = asRecord(n);
        if (!row) return n;
        const data = asRecord(row.data);
        if (!data) return n;
        const catalogType = typeof data.catalogType === 'string' ? data.catalogType : undefined;
        const nodeConfig = asRecord(data.config) ?? {};
        if (hasBuyerFields(catalogType, nodeConfig)) {
          const res = syncBuyerConfig(nodeConfig, dbBuyers);
          if (res.changed) {
            canvasChanged = true;
            return {
              ...row,
              data: {
                ...data,
                config: res.config,
              },
            };
          }
        }
        return n;
      });

      if (canvasChanged) {
        changed = true;
        nextAgentConfig = {
          ...root,
          __canvas: {
            ...canvas,
            nodes: nextNodes,
          },
        };
      }
    }
  }

  return {
    agentConfig: nextAgentConfig,
    actionConfig: nextActionConfig,
    changed,
  };
}

/**
 * Queries current database buyers for a user.
 */
export async function fetchDbBuyers(userId: number): Promise<DbBuyerSummary[]> {
  return prisma.buyer.findMany({
    where: { userId },
    select: {
      id: true,
      buyerId: true,
      owner: true,
      storeName: true,
      email: true,
      phone: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Synchronizes a workflow's buyer selection with the database:
 * - Queries current buyers for this user in Prisma (or reuses prefetchedDbBuyers).
 * - Removes any deleted buyers from all nodes and flat action config.
 * - Refreshes buyer contacts (label, email, phone) from the DB.
 * - If all selected buyers were deleted, picks available buyers from the DB.
 * - Persists updated configs to Prisma ONLY when options.persist is true (e.g. mutations, deletion hook).
 *   Reads (query resolvers) should leave options.persist as false to avoid database writes on read.
 */
export async function syncWorkflowBuyers<
  T extends {
    id?: string;
    userId: number;
    agentConfig: unknown;
    actionConfig: unknown;
    actionType?: string | null;
  },
>(
  workflow: T,
  prefetchedDbBuyers?: DbBuyerSummary[],
  options?: { persist?: boolean },
): Promise<T> {
  const dbBuyers = prefetchedDbBuyers ?? (await fetchDbBuyers(workflow.userId));

  const { agentConfig, actionConfig, changed } = syncWorkflowConfigsBuyers(
    workflow.agentConfig,
    workflow.actionConfig,
    workflow.actionType,
    dbBuyers,
  );

  const shouldPersist = options?.persist ?? false;

  if (shouldPersist && changed && workflow.id) {
    try {
      await prisma.automationWorkflow.update({
        where: { id: workflow.id },
        data: {
          agentConfig: (agentConfig ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          actionConfig: actionConfig as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Non-fatal if workflow was concurrently deleted
    }
  }

  if (!changed) {
    return workflow;
  }

  return {
    ...workflow,
    agentConfig,
    actionConfig,
  };
}

/**
 * Syncs all workflows for a given user (e.g. after a buyer deletion event).
 */
export async function syncAllWorkflowsForUser(userId: number): Promise<void> {
  let workflows: AutomationWorkflow[] = [];
  let dbBuyers: DbBuyerSummary[] = [];

  try {
    const [fetchedWorkflows, fetchedDbBuyers] = await Promise.all([
      prisma.automationWorkflow.findMany({
        where: { userId },
      }),
      fetchDbBuyers(userId),
    ]);
    workflows = fetchedWorkflows;
    dbBuyers = fetchedDbBuyers;
  } catch (err) {
    console.error(`[automations] failed to fetch workflows or buyers for user ${userId}`, err);
    return;
  }

  for (const w of workflows) {
    try {
      await syncWorkflowBuyers(w, dbBuyers, { persist: true });
    } catch (err) {
      console.error(`[automations] failed to sync workflow ${w.id} buyers`, err);
    }
  }
}
