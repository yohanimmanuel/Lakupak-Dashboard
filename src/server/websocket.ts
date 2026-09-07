// WebSocket server for real-time marketplace updates
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { createServer, IncomingMessage as HttpIncomingMessage, ServerResponse } from 'http';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file FIRST
// This is needed when running the server directly (not through Next.js)
// MUST be loaded before importing jwt.ts which uses JWT_SECRET
if (require.main === module) {
  // Try .env.local first (Next.js convention), then .env
  config({ path: resolve(process.cwd(), '.env.local') });
  config({ path: resolve(process.cwd(), '.env') });
}

// Import jwt AFTER loading environment variables
import { validateDashboardEnv } from '../lib/validateEnv';
import { verifyAccessToken } from '../lib/jwt';
import { WS_INTERNAL_SECRET_HEADER, isValidWsInternalSecret } from '../lib/wsInternalAuth';
import { verifyPlatformAdminToken } from '../lib/platform-admin-jwt';
import { 
  websocketConnectionRateLimiter, 
  websocketMessageRateLimiter,
  getClientIp 
} from '../utils/rateLimiter';

/**
 * Which account namespace a connection's `userId` belongs to. Dashboard users,
 * marketplace buyers, and drivers each have independent id sequences, so the same
 * numeric id can exist in every namespace — targeting must compare this too.
 */
export type WsPrincipalType = 'dashboard' | 'marketplace' | 'driver' | 'platform-admin' | 'unknown';

interface ClientConnection {
  ws: WebSocket;
  userId: number | null;
  isAlive: boolean;
  /** Namespace of `userId` (from the JWT `type` claim / platform-admin token). */
  principalType: WsPrincipalType;
  /** True when JWT is a platform admin session (distinct from dashboard User.id). */
  isPlatformAdmin?: boolean;
}

export type PlatformAnnouncementWsPayload = {
  id: number;
  title: string;
  body: string;
  category: string;
  imageUrl: string | null;
  linkUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
};

interface WebSocketMessage {
  type:
    | 'offer_updated'
    | 'product_updated'
    | 'prices_updated'
    | 'order_updated'
    | 'notification'
    | 'platform_announcement_published'
    | 'platform_announcement_unpublished'
    | 'home_offers_updated'
    | 'ping'
    | 'pong';
  data?: unknown;
  productIds?: string[];
  offerIds?: string[];
  orderIds?: string[];
  announcement?: PlatformAnnouncementWsPayload;
  announcementId?: number;
  notification?: {
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    targetUserId?: number;
    /** Account namespace the target id belongs to; prevents cross-principal delivery. */
    targetType?: WsPrincipalType;
  };
}

class MarketplaceWebSocketServer {
  private wss: WebSocketServer | null = null;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private isExternalHttpServer = false;
  private clients: Set<ClientConnection> = new Set();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Handle POST broadcast requests (e.g. from API routes or custom server).
   * Returns true if request was handled, false otherwise.
   */
  handleBroadcastRequest(req: HttpIncomingMessage, res: ServerResponse): boolean {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/api/marketplace/broadcast' && req.method === 'POST') {
      const secretHeader = req.headers[WS_INTERNAL_SECRET_HEADER];
      const providedSecret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
      if (!isValidWsInternalSecret(providedSecret)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return true;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.type === 'offer_updated') {
            this.broadcastOfferUpdate(data.offerId, data.productIds || []);
          } else if (data.type === 'prices_updated') {
            this.broadcastPriceUpdate(data.productIds || []);
          } else if (data.type === 'product_updated') {
            this.broadcastProductUpdate(data.productIds || []);
          } else if (data.type === 'order_updated') {
            this.broadcastOrderUpdate(data.orderIds || []);
          } else if (data.type === 'notification') {
            this.broadcastNotification(
              data.notification?.type || 'system',
              data.notification?.title || '',
              data.notification?.body || '',
              data.notification?.data,
              data.notification?.targetUserId,
              data.notification?.targetType
            );
          } else if (data.type === 'platform_announcement_published' && data.announcement) {
            this.broadcastPlatformAnnouncementPublished(data.announcement as PlatformAnnouncementWsPayload);
          } else if (data.type === 'platform_announcement_unpublished' && typeof data.announcementId === 'number') {
            this.broadcastPlatformAnnouncementUnpublished(data.announcementId);
          } else if (data.type === 'platform_admin_inbox') {
            this.broadcastPlatformAdminInbox();
          } else if (data.type === 'home_offers_updated') {
            this.broadcastHomeOffersUpdated();
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request' }));
        }
      });
      return true;
    }
    return false;
  }

  /**
   * Attach WebSocket server to an existing HTTP server (e.g. Next.js unified server).
   */
  attach(server: ReturnType<typeof createServer>): void {
    if (this.wss) {
      return;
    }

    this.httpServer = server;
    this.isExternalHttpServer = true;
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const url = request.url || '';
      const pathname = url.split('?')[0];
      if (pathname === '/api/marketplace/ws') {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      }
    });

    this.setupConnectionHandlers();
    console.info(`[WebSocket] Attached to HTTP server (ws path: /api/marketplace/ws)`);
  }

  /**
   * Standalone start method for running as an independent process on a dedicated port.
   */
  start(port: number = 3001): void {
    // Don't start if already running
    if (this.wss) {
      return;
    }
    
    try {
      // Create HTTP server for handling broadcast requests from API routes
      this.httpServer = createServer((req: HttpIncomingMessage, res: ServerResponse) => {
        if (!this.handleBroadcastRequest(req, res)) {
          res.writeHead(404);
          res.end();
        }
      });
      this.isExternalHttpServer = false;

      // Create WebSocket server attached to HTTP server
      this.wss = new WebSocketServer({ 
        server: this.httpServer,
        path: '/api/marketplace/ws'
      });

      // Start HTTP server (which also serves WebSocket)
      this.httpServer.listen(port, () => {
        console.info(`[WebSocket] Server listening on port ${port} (ws path: /api/marketplace/ws)`);
      });

      this.setupConnectionHandlers();
    } catch (error) {
      throw error;
    }
  }

  private setupConnectionHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', async (ws: WebSocket, request: IncomingMessage) => {
      // Extract IP address for rate limiting
      const forwardedFor = request.headers['x-forwarded-for'];
      const realIp = request.headers['x-real-ip'];
      const ip = forwardedFor?.toString().split(',')[0].trim() || 
                 realIp?.toString() || 
                 request.socket.remoteAddress || 
                 'unknown';

      // Extract token from query string
      let token: string | null = null;
      let userId: number | null = null;
      let isPlatformAdmin = false;
      let principalType: WsPrincipalType = 'unknown';

      try {
        const url = new URL(request.url || '', `http://${request.headers.host}`);
        token = url.searchParams.get('token');
      } catch (error) {
        // Try to extract token manually from request.url
        if (request.url) {
          const tokenMatch = request.url.match(/[?&]token=([^&]+)/);
          if (tokenMatch) {
            token = decodeURIComponent(tokenMatch[1]);
          }
        }
      }

      // Authenticate client (dashboard user JWT or platform admin JWT)
      if (!token) {
        ws.close(1008, 'Authentication required');
        return;
      }
      try {
        if (!process.env.JWT_SECRET) {
          ws.close(1008, 'Server configuration error: JWT_SECRET not set');
          return;
        }
        const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
        try {
          const pa = verifyPlatformAdminToken(cleanToken);
          userId = pa.sub;
          isPlatformAdmin = true;
          principalType = 'platform-admin';
        } catch (err) {
          if (err instanceof Error && err.message?.includes('secret')) {
            throw err;
          }
          const payload = verifyAccessToken(cleanToken);
          userId = payload.sub;
          // Legacy tokens omit `type`; such clients simply won't receive
          // namespace-targeted notifications until they re-authenticate.
          principalType = payload.type ?? 'unknown';
        }
      } catch (error) {
        ws.close(1008, 'Invalid token');
        return;
      }

      // Apply WebSocket connection rate limiting
      const connectionCheck = await websocketConnectionRateLimiter(ip, userId);
      if (!connectionCheck.allowed) {
        ws.close(1008, connectionCheck.reason || 'Too many connections');
        return;
      }

      const client: ClientConnection = {
        ws,
        userId,
        isAlive: true,
        principalType,
        isPlatformAdmin,
      };

      // Add client to Set BEFORE setting up event handlers
      this.clients.add(client);

      // Handle ping/pong for keepalive
      ws.on('pong', () => {
        client.isAlive = true;
      });

      // Handle incoming messages with rate limiting
      ws.on('message', async (data: Buffer) => {
        try {
          // Apply WebSocket message rate limiting
          const messageCheck = await websocketMessageRateLimiter(ip, client.userId);
          if (!messageCheck.allowed) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              data: { 
                message: messageCheck.reason || 'Too many messages',
                retryAfter: messageCheck.retryAfter 
              } 
            }));
            return;
          }

          const message: WebSocketMessage = JSON.parse(data.toString());
          
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (error) {
          // Invalid message, ignore
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(client);
      });

      // Handle errors
      ws.on('error', () => {
        this.clients.delete(client);
      });

      // Send welcome message
      ws.send(JSON.stringify({ 
        type: 'pong',
        data: { message: 'Connected to marketplace WebSocket' }
      }));
    });

    // Start ping interval to keep connections alive
    this.pingInterval = setInterval(() => {
      this.clients.forEach((client) => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(client);
          return;
        }

        client.isAlive = false;
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      });
    }, 30000); // Ping every 30 seconds
  }

  stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    this.clients.forEach((client) => {
      client.ws.close();
    });
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.httpServer && !this.isExternalHttpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
  }

  // Broadcast offer update to all connected clients
  broadcastOfferUpdate(offerId: string, productIds: string[]): void {
    const message: WebSocketMessage = {
      type: 'offer_updated',
      offerIds: [offerId],
      productIds
    };

    this.broadcast(message);
  }

  // Broadcast product update to all connected clients
  broadcastProductUpdate(productIds: string[]): void {
    const message: WebSocketMessage = {
      type: 'product_updated',
      productIds
    };

    this.broadcast(message);
  }

  // Broadcast price update to all connected clients
  broadcastPriceUpdate(productIds: string[]): void {
    const message: WebSocketMessage = {
      type: 'prices_updated',
      productIds
    };

    this.broadcast(message);
  }

  // Broadcast order update to all connected clients
  broadcastOrderUpdate(orderIds: string[]): void {
    const message: WebSocketMessage = {
      type: 'order_updated',
      orderIds
    };

    this.broadcast(message);
  }

  broadcastPlatformAnnouncementPublished(announcement: PlatformAnnouncementWsPayload): void {
    const message: WebSocketMessage = {
      type: 'platform_announcement_published',
      announcement,
    };
    this.broadcast(message);
  }

  broadcastPlatformAnnouncementUnpublished(announcementId: number): void {
    const message: WebSocketMessage = {
      type: 'platform_announcement_unpublished',
      announcementId,
    };
    this.broadcast(message);
  }

  broadcastHomeOffersUpdated(): void {
    const message: WebSocketMessage = { type: 'home_offers_updated' };
    this.broadcast(message);
  }

  /** Notify platform admin dashboard clients to refetch inbox (e.g. new buyer report). */
  broadcastPlatformAdminInbox(): void {
    const message: WebSocketMessage = {
      type: 'notification',
      notification: {
        type: 'platform_admin_inbox',
        title: '',
        body: '',
        data: { hint: 'refetch' },
      },
    };
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.isPlatformAdmin && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(messageStr);
        } catch {
          this.clients.delete(client);
        }
      }
    });
  }

  // Broadcast notification to specific user or all clients
  broadcastNotification(
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    targetUserId?: number,
    targetType?: WsPrincipalType
  ): void {
    const message: WebSocketMessage = {
      type: 'notification',
      notification: {
        type,
        title,
        body,
        data,
        targetUserId,
        targetType
      }
    };

    // If targetUserId is specified, only send to that user
    if (targetUserId) {
      this.broadcastToUser(message, targetUserId, targetType);
    } else {
      this.broadcast(message);
    }
  }

  // Broadcast message to a specific user within a principal namespace.
  private broadcastToUser(
    message: WebSocketMessage,
    userId: number,
    targetType?: WsPrincipalType,
  ): void {
    const messageStr = JSON.stringify(message);

    this.clients.forEach((client) => {
      if (client.userId !== userId) return;
      // When the caller declares the target namespace, require an exact match so a
      // buyer / driver / dashboard user sharing the same numeric id can't receive
      // each other's notifications. Missing targetType keeps legacy id-only routing.
      if (targetType && client.principalType !== targetType) return;
      if (client.ws.readyState !== WebSocket.OPEN) return;
      try {
        client.ws.send(messageStr);
      } catch (error) {
        // Client disconnected, remove it
        this.clients.delete(client);
      }
    });
  }

  // Broadcast message to all connected clients
  private broadcast(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);

    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(messageStr);
        } catch (error) {
          // Client disconnected, remove it
          this.clients.delete(client);
        }
      }
    });
  }

  // Get connected clients count
  getConnectedCount(): number {
    return this.clients.size;
  }

  // Get WebSocketServer instance (for checking if server is running)
  getWss(): WebSocketServer | null {
    return this.wss;
  }
}

// Singleton instance
export const wsServer = new MarketplaceWebSocketServer();

// Start server if running directly
if (require.main === module) {
  validateDashboardEnv();
  const port = parseInt(process.env.WS_PORT || '3001', 10);
  wsServer.start(port);
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    wsServer.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    wsServer.stop();
    process.exit(0);
  });
}

