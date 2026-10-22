import type { SalesConversionOpportunityKind } from './buildSalesConversionInsights';

export const OPPORTUNITY_KIND_BADGE_STYLES: Record<SalesConversionOpportunityKind, string> = {
  reorder: 'bg-amber-100 text-amber-700',
  quotation: 'bg-blue-100 text-blue-700',
  buyer_interest: 'bg-emerald-100 text-emerald-700',
  sales_task: 'bg-violet-100 text-violet-700',
};
