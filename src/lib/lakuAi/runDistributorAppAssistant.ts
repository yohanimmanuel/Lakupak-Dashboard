import { chatWithOpenRouter, isOpenRouterConfigured } from '@/lib/automations/openrouter';
import { resolveLakuAgentProviderModel } from '@/lib/automations/agentModels';
import { copilotRecipeById } from '@/lib/automations/copilotRecipes';
import { buildDistributorAppAssistantContext } from '@/lib/lakuAi/distributorAppContext';
import { searchDocsLocal } from '@/lib/docs/search';
import { docUrl, getDocsNav } from '@/lib/docs/load';
import type { DocLocale } from '@/lib/docs/types';

export type DistributorAppChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type DistributorAppAssistantResult =
  | { ok: true; reply: string; model: string; recipeId: string | null }
  | { ok: false; error: string; code?: 'unauthorized' | 'not_configured' | 'bad_request' | 'upstream' };

const AUTOMATION_RECIPES = [
  'low_stock: stock falls under its line, then replenish and notify the dashboard. The user picks the product and quantity on the canvas.',
  'buyer_question: a buyer messages the distributor WhatsApp number. Stay in the 24 hour service window. Hand off if they ask for a person.',
  'return_accepted: a return is accepted. Confirm on WhatsApp and notify the dashboard.',
  'new_buyer: a buyer places a first order. Message the team to assign an agent and notify the dashboard.',
  'order_paid: payment proof is submitted. Mark the order paid from that proof and notify the dashboard.',
  'cart_idle: a cart sits idle for 24 hours. Send a WhatsApp win-back. Stop if they already ordered.',
  'sales_jobs: guide only. Sales agent replies on the distributor WhatsApp number are filed on the open job when the facts are clear. Several shops means ask which shop. A missing fact means ask the agent.',
].join('\n');

function recipeFromJson(raw: string): { recipeId: string | null } | null {
  try {
    const parsed = JSON.parse(raw) as { recipeId?: unknown };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('recipeId' in parsed)) return null;
    const id = typeof parsed.recipeId === 'string' ? parsed.recipeId.trim() : '';
    return { recipeId: id && copilotRecipeById(id) ? id : null };
  } catch {
    return null;
  }
}

function recipeInChunk(chunk: string): { recipeId: string | null } | null {
  const whole = recipeFromJson(chunk.trim());
  if (whole) return whole;
  const inlines = [...chunk.matchAll(/\{[^{}]*"recipeId"[^{}]*\}/g)];
  for (let i = inlines.length - 1; i >= 0; i -= 1) {
    const parsed = recipeFromJson(inlines[i][0]);
    if (parsed) return parsed;
  }
  return null;
}

function extractRecipeReply(content: string): { reply: string; recipeId: string | null } {
  const text = content.replace(/\u2014|\u2013/g, '-').trim();
  const markers: { start: number; end: number; recipeId: string | null }[] = [];
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  for (const fence of fences) {
    if (fence.index == null) continue;
    const parsed = recipeInChunk(fence[1] ?? '');
    if (!parsed) continue;
    markers.push({
      start: fence.index,
      end: fence.index + fence[0].length,
      recipeId: parsed.recipeId,
    });
  }
  for (const inline of text.matchAll(/\{[^{}]*"recipeId"[^{}]*\}/g)) {
    if (inline.index == null) continue;
    const insideFence = markers.some((marker) => inline.index! >= marker.start && inline.index! < marker.end);
    if (insideFence) continue;
    const parsed = recipeFromJson(inline[0]);
    if (!parsed) continue;
    markers.push({
      start: inline.index,
      end: inline.index + inline[0].length,
      recipeId: parsed.recipeId,
    });
  }
  if (markers.length === 0) return { reply: text, recipeId: null };
  const selected = markers.reduce((last, marker) => (marker.start >= last.start ? marker : last));
  const reply = `${text.slice(0, selected.start)}${text.slice(selected.end)}`.trim();
  return { reply, recipeId: selected.recipeId };
}

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
 * Shared Lakupak AI for the navbar and the automation copilot.
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
    'This assistant is for distributors inside Lakupak, not the restricted buyer WhatsApp CS agent.',
    'ONE ASSISTANT:',
    'You are the same Lakupak AI everywhere: analysis, order taking, buyer analysis, product creation, offers, sales reminders, and automation drafts. Do not tell the user to open a different chatbot.',
    'Answer the question they asked. If they want numbers, use the account context. If they want to create a product, buyer, or order, explain the practical next step and the module path.',
    'AUTOMATION DRAFTS:',
    'When they ask you to build, automate, remind, or set up a repeating process, explain the draft in plain language and end with one JSON line: {"recipeId":"<id>"}',
    'Use only these ids. Channels for drafts are WhatsApp and Gmail only. Do not invent other apps.',
    'If they are not asking to build a workflow, end with {"recipeId":null}. A greeting, an analysis question, order help, buyer help, or product help is not a workflow.',
    'If none of the ids fit, answer in conversation and use null. Do not invent a workflow.',
    'The JSON line is removed before they see the reply. Do not mention it.',
    'Do not claim a workflow is saved or active. They review it on the canvas, then save or activate it themselves.',
    AUTOMATION_RECIPES,
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
    const parsed = extractRecipeReply(String(result.content ?? ''));
    if (!parsed.reply) {
      return { ok: false, code: 'upstream', error: 'Empty reply from model.' };
    }
    return { ok: true, reply: parsed.reply, model: result.model, recipeId: parsed.recipeId };
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
