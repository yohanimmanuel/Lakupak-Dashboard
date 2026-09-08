// WebSocket broadcast utility for real-time updates
import { wsServer, WS_SERVER_GLOBAL_KEY } from '../server/websocket';
import { WS_INTERNAL_SECRET_HEADER, getWsInternalSecret } from '@/lib/wsInternalAuth';

type WsBroadcaster = typeof wsServer;

type GlobalWithWsServer = { [WS_SERVER_GLOBAL_KEY]?: WsBroadcaster };

/**
 * Resolve the `wsServer` that actually holds the connected clients, or null if it
 * lives in another process and must be reached over HTTP.
 *
 * Next.js bundles its own copy of src/server/websocket, so the module-level `wsServer`
 * imported here is a second, unattached instance — never the one serving clients.
 * The unified server hands the real one over on globalThis, which is shared across
 * both module registries because they run in the same process.
 */
function getAttachedWsServer(): WsBroadcaster | null {
  const fromGlobal = (globalThis as GlobalWithWsServer)[WS_SERVER_GLOBAL_KEY];
  if (fromGlobal && fromGlobal.getWss() !== null) {
    return fromGlobal;
  }
  // Standalone WS server process: this module's own instance is the live one.
  if (wsServer.getWss() !== null) {
    return wsServer;
  }
  return null;
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
  directBroadcast: (server: WsBroadcaster) => void,
): Promise<void> {
  const attached = getAttachedWsServer();
  if (attached) {
    directBroadcast(attached);
    return;
  }

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
      (srv) => srv.broadcastOfferUpdate(offerId, productIds),
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
export async function broadcastProductUpdate(
  productIds: string[],
  action?: 'publish' | 'unpublish' | 'update',
): Promise<void> {
  try {
    await dispatchBroadcast(
      {
        type: 'product_updated',
        productIds,
        ...(action ? { action } : {}),
      },
      (srv) => srv.broadcastProductUpdate(productIds, action),
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
      (srv) => srv.broadcastPriceUpdate(productIds),
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
      (srv) => srv.broadcastOrderUpdate(orderIds),
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
      (srv) => srv.broadcastPlatformAnnouncementPublished(announcement),
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
      (srv) => srv.broadcastHomeOffersUpdated(),
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
      (srv) => srv.broadcastPlatformAnnouncementUnpublished(announcementId),
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
      (srv) => srv.broadcastPlatformAdminInbox(),
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
      (srv) => srv.broadcastNotification(type, title, body, data, targetUserId, targetType),
    );
  } catch {
    // best-effort
  }
}
