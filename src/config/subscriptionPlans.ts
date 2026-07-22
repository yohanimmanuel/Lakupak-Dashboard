export type SubscriptionPlanId = 'starter' | 'growth' | 'scale' | 'enterprise';

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
};

/** Canvas pricing model — shared by landing pricing + Settings billing. */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'starter',
    connections: '1 – 1,000',
    monthlyIdr: 999_000,
    annualIdr: 9_990_000,
  },
  {
    id: 'growth',
    connections: '1,000 – 5,000',
    monthlyIdr: 2_990_000,
    annualIdr: 29_900_000,
    popular: true,
  },
  {
    id: 'scale',
    connections: '5,000 – 10,000',
    monthlyIdr: 6_990_000,
    annualIdr: 69_900_000,
  },
  {
    id: 'enterprise',
    connections: '10,000+',
    monthlyIdr: null,
    annualIdr: null,
    fromMonthlyIdr: 12_900_000,
  },
];

/** Annual billing ≈ 17% off vs 12× monthly (pay 10 months). */
export const ANNUAL_SAVINGS_PERCENT = 17;

export function formatIdr(amount: number): string {
  return `Rp ${amount.toLocaleString('en-US')}`;
}

export function getPlanById(id: SubscriptionPlanId): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id);
}

export function formatPlanPrice(
  plan: SubscriptionPlan,
  billing: 'monthly' | 'annual',
  opts?: { customLabel?: string; fromPrefix?: string },
): string {
  const customLabel = opts?.customLabel ?? 'Custom';

  if (plan.monthlyIdr == null) {
    return customLabel;
  }

  const amount = billing === 'annual' ? plan.annualIdr : plan.monthlyIdr;
  if (amount == null) return customLabel;
  return formatIdr(amount);
}

export function planHasFixedPrice(plan: SubscriptionPlan): boolean {
  return plan.monthlyIdr != null;
}
