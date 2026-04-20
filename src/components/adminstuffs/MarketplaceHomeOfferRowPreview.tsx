'use client';

import { OfferPreviewIcon } from '@/utils/offerPreviewIcons';
import { cssSafeUrl } from '@/utils/cssSafeUrl';

/** Fields needed to render the mini banner (matches Marketplace SaleBanner layout). */
export type MarketplaceHomeOfferPreviewRow = {
  title: string;
  subtitle: string;
  discountText: string;
  backgroundColor: string;
  textColor: string;
  bannerImageUrl: string | null;
  customBannerImageUrl: string | null;
  rightIconKey: string;
  discountIconKey: string;
};

export function normalizeHex(hex: string | undefined, fallback: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? '').trim());
  return m ? `#${m[1].toLowerCase()}` : fallback;
}

/** Mini built-in banner (matches Marketplace SaleBanner layout) — not the “Template” placeholder. */
function OfferTemplateMiniPreview({ row }: { row: MarketplaceHomeOfferPreviewRow }) {
  const heroUrlCss = cssSafeUrl(row.bannerImageUrl);
  const bg = normalizeHex(row.backgroundColor, '#0a61d7');
  const text = normalizeHex(row.textColor, '#ffffff');
  const title = (row.title || 'Title').slice(0, 42);
  const disc = (row.discountText || 'Promo').slice(0, 18);

  return (
    <div
      className="h-12 w-[104px] rounded-md border border-[#e6e6e6] overflow-hidden flex flex-row shrink-0 relative"
      style={{
        background: heroUrlCss
          ? `linear-gradient(0deg, ${bg}e6, ${bg}e6), ${heroUrlCss} center/cover`
          : bg,
      }}
    >
      <div className="flex-1 min-w-0 pl-1 pr-0.5 py-0.5 flex flex-col justify-center z-[1]">
        <p className="text-[7px] font-bold leading-tight line-clamp-2" style={{ color: text }}>
          {title}
        </p>
        <div className="mt-0.5 flex items-center min-h-0">
          <span className="inline-flex items-center gap-0.5 rounded-full bg-white/90 px-1 py-0.5 max-w-[62px]">
            <OfferPreviewIcon
              iconKey={row.discountIconKey}
              fallbackKey="flash"
              size={7}
              style={{ color: bg }}
            />
            <span className="text-[6px] font-bold truncate" style={{ color: bg }}>
              {disc}
            </span>
          </span>
        </div>
      </div>
      <div className="w-[26px] shrink-0 flex flex-col items-center justify-center z-[1]">
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}
        >
          <OfferPreviewIcon
            iconKey={row.rightIconKey}
            fallbackKey="gift"
            size={11}
            style={{ color: text }}
          />
        </div>
      </div>
    </div>
  );
}

export function MarketplaceHomeOfferRowPreview({ row }: { row: MarketplaceHomeOfferPreviewRow }) {
  const custom = row.customBannerImageUrl?.trim();
  if (custom) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={custom}
        alt=""
        className="h-12 w-[104px] object-cover rounded-md border border-[#e6e6e6] bg-gray-50 shrink-0"
      />
    );
  }
  return <OfferTemplateMiniPreview row={row} />;
}
