import type { WorkflowType } from '@/components/automations/automationTypes';
import { copilotRecipeById } from '@/lib/automations/copilotRecipes';
import { getAllActions, getAllTriggers } from '@/lib/automations/catalog';

export type WorkflowPlanStep = (
  | { kind: 'trigger'; type: string }
  | { kind: 'action'; type: string }
  | { kind: 'agent' }
  | { kind: 'app'; type: string }
  | { kind: 'condition'; type: string }
  | { kind: 'end'; type: string }
) & { config?: Record<string, unknown> };

export type WorkflowFieldUpdate = {
  type: string;
  config: Record<string, unknown>;
};

/** One Ask AI change: graph, name, description, and inputs already on the canvas. */
export type WorkflowCanvasEdit = {
  steps: WorkflowPlanStep[] | null;
  name: string | null;
  description: string | null;
  updates: WorkflowFieldUpdate[];
};

const APP_TYPES = new Set(['app_webhook', 'app_email']);
const CONDITION_TYPES = new Set(['yes_no']);
const END_TYPES = new Set(['stay_in_cs', 'stop']);

const TRIGGER_WORKFLOW: Record<string, WorkflowType> = {
  stock_below: 'product_offers',
  buyer_questions: 'lead_management',
  return_accepted: 'order_logistics',
  new_buyer: 'lead_management',
  order_paid: 'order_logistics',
  cart_idle: 'sales',
};

export function workflowTypeForTrigger(triggerType: string): WorkflowType {
  return TRIGGER_WORKFLOW[triggerType] ?? 'product_offers';
}

export function allowedWorkflowCatalog(): string {
  const triggers = getAllTriggers().map((item) => item.type).join(', ');
  const actions = getAllActions().map((item) => item.type).join(', ');
  return [
    `Triggers: ${triggers}.`,
    `Actions: ${actions}.`,
    'Apps: app_webhook (WhatsApp connection), app_email (Gmail connection).',
    'Optional agent: include {"kind":"agent"} only when the workflow must read a buyer message and answer or decide. Leave it out for replenish stock, mark paid, notify, win-back, and other direct steps.',
    'Logic: {"kind":"condition","type":"yes_no"} then two different steps you choose. The next step is Yes. The step after that is No. Ends are {"kind":"end","type":"stay_in_cs"} or {"kind":"end","type":"stop"}.',
  ].join('\n');
}

function knownStep(step: WorkflowPlanStep): boolean {
  if (step.kind === 'trigger') return getAllTriggers().some((item) => item.type === step.type);
  if (step.kind === 'action') return getAllActions().some((item) => item.type === step.type);
  if (step.kind === 'agent') return true;
  if (step.kind === 'app') return APP_TYPES.has(step.type);
  if (step.kind === 'condition') return CONDITION_TYPES.has(step.type);
  return END_TYPES.has(step.type);
}

export function planFromRecipe(recipeId: string): WorkflowPlanStep[] | null {
  const recipe = copilotRecipeById(recipeId);
  if (!recipe || recipe.kind !== 'workflow') return null;
  const steps: WorkflowPlanStep[] = [{ kind: 'trigger', type: recipe.triggerType }];
  if (recipe.id === 'buyer_question') steps.push({ kind: 'agent' });
  for (const action of recipe.actions) steps.push({ kind: 'action', type: action.type });
  return steps.every(knownStep) ? steps : null;
}

function cleanCopy(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\u2014|\u2013/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function fieldsForCatalogType(catalogType: string) {
  return (
    getAllTriggers().find((item) => item.type === catalogType)?.fields ??
    getAllActions().find((item) => item.type === catalogType)?.fields ??
    []
  );
}

/** Keeps only inputs that exist on that step. Buyer and product names stay for lookup. */
export function sanitizeStepConfig(catalogType: string, raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  const config: Record<string, unknown> = {};
  for (const field of fieldsForCatalogType(catalogType)) {
    const value = row[field.key];
    if (value == null || value === '') continue;
    if (field.kind === 'text' || field.kind === 'textarea') {
      const text = cleanCopy(value, field.kind === 'textarea' ? 1200 : 240);
      if (text) config[field.key] = text;
    } else if (field.kind === 'number') {
      const amount = Number(value);
      if (Number.isFinite(amount)) config[field.key] = amount;
    } else if (field.kind === 'select') {
      const match = field.options?.find((option) => option.toLowerCase() === String(value).trim().toLowerCase());
      if (match) config[field.key] = match;
    } else if (field.kind === 'buyer' || field.kind === 'product' || field.kind === 'offer') {
      const id = String(value).trim();
      if (id) config[field.key] = id;
    }
  }
  if (Array.isArray(row.buyers)) {
    const names = row.buyers.map((item) => cleanCopy(item, 120)).filter(Boolean).slice(0, 20);
    if (names.length) config.buyers = names;
  }
  if (Array.isArray(row.products)) {
    const names = row.products.map((item) => cleanCopy(item, 120)).filter(Boolean).slice(0, 20);
    if (names.length) config.products = names;
  }
  return config;
}

export function workflowInputGuide(): string {
  const lines: string[] = [];
  for (const item of [...getAllTriggers(), ...getAllActions()]) {
    if (!item.fields.length) continue;
    const fields = item.fields
      .map((field) => (field.options?.length ? `${field.key} (${field.options.join('|')})` : field.key))
      .join(', ');
    lines.push(`${item.type}: ${fields}.`);
  }
  return lines.join('\n');
}

function stepFromJson(value: unknown): WorkflowPlanStep | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const kind = String(row.kind ?? '').trim();
  const type = String(row.type ?? '').trim();
  let step: WorkflowPlanStep | null = null;
  if (kind === 'agent') step = { kind: 'agent' };
  else if (kind === 'trigger' && type) step = { kind: 'trigger', type };
  else if (kind === 'action' && type) step = { kind: 'action', type };
  else if (kind === 'app' && type) step = { kind: 'app', type };
  else if (kind === 'condition' && type) step = { kind: 'condition', type };
  else if (kind === 'end' && type) step = { kind: 'end', type };
  if (!step || step.kind === 'agent') return step;
  const config = sanitizeStepConfig(step.type, row.config);
  return Object.keys(config).length ? { ...step, config } : step;
}

/** A usable canvas plan, or null when the value is not a plan. */
export function validateWorkflowPlan(value: unknown): WorkflowPlanStep[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10) return null;
  const steps = value.map(stepFromJson);
  if (steps.some((step) => !step)) return null;
  const plan = steps as WorkflowPlanStep[];
  if (!plan.every(knownStep)) return null;
  const triggers = plan.filter((step) => step.kind === 'trigger');
  if (triggers.length !== 1 || plan[0]?.kind !== 'trigger') return null;
  if (plan.filter((step) => step.kind === 'agent').length > 1) return null;
  return plan;
}

function recipeIdFromToolCall(text: string): string | null {
  const match = text.match(/recipeId\s*=\s*['"]([a-z0-9_]+)['"]/i);
  const id = match?.[1]?.trim() ?? '';
  return id && copilotRecipeById(id) ? id : null;
}

function jsonObjectEnd(text: string, start: number): number {
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quote = false;
      continue;
    }
    if (char === '"') quote = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function textField(value: unknown, max: number): string | null {
  const text = cleanCopy(value, max);
  return text || null;
}

function updatesFromJson(value: unknown): WorkflowFieldUpdate[] {
  if (!Array.isArray(value)) return [];
  const updates: WorkflowFieldUpdate[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const type = String(row.type ?? '').trim();
    if (!type) continue;
    const config = sanitizeStepConfig(type, row.config);
    if (Object.keys(config).length) updates.push({ type, config });
  }
  return updates;
}

function planMarker(raw: string): {
  plan: WorkflowPlanStep[] | null;
  unavailable: boolean;
  name: string | null;
  description: string | null;
  updates: WorkflowFieldUpdate[];
} | null {
  try {
    const parsed = JSON.parse(raw) as { plan?: unknown; name?: unknown; description?: unknown; updates?: unknown };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const hasEdit = 'plan' in parsed || 'name' in parsed || 'description' in parsed || 'updates' in parsed;
    if (!hasEdit) return null;
    const name = textField(parsed.name, 80);
    const description = textField(parsed.description, 400);
    const updates = updatesFromJson(parsed.updates);
    if (!('plan' in parsed) || parsed.plan == null) {
      return { plan: null, unavailable: false, name, description, updates };
    }
    if (parsed.plan === 'unavailable') return { plan: null, unavailable: true, name, description, updates };
    const plan = validateWorkflowPlan(parsed.plan);
    if (!plan) return { plan: null, unavailable: true, name, description, updates };
    return { plan, unavailable: false, name, description, updates };
  } catch {
    return null;
  }
}

export function readAssistantWorkflow(content: string): {
  reply: string;
  recipeId: string | null;
  plan: WorkflowPlanStep[] | null;
  unavailable: boolean;
  /** True when the plan was expanded from a recipe id, not written as steps. */
  recipeOnly: boolean;
  name: string | null;
  description: string | null;
  updates: WorkflowFieldUpdate[];
} {
  const text = content.replace(/\u2014|\u2013/g, '-').trim();
  const toolRecipeId = recipeIdFromToolCall(text);
  let plan: WorkflowPlanStep[] | null = null;
  let explicitPlan = false;
  let unavailable = false;
  let recipeId: string | null = toolRecipeId;
  let name: string | null = null;
  let description: string | null = null;
  let updates: WorkflowFieldUpdate[] = [];
  const cuts: { start: number; end: number }[] = [];

  const consider = (raw: string, start: number, end: number) => {
    const marker = planMarker(raw);
    if (marker) {
      plan = marker.plan;
      unavailable = marker.unavailable;
      if (marker.plan) explicitPlan = true;
      if (marker.name) name = marker.name;
      if (marker.description) description = marker.description;
      if (marker.updates.length) updates = marker.updates;
      cuts.push({ start, end });
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { recipeId?: unknown };
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('recipeId' in parsed)) return;
      const id = typeof parsed.recipeId === 'string' ? parsed.recipeId.trim() : '';
      if (id && copilotRecipeById(id)) recipeId = id;
      else if (id && !plan) unavailable = true;
      cuts.push({ start, end });
    } catch {
      // Not a workflow marker.
    }
  };

  for (const fence of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    if (fence.index == null) continue;
    consider((fence[1] ?? '').trim(), fence.index, fence.index + fence[0].length);
  }
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') continue;
    const inside = cuts.some((cut) => index >= cut.start && index < cut.end);
    if (inside) continue;
    const end = jsonObjectEnd(text, index);
    if (end < 0) continue;
    const raw = text.slice(index, end);
    if (!/"plan"|"recipeId"|"name"|"description"|"updates"/.test(raw)) continue;
    consider(raw, index, end);
    index = end - 1;
  }

  let reply = text;
  for (const cut of cuts.sort((a, b) => b.start - a.start)) {
    reply = `${reply.slice(0, cut.start)}${reply.slice(cut.end)}`;
  }
  reply = reply
    .replace(/<\|tool_call_start\|>[\s\S]*?<\|tool_call_end\|>/gi, '')
    .replace(/<\|[^|\n>]+\|>/g, '')
    .replace(/\[automation\([\s\S]*?\)\]/gi, '')
    .replace(/^[ \t]*(?:user|response|model|content)\s+safety\s*:\s*.+$/gim, '')
    .replace(/^[ \t]*lakupak ai[ \t]*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!unavailable && !plan && recipeId && !name && !description && updates.length === 0) plan = planFromRecipe(recipeId);
  if (plan) {
    for (const step of plan) {
      if (step.kind === 'agent' || !step.config) continue;
      updates = [...updates.filter((item) => item.type !== step.type), { type: step.type, config: step.config }];
    }
  }
  return {
    reply,
    recipeId,
    plan,
    unavailable,
    recipeOnly: Boolean(plan) && !explicitPlan && !unavailable,
    name,
    description,
    updates,
  };
}

type CanvasNodeLike = {
  id: string;
  data?: { kind?: string; catalogType?: string };
};

type CanvasEdgeLike = {
  source: string;
  target: string;
  label?: unknown;
};

function stepFromNode(node: CanvasNodeLike): WorkflowPlanStep | null {
  const kind = String(node.data?.kind ?? '');
  const type = String(node.data?.catalogType ?? '');
  if (kind === 'agent') return { kind: 'agent' };
  if (kind === 'trigger' && type) return { kind: 'trigger', type };
  if (kind === 'action' && type) return { kind: 'action', type };
  if (kind === 'app' && type) return { kind: 'app', type };
  if (kind === 'condition' && type) return { kind: 'condition', type };
  if (kind === 'end' && type) return { kind: 'end', type };
  return null;
}

function branchNodeCount(nodes: CanvasNodeLike[], edges: CanvasEdgeLike[], startId: string): number {
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id) || !nodes.some((node) => node.id === id)) return;
    seen.add(id);
    for (const edge of edges) {
      if (edge.source === id) visit(edge.target);
    }
  };
  visit(startId);
  return seen.size;
}

/** Steps currently on the canvas, trigger first, Yes branch before No. */
export function planFromCanvasNodes(nodes: CanvasNodeLike[], edges: CanvasEdgeLike[]): WorkflowPlanStep[] | null {
  const trigger = nodes.find((node) => node.data?.kind === 'trigger');
  if (!trigger) return null;
  for (const node of nodes) {
    if (node.data?.kind !== 'condition') continue;
    const outgoing = edges.filter((edge) => edge.source === node.id);
    for (const label of ['Yes', 'No']) {
      const branch = outgoing.find((edge) => String(edge.label ?? '') === label);
      if (branch && branchNodeCount(nodes, edges, branch.target) > 1) return null;
    }
  }
  const ordered: CanvasNodeLike[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    seen.add(id);
    ordered.push(node);
    const outgoing = edges.filter((edge) => edge.source === id);
    const yes = outgoing.find((edge) => String(edge.label ?? '') === 'Yes');
    const no = outgoing.find((edge) => String(edge.label ?? '') === 'No');
    const rest = outgoing.filter((edge) => edge !== yes && edge !== no);
    for (const edge of [...(yes ? [yes] : []), ...rest, ...(no ? [no] : [])]) walk(edge.target);
  };
  walk(trigger.id);
  return validateWorkflowPlan(ordered.map(stepFromNode));
}

const STEP_LABELS: Record<'en' | 'id', Record<string, string>> = {
  en: {
    agent: 'Lakupak AI',
    'trigger:stock_below': 'Low stock',
    'trigger:buyer_questions': 'Buyer WhatsApp questions',
    'trigger:return_accepted': 'Return accepted',
    'trigger:new_buyer': 'New buyer',
    'trigger:order_paid': 'Order paid',
    'trigger:cart_idle': 'Cart idle',
    'action:replenish_stock': 'Replenish stock',
    'action:whatsapp_buyer': 'WhatsApp the buyer',
    'action:share_product_whatsapp': 'Share a product',
    'action:notify_dashboard': 'Notify the dashboard',
    'action:assign_agent_whatsapp': 'Assign an agent',
    'action:cs_24h_window': 'Open 24h customer service',
    'action:mark_paid_from_proof': 'Mark paid from proof',
    'action:return_confirm_whatsapp': 'Confirm the return',
    'action:cart_winback': 'Send a cart win-back',
    'app:app_webhook': 'WhatsApp',
    'app:app_email': 'Gmail',
    'condition:yes_no': 'If the buyer asks for a person',
    'end:stay_in_cs': 'Stay in customer service',
    'end:stop': 'Stop the run',
  },
  id: {
    agent: 'Lakupak AI',
    'trigger:stock_below': 'Stok rendah',
    'trigger:buyer_questions': 'Pertanyaan WhatsApp pembeli',
    'trigger:return_accepted': 'Retur diterima',
    'trigger:new_buyer': 'Pembeli baru',
    'trigger:order_paid': 'Pesanan dibayar',
    'trigger:cart_idle': 'Keranjang menganggur',
    'action:replenish_stock': 'Isi ulang stok',
    'action:whatsapp_buyer': 'WhatsApp ke pembeli',
    'action:share_product_whatsapp': 'Bagikan produk',
    'action:notify_dashboard': 'Beri tahu dasbor',
    'action:assign_agent_whatsapp': 'Tugaskan agent',
    'action:cs_24h_window': 'Buka layanan pelanggan 24 jam',
    'action:mark_paid_from_proof': 'Tandai lunas dari bukti',
    'action:return_confirm_whatsapp': 'Konfirmasi retur',
    'action:cart_winback': 'Kirim ajakan kembali keranjang',
    'app:app_webhook': 'WhatsApp',
    'app:app_email': 'Gmail',
    'condition:yes_no': 'Jika pembeli minta berbicara dengan orang',
    'end:stay_in_cs': 'Tetap di layanan pelanggan',
    'end:stop': 'Hentikan proses',
  },
};

export function workflowStepLabel(step: WorkflowPlanStep, locale: 'en' | 'id'): string {
  const key = step.kind === 'agent' ? 'agent' : `${step.kind}:${step.type}`;
  return STEP_LABELS[locale][key] ?? step.kind;
}

export function catalogTypeLabel(type: string, locale: 'en' | 'id'): string {
  const kind = getAllTriggers().some((item) => item.type === type)
    ? 'trigger'
    : APP_TYPES.has(type)
      ? 'app'
      : 'action';
  return workflowStepLabel({ kind, type }, locale);
}

export function describeWorkflowPlan(
  steps: WorkflowPlanStep[],
  locale: 'en' | 'id',
  mode: 'updated' | 'already' | 'draft',
): string {
  const lines: string[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    const yes = steps[index + 1];
    const no = steps[index + 2];
    if (step.kind === 'condition' && yes && no) {
      const yesLabel = locale === 'id' ? 'Ya' : 'Yes';
      const noLabel = locale === 'id' ? 'Tidak' : 'No';
      lines.push(`${lines.length + 1}. ${workflowStepLabel(step, locale)}`);
      lines.push(`   ${yesLabel}: ${workflowStepLabel(yes, locale)}`);
      lines.push(`   ${noLabel}: ${workflowStepLabel(no, locale)}`);
      index += 2;
      continue;
    }
    lines.push(`${lines.length + 1}. ${workflowStepLabel(step, locale)}`);
  }
  const intro =
    locale === 'id'
      ? mode === 'updated'
        ? 'Saya memperbarui kanvas menjadi langkah ini:'
        : mode === 'already'
          ? 'Kanvas sudah berisi langkah ini:'
          : 'Draf ini memakai langkah ini:'
      : mode === 'updated'
        ? 'I updated the canvas to these steps:'
        : mode === 'already'
          ? 'The canvas already has these steps:'
          : 'This draft uses these steps:';
  const close =
    locale === 'id' ? 'Simpan draf saat sudah sesuai.' : 'Save the draft when it looks right.';
  return `${intro}\n${lines.join('\n')}\n\n${close}`;
}

export function workflowMetaFromMessage(message: string): { name: string | null; wantsDescription: boolean } {
  const wantsDescription = /\b(description|deskripsi|describe)\b/i.test(message);
  const asksName = /\b(name the workflow|rename the workflow|rename it|judul|namai|beri nama|workflow name)\b/i.test(message);
  if (!asksName) return { name: null, wantsDescription };
  const match = message.match(/["“]([^"”\n]{2,80})["”]/);
  return { name: match?.[1]?.replace(/\s+/g, ' ').trim() || null, wantsDescription };
}

export function fallbackWorkflowDescription(steps: WorkflowPlanStep[], locale: 'en' | 'id'): string {
  const types = new Set(steps.flatMap((step) => (step.kind === 'agent' ? [] : [step.type])));
  if (types.has('cart_winback')) {
    return locale === 'id'
      ? 'Mengirim ajakan kembali saat keranjang pembeli menganggur, lalu memberi tahu dasbor.'
      : 'Sends a win-back when a buyer cart stays idle, then notifies the dashboard.';
  }
  if (types.has('replenish_stock')) {
    return locale === 'id'
      ? 'Mengisi ulang stok saat produk menipis, lalu memberi tahu dasbor.'
      : 'Replenishes stock when a product runs low, then notifies the dashboard.';
  }
  if (types.has('mark_paid_from_proof')) {
    return locale === 'id'
      ? 'Menandai pesanan lunas dari bukti bayar, lalu memberi tahu dasbor.'
      : 'Marks an order paid from the payment proof, then notifies the dashboard.';
  }
  const labels = steps.map((step) => workflowStepLabel(step, locale)).filter(Boolean);
  if (!labels.length) {
    return locale === 'id' ? 'Alur kerja untuk tugas ini.' : 'A workflow for this task.';
  }
  return locale === 'id'
    ? `Alur ini menjalankan: ${labels.join(', ')}.`
    : `This workflow runs: ${labels.join(', ')}.`;
}

export function fallbackMessageTemplate(catalogType: string, locale: 'en' | 'id'): string | null {
  if (catalogType === 'cart_winback') {
    return locale === 'id'
      ? 'Keranjang toko Anda masih terbuka. Balas pesan ini dan kami siapkan pesanan hari ini sebelum stoknya habis.'
      : 'Your store cart is still open. Reply to this message and we will set aside today\'s order before it sells out.';
  }
  if (catalogType === 'whatsapp_buyer' || catalogType === 'share_product_whatsapp') {
    return locale === 'id'
      ? 'Ada stok yang siap dikirim untuk toko Anda. Balas pesan ini jika Anda ingin kami proses hari ini.'
      : 'Stock is ready for your store. Reply to this message if you want us to process it today.';
  }
  if (catalogType === 'return_confirm_whatsapp') {
    return locale === 'id'
      ? 'Retur Anda sudah kami terima. Balas pesan ini jika ada barang yang masih perlu dicek.'
      : 'We have accepted your return. Reply to this message if any item still needs a check.';
  }
  if (catalogType === 'assign_agent_whatsapp') {
    return locale === 'id'
      ? 'Tim kami akan membalas di percakapan ini. Tuliskan pertanyaan Anda di sini.'
      : 'Our team will reply in this chat. Write your question here.';
  }
  return null;
}

function pickedLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const row = item as Record<string, unknown>;
      return String(row.buyerLabel ?? row.productLabel ?? row.offerLabel ?? '').trim();
    })
    .filter(Boolean);
}

function summarizeFieldUpdate(update: WorkflowFieldUpdate, locale: 'en' | 'id'): string {
  const label = catalogTypeLabel(update.type, locale);
  const config = update.config;
  const parts: string[] = [];
  const buyers = pickedLabels(config.selectedBuyers);
  const products = pickedLabels(config.selectedProducts);
  const offers = pickedLabels(config.selectedOffers);
  if (buyers.length) parts.push(locale === 'id' ? `Pembeli: ${buyers.join(', ')}` : `Buyers: ${buyers.join(', ')}`);
  if (products.length) parts.push(locale === 'id' ? `Produk: ${products.join(', ')}` : `Products: ${products.join(', ')}`);
  if (offers.length) parts.push(locale === 'id' ? `Penawaran: ${offers.join(', ')}` : `Offers: ${offers.join(', ')}`);
  if (config.channel) parts.push(locale === 'id' ? `Saluran: ${config.channel}` : `Channel: ${config.channel}`);
  if (config.messageCategory) {
    parts.push(locale === 'id' ? `Jenis pesan: ${config.messageCategory}` : `Message type: ${config.messageCategory}`);
  }
  if (config.hours != null && config.hours !== '') {
    parts.push(locale === 'id' ? `Jam menganggur: ${config.hours}` : `Idle hours: ${config.hours}`);
  }
  if (config.replenishQty != null && config.replenishQty !== '') {
    parts.push(locale === 'id' ? `Jumlah: ${config.replenishQty}` : `Quantity: ${config.replenishQty}`);
  }
  const template = String(config.messageTemplate ?? '').trim();
  if (template) {
    const shown = template.length > 180 ? `${template.slice(0, 177)}...` : template;
    parts.push(locale === 'id' ? `Pesan: ${shown}` : `Message: ${shown}`);
  }
  return parts.length ? `${label}. ${parts.join('. ')}.` : '';
}

/** Says what landed on the draft: name, description, steps, and filled inputs. */
export function describeWorkflowEdit(input: {
  locale: 'en' | 'id';
  name: string | null;
  description: string | null;
  steps: WorkflowPlanStep[] | null;
  stepMode: 'updated' | 'already' | 'draft' | null;
  updates: WorkflowFieldUpdate[];
  missing: string[];
  skipped?: string[];
}): string {
  const locale = input.locale;
  const blocks: string[] = [];
  if (input.name) {
    blocks.push(locale === 'id' ? `Nama alur kerja: ${input.name}.` : `Workflow name: ${input.name}.`);
  }
  if (input.description) {
    blocks.push(locale === 'id' ? `Deskripsi: ${input.description}` : `Description: ${input.description}`);
  }
  const filled = input.updates.map((update) => summarizeFieldUpdate(update, locale)).filter(Boolean);
  if (filled.length) {
    const intro = locale === 'id' ? 'Saya mengisi ini:' : 'I filled these in:';
    blocks.push(`${intro}\n${filled.join('\n')}`);
  }
  if (input.steps && input.stepMode && input.stepMode !== 'already') {
    blocks.push(describeWorkflowPlan(input.steps, locale, input.stepMode));
  }
  if (input.missing.length) {
    const names = input.missing.join(', ');
    blocks.push(
      locale === 'id'
        ? `Catatan ini tidak ada di akun Anda, jadi isiannya tetap kosong: ${names}.`
        : `These records are not on your account, so that input stayed empty: ${names}.`,
    );
  }
  if (input.skipped?.length) {
    const names = input.skipped.join(', ');
    blocks.push(
      locale === 'id'
        ? `Langkah ini tidak ada di kanvas, jadi isiannya tidak masuk: ${names}.`
        : `That step is not on this canvas, so I left it unchanged: ${names}.`,
    );
  }
  const alreadyClosed = blocks.some((block) => block.includes('Save the draft') || block.includes('Simpan draf'));
  if (!alreadyClosed) {
    blocks.push(locale === 'id' ? 'Simpan draf saat sudah sesuai.' : 'Save the draft when it looks right.');
  }
  return blocks.filter(Boolean).join('\n\n');
}

function sameStep(left: WorkflowPlanStep, right: WorkflowPlanStep): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'agent' || right.kind === 'agent') return left.kind === right.kind;
  return left.type === right.type;
}

function plansEqual(left: WorkflowPlanStep[], right: WorkflowPlanStep[]): boolean {
  return left.length === right.length && left.every((step, index) => sameStep(step, right[index]!));
}

/** An If is valid only when Yes and No are both present and different. Nothing is filled in. */
function ifBranchesArePaired(steps: WorkflowPlanStep[]): boolean {
  for (let index = 0; index < steps.length; index += 1) {
    if (steps[index]?.kind !== 'condition') continue;
    const yes = steps[index + 1];
    const no = steps[index + 2];
    if (!yes || !no || sameStep(yes, no)) return false;
    index += 2;
  }
  return true;
}

/**
 * Applies the model's plan when it is a complete catalog graph.
 * A recipe id alone does not replace a canvas that is already open.
 */
export function settleWorkflowPlan(input: {
  message: string;
  plan: WorkflowPlanStep[] | null;
  recipeOnly: boolean;
  canvas: WorkflowPlanStep[] | null;
  unavailable: boolean;
}): { plan: WorkflowPlanStep[] | null; unchanged: boolean } {
  const canvas = input.canvas && validateWorkflowPlan(input.canvas) ? input.canvas : null;
  if (input.unavailable) return { plan: null, unchanged: true };

  const explicit = input.plan && validateWorkflowPlan(input.plan) && !input.recipeOnly ? input.plan : null;
  if (explicit) {
    if (!ifBranchesArePaired(explicit)) return { plan: null, unchanged: true };
    return { plan: explicit, unchanged: canvas ? plansEqual(explicit, canvas) : false };
  }

  const recipePlan = input.recipeOnly && input.plan && validateWorkflowPlan(input.plan) ? input.plan : null;
  if (recipePlan && !canvas && ifBranchesArePaired(recipePlan)) {
    return { plan: recipePlan, unchanged: false };
  }

  return { plan: null, unchanged: true };
}
