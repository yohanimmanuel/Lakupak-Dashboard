'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import OfferEditorForm, { type OfferFormValues } from '@/components/offersincentivesdisc/OfferEditorForm';

function mapApiOfferToForm(o: Record<string, unknown>): Partial<OfferFormValues> {
  return {
    title: String(o.title ?? ''),
    subtitle: String(o.subtitle ?? ''),
    discountText: String(o.discountText ?? ''),
    endDateText: String(o.endDateText ?? ''),
    backgroundColor: String(o.backgroundColor ?? '#0a61d7'),
    textColor: String(o.textColor ?? '#FFFFFF'),
    bannerImageUrl: o.bannerImageUrl ? String(o.bannerImageUrl) : '',
    customBannerImageUrl: o.customBannerImageUrl ? String(o.customBannerImageUrl) : '',
    rightIconKey: String(o.rightIconKey ?? 'gift'),
    discountIconKey: String(o.discountIconKey ?? 'flash'),
    detailsBody: String(o.detailsBody ?? ''),
    sortOrder: typeof o.sortOrder === 'number' ? o.sortOrder : Number(o.sortOrder) || 0,
    isPublished: Boolean(o.isPublished),
  };
}

export default function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const offerId = Number(idStr);
  const valid = Number.isInteger(offerId) && offerId > 0;

  const [initial, setInitial] = useState<Partial<OfferFormValues> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!valid) {
      setLoading(false);
      setLoadError('Invalid offer');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/offers/campaigns/${offerId}`);
        const j = r.ok ? await r.json().catch(() => null) : null;
        if (cancelled) return;
        if (!r.ok || !j?.offer) {
          setLoadError('Could not load this offer.');
          setInitial(null);
        } else {
          setInitial(mapApiOfferToForm(j.offer as Record<string, unknown>));
        }
      } catch {
        if (!cancelled) setLoadError('Could not load this offer.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offerId, valid]);

  if (loading && valid) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="w-full rounded-lg border border-[#e6e6e6] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#e6e6e6] p-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
            <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
              <Link
                href="/offers/campaign"
                className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to campaign
              </Link>
              <h1 className="truncate text-2xl font-bold text-gray-900">Edit campaign</h1>
            </div>
          </div>
          <div className="p-8 text-center text-sm text-gray-600">Loading…</div>
        </div>
      </div>
    );
  }

  if (loadError || !initial) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="w-full rounded-lg border border-[#e6e6e6] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#e6e6e6] p-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
            <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
              <Link
                href="/offers/campaign"
                className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to campaign
              </Link>
              <h1 className="truncate text-2xl font-bold text-gray-900">Edit campaign</h1>
            </div>
          </div>
          <div className="p-8 text-center text-sm text-red-600">{loadError ?? 'Offer not found.'}</div>
        </div>
      </div>
    );
  }

  return (
    <OfferEditorForm
      mode="edit"
      offerId={offerId}
      initial={initial}
      pageTitle="Edit campaign"
      pageDescription="Update banner copy, visuals, and publishing."
    />
  );
}
