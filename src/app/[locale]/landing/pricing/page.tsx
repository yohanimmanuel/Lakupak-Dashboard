'use client';

import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Store,
  TrendingUp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePagePerformanceTracking, createTrackConversion, createErrorBoundary } from '@/utils/landing-enhancements';
import {
  ANNUAL_SAVINGS_PERCENT,
  PLAN_QUOTA_COMPARISON_KEYS,
  SUBSCRIPTION_PLANS,
  formatMediaStorageGb,
  formatPlanPrice,
  formatQuotaCount,
  getPlanQuotaHighlights,
  planHasFixedPrice,
  type PlanQuotaHighlightKey,
  type PlanSupportTier,
  type SubscriptionPlanId,
} from '@/config/subscriptionPlans';

const ErrorBoundary = createErrorBoundary('Pricing');

const PLAN_ICONS: Record<SubscriptionPlanId, ReactNode> = {
  starter: <Store className="w-5 h-5 text-[#0a61d7]" />,
  growth: <TrendingUp className="w-5 h-5 text-[#0a61d7]" />,
  scale: <BarChart3 className="w-5 h-5 text-[#0a61d7]" />,
  enterprise: <Building2 className="w-5 h-5 text-[#0a61d7]" />,
};

export default function PricingPage() {
  const router = useRouter();
  const t = useTranslations('pricing');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isAnnual, setIsAnnual] = useState(false);

  usePagePerformanceTracking('Pricing');
  const trackConversion = createTrackConversion('Pricing');

  const billing = isAnnual ? 'annual' : 'monthly';
  const periodLabel = isAnnual ? t('card.perYear') : t('card.perMonth');

  const pricingTiers = SUBSCRIPTION_PLANS.map((plan) => {
    const customLabel = t('comparison.custom');
    const features = getPlanQuotaHighlights(plan).map((item) => {
      const count = item.params?.count;
      if (item.key === 'products' && count === 'custom') {
        return t('quotaBullets.productsCustom');
      }
      if (item.key === 'salesAgents' && count === 'custom') {
        return t('quotaBullets.salesAgentsCustom');
      }
      if (item.key === 'drivers' && count === 'custom') {
        return t('quotaBullets.driversCustom');
      }
      return t(`quotaBullets.${item.key}` as `quotaBullets.${PlanQuotaHighlightKey}`, item.params ?? {});
    });
    return {
      plan,
      name: t(`tiers.${plan.id}.name`),
      description: t(`tiers.${plan.id}.description`),
      features,
      priceLabel: formatPlanPrice(plan, billing, {
        customLabel: t('card.custom'),
      }),
      showPeriod: planHasFixedPrice(plan),
      isEnterprise: plan.id === 'enterprise',
      popular: Boolean(plan.popular),
    };
  });

  const comparisonRows: { key: string; values: string[] }[] = PLAN_QUOTA_COMPARISON_KEYS.map((key) => {
    const customLabel = t('comparison.custom');
    if (key === 'connections') {
      return { key, values: SUBSCRIPTION_PLANS.map((p) => p.connections) };
    }
    if (key === 'platformAccess') {
      return { key, values: SUBSCRIPTION_PLANS.map(() => t('comparison.platformAll')) };
    }
    if (key === 'support') {
      return {
        key,
        values: SUBSCRIPTION_PLANS.map((p) =>
          t(`comparison.support.${p.quotas.support}` as `comparison.support.${PlanSupportTier}`),
        ),
      };
    }
    if (key === 'mediaStorageGb') {
      return {
        key,
        values: SUBSCRIPTION_PLANS.map((p) => formatMediaStorageGb(p.quotas.mediaStorageGb, customLabel)),
      };
    }
    const quotaKey = key as Exclude<
      typeof key,
      'connections' | 'platformAccess' | 'support' | 'mediaStorageGb'
    >;
    return {
      key,
      values: SUBSCRIPTION_PLANS.map((p) => formatQuotaCount(p.quotas[quotaKey], customLabel)),
    };
  });

  const faqs = Array.from({ length: 8 }, (_, i) => ({
    question: t(`faq.${i + 1}.q`),
    answer: t(`faq.${i + 1}.a`),
  }));

  const goRegister = () => {
    trackConversion('cta_click', 'free_trial');
    router.push('/register');
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#f7f8fa]">
        {/* Hero + cards */}
        <section className="pt-16 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <span className="inline-flex items-center rounded-full border border-[#0a61d7]/25 bg-[#0a61d7]/10 px-3 py-1 text-xs font-semibold text-[#0a61d7] mb-5">
                {t('hero.badge')}
              </span>
              <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight mb-4">
                {t('hero.title')}
              </h1>
              <p className="text-base sm:text-lg text-gray-500 leading-relaxed mb-4">
                {t('hero.subtitle')}
              </p>
              <p className="text-sm font-medium text-[#0a61d7] mb-8">{t('hero.trial')}</p>

              <div className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setIsAnnual(false)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    !isAnnual ? 'bg-[#0a61d7] text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('toggle.monthly')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAnnual(true)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                    isAnnual ? 'bg-[#0a61d7] text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('toggle.annual')}
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isAnnual ? 'bg-white/20 text-white' : 'bg-[#0a61d7]/10 text-[#0a61d7]'
                    }`}
                  >
                    {t('toggle.save', { percent: ANNUAL_SAVINGS_PERCENT })}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              {pricingTiers.map((tier) => (
                <article
                  key={tier.plan.id}
                  className={`relative flex flex-col rounded-2xl bg-white pt-6 shadow-sm border transition-shadow hover:shadow-md overflow-hidden ${
                    tier.popular ? 'border-[#0a61d7] ring-1 ring-[#0a61d7]/20' : 'border-gray-200'
                  }`}
                >
                  <div className="px-6">
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[#0a61d7]/10 flex items-center justify-center">
                        {PLAN_ICONS[tier.plan.id]}
                      </div>
                      {tier.popular && (
                        <span className="rounded-full bg-[#0a61d7]/10 px-2.5 py-1 text-[11px] font-semibold text-[#0a61d7]">
                          {t('card.mostpopular')}
                        </span>
                      )}
                    </div>

                    <div className="mb-5">
                      <h3 className="text-lg font-bold text-gray-900 mb-1">{tier.name}</h3>
                      <p className="text-sm text-gray-500 leading-snug min-h-[40px]">{tier.description}</p>
                    </div>

                    <div className="mb-5">
                      <div className="flex items-baseline gap-1 whitespace-nowrap">
                        <span className="text-2xl font-bold text-gray-900 tracking-tight">{tier.priceLabel}</span>
                        {tier.showPeriod && (
                          <span className="text-sm font-medium text-gray-500">{periodLabel}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5">
                        {tier.isEnterprise ? t('card.enterpriseHint') : t('card.priceHint')}
                      </p>
                      <p className="text-xs font-medium text-gray-700 mt-2">
                        {t('card.retailersBand', { band: tier.plan.connections })}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={tier.isEnterprise ? undefined : goRegister}
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors mb-6 ${
                        tier.isEnterprise
                          ? 'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50'
                          : 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
                      }`}
                    >
                      {tier.isEnterprise ? t('card.contactSales') : t('card.getstarted')}
                      {tier.isEnterprise && <ArrowRight className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="border-t border-gray-200 px-6 pt-5 pb-6 flex-1">
                    <p className="text-sm font-semibold text-gray-900 mb-3">
                      {t('card.includes', { name: tier.name })}
                    </p>
                    <ul className="space-y-2.5">
                      {tier.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0a61d7]/10">
                            <Check className="h-2.5 w-2.5 text-[#0a61d7]" strokeWidth={3} />
                          </span>
                          <span className="text-sm text-gray-600 leading-snug">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="pb-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('comparison.title')}</h2>
              <p className="text-gray-500">{t('comparison.subtitle')}</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('comparison.featureColumn')}
                    </th>
                    {pricingTiers.map((tier) => (
                      <th key={tier.plan.id} className="px-5 py-4 text-center">
                        <div
                          className={`text-sm font-semibold mb-1 ${
                            tier.popular ? 'text-[#0a61d7]' : 'text-gray-900'
                          }`}
                        >
                          {tier.name}
                        </div>
                        <div className="text-sm font-bold text-gray-900 mb-2 whitespace-nowrap">
                          {tier.priceLabel}
                          {tier.showPeriod && (
                            <span className="text-gray-500 font-medium text-xs ml-1">{periodLabel}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={tier.isEnterprise ? undefined : goRegister}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            tier.popular
                              ? 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
                              : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {tier.isEnterprise ? t('card.contactSales') : t('card.getstarted')}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {comparisonRows.map((row) => (
                    <tr key={row.key} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3.5 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {t(`comparison.rows.${row.key}`)}
                      </td>
                      {row.values.map((value, i) => (
                        <td key={`${row.key}-${i}`} className="px-5 py-3.5 text-sm text-gray-600 text-center">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="pb-20 px-4 sm:px-6 lg:px-8 bg-white border-t border-gray-100">
          <div className="max-w-3xl mx-auto pt-16">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('faq.title')}</h2>
              <p className="text-gray-500">{t('faq.subtitle')}</p>
            </div>
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <div key={index} className="rounded-xl border border-gray-200 bg-[#f7f8fa]/50">
                  <button
                    type="button"
                    className="w-full px-5 py-4 text-left flex justify-between items-center hover:bg-gray-50 rounded-xl"
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  >
                    <h3 className="text-sm font-semibold text-gray-900 pr-4">{faq.question}</h3>
                    {openFaq === index ? (
                      <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                  {openFaq === index && (
                    <div className="px-5 pb-4">
                      <p className="text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#0a61d7] py-14 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-3">{t('cta.title')}</h2>
            <p className="text-blue-100 mb-8">{t('cta.subtitle')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={goRegister}
                className="bg-white text-[#0a61d7] px-8 py-3 rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors"
              >
                {t('cta.trial')}
              </button>
              <button
                type="button"
                className="bg-transparent text-white px-8 py-3 rounded-xl text-sm font-medium border border-white/40 hover:bg-white/10 transition-colors"
              >
                {t('cta.contact')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </ErrorBoundary>
  );
}
