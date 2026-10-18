import {
  validateWorkflowPlan,
  type WorkflowCanvasEdit,
  type WorkflowFieldUpdate,
  type WorkflowPlanStep,
} from '@/lib/lakuAi/workflowPlan';
import {
  extractProspectFillsFromReply,
  type ProspectFormFill,
} from '@/lib/salesJobs/prospectFormFill';

const STORAGE_KEY = 'laku-ai-review-plan';
const AI_MARK = '<!--laku-ai:';
const MARKER_STRIP = /\n*<!--laku-(?:ai|canvas):[\s\S]*-->\s*$/;

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

function parseStoredFill(value: unknown): ProspectFormFill | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const customerNumber = typeof row.customerNumber === 'string' ? row.customerNumber.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const storeName = typeof row.storeName === 'string' ? row.storeName.trim() : '';
  if (!customerNumber && !name && !storeName) return null;
  return {
    buyerId: typeof row.buyerId === 'string' && row.buyerId.trim() ? row.buyerId.trim() : null,
    customerNumber,
    name,
    storeName,
    phone: typeof row.phone === 'string' ? row.phone : '',
    address: typeof row.address === 'string' ? row.address : '',
    region: typeof row.region === 'string' ? row.region : '',
    buyerType: typeof row.buyerType === 'string' ? row.buyerType : '',
    notes: typeof row.notes === 'string' ? row.notes : '',
  };
}

function parseStoredFills(value: unknown): ProspectFormFill[] {
  if (!Array.isArray(value)) return [];
  const fills: ProspectFormFill[] = [];
  for (const item of value) {
    const fill = parseStoredFill(item);
    if (fill) fills.push(fill);
    if (fills.length >= 12) break;
  }
  return fills;
}

/** Keeps canvas + prospect actions on the saved reply so buttons survive history reload. */
export function packCanvasReply(
  text: string,
  edit: WorkflowCanvasEdit | null,
  prospectFills?: ProspectFormFill[] | null,
): string {
  const visible = text.replace(MARKER_STRIP, '').trim();
  const fills = parseStoredFills(prospectFills ?? []);
  if (!edit && fills.length === 0) return visible;
  return `${visible}\n\n${AI_MARK}${JSON.stringify({ edit: edit ?? null, prospectFills: fills.length ? fills : null })}-->`;
}

/** Reads a saved reply. Older workflow replies recover their steps from the numbered list. */
export function readCanvasReply(content: string): {
  text: string;
  edit: WorkflowCanvasEdit | null;
  prospectFills: ProspectFormFill[];
} {
  const withoutAiMarker = content.replace(MARKER_STRIP, '').trim();
  let edit: WorkflowCanvasEdit | null = null;
  let packedFills: ProspectFormFill[] = [];

  const aiMatch = content.match(/<!--laku-ai:([\s\S]*?)-->\s*$/);
  if (aiMatch) {
    try {
      const parsed = JSON.parse(aiMatch[1]) as { edit?: unknown; prospectFills?: unknown };
      edit = parseStoredEdit(parsed.edit);
      packedFills = parseStoredFills(parsed.prospectFills);
    } catch {
      edit = null;
      packedFills = [];
    }
  } else {
    const canvasMatch = content.match(/<!--laku-canvas:([\s\S]*?)-->\s*$/);
    if (canvasMatch) {
      try {
        edit = parseStoredEdit(JSON.parse(canvasMatch[1]));
      } catch {
        edit = null;
      }
    }
  }

  const fromBody = extractProspectFillsFromReply(withoutAiMarker);
  const prospectFills = packedFills.length ? packedFills : fromBody.prospectFills;
  const text = fromBody.text;
  return {
    text,
    edit: edit ?? editFromWorkflowReply(text),
    prospectFills,
  };
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
