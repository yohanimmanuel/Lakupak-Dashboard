import {
  normalizeLakuAgentModelId,
  resolveLakuAgentProviderModel,
} from '@/lib/automations/agentModels';
import { buildDistributorAgentContext } from '@/lib/automations/distributorAgentContext';
import { chatWithOpenRouter, isOpenRouterConfigured } from '@/lib/automations/openrouter';

type CanvasNode = {
  id?: string;
  data?: {
    kind?: string;
    catalogType?: string;
    name?: string;
    title?: string;
    config?: Record<string, unknown>;
  };
};

export type AgentNodeRunInput = {
  userId: number;
  nodes: CanvasNode[];
  workflowName: string;
  triggerType?: string | null;
  actionType?: string | null;
  /** Dashboard UI locale (`en` | `id`). Controls reply language. */
  locale?: string | null;
};

export type AgentNodeSkippedCode = 'no_agent_node' | 'openrouter_not_configured';

export type AgentNodeRunResult = {
  ran: boolean;
  /** Machine-readable skip cause when `ran` is false. */
  skippedCode?: AgentNodeSkippedCode;
  /** Human-readable skip text when `ran` is false. */
  skippedReason?: string;
  model?: string;
  reply?: string;
  error?: string;
};

function firstAgentNode(nodes: CanvasNode[]): CanvasNode | undefined {
  return nodes.find((n) => n.data?.kind === 'agent');
}

function normalizeReplyLocale(locale?: string | null): 'en' | 'id' {
  const raw = (locale ?? '').trim().toLowerCase();
  if (raw === 'id' || raw.startsWith('id-') || raw === 'indonesian' || raw === 'indonesia') {
    return 'id';
  }
  return 'en';
}

/**
 * Run the first Laku AI node on the canvas through OpenRouter / Ling,
 * with buyer-facing customer-service context only.
 */
export async function runLakuAgentNode(
  input: AgentNodeRunInput,
): Promise<AgentNodeRunResult> {
  const agent = firstAgentNode(input.nodes);
  if (!agent) {
    return {
      ran: false,
      skippedCode: 'no_agent_node',
      skippedReason: 'No agent node on canvas.',
    };
  }

  if (!isOpenRouterConfigured()) {
    return {
      ran: false,
      skippedCode: 'openrouter_not_configured',
      skippedReason: 'OPENROUTER_API_KEY is not configured.',
    };
  }

  const config = agent.data?.config ?? {};
  const note = String(config.note ?? '').trim();
  const model = resolveLakuAgentProviderModel(
    normalizeLakuAgentModelId(config.model ?? config.providerModel),
  );
  const replyLocale = normalizeReplyLocale(input.locale);
  const replyInIndonesian = replyLocale === 'id';

  let distributorContext = '';
  try {
    distributorContext = await buildDistributorAgentContext(input.userId);
  } catch (e) {
    return {
      ran: true,
      model,
      error:
        e instanceof Error
          ? `Failed to load distributor context: ${e.message}`
          : 'Failed to load distributor context.',
    };
  }

  const languageRule = replyInIndonesian
    ? 'Reply entirely in Indonesian (Bahasa Indonesia). Use clear, natural Indonesian. Keep product names, order IDs, and proper nouns as-is.'
    : 'Reply entirely in English. Keep product names, order IDs, and proper nouns as-is.';

  const system = [
    'You are Laku AI, a buyer-facing customer service assistant inside a Laku automation workflow.',
    'This is a customer service window for buyers — not an internal distributor briefing tool.',
    'Use only the provided context for this account. Do not invent other companies or users.',
    'Be concise, practical, and helpful to buyers.',
    languageRule,
    'ALLOWED buyer-facing topics ONLY:',
    '- Products (published catalog): name, variants, selling prices, MOQ, stock status (In/Low/Out), categories, assurance (halal / BPOM / original), product return window days',
    '- Order updates: full status pipeline (Pending → Confirmed → Packed → Shipped → Delivered → Received, plus Failed / Cancelled / Returned), payment status (Unpaid/Paid)',
    '- Payment method TYPE only (Bank Transfer or COD) and payment TERM days (e.g. pay within N days) — never bank account numbers or credentials',
    '- Delivery: methods (Self Pickup / Seller Delivery / Buyer-arranged Courier), preferred days & time slots, lead times, preferred date/time, tracking number, ETA',
    '- Returns: when allowed (typically after Delivered/Received), reasons, request status (Pending/Accepted/Rejected)',
    '- Cancellations: status and structured cancel reasons when relevant',
    '- Distributor public ops: company intro, contact, pickup address, how ordering works at a high level',
    '- Note: shipping fee may be agreed offline and is not always auto-charged at checkout',
    'NEVER share or discuss with buyers (even if somehow present in context):',
    '- Offers, promotions, campaigns, marketing metrics (opens, clicks, revenue)',
    '- Bank account numbers, bank credentials, or payment-method secrets',
    '- Internal analytics, revenue totals, compliance status, SKU data-quality issues',
    '- Fleet codes, driver contacts, load %, supplier data, sales-agent data',
    '- Draft / unpublished products',
    'If a buyer asks about a forbidden topic, politely decline and steer back to allowed topics.',
    'Do not reveal secrets, passwords, API keys, or card numbers if present.',
    note ? `Operator instructions:\n${note}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const user = replyInIndonesian
    ? [
        `Alur kerja: ${input.workflowName || 'Tanpa judul'}`,
        `Pemicu: ${input.triggerType?.trim() || 'tidak ada'}`,
        `Aksi: ${input.actionType?.trim() || 'tidak ada'}`,
        `Bahasa balasan: Indonesia`,
        '',
        'Konteks CS menghadap pembeli (JSON):',
        distributorContext,
        '',
        'Ini adalah uji coba jendela customer service. Jawab SELURUHNYA dalam Bahasa Indonesia:',
        '- Cakup topik yang boleh: produk terbit (harga, MOQ, stok, jaminan), update pesanan (status lengkap, metode bayar Transfer/COD, tenor hari), pengiriman (slot/hari/lead time/tracking/ETA), retur & pembatalan, ops publik distributor.',
        '- Jangan sebut data internal (penawaran, kampanye, rekening bank, analitik, armada/driver, produk draft).',
        '- Jika data penting untuk CS kurang, sebutkan singkat tanpa membocorkan metrik internal.',
        '- Berikan 2–4 langkah konkret berikutnya untuk balasan CS yang aman bagi pembeli.',
      ].join('\n')
    : [
        `Workflow: ${input.workflowName || 'Untitled'}`,
        `Trigger: ${input.triggerType?.trim() || 'none'}`,
        `Action: ${input.actionType?.trim() || 'none'}`,
        `Reply language: English`,
        '',
        'Buyer-facing CS context (JSON):',
        distributorContext,
        '',
        'This is a customer service window test run. Reply entirely in English:',
        '- Cover allowed topics: published products (price, MOQ, stock, assurance), order updates (full status, Bank Transfer/COD type, term days), delivery (slots/days/lead time/tracking/ETA), returns & cancellations, public distributor ops.',
        '- Do not mention internal data (offers, campaigns, bank accounts, analytics, fleets/drivers, draft products).',
        '- If important CS inputs are missing, note that briefly without leaking internal metrics.',
        '- Give 2–4 concrete next actions for safe buyer-facing CS replies.',
      ].join('\n');

  try {
    const result = await chatWithOpenRouter({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return {
      ran: true,
      model: result.model,
      reply: result.content,
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return {
      ran: true,
      model,
      error: timedOut
        ? 'Laku AI request timed out. Please try again.'
        : e instanceof Error
          ? e.message
          : 'Agent request failed.',
    };
  }
}
