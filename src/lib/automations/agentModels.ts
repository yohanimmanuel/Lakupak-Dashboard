/**
 * Laku Agent UI model presets.
 * Every branded option is routed through Ling on OpenRouter for now.
 */
export const LAKU_AGENT_PROVIDER_MODEL = 'inclusionai/ling-3.0-flash:free';

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

/** Resolve the real provider model slug used for API calls. */
export function resolveLakuAgentProviderModel(_selected: unknown): string {
  return LAKU_AGENT_PROVIDER_MODEL;
}

export function defaultLakuAgentConfig(note = ''): Record<string, unknown> {
  return {
    note,
    model: DEFAULT_LAKU_AGENT_MODEL,
    providerModel: LAKU_AGENT_PROVIDER_MODEL,
  };
}
