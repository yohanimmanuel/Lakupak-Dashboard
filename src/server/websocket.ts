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
import { verifyAccessToken } from '../lib/jwt';

interface ClientConnection {
  ws: WebSocket;
  userId: number | null;
  isAlive: boolean;
}

interface WebSocketMessage {
  type: 'offer_updated' | 'product_updated' | 'prices_updated' | 'order_updated' | 'ping' | 'pong';
  data?: unknown;
  productIds?: string[];
  offerIds?: string[];
  orderIds?: string[];
}

class MarketplaceWebSocketServer {
  private wss: WebSocketServer | null = null;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private clients: Set<ClientConnection> = new Set();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  start(port: number = 3001): void {
    // Don't start if already running
    if (this.wss) {
      return;
    }
    
    try {
      // Create HTTP server for handling broadcast requests from API routes
      this.httpServer = createServer((req: HttpIncomingMessage, res: ServerResponse) => {
        if (req.url === '/api/marketplace/broadcast' && req.method === 'POST') {
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
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid request' }));
            }
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      // Create WebSocket server attached to HTTP server
      this.wss = new WebSocketServer({ 
        server: this.httpServer,
        path: '/api/marketplace/ws'
      });

      // Start HTTP server (which also serves WebSocket)
      this.httpServer.listen(port);

      this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        const client: ClientConnection = {
          ws,
          userId: null,
          isAlive: true
        };

        // Extract token from query string
        let token: string | null = null;
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

        // Authenticate client
        if (token) {
          try {
            // Remove "Bearer " prefix if present
            const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
            const payload = verifyAccessToken(cleanToken);
            client.userId = payload.sub;
          } catch (error) {
            // Close connection if JWT_SECRET is not set (configuration error)
            if (!process.env.JWT_SECRET) {
              ws.close(1008, 'Server configuration error: JWT_SECRET not set');
              return;
            }
            // Close connection for invalid token
            ws.close(1008, 'Invalid token');
            return;
          }
        }

        // Add client to Set BEFORE setting up event handlers
        this.clients.add(client);

        // Handle ping/pong for keepalive
        ws.on('pong', () => {
          client.isAlive = true;
        });

        // Handle incoming messages
        ws.on('message', (data: Buffer) => {
          try {
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
    } catch (error) {
      throw error;
    }
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

    if (this.httpServer) {
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

