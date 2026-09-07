// WebSocket broadcast utility for real-time updates
import { wsServer } from '../server/websocket';
import { WS_INTERNAL_SECRET_HEADER, getWsInternalSecret } from '@/lib/wsInternalAuth';

/**
 * Broadcast in-memory only when this module's `wsServer` is the one holding the clients.
 *
 * That is true inside the standalone WS server process, but NOT inside Next.js: Next
 * bundles its own copy of src/server/websocket, so app code sees an unattached
 * singleton and must reach the real server over HTTP. In unified mode `server.ts`
 * sets WS_HOST/WS_PORT to its own address so that post lands back on this process.
 */
function shouldPostToWsServer(): boolean {
  if (wsServer.getWss() !== null) {
    return false;
  }
  return true;
}

async function postWsBroadcast(body: Record<string, unknown>): Promise<Response | null> {
  const wsPort = process.env.WS_PORT || '3001';
  const wsHost = process.env.WS_HOST || 'localhost';
  const secret = getWsInternalSecret();
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WebSocket] WS_INTERNAL_SECRET / JWT_SECRET not set; skipping HTTP broadcast');
    }
    return null;
  }
  try {
    return await fetch(`http://${wsHost}:${wsPort}/api/marketplace/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [WS_INTERNAL_SECRET_HEADER]: secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    // Logged in production too: a dropped broadcast silently disables real-time updates.
    console.warn('[WebSocket] postWsBroadcast error:', error);
    return null;
  }
}

async function dispatchBroadcast(
  body: Record<string, unknown>,
  directBroadcast: () => void,
): Promise<void> {
  if (shouldPostToWsServer()) {
    const response = await postWsBroadcast(body);
    if (response && !response.ok) {
      let detail = response.statusText;
      try {
        const json = (await response.json()) as { error?: string };
        detail = json.error ?? detail;
      } catch {
        // ignore
      }
      console.warn(
        `[WebSocket] Broadcast failed (${response.status}): ${detail}`,
        body.type,
      );
    }
    return;
  }
  directBroadcast();
}

/**
 * Broadcast offer update to all connected WebSocket clients
 */
export async function broadcastOfferUpdate(
  offerId: string,
  productIds: string[],
): Promise<void> {
  try {
    await dispatchBroadcast(
      { type: 'offer_updated', offerId, productIds },
      () => wsServer.broadcastOfferUpdate(offerId, productIds),
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WebSocket] broadcastOfferUpdate error:', error);
    }
  }
}

/**
 * Broadcast product update to all connected WebSocket clients
 */
export async function broadcastProductUpdate(productIds: string[]): Promise<void> {
  try {
    await dispatchBroadcast(
      { type: 'product_updated', productIds },
      () => wsServer.broadcastProductUpdate(productIds),
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WebSocket] broadcastProductUpdate error:', error);
    }
  }
}

/**
 * Broadcast price update to all connected WebSocket clients
 */
export async function broadcastPriceUpdate(productIds: string[]): Promise<void> {
  try {
    await dispatchBroadcast(
      { type: 'prices_updated', productIds },
      () => wsServer.broadcastPriceUpdate(productIds),
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WebSocket] broadcastPriceUpdate error:', error);
    }
  }
}

/**
 * Broadcast order update to all connected WebSocket clients
 */
export async function broadcastOrderUpdate(orderIds: string[]): Promise<void> {
  try {
    await dispatchBroadcast(
      { type: 'order_updated', orderIds },
      () => wsServer.broadcastOrderUpdate(orderIds),
    );
  } catch (error) {
    // best-effort
  }
}

/**
 * Account namespace a targeted notification's id belongs to. Dashboard users,
 * marketplace buyers, and drivers have independent id spaces, so this must be passed
 * with every targeted notification to prevent cross-principal delivery.
 */
export type WsNotificationTargetType = 'dashboard' | 'marketplace' | 'driver';

/**
 * Notify a dashboard user that a new notification was created (real-time).
 * Sends to WebSocket clients with matching userId so the Dashboard can refetch.
 */
export async function broadcastDashboardNotification(userId: number): Promise<void> {
  return broadcastNotification('dashboard_new', 'New notification', '', { hint: 'refetch' }, userId, 'dashboard');
}

export type PlatformAnnouncementBroadcastPayload = {
  id: number;
  title: string;
  body: string;
  category: string;
  imageUrl: string | null;
  linkUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export async function broadcastPlatformAnnouncementPublished(
  announcement: PlatformAnnouncementBroadcastPayload,
): Promise<void> {
  try {
    await dispatchBroadcast(
      { type: 'platform_announcement_published', announcement },
      () => wsServer.broadcastPlatformAnnouncementPublished(announcement),
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WebSocket] broadcastPlatformAnnouncementPublished error:', error);
    }
  }
}

export async function broadcastMarketplaceHomeOffersRefresh(): Promise<void> {
  try {
    await dispatchBroadcast(
      { type: 'home_offers_updated' },
      () => wsServer.broadcastHomeOffersUpdated(),
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WebSocket] broadcastMarketplaceHomeOffersRefresh error:', error);
    }
  }
}

export async function broadcastPlatformAnnouncementUnpublished(
  announcementId: number,
): Promise<void> {
  try {
    await dispatchBroadcast(
      { type: 'platform_announcement_unpublished', announcementId },
      () => wsServer.broadcastPlatformAnnouncementUnpublished(announcementId),
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WebSocket] broadcastPlatformAnnouncementUnpublished error:', error);
    }
  }
}

export async function broadcastPlatformAdminInboxRefresh(): Promise<void> {
  try {
    await dispatchBroadcast(
      { type: 'platform_admin_inbox' },
      () => wsServer.broadcastPlatformAdminInbox(),
    );
  } catch {
    /* best-effort */
  }
}

export async function broadcastNotification(
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  targetUserId?: number,
  targetType?: WsNotificationTargetType,
): Promise<void> {
  try {
    await dispatchBroadcast(
      {
        type: 'notification',
        notification: { type, title, body, data, targetUserId, targetType },
      },
      () => wsServer.broadcastNotification(type, title, body, data, targetUserId, targetType),
    );
  } catch {
    // best-effort
  }
}
