import {
  validateWorkflowPlan,
  type WorkflowCanvasEdit,
  type WorkflowFieldUpdate,
  type WorkflowPlanStep,
} from '@/lib/lakuAi/workflowPlan';

const STORAGE_KEY = 'laku-ai-review-plan';
const CANVAS_MARK = '<!--laku-canvas:';

function parseStoredEdit(value: unknown): WorkflowCanvasEdit | null {
  if (Array.isArray(value)) {
    const steps = validateWorkflowPlan(value);
    return steps ? { steps, name: null, description: null, updates: [] } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const steps = validateWorkflowPlan(row.steps);
  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : null;
  const description = typeof row.description === 'string' && row.description.trim() ? row.description.trim() : null;
  const updates = updatesFrom(row.updates);
  if (!steps && !name && !description && updates.length === 0) return null;
  return { steps, name, description, updates };
}

/** Keeps a canvas draft on the saved reply so Review on the canvas survives history. */
export function packCanvasReply(text: string, edit: WorkflowCanvasEdit | null): string {
  const visible = text.replace(/\n*<!--laku-canvas:[\s\S]*-->\s*$/, '').trim();
  if (!edit) return visible;
  return `${visible}\n\n${CANVAS_MARK}${JSON.stringify(edit)}-->`;
}

/** Reads a saved reply. Older workflow replies recover their steps from the numbered list. */
export function readCanvasReply(content: string): { text: string; edit: WorkflowCanvasEdit | null } {
  const text = content.replace(/\n*<!--laku-canvas:[\s\S]*-->\s*$/, '').trim();
  const match = content.match(/<!--laku-canvas:([\s\S]*?)-->\s*$/);
  if (!match) return { text, edit: editFromWorkflowReply(text) };
  try {
    return { text, edit: parseStoredEdit(JSON.parse(match[1])) ?? editFromWorkflowReply(text) };
  } catch {
    return { text, edit: editFromWorkflowReply(text) };
  }
}

const STEP_LABEL_TO_KEY: Record<string, string> = {
  'lakupak ai': 'agent',
  'low stock': 'trigger:stock_below',
  'stok rendah': 'trigger:stock_below',
  'buyer whatsapp questions': 'trigger:buyer_questions',
  'pertanyaan whatsapp pembeli': 'trigger:buyer_questions',
  'return accepted': 'trigger:return_accepted',
  'retur diterima': 'trigger:return_accepted',
  'new buyer': 'trigger:new_buyer',
  'pembeli baru': 'trigger:new_buyer',
  'order paid': 'trigger:order_paid',
  'pesanan dibayar': 'trigger:order_paid',
  'cart idle': 'trigger:cart_idle',
  'keranjang menganggur': 'trigger:cart_idle',
  'sales job created': 'trigger:sales_job_created',
  'pekerjaan penjualan dibuat': 'trigger:sales_job_created',
  'replenish stock': 'action:replenish_stock',
  'isi ulang stok': 'action:replenish_stock',
  'whatsapp the buyer': 'action:whatsapp_buyer',
  'whatsapp ke pembeli': 'action:whatsapp_buyer',
  'share a product': 'action:share_product_whatsapp',
  'bagikan produk': 'action:share_product_whatsapp',
  'notify the dashboard': 'action:notify_dashboard',
  'beri tahu dasbor': 'action:notify_dashboard',
  'assign an agent': 'action:assign_agent_whatsapp',
  'tugaskan agent': 'action:assign_agent_whatsapp',
  'open 24h customer service': 'action:cs_24h_window',
  'buka layanan pelanggan 24 jam': 'action:cs_24h_window',
  'mark paid from proof': 'action:mark_paid_from_proof',
  'tandai lunas dari bukti': 'action:mark_paid_from_proof',
  'confirm the return': 'action:return_confirm_whatsapp',
  'konfirmasi retur': 'action:return_confirm_whatsapp',
  'send a cart win-back': 'action:cart_winback',
  'kirim ajakan kembali keranjang': 'action:cart_winback',
  'assign sales job': 'action:assign_sales_job',
  'tugaskan pekerjaan penjualan': 'action:assign_sales_job',
  whatsapp: 'app:app_webhook',
  gmail: 'app:app_email',
  'if the buyer asks for a person': 'condition:yes_no',
  'jika pembeli minta berbicara dengan orang': 'condition:yes_no',
  'stay in customer service': 'end:stay_in_cs',
  'tetap di layanan pelanggan': 'end:stay_in_cs',
  'stop the run': 'end:stop',
  'hentikan proses': 'end:stop',
};

function stepFromLabel(label: string): WorkflowPlanStep | null {
  const key = STEP_LABEL_TO_KEY[label.trim().toLowerCase()];
  if (!key) return null;
  if (key === 'agent') return { kind: 'agent' };
  const [kind, type] = key.split(':');
  if (kind === 'trigger' || kind === 'action' || kind === 'app' || kind === 'condition' || kind === 'end') {
    return { kind, type } as WorkflowPlanStep;
  }
  return null;
}

/** Rebuilds a canvas draft from a saved workflow reply that has no stored plan. */
export function editFromWorkflowReply(text: string): WorkflowCanvasEdit | null {
  const steps: WorkflowPlanStep[] = [];
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^\d+\.\s+(.+)$/);
    if (!match) continue;
    const step = stepFromLabel(match[1]);
    if (!step) return null;
    steps.push(step);
  }
  const plan = validateWorkflowPlan(steps);
  if (!plan) return null;
  const nameMatch = text.match(/(?:Workflow name|Nama alur kerja):\s*(.+?)\.\s*(?:\n|$)/);
  const descriptionMatch = text.match(/(?:^|\n)(?:Description|Deskripsi):\s*([^\n]+)/);
  return {
    steps: plan,
    name: nameMatch?.[1]?.trim() || null,
    description: descriptionMatch?.[1]?.trim() || null,
    updates: [],
  };
}

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
    return parseStoredEdit(JSON.parse(raw));
  } catch {
    return null;
  }
}

export type { WorkflowPlanStep };
