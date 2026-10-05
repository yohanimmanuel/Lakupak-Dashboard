import { chatWithOpenRouter, isOpenRouterConfigured } from '@/lib/automations/openrouter';
import { resolveLakuAgentProviderModel } from '@/lib/automations/agentModels';
import {
  allowedWorkflowCatalog,
  describeWorkflowEdit,
  fallbackMessageTemplate,
  fallbackWorkflowDescription,
  fieldsForCatalogType,
  readAssistantWorkflow,
  settleWorkflowPlan,
  workflowInputGuide,
  catalogTypeLabel,
  workflowMetaFromMessage,
  type WorkflowFieldUpdate,
  type WorkflowPlanStep,
} from '@/lib/lakuAi/workflowPlan';
import { resolveWorkflowInputs, workflowRecordHints } from '@/lib/lakuAi/resolveWorkflowInputs';
import { buildDistributorAppAssistantContext } from '@/lib/lakuAi/distributorAppContext';
import { searchDocsLocal } from '@/lib/docs/search';
import { docUrl, getDocsNav } from '@/lib/docs/load';
import type { DocLocale } from '@/lib/docs/types';

export type DistributorAppChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type DistributorAppAssistantResult =
  | {
      ok: true;
      reply: string;
      model: string;
      recipeId: string | null;
      plan: WorkflowPlanStep[] | null;
      unavailable: boolean;
      name: string | null;
      description: string | null;
      updates: WorkflowFieldUpdate[];
    }
  | { ok: false; error: string; code?: 'unauthorized' | 'not_configured' | 'bad_request' | 'upstream' };

const AUTOMATION_RECIPES = [
  'low_stock: stock falls under its line, then replenish and notify the dashboard. The user picks the product and quantity on the canvas.',
  'buyer_question: a buyer messages the distributor WhatsApp number. Stay in the 24 hour service window. Hand off if they ask for a person.',
  'return_accepted: a return is accepted. Confirm on WhatsApp and notify the dashboard.',
  'new_buyer: a buyer places a first order. Message the team to assign an agent and notify the dashboard.',
  'order_paid: payment proof is submitted. Mark the order paid from that proof and notify the dashboard.',
  'cart_idle: a cart sits idle for 24 hours. Send a WhatsApp win-back. Stop if they already ordered.',
  'sales_job_assign: a sales job is created. Lakupak AI, then WhatsApp, then assign that job to the salesman.',
  'sales_jobs: guide only. Sales agent replies on the distributor WhatsApp number are filed on the open job when the facts are clear. Several shops means ask which shop. A missing fact means ask the agent.',
].join('\n');

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
  onCanvas?: boolean;
  canvas?: WorkflowPlanStep[] | null;
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
    'When they ask you to build, edit, name, describe, or fill inputs on a workflow, end with one JSON object: {"plan":[steps] or null, "name": string or null, "description": string or null, "updates":[{"type":"...","config":{}}]}.',
    'Each step is one of {"kind":"trigger","type":"...","config":{}}, {"kind":"action","type":"...","config":{}}, {"kind":"agent"}, {"kind":"app","type":"..."}, {"kind":"condition","type":"..."}, {"kind":"end","type":"..."}. Omit config when you are not filling inputs.',
    'The first step is the trigger. Then only the steps the request needs, in order. Build the workflow they asked for. A direct task such as replenish stock or mark paid is trigger then action, with no agent.',
    'An If condition always has two different next steps that you choose for this request. The step right after the condition is Yes. The step after that is No. Do not leave a condition with one path. Do not reuse a previous workflow when they asked for a different one.',
    'Examples, copy the shape only when the request matches that example:',
    'Replenish: {"kind":"trigger","type":"stock_below"}, {"kind":"action","type":"replenish_stock"}, {"kind":"action","type":"notify_dashboard"}.',
    'Mark paid: {"kind":"trigger","type":"order_paid"}, {"kind":"action","type":"mark_paid_from_proof"}, {"kind":"action","type":"notify_dashboard"}.',
    'Buyer handoff: {"kind":"trigger","type":"buyer_questions"}, {"kind":"agent"}, {"kind":"app","type":"app_webhook"}, {"kind":"action","type":"cs_24h_window"}, {"kind":"condition","type":"yes_no"}, {"kind":"action","type":"assign_agent_whatsapp"}, {"kind":"end","type":"stay_in_cs"}. Yes assigns an agent. No stays in customer service.',
    'Assign sales job: {"kind":"trigger","type":"sales_job_created"}, {"kind":"agent"}, {"kind":"app","type":"app_webhook"}, {"kind":"action","type":"assign_sales_job"}. WhatsApp is the connection. Assign sales job sends the message. Set escalateOutOfScope to yes or no, and csReplyLanguage to en or id.',
    'Use only the catalog below. Channels are WhatsApp and Gmail only.',
    allowedWorkflowCatalog(),
    'If they ask for a step, channel, or behavior that is not in that catalog, do not invent it. Reply with exactly "Workflow feature is not available, try another thing." in English, or "Fitur alur kerja belum tersedia, coba hal lain." in Indonesian, and end with {"plan":"unavailable"}.',
    'WORKFLOW NAME, DESCRIPTION, AND INPUTS:',
    'A rename, a description, or a filled input is a workflow edit. If the steps stay the same, set plan to null and set name, description, and updates.',
    'name is the workflow title they asked for, kept short. description is one or two sentences about what this workflow does for their business. Write it yourself when they ask for a description and do not supply the words.',
    'updates fill inputs that already exist on a step. Use the catalog type, for example cart_winback or cart_idle. config may include buyers (store names), products (product names), messageTemplate, channel, messageCategory, hours, replenishQty, and offerId.',
    'messageTemplate is the message a buyer or the team will actually receive. Write it for this request, specific and ready to send, in the reply language. Do not use a placeholder like [name] unless they asked for one. No em dashes.',
    'Pick buyers and products only from the account list in the user message. Use the store name. If the name is not in that list, leave buyers empty. Never invent an id.',
    'Win-back and promo messages use channel whatsapp and messageCategory MARKETING unless they asked for email or both.',
    'Allowed inputs:',
    workflowInputGuide(),
    'If they are not asking to build, rename, describe, or fill a workflow, end with {"plan":null}. A greeting, an analysis question, order help, buyer help, or product help is not a workflow edit.',
    'The JSON is removed before they see the reply. Do not mention it, tool calls, function calls, safety labels, or recipe ids.',
    'Name every step you keep, in order, in the reply: the trigger, then each app, Lakupak AI, action, condition, or end.',
    'When a current canvas is included, return the full plan after the edit. Keep every current step the user did not ask to remove.',
    'Do not claim a workflow is saved or active. The canvas shows the draft, then they save or activate it. Do not tell them to open Automations, click Create Workflow, or leave the page.',
    input.onCanvas
      ? 'The user is on the automation canvas now. The plan updates that canvas in place. Do not tell them to go somewhere else to edit it.'
      : '',
    AUTOMATION_RECIPES,
  ]
    .filter(Boolean)
    .join('\n\n');

  const history = (input.history ?? [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content ?? '').trim())
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: String(m.content).trim().slice(0, 4000),
    }));

  const wantsRecords =
    input.onCanvas === true ||
    /workflow|automation|canvas|buyer|template|message|win-?back|alur|pembeli|pesan|deskripsi|description/i.test(message);
  const recordHints = wantsRecords ? await workflowRecordHints(input.userId) : '';

  const userContent = [
    `Reply language: ${locale === 'id' ? 'Indonesian' : 'English'}`,
    '',
    'Distributor account + app context (JSON):',
    accountContext,
    recordHints ? `\nRecords you may select:\n${recordHints}` : '',
    '',
    'Documentation context (JSON):',
    JSON.stringify(documentation),
    '',
    input.canvas?.length ? `Current canvas steps (JSON):\n${JSON.stringify(input.canvas)}` : '',
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
    const raw = String(result.content ?? '');
    const parsed = readAssistantWorkflow(raw);
    const unavailableCopy =
      locale === 'id'
        ? 'Fitur alur kerja belum tersedia, coba hal lain.'
        : 'Workflow feature is not available, try another thing.';
    const leaked = /<\|tool_call|safety\s*:/i.test(raw);
    const readableFallback =
      locale === 'id'
        ? 'Saya tidak menangkap itu. Coba lagi dengan langkah yang ada di kanvas.'
        : 'I did not catch that. Try again with a step from the canvas.';
    const settled = settleWorkflowPlan({
      message,
      plan: parsed.plan,
      recipeOnly: parsed.recipeOnly,
      canvas: input.canvas ?? null,
      unavailable: parsed.unavailable,
    });
    const hinted = workflowMetaFromMessage(message);
    const name = parsed.name || (input.onCanvas ? hinted.name : null);
    const canvasSteps = settled.plan ?? input.canvas ?? null;
    const description =
      parsed.description ||
      (input.onCanvas && hinted.wantsDescription && canvasSteps?.length
        ? fallbackWorkflowDescription(canvasSteps, locale)
        : null);
    const resolved =
      parsed.updates.length || input.onCanvas
        ? await resolveWorkflowInputs(input.userId, parsed.updates, {
            message,
            canvasTypes: (input.canvas ?? []).flatMap((step) => (step.kind === 'agent' ? [] : [step.type])),
          })
        : { updates: [], missing: [] };
    const canvasTypes = new Set(
      (input.canvas ?? []).flatMap((step) => (step.kind === 'agent' ? [] : [step.type])),
    );
    const planTypes = new Set(
      (settled.plan ?? []).flatMap((step) => (step.kind === 'agent' ? [] : [step.type])),
    );
    const updates = resolved.updates.filter((update) => {
      if (!input.onCanvas) return true;
      if (settled.plan && !settled.unchanged) return planTypes.has(update.type);
      return canvasTypes.has(update.type);
    });
    const skipped = resolved.updates
      .filter((update) => !updates.some((kept) => kept.type === update.type))
      .map((update) => catalogTypeLabel(update.type, locale));
    const asksMessage = /\b(message template|write a message|draft a message|tulis pesan|buat pesan|buatkan pesan)\b/i.test(
      message,
    );
    if (input.onCanvas && asksMessage && !updates.some((update) => String(update.config.messageTemplate ?? '').trim())) {
      const target = (input.canvas ?? []).find(
        (step) =>
          step.kind !== 'agent' && fieldsForCatalogType(step.type).some((field) => field.key === 'messageTemplate'),
      );
      if (target && target.kind !== 'agent') {
        const template = fallbackMessageTemplate(target.type, locale);
        if (template) {
          const existing = updates.find((update) => update.type === target.type);
          const config: Record<string, unknown> = { ...(existing?.config ?? {}), messageTemplate: template };
          if (target.type === 'cart_winback') {
            if (!config.channel) config.channel = 'whatsapp';
            if (!config.messageCategory) config.messageCategory = 'MARKETING';
          }
          if (existing) existing.config = config;
          else updates.push({ type: target.type, config });
        }
      }
    }
    if (settled.plan) {
      for (const step of settled.plan) {
        if (step.kind === 'agent') continue;
        const update = updates.find((item) => item.type === step.type);
        if (update) step.config = update.config;
      }
    }
    const hidePlan = Boolean(input.onCanvas && settled.unchanged);
    const plan = settled.plan && !hidePlan ? settled.plan : null;
    const hasEdit = Boolean(name || description || updates.length);
    const claimedUpdate = /updated the canvas|memperbarui kanvas|these steps:|langkah ini:/i.test(parsed.reply);
    const missedCanvasEdit =
      locale === 'id'
        ? 'Kanvas tidak berubah. Sebutkan langkah yang ada di pembangun alur kerja.'
        : 'The canvas did not change. Name a step the workflow builder already has.';
    const reply =
      settled.plan || hasEdit
        ? describeWorkflowEdit({
            locale,
            name,
            description,
            steps: settled.plan,
            stepMode: settled.plan
              ? input.onCanvas
                ? settled.unchanged
                  ? 'already'
                  : 'updated'
                : 'draft'
              : null,
            updates,
            missing: resolved.missing,
            skipped,
          })
        : input.onCanvas && claimedUpdate
          ? missedCanvasEdit
          : parsed.unavailable
            ? unavailableCopy
            : parsed.reply || (leaked ? readableFallback : '');
    if (!reply) {
      return { ok: false, code: 'upstream', error: 'Empty reply from model.' };
    }
    return {
      ok: true,
      reply,
      model: result.model,
      recipeId: plan ? parsed.recipeId : null,
      plan,
      unavailable: !plan && !hasEdit && parsed.unavailable,
      name,
      description,
      updates,
    };
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
