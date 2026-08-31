import {
  normalizeLakuAgentModelId,
  resolveLakuAgentProviderModel,
} from '@/lib/automations/agentModels';
import { buildDistributorAgentContext } from '@/lib/automations/distributorAgentContext';
import { chatWithOpenRouter, isOpenRouterConfigured } from '@/lib/automations/openrouter';
import {
  formatUntrustedAgentNote,
  LAKU_AGENT_PRIVACY_POLICY,
  validateAgentOperatorNote,
} from '@/lib/automations/agentNotePolicy';

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
  /**
   * Present only when this run produces an actionable human escalation
   * for the caller to execute. Omit or leave unset when no handoff can be fulfilled.
   */
  handoff?: {
    requested: true;
    summary?: string;
  };
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
  const noteValidation = validateAgentOperatorNote(config.note);
  const trustedNote = noteValidation.ok ? noteValidation.note : '';
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
    ? 'Reply entirely in Indonesian (Bahasa Indonesia). Keep product names, order IDs, and proper nouns as-is.'
    : 'Reply entirely in English. Keep product names, order IDs, and proper nouns as-is.';

  const welcomeShape = replyInIndonesian
    ? [
        'Bentuk pesan sambutan CS (ikuti pola ini):',
        '1) Sapaan singkat + nama perusahaan dari konteks + siap membantu sebagai CS pembeli.',
        '2) Satu baris pembuka topik, lalu bullet kategori (topik saja, bukan dump data):',
        '   - Produk: stok, harga, MOQ, jaminan (halal/BPOM/original/kebijakan retur)',
        '   - Pesanan: cara cek status (pipeline umum saja; jangan ID pesanan nyata)',
        '   - Pembayaran: Bank Transfer / COD dan tenor hari dari konteks',
        '   - Pengiriman: metode, slot, hari, tracking, ETA (ringkas)',
        '   - Retur & pembatalan: bantuan proses',
        '   - Informasi umum: pickup, cara order, kontak publik',
        '   - Chat ke CS atau sales agent manusia: sebutkan bahwa pembeli bisa meminta chat dengan staf (jangan janjikan langsung tersambung)',
        '3) Bagian contoh cara bertanya (tepat 5 contoh singkat), mis. cek stok produk, status pesanan (minta ID pesanan), ajukan retur, info pengiriman, dan "saya ingin chat dengan CS / sales agent".',
        '4) Tutup dengan ajakan membantu hari ini, lalu satu emoji ramah (mis. 😊).',
      ].join('\n')
    : [
        'CS welcome message shape (follow this pattern):',
        '1) Short greeting + company name from context + ready to help as buyer CS.',
        '2) One intro line, then category bullets (topics only, not data dumps):',
        '   - Products: stock, price, MOQ, assurance (halal/BPOM/original/return policy)',
        '   - Orders: how to check status (general pipeline only; no real order IDs)',
        '   - Payment: Bank Transfer / COD and term days from context',
        '   - Delivery: methods, slots, days, tracking, ETA (brief)',
        '   - Returns & cancellations: process help',
        '   - General info: pickup, how to order, public contact',
        '   - Chat with a human CS or sales agent: mention buyers can request a staff chat (do not promise an immediate connection)',
        '3) Example asks section (exactly 5 short examples), e.g. check product stock, order status (ask for order ID), request a return, delivery info, and "I want to chat with CS / a sales agent".',
        '4) Close by asking how you can help today, then one friendly emoji (e.g. 😊).',
      ].join('\n');

  const system = [
    'You are Lakupak AI, the buyer-facing customer service chat assistant for this distributor account.',
    'Tone: warm, clear, WhatsApp-style CS. Structured and helpful, not a long brochure or internal briefing.',
    'Use the provided context as backend knowledge. On welcome, outline help topics; give concrete product/order/delivery details only when the buyer asks.',
    'Do not invent other companies or users. Prefer company name and business description from context.',
    'FORMATTING: Never use em dashes (—) or en dashes (–). Use commas, periods, colons, or hyphens (-) instead.',
    languageRule,
    welcomeShape,
    // Untrusted tenant note first (if allowed), then fixed privacy policy that always wins.
    trustedNote ? formatUntrustedAgentNote(trustedNote) : null,
    LAKU_AGENT_PRIVACY_POLICY,
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
        'Konteks backend CS (JSON):',
        distributorContext,
        '',
        'Uji coba jendela CS. Jawab SELURUHNYA dalam Bahasa Indonesia.',
        'Tulis pesan sambutan mengikuti bentuk sistem di atas: sapaan, daftar topik bantuan, 5 contoh cara bertanya (termasuk chat ke CS/sales agent), penutup.',
        'Pakai nama perusahaan dan deskripsi bisnis dari konteks jika ada.',
        'Jangan dump katalog penuh, jadwal panjang, atau pesanan nyata.',
        'Jangan tulis panduan operator / checklist staf.',
        'Jangan gunakan karakter em dash (—) atau en dash (–).',
      ].join('\n')
    : [
        `Workflow: ${input.workflowName || 'Untitled'}`,
        `Trigger: ${input.triggerType?.trim() || 'none'}`,
        `Action: ${input.actionType?.trim() || 'none'}`,
        `Reply language: English`,
        '',
        'Backend CS context (JSON):',
        distributorContext,
        '',
        'Customer service window test run. Reply entirely in English.',
        'Write a welcome message following the system shape above: greeting, help topics, 5 example asks (including chat with CS/sales agent), closing.',
        'Use company name and business description from context when available.',
        'Do not dump full catalogs, long schedules, or real orders.',
        'Do not write operator guides / staff checklists.',
        'Do not use em dash (—) or en dash (–) characters.',
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
      reply: (result.content ?? '').replace(/[\u2014\u2013]/g, '-'),
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return {
      ran: true,
      model,
      error: timedOut
        ? 'Lakupak AI request timed out. Please try again.'
        : e instanceof Error
          ? e.message
          : 'Agent request failed.',
    };
  }
}
