'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import OfferEditorForm, { type OfferFormValues } from '@/components/adminstuffs/OfferEditorForm';

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
        const r = await fetch(`/api/platform-admin/offers/${offerId}`);
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
      <div className="w-full mx-auto max-w-8xl bg-white rounded-lg border border-[#e6e6e6]">
        <div className="flex items-center gap-4 p-4 border-b border-[#e6e6e6]">
          <Link
            href="/admin/offers"
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to offers
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Edit offer</h1>
        </div>
        <div className="px-4 py-3 bg-gray-50 border-b border-[#e6e6e6]">
          <p className="text-sm text-gray-600">Update banner copy, visuals, and publishing.</p>
        </div>
        <div className="p-8 text-sm text-gray-600 text-center">Loading…</div>
      </div>
    );
  }

  if (loadError || !initial) {
    return (
      <div className="w-full mx-auto max-w-8xl bg-white rounded-lg border border-[#e6e6e6]">
        <div className="flex items-center gap-4 p-4 border-b border-[#e6e6e6]">
          <Link
            href="/admin/offers"
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to offers
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Edit offer</h1>
        </div>
        <div className="p-8 text-sm text-red-600 text-center">{loadError ?? 'Offer not found.'}</div>
      </div>
    );
  }

  return (
    <OfferEditorForm
      mode="edit"
      offerId={offerId}
      initial={initial}
      pageTitle="Edit offer"
      pageDescription="Update banner copy, visuals, and publishing."
    />
  );
}
