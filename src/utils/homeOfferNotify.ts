import {
  broadcastPlatformAnnouncementPublished,
  broadcastPlatformAnnouncementUnpublished,
} from '@/utils/websocketBroadcast';
import { sendExpoPushToAllMarketplaceUsers } from '@/utils/expoPush';
import {
  buildHomeOfferSummaryBody,
  mapHomeOfferToLatestUpdateBroadcast,
  marketplaceHomeOfferToLatestUpdateId,
  type HomeOfferFields,
} from '@/utils/homeOfferLatestUpdate';

/**
 * When a home offer is published: WebSocket + Expo push, same pipeline as {@link notifyMarketplacePublishedAnnouncement}.
 * Title/body come from admin-edited offer fields (not hardcoded).
 */
export async function notifyMarketplacePublishedHomeOffer(offer: HomeOfferFields): Promise<void> {
  const a = mapHomeOfferToLatestUpdateBroadcast(offer);
  await broadcastPlatformAnnouncementPublished(a);
  const preview = buildHomeOfferSummaryBody(offer);
  const pushBody =
    preview.length > 160 ? `${preview.slice(0, 157)}…` : preview || 'New update from Lakupak';
  await sendExpoPushToAllMarketplaceUsers(offer.title, pushBody, {
    type: 'promotion',
    announcementId: String(marketplaceHomeOfferToLatestUpdateId(offer.id)),
  });
}

export async function notifyMarketplaceUnpublishedHomeOffer(offerId: number): Promise<void> {
  await broadcastPlatformAnnouncementUnpublished(marketplaceHomeOfferToLatestUpdateId(offerId));
}
