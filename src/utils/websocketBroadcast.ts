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

