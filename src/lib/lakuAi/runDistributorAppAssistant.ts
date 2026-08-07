import { chatWithOpenRouter, isOpenRouterConfigured } from '@/lib/automations/openrouter';
import { resolveLakuAgentProviderModel } from '@/lib/automations/agentModels';
import { buildDistributorAppAssistantContext } from '@/lib/lakuAi/distributorAppContext';
import { searchDocsLocal } from '@/lib/docs/search';
import { docUrl, getDocsNav } from '@/lib/docs/load';
import type { DocLocale } from '@/lib/docs/types';

export type DistributorAppChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type DistributorAppAssistantResult =
  | { ok: true; reply: string; model: string }
  | { ok: false; error: string; code?: 'unauthorized' | 'not_configured' | 'bad_request' | 'upstream' };

function normalizeLocale(locale: string | null | undefined): 'en' | 'id' {
  const raw = String(locale ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'id' || raw.startsWith('id-')) return 'id';
  return 'en';
}

function buildDocsGuide(locale: DocLocale) {
  const nav = getDocsNav(locale);
  const links = nav.flatMap((section) =>
    section.items.slice(0, 8).map((item) => ({
      section: section.title,
      title: item.title,
      url: docUrl(locale, item.slug),
    })),
  );
  return {
    docsHome: `/${locale}/docs`,
    docsSearch: `/${locale}/docs/search`,
    featured: links.slice(0, 24),
  };
}

function buildDocsHitsForQuestion(locale: DocLocale, message: string) {
  const hits = searchDocsLocal(locale, message, 6);
  return hits.map((h) => ({
    title: h.title,
    url: h.url,
    module: h.module ?? null,
    section: h.section ?? null,
    snippet: h.snippet ?? h.description ?? null,
  }));
}

/**
 * Navbar Laku AI — distributor business / app guide for the whole dashboard.
 * Not the buyer-facing WhatsApp CS agent (that one is more restricted).
 */
export async function runDistributorAppAssistant(input: {
  userId: number;
  message: string;
  history?: DistributorAppChatMessage[];
  locale?: string | null;
}): Promise<DistributorAppAssistantResult> {
  const message = String(input.message ?? '').trim();
  if (!message) {
    return { ok: false, code: 'bad_request', error: 'Message is required.' };
  }
  if (!isOpenRouterConfigured()) {
    return {
      ok: false,
      code: 'not_configured',
      error: 'OPENROUTER_API_KEY is not configured.',
    };
  }

  const locale = normalizeLocale(input.locale);
  const docLocale = locale as DocLocale;
  const languageRule =
    locale === 'id'
      ? 'Reply entirely in Indonesian (Bahasa Indonesia). Keep product names, order IDs, path names, and doc URLs as-is when useful.'
      : 'Reply entirely in English. Keep product names, order IDs, path names, and doc URLs as-is when useful.';

  let accountContext = '';
  try {
    accountContext = await buildDistributorAppAssistantContext(input.userId);
  } catch (e) {
    return {
      ok: false,
      code: 'upstream',
      error:
        e instanceof Error
          ? `Failed to load account context: ${e.message}`
          : 'Failed to load account context.',
    };
  }

  let documentation: {
    guide: ReturnType<typeof buildDocsGuide>;
    relevantDocs: ReturnType<typeof buildDocsHitsForQuestion>;
  };
  try {
    documentation = {
      guide: buildDocsGuide(docLocale),
      relevantDocs: buildDocsHitsForQuestion(docLocale, message),
    };
  } catch {
    documentation = {
      guide: {
        docsHome: `/${locale}/docs`,
        docsSearch: `/${locale}/docs/search`,
        featured: [],
      },
      relevantDocs: [],
    };
  }

  const system = [
    'You are Laku AI, the in-dashboard business assistant for a logged-in Laku distributor.',
    'Help them use the whole Laku Dashboard, analyse THEIR business from account context, and go beyond the UI by using official Laku documentation.',
    'ANALYSIS (required when asked about finance, trends, performance, marketplace, catalog):',
    '- Use analyticsWindows (7d/30d revenue, order counts, payment/status mix), topProducts30d, marketplace, and catalogInsights.',
    '- Give a direct assessment with numbers from context (currency from account.currency).',
    '- Marketplace: comment on publish rate, unpublished listings, and whether bestsellers are published.',
    '- Catalog improvements: suggest margin changes, MOQ/stock actions, and better product descriptions. Be specific to named products when present.',
    '- Prefer actionable bullets. You may mention /analytics or /marketplace for deeper digs, but NEVER answer only with a redirect when context already has metrics.',
    'DOCUMENTATION (required when asked how to access, change, configure, or use a field/setting/feature):',
    '- Use documentation.relevantDocs first (title + url + snippet). Cite concrete doc URLs like /en/docs/dashboard/products.',
    '- If relevantDocs is empty, use documentation.guide.featured or documentation.guide.docsHome / docsSearch.',
    '- Explain the steps briefly, then link the doc so they can follow screenshots/details.',
    '- You may go beyond the distributor dashboard (Marketplace buyer app, Driver app, platform concepts) when docs cover it.',
    'If a metric or doc is missing, say what is missing. Do not invent figures or fake URLs.',
    'Be practical: point to module paths (e.g. /orders, /settings) and doc URLs together when useful.',
    'Tone: clear, concise, dashboard-friendly. Prefer short structured answers over long essays.',
    'FORMATTING: Never use em dashes (—) or en dashes (–). Use commas, periods, colons, or hyphens (-) instead.',
    languageRule,
    'You MAY use and discuss any fields present in the account context JSON for THIS distributor only.',
    'Do not invent orders, products, buyers, metrics, or other accounts.',
    'Do not ask for or expose passwords, API keys, or payment card numbers.',
    'This assistant is for distributors inside Laku — not the restricted buyer WhatsApp CS agent.',
  ].join('\n\n');

  const history = (input.history ?? [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content ?? '').trim())
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: String(m.content).trim().slice(0, 4000),
    }));

  const userContent = [
    `Reply language: ${locale === 'id' ? 'Indonesian' : 'English'}`,
    '',
    'Distributor account + app context (JSON):',
    accountContext,
    '',
    'Documentation context (JSON):',
    JSON.stringify(documentation),
    '',
    'User question:',
    message.slice(0, 4000),
  ].join('\n');

  try {
    const result = await chatWithOpenRouter({
      model: resolveLakuAgentProviderModel(undefined),
      messages: [
        { role: 'system', content: system },
        ...history,
        { role: 'user', content: userContent },
      ],
      temperature: 0.35,
    });
    const reply = String(result.content ?? '')
      .replace(/\u2014|\u2013/g, '-')
      .trim();
    if (!reply) {
      return { ok: false, code: 'upstream', error: 'Empty reply from model.' };
    }
    return { ok: true, reply, model: result.model };
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Upstream error';
    const timedOut = /timeout|aborted|AbortError/i.test(raw);
    const providerBusy =
      /provider returned error|overloaded|temporarily unavailable|rate.?limit|502|503/i.test(raw);
    console.error('[lakuAi] assistant upstream failure', raw);
    return {
      ok: false,
      code: 'upstream',
      error: timedOut
        ? 'Laku AI request timed out. Please try again.'
        : providerBusy
          ? 'Laku AI is briefly unavailable (model provider). Please try again in a moment.'
          : 'Laku AI could not complete the request. Please try again.',
    };
  }
}
