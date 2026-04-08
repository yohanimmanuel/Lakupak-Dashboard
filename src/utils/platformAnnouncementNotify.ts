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
export async function notifyMarketplacePublishedAnnouncement(
  a: PlatformAnnouncementBroadcastPayload
): Promise<void> {
  await broadcastPlatformAnnouncementPublished(a);
  const preview = a.body.length > 160 ? `${a.body.slice(0, 157)}…` : a.body;
  await sendExpoPushToAllMarketplaceUsers(a.title, preview || 'New update from Laku', {
    type: 'platform_announcement',
    announcementId: String(a.id),
  });
}

export async function notifyMarketplaceUnpublishedAnnouncement(announcementId: number): Promise<void> {
  await broadcastPlatformAnnouncementUnpublished(announcementId);
}
