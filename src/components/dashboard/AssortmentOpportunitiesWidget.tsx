'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

type AnalysisMetric = { label: string; value: string; hint: string };
type AnalysisCard = {
  title: string;
  body: string;
  points?: string[];
  kind: string;
  metricValue: string;
  metricLabel: string;
};

const MAX_POINTS = 2;

function analysisKindClass(kind: string): string {
  if (kind === 'coPurchase') return 'bg-violet-100 text-violet-700';
  if (kind === 'segmentFit') return 'bg-emerald-100 text-emerald-700';
  if (kind === 'purchasingActivity') return 'bg-amber-100 text-amber-700';
  if (kind === 'priceSuitability') return 'bg-sky-100 text-sky-700';
  return 'bg-blue-100 text-blue-700';
}

export default function AssortmentOpportunitiesWidget() {
  const t = useTranslations('dashboard.home.widgets.opportunities');
  const locale = useLocale();
  const [metrics, setMetrics] = useState<AnalysisMetric[]>([]);
  const [cards, setCards] = useState<AnalysisCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/products/opportunities/analysis?locale=${encodeURIComponent(locale)}`,
          { credentials: 'include' },
        );
        if (!response.ok) throw new Error('analysis failed');
        const payload = (await response.json()) as {
          cards?: AnalysisCard[];
          metrics?: AnalysisMetric[];
        };
        if (cancelled) return;
        // Keep only the opportunity-focused stats for the compact home widget.
        setMetrics((payload.metrics ?? []).slice(2, 4));
        setCards(payload.cards ?? []);
      } catch {
        if (cancelled) return;
        setMetrics([]);
        setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-6">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-[#0a61d7] border-t-transparent" />
        <p className="text-sm text-gray-600">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <p className="mb-3 text-xs leading-5 text-gray-500">{t('summary')}</p>

      {metrics.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-[#e6e6e6] bg-[#fbfcfe] px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{metric.label}</p>
              <p className="mt-1 text-2xl font-bold leading-none text-black">{metric.value}</p>
              <p className="mt-1 text-[11px] text-gray-500">{metric.hint}</p>
            </div>
          ))}
        </div>
      ) : null}

      <h3 className="mt-4 text-sm font-semibold text-black">{t('signalTitle')}</h3>

      {cards.length > 0 ? (
        <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
          {cards.map((card) => {
            const points = (card.points && card.points.length > 0
              ? card.points
              : (card.body ?? '').split(/(?<=\.)\s+/)
            )
              .filter(Boolean)
              .slice(0, MAX_POINTS);
            return (
              <article
                key={`${card.kind}-${card.title}`}
                className="flex min-h-40 w-[17rem] shrink-0 snap-start flex-col rounded-lg border border-[#e6e6e6] bg-white p-3"
              >
                <h4 className="min-w-0 truncate text-sm font-semibold text-black">{card.title}</h4>
                <div className="mt-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${analysisKindClass(card.kind)}`}>
                    {t.has(`kinds.${card.kind}` as 'kinds.categoryAffinity')
                      ? t(`kinds.${card.kind}` as 'kinds.categoryAffinity')
                      : card.kind}
                  </span>
                </div>
                <p className="mt-2 text-xl font-bold leading-none text-black">{card.metricValue}</p>
                <p className="mt-1 text-[11px] text-gray-500">{card.metricLabel}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-gray-600">
                  {points.map((point) => (
                    <li key={point}>{point.replace(/\.$/, '')}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-[#fbfcfe] px-4 py-6 text-center">
          <p className="text-sm font-semibold text-gray-600">{t('emptyTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('emptyHint')}</p>
        </div>
      )}
    </div>
  );
}
