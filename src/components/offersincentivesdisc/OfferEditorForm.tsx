'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Check, CheckCircle, ChevronDown, ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { OFFER_ICON_OPTIONS } from '@/utils/marketplaceHomeOfferIcons';
import { OfferPreviewIcon } from '@/utils/offerPreviewIcons';
import { cssSafeUrl } from '@/utils/cssSafeUrl';
import {
  CAMPAIGN_DETAILS_MAX,
  CAMPAIGN_DISCOUNT_MAX,
  CAMPAIGN_END_LINE_MAX,
  CAMPAIGN_SUBTITLE_MAX,
  CAMPAIGN_TITLE_MAX,
  CAMPAIGN_TITLE_MIN,
} from '@/lib/offers/campaignFieldValidation';

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
const invalidInputClass =
  'w-full border border-red-300 rounded-lg px-3 py-2 text-xs text-black outline-none focus:ring-2 focus:ring-red-500 bg-red-50';
const invalidTextareaClass = `${invalidInputClass} resize-y`;

type Props = {
  mode: 'create' | 'edit';
  offerId?: number;
  initial?: Partial<OfferFormValues> | null;
  pageTitle: string;
  pageDescription?: string;
  /** Defaults to `/offers/campaign`. */
  backHref?: string;
  /** Defaults to `/api/offers/campaigns`. */
  apiBase?: string;
};

export default function OfferEditorForm({
  mode,
  offerId,
  initial,
  pageTitle: _pageTitle,
  pageDescription: _pageDescription,
  backHref = '/offers/campaign',
  apiBase = '/api/offers/campaigns',
}: Props) {
  const router = useRouter();
  const t = useTranslations('dashboard.offers.campaign');
  const [values, setValues] = useState<OfferFormValues>(() => ({
    ...defaultValues,
    ...(initial ?? {}),
  }));
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveMode, setSaveMode] = useState<null | 'draft' | 'publish'>(null);
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
    (x: OfferFormValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: x }));
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };

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

  const collectCampaignErrors = () => {
    const errors: Record<string, string> = {};
    const title = values.title.trim();
    if (title.length === 0) errors.title = t('requiredTitle');
    else if (title.length < CAMPAIGN_TITLE_MIN) errors.title = t('shortTitle');
    else if (title.length > CAMPAIGN_TITLE_MAX) errors.title = t('longTitle');
    if (values.subtitle.trim().length > CAMPAIGN_SUBTITLE_MAX) errors.subtitle = t('longSubtitle');
    if (values.discountText.trim().length > CAMPAIGN_DISCOUNT_MAX) errors.discountText = t('longDiscount');
    if (values.endDateText.trim().length > CAMPAIGN_END_LINE_MAX) errors.endDateText = t('longUrgency');
    if (values.detailsBody.trim().length > CAMPAIGN_DETAILS_MAX) errors.detailsBody = t('longDetails');
    return errors;
  };

  const applyServerFieldError = (message: string) => {
    const known: Array<[string, string]> = [
      ['Title is required', 'title'],
      ['Title must be at least 2 characters', 'title'],
      ['Title is too long.', 'title'],
      ['Subtitle is too long.', 'subtitle'],
      ['Discount label is too long.', 'discountText'],
      ['Urgency line is too long.', 'endDateText'],
      ['Detail text is too long.', 'detailsBody'],
      ['Details are too long.', 'detailsBody'],
    ];
    const match = known.find(([text]) => message.includes(text));
    if (!match) return false;
    setFieldErrors({ [match[1]]: message });
    return true;
  };

  const save = async (publish: boolean) => {
    const errors = collectCampaignErrors();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    if (mode === 'edit' && offerId == null) {
      alert(t('saveFailed'));
      return;
    }
    setSaving(true);
    setSaveMode(publish ? 'publish' : 'draft');
    try {
      const body = { ...payload(), isPublished: publish };
      const r = await fetch(mode === 'create' ? apiBase : `${apiBase}/${offerId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const message = (j as { error?: string }).error || (mode === 'create' ? t('createFailed') : t('saveFailed'));
        if (!applyServerFieldError(message)) alert(message);
        return;
      }
      router.push(backHref);
      router.refresh();
    } finally {
      setSaving(false);
      setSaveMode(null);
    }
  };

  // Change publication status without submitting unsaved campaign form fields.
  const handleUnpublish = async () => {
    if (mode !== 'edit' || offerId == null || !values.isPublished || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`${apiBase}/${offerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: false }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        alert((result as { error?: string }).error || t('unpublishFailed'));
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : t('unpublishFailed'));
    } finally {
      setSaving(false);
    }
  };

  const bgPicker = normalizeColorForPicker(values.backgroundColor, '#0a61d7');
  const textPicker = normalizeColorForPicker(values.textColor, '#ffffff');
  const heroPreviewUrlCss = cssSafeUrl(values.bannerImageUrl);

  const uploadCustomBanner = async (file: File) => {
    setUploadingCustomBanner(true);
    try {
      const result = await uploadToCloudinaryDirect(file, 'marketplace-home-offers');
      if (!result.success || !result.url) throw new Error(result.error || t('uploadFailed'));
      set('customBannerImageUrl')(result.url);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('uploadFailed'));
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
          {which === 'right' ? t('rightIcon') : t('discountIcon')}
        </span>
        <button
          type="button"
          disabled={menuDisabled}
          className="mt-1 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[#e6e6e6] bg-white text-gray-700 hover:bg-gray-50 text-xs disabled:pointer-events-none disabled:cursor-not-allowed"
          onClick={() => setOpenMenu((m) => (m === which ? null : which))}
        >
          <span className="truncate">{OFFER_ICON_OPTIONS.find((o) => o.value === current)?.label ?? t('select')}</span>
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
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6]">
      <div className="flex flex-col gap-3 border-b border-[#e6e6e6] p-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to campaign
          </button>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-bold text-gray-900">{mode === 'create' ? t('newTitle') : t('editTitle')}</h1>
          </div>
        </div>
        {mode === 'edit' && values.isPublished && (
          <button
            type="button"
            onClick={() => void handleUnpublish()}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            {saving ? t('unpublishing') : t('unpublish')}
          </button>
        )}
      </div>
      {pageDescription ? (
        <div className="px-4 py-3 bg-gray-50 border-b border-[#e6e6e6]">
          <p className="text-sm text-gray-600">{mode === 'create' ? t('newDescription') : t('editDescription')}</p>
        </div>
      ) : null}
      <div className="space-y-8 p-4">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('bannerCopy')}</h2>
          <p className="text-xs text-gray-600 mt-1">
            {t('bannerCopyHint')}
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">
            {t('title')}<span className="text-red-500 ml-1">*</span>
          </span>
          <input
            className={fieldErrors.title ? invalidInputClass : inputClass}
            value={values.title}
            maxLength={CAMPAIGN_TITLE_MAX}
            onChange={(e) => set('title')(e.target.value)}
            placeholder={t('titlePlaceholder')}
            aria-invalid={fieldErrors.title ? true : undefined}
          />
          {fieldErrors.title ? <p className="text-red-500 text-xs mt-1">{fieldErrors.title}</p> : null}
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">{t('subtitle')}</span>
          <input
            className={fieldErrors.subtitle ? invalidInputClass : inputClass}
            value={values.subtitle}
            maxLength={CAMPAIGN_SUBTITLE_MAX}
            onChange={(e) => set('subtitle')(e.target.value)}
            placeholder={t('subtitlePlaceholder')}
            aria-invalid={fieldErrors.subtitle ? true : undefined}
          />
          {fieldErrors.subtitle ? <p className="text-red-500 text-xs mt-1">{fieldErrors.subtitle}</p> : null}
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">{t('discountLabel')}</span>
          <input
            className={fieldErrors.discountText ? invalidInputClass : inputClass}
            value={values.discountText}
            maxLength={CAMPAIGN_DISCOUNT_MAX}
            onChange={(e) => set('discountText')(e.target.value)}
            placeholder={t('discountPlaceholder')}
            aria-invalid={fieldErrors.discountText ? true : undefined}
          />
          {fieldErrors.discountText ? <p className="text-red-500 text-xs mt-1">{fieldErrors.discountText}</p> : null}
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">{t('urgency')}</span>
          <input
            className={fieldErrors.endDateText ? invalidInputClass : inputClass}
            value={values.endDateText}
            maxLength={CAMPAIGN_END_LINE_MAX}
            onChange={(e) => set('endDateText')(e.target.value)}
            placeholder={t('urgencyPlaceholder')}
            aria-invalid={fieldErrors.endDateText ? true : undefined}
          />
          {fieldErrors.endDateText ? <p className="text-red-500 text-xs mt-1">{fieldErrors.endDateText}</p> : null}
        </label>
      </section>

      <section className="space-y-4 border-t border-[#e6e6e6] pt-8">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('lookFeel')}</h2>
          <p className="text-xs text-gray-600 mt-1">
            {t('lookFeelHint')}
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
                {t('customBannerHint')}
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
                className="inline-flex items-center gap-2 rounded-lg bg-[#0a61d7] px-3 py-2 text-xs font-medium text-white hover:bg-[#084ba6] disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {uploadingCustomBanner ? t('uploading') : t('uploadImage')}
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
              alt={t('customBannerPreview')}
              className="mt-3 w-full max-h-48 object-contain rounded-lg border border-gray-200 bg-gray-50"
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-xs font-semibold text-gray-900">{t('builtIn')}</h3>
              <p className="text-[11px] text-gray-600 mt-0.5">
                {t('builtInHint')}
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
                <span className="text-xs font-medium text-gray-700">{t('background')}</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="color"
                    value={bgPicker}
                    onChange={(e) => set('backgroundColor')(e.target.value)}
                    disabled={useCustomHomeBanner}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-[#e6e6e6] bg-white p-1 disabled:cursor-not-allowed"
                    aria-label={t('background')}
                  />
                  <p className="text-[11px] text-gray-500 leading-snug">{t('backgroundHint')}</p>
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-xs font-medium text-gray-700">{t('textColor')}</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="color"
                    value={textPicker}
                    onChange={(e) => set('textColor')(e.target.value)}
                    disabled={useCustomHomeBanner}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-[#e6e6e6] bg-white p-1 disabled:cursor-not-allowed"
                    aria-label={t('textColor')}
                  />
                  <p className="text-[11px] text-gray-500 leading-snug">{t('textColorHint')}</p>
                </div>
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-700">{t('heroUrl')}</span>
              <input
                className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-500`}
                value={values.bannerImageUrl}
                onChange={(e) => set('bannerImageUrl')(e.target.value)}
                disabled={useCustomHomeBanner}
                placeholder={t('heroPlaceholder')}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {renderIconMenu('right', useCustomHomeBanner)}
              {renderIconMenu('discount', useCustomHomeBanner)}
            </div>

            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">{t('preview')}</p>
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
                      {values.title || t('titlePreview')}
                    </p>
                    <p className="text-sm font-semibold opacity-90 line-clamp-2 mb-3">
                      {values.subtitle || t('subtitlePreview')}
                    </p>
                    <div className="mt-1">
                      <span className="inline-flex flex-row items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold">
                        <OfferPreviewIcon
                          iconKey={values.discountIconKey}
                          fallbackKey="flash"
                          size={16}
                          style={{ color: bgPicker }}
                        />
                        <span style={{ color: bgPicker }}>{values.discountText || t('promoPreview')}</span>
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
        <h2 className="text-sm font-semibold text-gray-900">{t('detailPage')}</h2>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">{t('sortOrder')}</span>
          <input
            type="number"
            className={`${inputClass} max-w-[200px]`}
            value={values.sortOrder}
            onChange={(e) => set('sortOrder')(Number(e.target.value) || 0)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">{t('details')}</span>
          <textarea
            className={fieldErrors.detailsBody ? invalidTextareaClass : textareaClass}
            rows={6}
            maxLength={CAMPAIGN_DETAILS_MAX}
            value={values.detailsBody}
            onChange={(e) => set('detailsBody')(e.target.value)}
            placeholder={t('detailsPlaceholder')}
            aria-invalid={fieldErrors.detailsBody ? true : undefined}
          />
          {fieldErrors.detailsBody ? <p className="text-red-500 text-xs mt-1">{fieldErrors.detailsBody}</p> : null}
        </label>

      </section>
      </div>
      <div className="sticky bottom-0 z-20 flex justify-end border-t border-[#e6e6e6] bg-white p-4">
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          <button
            type="button"
            onClick={() => void save(false)}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#0a61d7] bg-white px-4 py-2 text-sm font-semibold text-[#0a61d7] transition hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-gray-100 @4xl/main:w-auto"
          >
            {saveMode === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saveMode === 'draft' ? t('saving') : t('saveDraft')}
          </button>
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#084ba6] disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
          >
            {saveMode === 'publish' ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving…
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Save and publish
              </>
            )}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
