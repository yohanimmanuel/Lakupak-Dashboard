// WebSocket broadcast utility for real-time updates
import { wsServer } from '../server/websocket';

// Check if WebSocket server is running in this process
// Note: When running via `npm run dev:all`, the server runs in a separate process
// API routes should NOT try to start the server - it's already running separately
function isServerRunning(): boolean {
  return wsServer.getWss() !== null;
}

/**
 * Broadcast offer update to all connected WebSocket clients
 */
export async function broadcastOfferUpdate(
  offerId: string,
  productIds: string[]
): Promise<void> {
  try {
    if (isServerRunning()) {
      // Server is running in this process - broadcast directly
      if (wsServer.getConnectedCount() > 0) {
        wsServer.broadcastOfferUpdate(offerId, productIds);
      }
    } else {
      // Server is running in a separate process - send HTTP request to trigger broadcast
      // The WebSocket server has an internal HTTP endpoint for this
      const wsPort = process.env.WS_PORT || '3001';
      const wsHost = process.env.WS_HOST || 'localhost';
      const response = await fetch(`http://${wsHost}:${wsPort}/api/marketplace/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'offer_updated',
            offerId,
            productIds
        }),
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[WebSocket] Broadcast failed: ${response.status} ${response.statusText}`);
        }
      }
    }
  } catch (error) {
    // Log in development to help debug
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
    if (isServerRunning()) {
      if (wsServer.getConnectedCount() > 0) {
        wsServer.broadcastProductUpdate(productIds);
      }
    } else {
      const wsPort = process.env.WS_PORT || '3001';
      const wsHost = process.env.WS_HOST || 'localhost';
      const response = await fetch(`http://${wsHost}:${wsPort}/api/marketplace/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'product_updated',
            productIds
        }),
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(5000)
        });
      
      if (!response.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[WebSocket] Broadcast failed: ${response.status} ${response.statusText}`);
        }
      }
    }
  } catch (error) {
    // Log in development to help debug
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
    if (isServerRunning()) {
      if (wsServer.getConnectedCount() > 0) {
        wsServer.broadcastPriceUpdate(productIds);
      }
    } else {
      const wsPort = process.env.WS_PORT || '3001';
      const wsHost = process.env.WS_HOST || 'localhost';
      const response = await fetch(`http://${wsHost}:${wsPort}/api/marketplace/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'prices_updated',
            productIds
        }),
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(5000)
        });
      
      if (!response.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[WebSocket] Broadcast failed: ${response.status} ${response.statusText}`);
        }
      }
    }
  } catch (error) {
    // Log in development to help debug
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
    if (isServerRunning()) {
      if (wsServer.getConnectedCount() > 0) {
        wsServer.broadcastOrderUpdate(orderIds);
      }
    } else {
      const wsPort = process.env.WS_PORT || '3001';
      const wsHost = process.env.WS_HOST || 'localhost';
      try {
        await fetch(`http://${wsHost}:${wsPort}/api/marketplace/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'order_updated',
            orderIds
          })
        });
      } catch (error) {
        // Silently fail
      }
    }
  } catch (error) {
    // Silently fail
  }
}

/**
 * Notify a dashboard user that a new notification was created (real-time).
 * Sends to WebSocket clients with matching userId so the Dashboard can refetch.
 */
export async function broadcastDashboardNotification(userId: number): Promise<void> {
  return broadcastNotification('dashboard_new', 'New notification', '', { hint: 'refetch' }, userId);
}

/**
 * Broadcast notification to connected WebSocket clients
 * @param type - Notification type (order, inventory, offer, etc.)
 * @param title - Notification title
 * @param body - Notification message body
 * @param data - Additional data to include
 * @param targetUserId - Optional: send only to specific user
 */
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

/**
 * Broadcast a newly published platform announcement to all connected marketplace WebSocket clients.
 */
export async function broadcastPlatformAnnouncementPublished(
  announcement: PlatformAnnouncementBroadcastPayload
): Promise<void> {
  try {
    if (isServerRunning()) {
      if (wsServer.getConnectedCount() > 0) {
        wsServer.broadcastPlatformAnnouncementPublished(announcement);
      }
    } else {
      const wsPort = process.env.WS_PORT || '3001';
      const wsHost = process.env.WS_HOST || 'localhost';
      await fetch(`http://${wsHost}:${wsPort}/api/marketplace/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'platform_announcement_published',
          announcement,
        }),
        signal: AbortSignal.timeout(5000),
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WebSocket] broadcastPlatformAnnouncementPublished error:', error);
    }
  }
}

/**
 * Broadcast an unpublished (removed) platform announcement so connected marketplace clients can remove it immediately.
 */
export async function broadcastPlatformAnnouncementUnpublished(announcementId: number): Promise<void> {
  try {
    if (isServerRunning()) {
      if (wsServer.getConnectedCount() > 0) {
        wsServer.broadcastPlatformAnnouncementUnpublished(announcementId);
      }
    } else {
      const wsPort = process.env.WS_PORT || '3001';
      const wsHost = process.env.WS_HOST || 'localhost';
      await fetch(`http://${wsHost}:${wsPort}/api/marketplace/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'platform_announcement_unpublished',
          announcementId,
        }),
        signal: AbortSignal.timeout(5000),
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WebSocket] broadcastPlatformAnnouncementUnpublished error:', error);
    }
  }
}

export async function broadcastNotification(
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  targetUserId?: number
): Promise<void> {
  try {
    if (isServerRunning()) {
      if (wsServer.getConnectedCount() > 0) {
        wsServer.broadcastNotification(type, title, body, data, targetUserId);
      }
    } else {
      const wsPort = process.env.WS_PORT || '3001';
      const wsHost = process.env.WS_HOST || 'localhost';
      try {
        await fetch(`http://${wsHost}:${wsPort}/api/marketplace/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'notification',
            notification: {
              type,
              title,
              body,
              data,
              targetUserId
            }
          }),
          signal: AbortSignal.timeout(5000)
        });
      } catch (error) {
        // Silently fail
      }
    }
  } catch (error) {
    // Silently fail
  }
}

