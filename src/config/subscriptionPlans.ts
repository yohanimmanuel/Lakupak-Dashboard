export type SubscriptionPlanId = 'free' | 'starter' | 'growth' | 'scale' | 'enterprise';
export type PaidSubscriptionPlanId = Exclude<SubscriptionPlanId, 'free'>;

export type PlanSupportTier =
  | 'standard_email'
  | 'priority_email'
  | 'priority_chat'
  | 'sla_csm';

/**
 * Usage quotas per plan. `null` = custom / fair-use (Enterprise).
 * No dashboardUsers or variants/skus — variants belong to a published product;
 * each distributor company has one Dashboard admin.
 */
export type PlanQuotas = {
  marketplaceProducts: number | null;
  ordersPerMonth: number | null;
  salesAgents: number | null;
  drivers: number | null;
  activeOffers: number | null;
  mediaStorageGb: number | null;
  automationRules: number | null;
  support: PlanSupportTier;
};

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  /** Active retail connections band (billing metric). */
  connections: string;
  /** Monthly list price in IDR. Null = custom / contact sales. */
  monthlyIdr: number | null;
  /** Annual list price in IDR (10× monthly = 2 months free). Null when custom. */
  annualIdr: number | null;
  /** Enterprise floor when monthlyIdr is null. */
  fromMonthlyIdr?: number;
  popular?: boolean;
  quotas: PlanQuotas;
};

/** Soft-cap warning threshold (show upgrade nudge at this fraction of a quota). */
export const SOFT_CAP_WARN_RATIO = 0.8;

/**
 * Soft-cap policy for MVP:
 * - At ~80% usage → warn in Settings → Billing
 * - At / over quota → allow continued use; hard blocks optional later
 *   (safest first: new product publish, new sales agent, new driver)
 * - Never cap the distributor Dashboard admin account
 */
export const PLAN_SOFT_CAP_POLICY = {
  warnRatio: SOFT_CAP_WARN_RATIO,
  hardBlockMidCycle: false,
  futureHardCapTargets: ['marketplaceProducts', 'salesAgents', 'drivers'] as const,
} as const;

/** Canvas pricing model — shared by landing pricing + Settings billing. */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    connections: '1 – 1K',
    monthlyIdr: 0,
    annualIdr: 0,
    quotas: {
      marketplaceProducts: 500,
      ordersPerMonth: 5000,
      salesAgents: 10,
      drivers: 5,
      activeOffers: 20,
      mediaStorageGb: 5,
      automationRules: 10,
      support: 'standard_email',
    },
  },
  {
    id: 'starter',
    connections: '1 – 1K',
    monthlyIdr: 999_000,
    annualIdr: 9_990_000,
    quotas: {
      marketplaceProducts: 500,
      ordersPerMonth: 5000,
      salesAgents: 10,
      drivers: 5,
      activeOffers: 20,
      mediaStorageGb: 5,
      automationRules: 10,
      support: 'standard_email',
    },
  },
  {
    id: 'growth',
    connections: '1K – 5K',
    monthlyIdr: 3_299_000,
    annualIdr: 32_990_000,
    popular: true,
    quotas: {
      marketplaceProducts: 1000,
      ordersPerMonth: 10_000,
      salesAgents: 20,
      drivers: 20,
      activeOffers: 40,
      mediaStorageGb: 10,
      automationRules: 25,
      support: 'priority_email',
    },
  },
  {
    id: 'scale',
    connections: '5K – 10K',
    monthlyIdr: 5_499_000,
    annualIdr: 54_990_000,
    quotas: {
      marketplaceProducts: 4_000,
      ordersPerMonth: 25_000,
      salesAgents: 40,
      drivers: 35,
      activeOffers: 60,
      mediaStorageGb: 50,
      automationRules: 100,
      support: 'priority_chat',
    },
  },
  {
    id: 'enterprise',
    connections: '10K+',
    monthlyIdr: null,
    annualIdr: null,
    fromMonthlyIdr: 12_900_000,
    quotas: {
      marketplaceProducts: null,
      ordersPerMonth: null,
      salesAgents: null,
      drivers: null,
      activeOffers: null,
      mediaStorageGb: null,
      automationRules: null,
      support: 'sla_csm',
    },
  },
];

export const PAID_SUBSCRIPTION_PLANS = SUBSCRIPTION_PLANS.filter(
  (plan): plan is SubscriptionPlan & { id: PaidSubscriptionPlanId } => plan.id !== 'free',
);

export function isTrialPlan(plan: SubscriptionPlan): boolean {
  return plan.id === 'free';
}

/** Annual billing ≈ 17% off vs 12× monthly (pay 10 months). */
export const ANNUAL_SAVINGS_PERCENT = 17;

/** Comparison / entitlement rows driven from quotas (not feature checkmarks). */
export const PLAN_QUOTA_COMPARISON_KEYS = [
  'platformAccess',
  'connections',
  'marketplaceProducts',
  'ordersPerMonth',
  'salesAgents',
  'drivers',
  'activeOffers',
  'mediaStorageGb',
  'automationRules',
  'support',
] as const;

export type PlanQuotaComparisonKey = (typeof PLAN_QUOTA_COMPARISON_KEYS)[number];

export function formatIdr(amount: number): string {
  return `Rp ${amount.toLocaleString('en-US')}`;
}

export function getPlanById(id: SubscriptionPlanId): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id);
}

export function formatPlanPrice(
  plan: SubscriptionPlan,
  billing: 'monthly' | 'annual',
  opts?: { customLabel?: string; fromPrefix?: string; freeLabel?: string },
): string {
  const customLabel = opts?.customLabel ?? 'Custom';

  if (plan.monthlyIdr == null) {
    return customLabel;
  }

  if (plan.monthlyIdr === 0) {
    return opts?.freeLabel ?? 'Free';
  }

  const amount = billing === 'annual' ? plan.annualIdr : plan.monthlyIdr;
  if (amount == null) return customLabel;
  return formatIdr(amount);
}

export function planHasFixedPrice(plan: SubscriptionPlan): boolean {
  return plan.monthlyIdr != null;
}

export function formatQuotaCount(
  value: number | null,
  customLabel = 'Custom',
  locale = 'en-US',
): string {
  if (value == null) return customLabel;
  return value.toLocaleString(locale);
}

export function formatMediaStorageGb(
  value: number | null,
  customLabel = 'Custom',
  locale = 'en-US',
): string {
  if (value == null) return customLabel;
  return `${value.toLocaleString(locale)} GB`;
}

/**
 * Soft-cap usage status for a single numeric quota.
 * Used for future banners / publish gates; MVP shows policy copy only.
 */
export function getSoftCapStatus(
  used: number,
  limit: number | null,
): 'ok' | 'warn' | 'over' | 'unlimited' {
  if (limit == null || limit <= 0) return 'unlimited';
  if (used >= limit) return 'over';
  if (used / limit >= SOFT_CAP_WARN_RATIO) return 'warn';
  return 'ok';
}

/** Card highlight bullets derived from quotas (i18n resolves labels). */
export type PlanQuotaHighlightKey =
  | 'allFeatures'
  | 'retailers'
  | 'products'
  | 'salesAgents'
  | 'drivers'
  | 'orders'
  | 'support';

export function getPlanQuotaHighlights(plan: SubscriptionPlan): Array<{
  key: PlanQuotaHighlightKey;
  params?: Record<string, string | number>;
}> {
  const q = plan.quotas;
  const highlights: Array<{
    key: PlanQuotaHighlightKey;
    params?: Record<string, string | number>;
  }> = [{ key: 'allFeatures' }, { key: 'retailers', params: { band: plan.connections } }];

  if (q.marketplaceProducts != null) {
    highlights.push({ key: 'products', params: { count: q.marketplaceProducts } });
  } else {
    highlights.push({ key: 'products', params: { count: 'custom' } });
  }

  if (q.salesAgents != null) {
    highlights.push({ key: 'salesAgents', params: { count: q.salesAgents } });
  } else {
    highlights.push({ key: 'salesAgents', params: { count: 'custom' } });
  }

  if (q.drivers != null) {
    highlights.push({ key: 'drivers', params: { count: q.drivers } });
  } else {
    highlights.push({ key: 'drivers', params: { count: 'custom' } });
  }

  if (plan.id === 'enterprise') {
    highlights.push({ key: 'support' });
  } else if (q.ordersPerMonth != null) {
    highlights.push({ key: 'orders', params: { count: q.ordersPerMonth } });
  }

  return highlights;
}
