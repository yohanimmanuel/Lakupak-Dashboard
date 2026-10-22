import {
  normalizeLakuAgentModelId,
  resolveLakuAgentProviderModel,
} from '@/lib/automations/agentModels';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_FETCH_TIMEOUT_MS = 60_000;
const OPENROUTER_MAX_ATTEMPTS = 2;
const OPENROUTER_RETRY_BASE_MS = 1000;

export type OpenRouterChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenRouterChatResult = {
  content: string;
  model: string;
  finishReason?: string | null;
};

type OpenRouterErrorBody = {
  error?: {
    message?: string;
    code?: number | string;
    metadata?: { raw?: string; provider_name?: string; provider_code?: string | number };
  };
  model?: string;
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
};

function openRouterApiKey(): string | null {
  const raw = process.env.OPENROUTER_API_KEY?.trim();
  if (!raw) return null;
  return raw.replace(/^["']|["']$/g, '').trim() || null;
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(openRouterApiKey());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(payload: OpenRouterErrorBody | null, statusText: string): string {
  const base = payload?.error?.message?.trim() || statusText || 'OpenRouter request failed';
  const raw = payload?.error?.metadata?.raw;
  if (typeof raw === 'string' && raw.trim() && !base.toLowerCase().includes(raw.trim().toLowerCase())) {
    return `${base} (${raw.trim().slice(0, 180)})`;
  }
  return base;
}

function isTransientOpenRouterFailure(status: number, message: string): boolean {
  if (/free-models-per-day|daily.?limit|quota.?exhausted|insufficient.?credits/i.test(message)) {
    return false;
  }
  if (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 524
  ) {
    return true;
  }
  return /provider returned error|overloaded|temporarily unavailable|timeout|try again|rate.?limit/i.test(
    message
  );
}

function retryDelayMs(attemptIndex: number, retryAfterHeader: string | null): number {
  const raw = retryAfterHeader?.trim();
  if (raw) {
    if (/^\d+$/.test(raw)) {
      const seconds = Number(raw);
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000);
      }
    } else {
      const when = Date.parse(raw);
      if (Number.isFinite(when)) {
        const delay = when - Date.now();
        if (delay > 0) return delay;
      }
    }
  }
  const jitter = Math.floor(Math.random() * 250);
  return OPENROUTER_RETRY_BASE_MS * 2 ** attemptIndex + jitter;
}

/**
 * Chat completion via OpenRouter (shared Lakupak AI provider model).
 * Server-only — requires OPENROUTER_API_KEY and OPENROUTER_MODEL.
 */
export async function chatWithOpenRouter(args: {
  model?: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Look up public pages for the products named in the message. */
  webSearch?: boolean;
  /** When false, the model must answer directly and must not spend the reply on reasoning. */
  reasoning?: boolean;
}): Promise<OpenRouterChatResult> {
  const apiKey = openRouterApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set.');
  }

  const model =
    args.model?.trim() ||
    resolveLakuAgentProviderModel(normalizeLakuAgentModelId(undefined));

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const siteUrl = process.env.OPENROUTER_SITE_URL?.trim();
  const appName = process.env.OPENROUTER_APP_NAME?.trim() || 'Lakupak';
  if (siteUrl) headers['HTTP-Referer'] = siteUrl;
  headers['X-Title'] = appName;

  const body: Record<string, unknown> = {
    model,
    messages: args.messages,
    temperature: args.temperature ?? 0.4,
  };
  if (typeof args.maxTokens === 'number' && args.maxTokens > 0) {
    body.max_tokens = args.maxTokens;
  }
  if (args.webSearch) {
    body.plugins = [{ id: 'web', max_results: 4 }];
  }
  if (args.reasoning === false) {
    body.reasoning = { effort: 'none', exclude: true };
  }

  let lastError = 'OpenRouter request failed';
  let emptyResponses = 0;

  for (let attempt = 0; attempt < OPENROUTER_MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OPENROUTER_FETCH_TIMEOUT_MS),
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Network error';
      lastError = raw;
      const timedOut = /timeout|aborted|AbortError/i.test(raw);
      if (attempt < OPENROUTER_MAX_ATTEMPTS - 1 && timedOut) {
        await sleep(retryDelayMs(attempt, null));
        continue;
      }
      throw new Error(timedOut ? 'Lakupak AI request timed out. Please try again.' : raw);
    }

    const payload = (await response.json().catch(() => null)) as OpenRouterErrorBody | null;

    if (!response.ok) {
      const detail = extractErrorMessage(payload, response.statusText);
      lastError = detail;
      if (/reasoning is mandatory/i.test(detail) && body.reasoning) {
        delete body.reasoning;
        if (attempt >= OPENROUTER_MAX_ATTEMPTS - 1) {
          attempt = OPENROUTER_MAX_ATTEMPTS - 2;
        }
        continue;
      }
      if (attempt < OPENROUTER_MAX_ATTEMPTS - 1 && isTransientOpenRouterFailure(response.status, detail)) {
        await sleep(retryDelayMs(attempt, response.headers.get('Retry-After')));
        continue;
      }
      throw new Error(detail);
    }

    const choice = payload?.choices?.[0];
    const content = choice?.message?.content?.trim();
    if (!content) {
      lastError = 'OpenRouter returned an empty response.';
      // Providers occasionally return an empty completion back to back. Give
      // empties more chances than other failures before giving up.
      if (emptyResponses < OPENROUTER_MAX_ATTEMPTS) {
        emptyResponses += 1;
        attempt -= 1;
        await sleep(retryDelayMs(emptyResponses, null));
        continue;
      }
      throw new Error(lastError);
    }

    return {
      content,
      model: payload?.model?.trim() || model,
      finishReason: choice?.finish_reason ?? null,
    };
  }

  throw new Error(lastError);
}
