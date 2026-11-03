/** Configurable rule weights. Scores renormalise over signals that have evidence. */

export const MATCH_WEIGHTS = {
  categoryAffinity: 30,
  coPurchase: 25,
  segmentFit: 20,
  purchasingActivity: 15,
  priceSuitability: 10,
} as const;

export const PRIORITY_WEIGHTS = {
  matchSuitability: 50,
  commercialValue: 20,
  actionability: 20,
  freshness: 10,
} as const;

/** Readable priority. Match scoring stays numeric; this is the label a distributor reads. */
export const PRIORITY_LABELS = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type PriorityLabel = (typeof PRIORITY_LABELS)[number];
export const PRIORITY_RANK: Record<PriorityLabel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

/** Purchase history used for "currently" and "regularly". */
export const EVIDENCE_WINDOW_DAYS = 90;

export function priorityLabelForRank(rank: number): PriorityLabel {
  if (rank >= PRIORITY_RANK.urgent) return 'urgent';
  if (rank === PRIORITY_RANK.high) return 'high';
  if (rank === PRIORITY_RANK.medium) return 'medium';
  if (rank === PRIORITY_RANK.low) return 'low';
  return 'none';
}

export function priorityLabelFromStored(score: number, label?: string | null): PriorityLabel {
  if (label && (PRIORITY_LABELS as readonly string[]).includes(label)) return label as PriorityLabel;
  if (score > PRIORITY_RANK.urgent) {
    if (score >= 85) return 'urgent';
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    if (score > 0) return 'low';
    return 'none';
  }
  return priorityLabelForRank(score);
}

export type MatchWeightKey = keyof typeof MATCH_WEIGHTS;
export type PriorityWeightKey = keyof typeof PRIORITY_WEIGHTS;

const SETTING_INT_MAX = 2147483647;

function numericSetting(raw: unknown): number | null {
  if (typeof raw === 'string' && raw.trim() === '') return null;
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerSetting(raw: unknown, min: number, max: number): number | null {
  const parsed = numericSetting(raw);
  if (parsed == null || !Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/** The filter is labeled as a percent. The list query compares confidence as a 0–1 fraction. */
export function confidenceFilterFraction(raw: string): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const percent = Math.min(100, Math.max(0, parsed));
  return percent / 100;
}

/** Accept a settings field only when it fits the column and cannot blank the match list. */
export function assortmentSettingValue(key: string, raw: unknown): number | null {
  if (key === 'lookbackDays' || key === 'defaultReorderDays') return integerSetting(raw, 0, SETTING_INT_MAX);
  if (key === 'minMatchScore') return integerSetting(raw, 0, 100);
  if (key === 'minEvidenceSignals') return integerSetting(raw, 0, Object.keys(MATCH_WEIGHTS).length);
  if (key !== 'minConfidence') return null;
  const parsed = numericSetting(raw);
  if (parsed == null || parsed < 0 || parsed > 1) return null;
  const rounded = Math.round(parsed * 1000) / 1000;
  if (Math.abs(rounded - parsed) > 1e-9) return null;
  return rounded;
}

export const DEFAULT_ASSORTMENT_SETTINGS = {
  lookbackDays: 365,
  defaultReorderDays: 45,
  minConfidence: 0.35,
  minMatchScore: 40,
  minEvidenceSignals: 2,
  highPriorityScore: 70,
  matchWeights: { ...MATCH_WEIGHTS },
  priorityWeights: { ...PRIORITY_WEIGHTS },
} as const;

/** Prospects are not ordering retailers and stay out of the match base. */
export const ELIGIBLE_RETAILER_STATUSES = ['active'] as const;

/** These order statuses are not treated as a completed SKU purchase. */
export const NON_PURCHASE_ORDER_STATUSES = [
  'cancelled',
  'canceled',
  'failed',
  'returned',
  'rejected',
  'pending',
  'draft',
] as const;

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function asWeightMap(
  value: unknown,
  fallback: Record<string, number>,
): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback };
  const next: Record<string, number> = { ...fallback };
  for (const key of Object.keys(fallback)) {
    const raw = (value as Record<string, unknown>)[key];
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) next[key] = parsed;
  }
  return next;
}
