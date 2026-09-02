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
import {
  buildBuyerCsWelcomeShape,
  buildBuyerCsWelcomeUserInstruction,
} from '@/lib/automations/buyerCsWelcomePrompt';
import type { BuyerCsChatTurn } from '@/lib/automations/buyerCsSession';

type CanvasNode = {
  data?: {
    kind?: string;
    config?: Record<string, unknown>;
  };
};

/** Unambiguous handoff phrases (request verb + human target in one match). */
const HANDOFF_PHRASE_RE =
  /\b(?:speak to|talk to|chat with|connect me(?:\s+(?:to|with))?|bicara dengan|chat dengan|hubungi(?:\s+(?:cs(?:\s+manusia)?|customer service|agen(?:\s+penjualan)?|sales(?:\s+manusia)?|manusia))?)\b/i;

/** Request-intent verbs paired with human-agent targets (bare chat/speak/talk omitted to avoid informational false positives). */
const HANDOFF_REQUEST_VERB_RE =
  /\b(?:want|need|would like|can i|could i|may i|please|let me|get me|transfer|escalat|hubungi|bicara|hubungkan|sambungkan|mau|ingin|minta|tolong)\b/i;

const HANDOFF_AGENT_TARGET_RE =
  /\b(?:human|real person|customer service|sales agent|live agent|cs manusia|agen penjualan|sales manusia)\b/i;

export function buyerRequestedHandoff(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (HANDOFF_PHRASE_RE.test(text)) return true;
  return HANDOFF_REQUEST_VERB_RE.test(text) && HANDOFF_AGENT_TARGET_RE.test(text);
}

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

function resolveMarketplacePublicUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MARKETPLACE_URL ||
    process.env.MARKETPLACE_PUBLIC_URL ||
    'https://laku.id'
  ).replace(/\/$/, '');
}

export async function runInboundBuyerCsAgent(input: {
  userId: number;
  workflowName: string;
  nodes: CanvasNode[];
  buyerMessage: string;
  isWelcome: boolean;
  locale?: string | null;
  history?: BuyerCsChatTurn[];
}): Promise<{
  reply: string;
  error?: string;
  handoffRequested: boolean;
}> {
  const agent = firstAgentNode(input.nodes);
  if (!agent) {
    return { reply: '', error: 'No Lakupak AI node on canvas.', handoffRequested: false };
  }
  if (!isOpenRouterConfigured()) {
    return {
      reply: '',
      error: 'OPENROUTER_API_KEY is not configured.',
      handoffRequested: false,
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
  const handoffRequested = buyerRequestedHandoff(input.buyerMessage);

  let distributorContext = '';
  try {
    distributorContext = await buildDistributorAgentContext(input.userId);
  } catch (e) {
    return {
      reply: '',
      error:
        e instanceof Error
          ? `Failed to load distributor context: ${e.message}`
          : 'Failed to load distributor context.',
      handoffRequested,
    };
  }

  const languageRule = replyInIndonesian
    ? 'Reply entirely in Indonesian (Bahasa Indonesia). Keep product names, order IDs, and proper nouns as-is.'
    : 'Reply entirely in English. Keep product names, order IDs, and proper nouns as-is.';

  const marketplaceUrl = resolveMarketplacePublicUrl();
  const marketplaceRule = replyInIndonesian
    ? [
        'ATURAN PENTING - TRANSAKSI HANYA LEWAT MARKETPLACE:',
        `Semua pembelian, checkout, pembayaran, dan pembuatan pesanan HARUS dilakukan di marketplace Lakupak: ${marketplaceUrl}`,
        'WhatsApp hanya untuk CS: info produk, kebijakan, bantuan setelah pesanan dibuat di marketplace.',
        'JANGAN menawarkan untuk menerima pesanan, pembayaran, atau checkout lewat WhatsApp.',
        'JANGAN mengarahkan pembeli untuk beli langsung lewat alamat fisik, telepon, atau email.',
        'Jika pembeli bertanya cara beli / marketplace / checkout: jelaskan bahwa distributor ini menjual di Lakupak marketplace dan arahkan ke link di atas.',
        'Jangan bilang "kami bukan marketplace". Distributor ini berjualan DI Lakupak marketplace.',
        'Untuk bantuan pesanan: pesanan harus sudah dibuat di marketplace; minta order ID jika perlu.',
      ].join('\n')
    : [
        'CRITICAL - MARKETPLACE-ONLY TRANSACTIONS:',
        `All purchases, checkout, payment, and order placement MUST happen on the Lakupak marketplace: ${marketplaceUrl}`,
        'WhatsApp is CS only: product info, policies, and help after an order was placed on the marketplace.',
        'NEVER offer to take orders, payment, or checkout on WhatsApp.',
        'NEVER direct buyers to purchase directly via physical address, phone, or email.',
        'If the buyer asks how to buy / about marketplace / checkout: explain this distributor sells on Lakupak marketplace and point them to the URL above.',
        'Never say "we are not a marketplace". This distributor sells ON the Lakupak marketplace.',
        'For order help: the order must already exist on the marketplace; ask for order ID if needed.',
      ].join('\n');

  const system = [
    'You are Lakupak AI, the buyer-facing customer service chat assistant for this distributor on WhatsApp.',
    input.isWelcome
      ? 'Tone: warm, clear, WhatsApp-style CS. Structured and helpful, not a long brochure or internal briefing.'
      : 'Tone: warm, clear, WhatsApp-style CS. Be concise and helpful.',
    'Use the provided context as backend knowledge. Do not invent other companies or users.',
    marketplaceRule,
    'FORMATTING: Never use em dashes (—) or en dashes (–). Use commas, periods, colons, or hyphens (-) instead.',
    'FORMATTING: For emphasis use WhatsApp style with single asterisks only, like *this*. Never use **double asterisks** or markdown headings.',
    languageRule,
    input.isWelcome
      ? buildBuyerCsWelcomeShape(replyInIndonesian)
      : replyInIndonesian
        ? 'Lanjutkan percakapan CS. Jawab pertanyaan pembeli secara langsung. Jika mereka minta chat dengan manusia, akui permintaan tanpa janji waktu pasti.'
        : 'Continue the CS conversation. Answer the buyer’s question directly. If they ask for a human, acknowledge without promising an exact connection time.',
    trustedNote ? formatUntrustedAgentNote(trustedNote) : null,
    LAKU_AGENT_PRIVACY_POLICY,
  ]
    .filter(Boolean)
    .join('\n\n');

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: system },
  ];

  for (const turn of input.history ?? []) {
    messages.push({ role: turn.role, content: turn.content });
  }

  const userPrompt = input.isWelcome
    ? [
        buildBuyerCsWelcomeUserInstruction(replyInIndonesian, input.workflowName),
        '',
        replyInIndonesian ? 'Konteks backend CS (JSON):' : 'Backend CS context (JSON):',
        distributorContext,
        '',
        replyInIndonesian
          ? `Pesan pembeli: ${input.buyerMessage.trim()}`
          : `Buyer message: ${input.buyerMessage.trim()}`,
      ].join('\n')
    : replyInIndonesian
      ? [
          `Alur kerja: ${input.workflowName || 'Tanpa judul'}`,
          '',
          'Konteks backend CS (JSON):',
          distributorContext,
          '',
          `Pesan pembeli: ${input.buyerMessage.trim()}`,
        ].join('\n')
      : [
          `Workflow: ${input.workflowName || 'Untitled'}`,
          '',
          'Backend CS context (JSON):',
          distributorContext,
          '',
          `Buyer message: ${input.buyerMessage.trim()}`,
        ].join('\n');

  messages.push({ role: 'user', content: userPrompt });

  try {
    const result = await chatWithOpenRouter({ model, messages });
    return {
      reply: (result.content ?? '').replace(/[\u2014\u2013]/g, '-').trim(),
      handoffRequested,
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return {
      reply: '',
      error: timedOut
        ? 'Lakupak AI request timed out. Please try again.'
        : e instanceof Error
          ? e.message
          : 'Agent request failed.',
      handoffRequested,
    };
  }
}
