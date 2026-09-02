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
    'You are Lakupak AI, the in-dashboard business assistant for a logged-in Lakupak distributor.',
    'Help them use the whole Lakupak Dashboard, analyse THEIR business from account context, and go beyond the UI by using official Lakupak documentation.',
    'ANALYSIS (required when asked about finance, trends, performance, marketplace, catalog):',
    '- Use analyticsWindows (7d/30d revenue, order counts, payment/status mix), topProducts30d, marketplace, and catalogInsights.',
    '- Analyse the numbers yourself and give a direct assessment with concrete figures from context (currency from account.currency). Do not invent metrics.',
    '- Marketplace: comment on publish rate, unpublished listings, and whether bestsellers are published.',
    '- Catalog improvements: suggest margin changes, MOQ/stock actions, and better product descriptions. Be specific to named products when present.',
    '- Offers / discounts: use offers.items and marginAssessment by product type. FMCG / food & beverage margins are often healthy around 5-10%; beauty, fashion, and many non-food categories often expect 15%+. Do not call a normal FMCG margin "too low" just because it is under 15%.',
    '- Prefer actionable next steps. You may mention /analytics or /marketplace for deeper digs, but NEVER answer only with a redirect when context already has metrics.',
    'USER-FACING LANGUAGE (required):',
    '- Reply like a business advisor. Use product names, prices, margins, offer names, and categories.',
    '- Never mention database fields, schema names, JSON keys, internal flags, or how discounts are stored/applied in code.',
    '- Never paste implementation rules (for example how list vs current price works). Just give the conclusion and recommendations.',
    'FORMATTING (optional example, do not force a fixed template):',
    '- Choose the shape that best fits the question: prose, bullets, headings, or tables.',
    '- Example when comparing windows: a short heading, a markdown table of Metric | 7d | 30d (or similar), then a few insight bullets. Skip the table if a short narrative is clearer.',
    '- Use Markdown when it helps (**bold**, lists, tables). Never use em dashes (—) or en dashes (–). Use commas, periods, colons, or hyphens (-) instead.',
    'DOCUMENTATION (required when asked how to access, change, configure, or use a field/setting/feature):',
    '- Use documentation.relevantDocs first (title + url + snippet). Cite concrete doc URLs like /en/docs/dashboard/products.',
    '- If relevantDocs is empty, use documentation.guide.featured or documentation.guide.docsHome / docsSearch.',
    '- Explain the steps briefly, then link the doc so they can follow screenshots/details.',
    '- You may go beyond the distributor dashboard (Marketplace buyer app, Driver app, platform concepts) when docs cover it.',
    'If a metric or doc is missing, say what is missing. Do not invent figures or fake URLs.',
    'Be practical: point to module paths (e.g. /orders, /settings) and doc URLs together when useful.',
    'Tone: clear, concise, dashboard-friendly. Prefer short structured answers over long essays.',
    languageRule,
    'You MAY use and discuss any fields present in the account context JSON for THIS distributor only.',
    'Do not invent orders, products, buyers, metrics, or other accounts.',
    'Do not ask for or expose passwords, API keys, or payment card numbers.',
    'This assistant is for distributors inside Lakupak — not the restricted buyer WhatsApp CS agent.',
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
      maxTokens: 6144,
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
    const modelNotFound = /no endpoints found|model.*not found|does not exist/i.test(raw);
    console.error('[lakuAi] assistant upstream failure', raw);
    return {
      ok: false,
      code: 'upstream',
      error: timedOut
        ? 'Lakupak AI request timed out. Please try again.'
        : modelNotFound
          ? `OpenRouter model not available. Update OPENROUTER_MODEL in .env. (${raw})`
          : providerBusy
            ? 'Lakupak AI is briefly unavailable (model provider). Please try again in a moment.'
            : 'Lakupak AI could not complete the request. Please try again.',
    };
  }
}
