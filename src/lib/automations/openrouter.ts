import {
  normalizeLakuAgentModelId,
  resolveLakuAgentProviderModel,
} from '@/lib/automations/agentModels';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Free Ling responses can be slow; fail clearly instead of hanging indefinitely. */
const OPENROUTER_FETCH_TIMEOUT_MS = 120_000;

export type OpenRouterChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenRouterChatResult = {
  content: string;
  model: string;
  finishReason?: string | null;
};

function openRouterApiKey(): string | null {
  const raw = process.env.OPENROUTER_API_KEY?.trim();
  if (!raw) return null;
  return raw.replace(/^["']|["']$/g, '').trim() || null;
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(openRouterApiKey());
}

/**
 * Chat completion via OpenRouter (Ling 3.0 for Laku Agent).
 * Server-only — requires OPENROUTER_API_KEY.
 */
export async function chatWithOpenRouter(args: {
  model?: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
  /** Optional output cap. Omit to use the provider default (preferred for free Ling). */
  maxTokens?: number;
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
  const appName = process.env.OPENROUTER_APP_NAME?.trim() || 'Laku';
  if (siteUrl) headers['HTTP-Referer'] = siteUrl;
  headers['X-Title'] = appName;

  const body: Record<string, unknown> = {
    model,
    messages: args.messages,
    temperature: args.temperature ?? 0.4,
  };
  // Only send max_tokens when explicitly set; omit so provider default applies (free Ling).
  if (typeof args.maxTokens === 'number' && args.maxTokens > 0) {
    body.max_tokens = args.maxTokens;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OPENROUTER_FETCH_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        model?: string;
        choices?: Array<{
          message?: { content?: string | null };
          finish_reason?: string | null;
        }>;
      }
    | null;

  if (!response.ok) {
    const detail = payload?.error?.message || response.statusText || 'OpenRouter request failed';
    throw new Error(detail);
  }

  const choice = payload?.choices?.[0];
  const content = choice?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenRouter returned an empty response.');
  }

  return {
    content,
    model: payload?.model?.trim() || model,
    finishReason: choice?.finish_reason ?? null,
  };
}
