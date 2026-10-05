import type { WorkflowType } from '@/components/automations/automationTypes';

export type CopilotActionStep = {
  type: string;
  config: Record<string, unknown>;
};

export type CopilotWorkflowRecipe = {
  id: string;
  kind: 'workflow';
  workflowType: WorkflowType;
  keywords: string[];
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  actions: CopilotActionStep[];
};

export type CopilotGuideRecipe = {
  id: string;
  kind: 'guide';
  keywords: string[];
};

export type CopilotRecipe = CopilotWorkflowRecipe | CopilotGuideRecipe;

const UTILITY = { messageCategory: 'UTILITY', channel: 'whatsapp' };

export const COPILOT_RECIPES: CopilotRecipe[] = [
  {
    id: 'low_stock',
    kind: 'workflow',
    workflowType: 'product_offers',
    keywords: ['low stock', 'stok rendah', 'stok habis', 'replenish', 'restock', 'isi ulang'],
    triggerType: 'stock_below',
    triggerConfig: { productId: '', productLabel: '' },
    actions: [
      { type: 'replenish_stock', config: { replenishQty: '' } },
      { type: 'notify_dashboard', config: {} },
    ],
  },
  {
    id: 'buyer_question',
    kind: 'workflow',
    workflowType: 'lead_management',
    keywords: ['buyer question', 'pertanyaan pembeli', 'customer service', 'layanan pelanggan', '24 hour', '24 jam'],
    triggerType: 'buyer_questions',
    triggerConfig: {},
    actions: [
      {
        type: 'cs_24h_window',
        config: { escalateOutOfScope: 'yes', csReplyLanguage: 'en' },
      },
    ],
  },
  {
    id: 'return_accepted',
    kind: 'workflow',
    workflowType: 'order_logistics',
    keywords: ['return accepted', 'retur diterima', 'return confirm', 'konfirmasi retur'],
    triggerType: 'return_accepted',
    triggerConfig: {},
    actions: [
      {
        type: 'return_confirm_whatsapp',
        config: {
          ...UTILITY,
          buyerId: '',
          messageTemplate: 'Your return was accepted. We will confirm the next step.',
        },
      },
      { type: 'notify_dashboard', config: {} },
    ],
  },
  {
    id: 'new_buyer',
    kind: 'workflow',
    workflowType: 'lead_management',
    keywords: ['new buyer', 'pembeli baru', 'first order', 'order pertama'],
    triggerType: 'new_buyer',
    triggerConfig: {},
    actions: [
      {
        type: 'assign_agent_whatsapp',
        config: { messageTemplate: 'A new buyer placed a first order. Assign a sales agent.' },
      },
      { type: 'notify_dashboard', config: {} },
    ],
  },
  {
    id: 'order_paid',
    kind: 'workflow',
    workflowType: 'order_logistics',
    keywords: ['payment proof', 'bukti bayar', 'order paid', 'mark paid', 'sudah bayar', 'bukti pembayaran'],
    triggerType: 'order_paid',
    triggerConfig: { paidWhen: 'proof_submitted' },
    actions: [
      { type: 'mark_paid_from_proof', config: {} },
      { type: 'notify_dashboard', config: {} },
    ],
  },
  {
    id: 'cart_idle',
    kind: 'workflow',
    workflowType: 'sales',
    keywords: ['cart idle', 'keranjang', 'win-back', 'winback', 'abandoned cart', 'keranjang menganggur'],
    triggerType: 'cart_idle',
    triggerConfig: { hours: 24 },
    actions: [
      {
        type: 'cart_winback',
        config: {
          channel: 'whatsapp',
          messageCategory: 'MARKETING',
          buyerId: '',
          offerId: '',
          messageTemplate: 'You left items in your cart. Reply if you still want them.',
        },
      },
    ],
  },
  {
    id: 'sales_job_assign',
    kind: 'workflow',
    workflowType: 'sales',
    keywords: [
      'assign sales job',
      'sales job created',
      'sales job creation',
      'tugaskan pekerjaan',
      'pekerjaan penjualan baru',
      'assign job to salesman',
    ],
    triggerType: 'sales_job_created',
    triggerConfig: { jobType: 'any' },
    actions: [
      {
        type: 'assign_sales_job',
        config: { escalateOutOfScope: 'yes', csReplyLanguage: 'en' },
      },
    ],
  },
  {
    id: 'sales_jobs',
    kind: 'guide',
    keywords: [
      'sales job',
      'sales agent',
      'tugas penjualan',
      'agen penjualan',
      'remind sales',
      'pengingat sales',
      'job assignment',
      'penugasan',
    ],
  },
];

export function copilotRecipeById(id: string): CopilotRecipe | null {
  return COPILOT_RECIPES.find((recipe) => recipe.id === id) ?? null;
}

/** Longest keyword hit wins. No match returns null so the caller can ask the model. */
export function matchCopilotRecipe(text: string): CopilotRecipe | null {
  const hay = text.toLowerCase();
  let best: { recipe: CopilotRecipe; score: number } | null = null;
  for (const recipe of COPILOT_RECIPES) {
    let score = 0;
    for (const keyword of recipe.keywords) {
      if (hay.includes(keyword)) score += keyword.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { recipe, score };
  }
  return best?.recipe ?? null;
}

export function copilotRecipeBriefs(): Array<{ id: string; hint: string }> {
  return COPILOT_RECIPES.map((recipe) => ({
    id: recipe.id,
    hint: recipe.keywords.slice(0, 3).join(', '),
  }));
}
