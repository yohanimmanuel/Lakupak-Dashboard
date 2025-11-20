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
      try {
        await fetch(`http://${wsHost}:${wsPort}/api/marketplace/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'offer_updated',
            offerId,
            productIds
          })
        });
      } catch (error) {
        // Server might not be running or HTTP endpoint not available - silently fail
      }
    }
  } catch (error) {
    // Silently fail if broadcast fails
  }
}

/**
 * Broadcast product update to all connected WebSocket clients
 */
export async function broadcastProductUpdate(productIds: string[]): Promise<void> {
  try {
    if (wsServer.getConnectedCount() > 0) {
      wsServer.broadcastProductUpdate(productIds);
    }
  } catch (error) {
    // Silently fail if WebSocket server is not running
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
      try {
        await fetch(`http://${wsHost}:${wsPort}/api/marketplace/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'prices_updated',
            productIds
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

