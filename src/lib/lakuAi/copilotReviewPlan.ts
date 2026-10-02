import {
  validateWorkflowPlan,
  type WorkflowCanvasEdit,
  type WorkflowFieldUpdate,
  type WorkflowPlanStep,
} from '@/lib/lakuAi/workflowPlan';

const STORAGE_KEY = 'laku-ai-review-plan';

function updatesFrom(value: unknown): WorkflowFieldUpdate[] {
  if (!Array.isArray(value)) return [];
  const updates: WorkflowFieldUpdate[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const type = String(row.type ?? '').trim();
    const config = row.config;
    if (!type || !config || typeof config !== 'object' || Array.isArray(config)) continue;
    updates.push({ type, config: config as Record<string, unknown> });
  }
  return updates;
}

/** Hands a custom draft from the Copilot page to the canvas. The canvas reads it once. */
export function writeCopilotReviewPlan(edit: WorkflowCanvasEdit): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(edit));
  } catch {
    // Review still opens the canvas. A blocked store only skips this draft.
  }
}

export function takeCopilotReviewPlan(): WorkflowCanvasEdit | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const steps = validateWorkflowPlan(parsed);
      return steps ? { steps, name: null, description: null, updates: [] } : null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const row = parsed as Record<string, unknown>;
    const steps = validateWorkflowPlan(row.steps);
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : null;
    const description = typeof row.description === 'string' && row.description.trim() ? row.description.trim() : null;
    const updates = updatesFrom(row.updates);
    if (!steps && !name && !description && updates.length === 0) return null;
    return { steps, name, description, updates };
  } catch {
    return null;
  }
}

export type { WorkflowPlanStep };
