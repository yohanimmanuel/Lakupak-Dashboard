/**
 * Lakupak AI OpenRouter model — set OPENROUTER_MODEL in .env (single source of truth).
 */
export const OPENROUTER_MODEL_ENV_KEY = 'OPENROUTER_MODEL';

export const LAKU_AGENT_MODEL_IDS = [
  'gpt',
  'claude',
  'grok',
  'gemini',
  'llama',
  'deepseek',
] as const;

export type LakuAgentModelId = (typeof LAKU_AGENT_MODEL_IDS)[number];

export const DEFAULT_LAKU_AGENT_MODEL: LakuAgentModelId = 'gpt';

/** Public logo paths for each branded model option. */
export const LAKU_AGENT_MODEL_LOGOS: Record<LakuAgentModelId, string> = {
  gpt: '/Modelchatgpt.png',
  claude: '/Modelclaude.png',
  grok: '/Modelgrok.png',
  gemini: '/Modelgemini.png',
  llama: '/Modelmeta.png',
  deepseek: '/Modeldeepseek.png',
};

export function isLakuAgentModelId(value: unknown): value is LakuAgentModelId {
  return typeof value === 'string' && (LAKU_AGENT_MODEL_IDS as readonly string[]).includes(value);
}

export function normalizeLakuAgentModelId(value: unknown): LakuAgentModelId {
  return isLakuAgentModelId(value) ? value : DEFAULT_LAKU_AGENT_MODEL;
}

/**
 * Resolve the OpenRouter model slug from OPENROUTER_MODEL in .env.
 * Ignores stale providerModel values saved on older canvases.
 */
export function resolveLakuAgentProviderModel(_selected: unknown): string {
  const model = process.env.OPENROUTER_MODEL?.trim();
  if (!model) {
    if (typeof window === 'undefined') {
      throw new Error(`${OPENROUTER_MODEL_ENV_KEY} is not set in .env.`);
    }
    return '';
  }
  return model;
}

export function defaultLakuAgentConfig(note = ''): Record<string, unknown> {
  return {
    note,
    model: DEFAULT_LAKU_AGENT_MODEL,
    providerModel: '',
  };
}
