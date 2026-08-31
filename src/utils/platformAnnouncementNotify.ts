import {
  broadcastPlatformAnnouncementPublished,
  broadcastPlatformAnnouncementUnpublished,
  type PlatformAnnouncementBroadcastPayload,
} from '@/utils/websocketBroadcast';
import { sendExpoPushToAllMarketplaceUsers } from '@/utils/expoPush';

export type { PlatformAnnouncementBroadcastPayload };

/**
 * When an announcement is first published: real-time WebSocket to connected apps + Expo push to all registered devices.
 */
function isPromotionAnnouncementCategory(category: string): boolean {
  const c = category.trim().toLowerCase();
  return c === 'promotion' || c === 'promotions';
}

export async function notifyMarketplacePublishedAnnouncement(
  a: PlatformAnnouncementBroadcastPayload
): Promise<void> {
  await broadcastPlatformAnnouncementPublished(a);
  const preview = a.body.length > 160 ? `${a.body.slice(0, 157)}…` : a.body;
  /** Promotional posts respect the Marketplace “Promotions” notification toggle (type `promotion`). */
  const pushType = isPromotionAnnouncementCategory(a.category) ? 'promotion' : 'platform_announcement';
  await sendExpoPushToAllMarketplaceUsers(a.title, preview || 'New update from Lakupak', {
    type: pushType,
    announcementId: String(a.id),
  });
}

export async function notifyMarketplaceUnpublishedAnnouncement(announcementId: number): Promise<void> {
  await broadcastPlatformAnnouncementUnpublished(announcementId);
}
