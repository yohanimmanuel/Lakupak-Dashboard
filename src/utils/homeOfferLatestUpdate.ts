import type { PlatformAnnouncementBroadcastPayload } from '@/utils/websocketBroadcast';

/** Negative ids distinguish home offers from `PlatformAnnouncement` rows in the merged “Latest updates” feed. */
export function marketplaceHomeOfferToLatestUpdateId(offerId: number): number {
  if (offerId === 0) {
    throw new Error('offerId must be non-zero');
  }
  return -Math.abs(offerId);
}

export function latestUpdateIdToHomeOfferId(id: number): number | null {
  if (!Number.isInteger(id) || id >= 0) return null;
  return -id;
}

export type HomeOfferFields = {
  id: number;
  title: string;
  subtitle: string;
  detailsBody: string;
  discountText: string;
  endDateText: string;
  bannerImageUrl: string | null;
  customBannerImageUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
};

/** Short copy for list rows, push preview, and WebSocket payload (admin-authored). */
export function buildHomeOfferSummaryBody(o: HomeOfferFields): string {
  const sub = (o.subtitle ?? '').trim();
  if (sub.length > 0) return sub;
  const details = (o.detailsBody ?? '').trim();
  if (details.length > 0) {
    const oneLine = details.replace(/\s+/g, ' ');
    return oneLine.length > 280 ? `${oneLine.slice(0, 277)}…` : oneLine;
  }
  const bits = [o.discountText, o.endDateText].map((s) => (s ?? '').trim()).filter(Boolean);
  return bits.join(' · ') || o.title;
}

/** Full detail body for the latest-update detail screen (admin “details” field). */
export function buildHomeOfferDetailBody(o: HomeOfferFields): string {
  const details = (o.detailsBody ?? '').trim();
  if (details.length > 0) return details;
  return buildHomeOfferSummaryBody(o);
}

/** Same shape as platform announcements so Marketplace reuses realtime + notifications UI. */
export function mapHomeOfferToLatestUpdateBroadcast(o: HomeOfferFields): PlatformAnnouncementBroadcastPayload {
  const id = marketplaceHomeOfferToLatestUpdateId(o.id);
  return {
    id,
    title: o.title,
    body: buildHomeOfferSummaryBody(o),
    category: 'promotion',
    imageUrl: o.bannerImageUrl ?? o.customBannerImageUrl ?? null,
    linkUrl: null,
    publishedAt: o.publishedAt ? o.publishedAt.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
  };
}

export function mapHomeOfferToLatestUpdatePublic(
  o: HomeOfferFields,
  mode: 'list' | 'detail',
): {
  id: number;
  title: string;
  body: string;
  category: string;
  imageUrl: string | null;
  linkUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
} {
  const base = mapHomeOfferToLatestUpdateBroadcast(o);
  const body = mode === 'detail' ? buildHomeOfferDetailBody(o) : base.body;
  return {
    ...base,
    body,
  };
}
