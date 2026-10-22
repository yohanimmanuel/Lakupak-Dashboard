export type OpportunityUrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

/** Urgency is derived from the opportunity priority score in buildSalesConversionInsights. */
export function getOpportunityUrgencyLevel(score: number): OpportunityUrgencyLevel {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

export const OPPORTUNITY_URGENCY_BADGE_STYLES: Record<OpportunityUrgencyLevel, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-gray-100 text-gray-600',
};
