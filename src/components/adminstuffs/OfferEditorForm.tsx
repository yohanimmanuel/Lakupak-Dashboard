'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronDown, ImagePlus, Upload } from 'lucide-react';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { OFFER_ICON_OPTIONS } from '@/utils/marketplaceHomeOfferIcons';
import { OfferPreviewIcon } from '@/utils/offerPreviewIcons';
import { cssSafeUrl } from '@/utils/cssSafeUrl';

export type OfferFormValues = {
  title: string;
  subtitle: string;
  discountText: string;
  endDateText: string;
  backgroundColor: string;
  textColor: string;
  bannerImageUrl: string;
  /** Full artwork for home (Canva/Photoshop). When set, home shows this image; copy fields still show on the offer detail screen. */
  customBannerImageUrl: string;
  rightIconKey: string;
  discountIconKey: string;
  detailsBody: string;
  sortOrder: number;
  isPublished: boolean;
};

const defaultValues: OfferFormValues = {
  title: '',
  subtitle: '',
  discountText: '',
  endDateText: '',
  backgroundColor: '#0a61d7',
  textColor: '#FFFFFF',
  bannerImageUrl: '',
  customBannerImageUrl: '',
  rightIconKey: 'gift',
  discountIconKey: 'flash',
  detailsBody: '',
  sortOrder: 0,
  isPublished: false,
};

/** Ensures a valid 6-digit hex for <input type="color" />. */
function normalizeColorForPicker(hex: string | undefined, fallback: string): string {
  const tryParse = (s: string) => {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(s.trim());
    return m ? `#${m[1].toLowerCase()}` : null;
  };
  return tryParse(hex ?? '') ?? tryParse(fallback) ?? '#0a61d7';
}

const inputClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7] bg-white';
const textareaClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-black outline-none focus:ring-1 focus:ring-[#0a61d7] focus:border-[#0a61d7] resize-y bg-white';

type Props = {
  mode: 'create' | 'edit';
  offerId?: number;
  initial?: Partial<OfferFormValues> | null;
  pageTitle: string;
  pageDescription?: string;
  /** Defaults to `/admin/offers`. */
  backHref?: string;
};

export default function OfferEditorForm({
  mode,
  offerId,
  initial,
  pageTitle,
  pageDescription,
  backHref = '/admin/offers',
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<OfferFormValues>(() => ({
    ...defaultValues,
    ...(initial ?? {}),
  }));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openMenu, setOpenMenu] = useState<null | 'right' | 'discount'>(null);
  const rightMenuRef = useRef<HTMLDivElement>(null);
  const discountMenuRef = useRef<HTMLDivElement>(null);
  const customBannerFileRef = useRef<HTMLInputElement>(null);
  const [uploadingCustomBanner, setUploadingCustomBanner] = useState(false);

  useEffect(() => {
    if (initial) {
      setValues({ ...defaultValues, ...initial });
    }
  }, [initial]);

  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rightMenuRef.current?.contains(t) || discountMenuRef.current?.contains(t)) return;
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  const set =
    <K extends keyof OfferFormValues>(key: K) =>
    (x: OfferFormValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: x }));

  const payload = () => ({
    title: values.title.trim(),
    subtitle: values.subtitle.trim(),
    discountText: values.discountText.trim(),
    endDateText: values.endDateText.trim(),
    backgroundColor: normalizeColorForPicker(values.backgroundColor, '#0a61d7'),
    textColor: normalizeColorForPicker(values.textColor, '#ffffff'),
    bannerImageUrl: values.bannerImageUrl.trim() || null,
    customBannerImageUrl: values.customBannerImageUrl.trim() || null,
    rightIconKey: values.rightIconKey,
    discountIconKey: values.discountIconKey,
    detailsBody: values.detailsBody.trim(),
    sortOrder: values.sortOrder,
    isPublished: values.isPublished,
  });

  const save = async () => {
    if (values.title.trim().length < 2) {
      alert('Title is required (at least 2 characters).');
      return;
    }
    setSaving(true);
    try {
      const body = payload();
      if (mode === 'create') {
        const r = await fetch('/api/platform-admin/offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          alert((j as { error?: string }).error || 'Failed to create');
          return;
        }
      } else if (offerId != null) {
        const r = await fetch(`/api/platform-admin/offers/${offerId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          alert((j as { error?: string }).error || 'Failed to save');
          return;
        }
      }
      router.push('/admin/offers');
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (mode !== 'edit' || offerId == null) return;
    if (!confirm('Delete this offer? The home banner will update for all users.')) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/platform-admin/offers/${offerId}`, { method: 'DELETE' });
      if (!r.ok) {
        alert('Failed to delete');
        return;
      }
      router.push('/admin/offers');
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  const bgPicker = normalizeColorForPicker(values.backgroundColor, '#0a61d7');
  const textPicker = normalizeColorForPicker(values.textColor, '#ffffff');
  const heroPreviewUrlCss = cssSafeUrl(values.bannerImageUrl);

  const uploadCustomBanner = async (file: File) => {
    setUploadingCustomBanner(true);
    try {
      const result = await uploadToCloudinaryDirect(file, 'marketplace-home-offers');
      if (!result.success || !result.url) throw new Error(result.error || 'Upload failed');
      set('customBannerImageUrl')(result.url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingCustomBanner(false);
      if (customBannerFileRef.current) customBannerFileRef.current.value = '';
    }
  };

  const useCustomHomeBanner = values.customBannerImageUrl.trim().length > 0;

  useEffect(() => {
    if (useCustomHomeBanner) setOpenMenu(null);
  }, [useCustomHomeBanner]);

  const renderIconMenu = (which: 'right' | 'discount', menuDisabled?: boolean) => {
    const current = which === 'right' ? values.rightIconKey : values.discountIconKey;
    const setKey = which === 'right' ? set('rightIconKey') : set('discountIconKey');
    const ref = which === 'right' ? rightMenuRef : discountMenuRef;
    const open = openMenu === which && !menuDisabled;

    return (
      <div className={`relative ${menuDisabled ? 'opacity-50' : ''}`} ref={ref}>
        <span className="text-xs font-medium text-gray-700">
          {which === 'right' ? 'Large right icon' : 'Icon in discount pill'}
        </span>
        <button
          type="button"
          disabled={menuDisabled}
          className="mt-1 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-50 text-xs disabled:pointer-events-none disabled:cursor-not-allowed"
          onClick={() => setOpenMenu((m) => (m === which ? null : which))}
        >
          <span className="truncate">{OFFER_ICON_OPTIONS.find((o) => o.value === current)?.label ?? 'Select'}</span>
          <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        </button>
        {open ? (
          <div className="absolute right-0 mt-2 w-full bg-white border border-[#e6e6e6] rounded-lg z-20 max-h-56 overflow-y-auto">
            {OFFER_ICON_OPTIONS.map((opt) => {
              const isActive = opt.value === current;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setKey(opt.value);
                    setOpenMenu(null);
                  }}
                  className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between ${
                    isActive ? 'bg-[#0a61d7] text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isActive ? <Check className="w-4 h-4" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="w-full mx-auto max-w-8xl bg-white rounded-lg border border-[#e6e6e6]">
      {/* Header — back + title only; actions are in the footer */}
      <div className="flex items-center gap-4 min-w-0 flex-wrap p-4 border-b border-[#e6e6e6]">
        <Link
          href={backHref}
          className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors shrink-0 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to offers
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 truncate">{pageTitle}</h1>
      </div>

      {pageDescription ? (
        <div className="px-4 py-3 bg-gray-50 border-b border-[#e6e6e6]">
          <p className="text-sm text-gray-600">{pageDescription}</p>
        </div>
      ) : null}

      <div className="p-4 space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Banner copy</h2>
          <p className="text-xs text-gray-600 mt-1">
            These fields map to the Marketplace home card: main headline, supporting line, pill label, and urgency line
            (e.g. “Ends Sunday”). Keep the title short and clear.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">Title *</span>
          <input
            className={inputClass}
            value={values.title}
            onChange={(e) => set('title')(e.target.value)}
            placeholder="e.g. Weekend stock-up sale"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">Subtitle</span>
          <input
            className={inputClass}
            value={values.subtitle}
            onChange={(e) => set('subtitle')(e.target.value)}
            placeholder="Short supporting line under the title"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">Discount / promo label</span>
          <input
            className={inputClass}
            value={values.discountText}
            onChange={(e) => set('discountText')(e.target.value)}
            placeholder="Shown in the white pill (e.g. Up to 30% off)"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">Urgency / end line</span>
          <input
            className={inputClass}
            value={values.endDateText}
            onChange={(e) => set('endDateText')(e.target.value)}
            placeholder="e.g. Ends 12 Apr · Free shipping over Rp500k"
          />
        </label>
      </section>

      <section className="space-y-4 border-t border-[#e6e6e6] pt-8">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Look &amp; feel</h2>
          <p className="text-xs text-gray-600 mt-1">
            Choose how the offer appears on <strong>Marketplace home</strong>: either upload a full-width custom
            graphic, or use the built-in template (colors, optional hero image, icons). When a custom home image is set,
            template options are turned off for home, they still apply if you remove the image later. Banner copy above
            and detail text below are always used on the <strong>offer detail</strong> screen.
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-900 flex items-center gap-2">
                <ImagePlus className="w-4 h-4 text-gray-600" />
                Custom home banner image (optional)
              </p>
              <p className="text-[11px] text-gray-600 mt-1">
                PNG / JPG / WebP / GIF, wide banner (e.g. 1200×400). Home shows only this image; tap opens the offer.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {values.customBannerImageUrl ? (
                <button
                  type="button"
                  onClick={() => set('customBannerImageUrl')('')}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  disabled={uploadingCustomBanner}
                >
                  Remove image
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => customBannerFileRef.current?.click()}
                disabled={uploadingCustomBanner}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0a61d7] text-white text-xs font-medium hover:bg-[#084ba6] disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {uploadingCustomBanner ? 'Uploading…' : 'Upload'}
              </button>
              <input
                ref={customBannerFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadCustomBanner(f);
                }}
              />
            </div>
          </div>
          {values.customBannerImageUrl.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={values.customBannerImageUrl.trim()}
              alt="Custom banner preview"
              className="mt-3 w-full max-h-48 object-contain rounded-lg border border-gray-200 bg-gray-50"
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-xs font-semibold text-gray-900">Built-in template (home)</h3>
              <p className="text-[11px] text-gray-600 mt-0.5">
                Colors tint the card and overlay an optional hero image. Icons match the Marketplace app.
              </p>
            </div>
            {useCustomHomeBanner ? (
              <span className="text-[11px] font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 shrink-0">
                Template disabled, remove custom image to edit
              </span>
            ) : null}
          </div>

          <div
            className={`space-y-4 rounded-lg border border-[#e6e6e6] p-4 transition-opacity ${
              useCustomHomeBanner ? 'opacity-40 pointer-events-none select-none' : ''
            }`}
            aria-disabled={useCustomHomeBanner}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-medium text-gray-700">Background color</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="color"
                    value={bgPicker}
                    onChange={(e) => set('backgroundColor')(e.target.value)}
                    disabled={useCustomHomeBanner}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-[#e6e6e6] bg-white p-1 disabled:cursor-not-allowed"
                    aria-label="Background color"
                  />
                  <p className="text-[11px] text-gray-500 leading-snug">Banner tint (and over hero images).</p>
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-xs font-medium text-gray-700">Text color</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="color"
                    value={textPicker}
                    onChange={(e) => set('textColor')(e.target.value)}
                    disabled={useCustomHomeBanner}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-[#e6e6e6] bg-white p-1 disabled:cursor-not-allowed"
                    aria-label="Text color"
                  />
                  <p className="text-[11px] text-gray-500 leading-snug">Headline and body on the banner.</p>
                </div>
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-700">Optional hero image URL (HTTPS)</span>
              <input
                className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-500`}
                value={values.bannerImageUrl}
                onChange={(e) => set('bannerImageUrl')(e.target.value)}
                disabled={useCustomHomeBanner}
                placeholder="https://… (shown behind text with a color tint for readability)"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {renderIconMenu('right', useCustomHomeBanner)}
              {renderIconMenu('discount', useCustomHomeBanner)}
            </div>

            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Preview (built-in layout)</p>
              <div
                className="rounded-lg border border-[#e6e6e6] overflow-hidden min-h-[100px]"
                style={{
                  background: heroPreviewUrlCss
                    ? `linear-gradient(0deg, ${bgPicker}e6, ${bgPicker}e6), ${heroPreviewUrlCss} center/cover`
                    : bgPicker,
                }}
              >
                {/* Mirrors Marketplace SaleBanner: left copy + discount pill (icon + text); right large icon + urgency below */}
                <div className="flex flex-row items-center p-5 gap-2" style={{ color: textPicker }}>
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-bold text-xl leading-tight line-clamp-2 mb-1">
                      {values.title || 'Title preview'}
                    </p>
                    <p className="text-sm font-semibold opacity-90 line-clamp-2 mb-3">
                      {values.subtitle || 'Subtitle preview'}
                    </p>
                    <div className="mt-1">
                      <span className="inline-flex flex-row items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold">
                        <OfferPreviewIcon
                          iconKey={values.discountIconKey}
                          fallbackKey="flash"
                          size={16}
                          style={{ color: bgPicker }}
                        />
                        <span style={{ color: bgPicker }}>{values.discountText || 'Promo'}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center shrink-0 w-[72px]">
                    <div
                      className="w-[60px] h-[60px] rounded-full flex items-center justify-center mb-2"
                      style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                    >
                      <OfferPreviewIcon
                        iconKey={values.rightIconKey}
                        fallbackKey="gift"
                        size={32}
                        style={{ color: textPicker }}
                      />
                    </div>
                    {values.endDateText.trim() ? (
                      <span className="text-xs font-semibold text-center opacity-90 leading-tight px-0.5">
                        {values.endDateText}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-[#e6e6e6] pt-8">
        <h2 className="text-sm font-semibold text-gray-900">Publishing &amp; detail page</h2>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">Sort order (lower = chosen first)</span>
          <input
            type="number"
            className={`${inputClass} max-w-[200px]`}
            value={values.sortOrder}
            onChange={(e) => set('sortOrder')(Number(e.target.value) || 0)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">Full detail text (after tap)</span>
          <textarea
            className={textareaClass}
            rows={6}
            value={values.detailsBody}
            onChange={(e) => set('detailsBody')(e.target.value)}
            placeholder="Terms, categories on sale, how to redeem, etc."
          />
        </label>

        <button
          type="button"
          onClick={() => set('isPublished')(!values.isPublished)}
          className="w-full flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-gray-900">Published</p>
            <p className="text-xs text-gray-600 mt-0.5">
              When on, this offer can appear on Marketplace home (first by sort order wins).
            </p>
          </div>
          <div
            className={`w-5 h-5 border-2 rounded flex items-center justify-center shrink-0 transition-all ${
              values.isPublished ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
            }`}
            aria-hidden="true"
          >
            {values.isPublished ? <Check className="w-4 h-4 text-white" /> : null}
          </div>
        </button>
      </section>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 p-4 bg-white">
        <button
          type="button"
          disabled={saving}
          onClick={() => router.push(backHref)}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 border border-gray-300 text-sm font-medium bg-white"
        >
          Cancel
        </button>
        {mode === 'edit' && offerId != null ? (
          <button
            type="button"
            disabled={deleting || saving}
            onClick={() => void remove()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 bg-white"
          >
            {deleting ? 'Deleting…' : 'Delete offer'}
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving || deleting}
          onClick={() => void save()}
          className="flex items-center gap-2 px-4 py-2 font-semibold bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors disabled:opacity-50 text-sm"
        >
          {saving ? 'Saving…' : mode === 'create' ? 'Create offer' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
