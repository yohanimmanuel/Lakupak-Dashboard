// Must be imported first to initialize Node baseline (AsyncLocalStorage, WebSocket) for Next.js 16
import 'next/dist/server/node-environment-baseline';
import { AsyncLocalStorage } from 'node:async_hooks';

if (typeof (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage !== 'function') {
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
}

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env in standalone mode if not already provided by container/host environment
config({ path: resolve(process.cwd(), '.env') });

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { wsServer } from './src/server/websocket';
import { validateDashboardEnv } from './src/lib/validateEnv';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// App code broadcasts through the instance attach() publishes on globalThis, so it never
// needs this. Kept as a fallback address for the HTTP path, since the default of :3001 has
// nothing listening in unified mode.
process.env.WS_HOST = '127.0.0.1';
process.env.WS_PORT = String(port);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function start() {
  validateDashboardEnv();
  await app.prepare();

  const server = createServer(async (req, res) => {
    try {
      // Allow wsServer to handle internal broadcast requests
      if (wsServer.handleBroadcastRequest(req, res)) {
        return;
      }

      const parsedUrl = parse(req.url || '', true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      } else {
        res.destroy();
      }
    }
  });

  // Attach WebSocket server for handling /api/marketplace/ws upgrades on this port.
  // attach() also publishes the instance on globalThis so Next.js-bundled app code can
  // broadcast directly instead of posting over HTTP to the server it already runs inside.
  wsServer.attach(server);

  server.listen(port, () => {
    console.info(`> Lakupak Server ready on http://${hostname}:${port}`);
    console.info(`> WebSockets active at ws://${hostname}:${port}/api/marketplace/ws`);
  });

  let isShuttingDown = false;
  const shutdown = () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.info('Gracefully shutting down server...');

    const forceExitTimeout = setTimeout(() => {
      console.warn('Forced shutdown: server close timed out');
      process.exit(1);
    }, 10000);

    wsServer.stop();
    server.close(() => {
      clearTimeout(forceExitTimeout);
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // This deployment runs a single instance, so an error escaping a detached callback
  // would take the whole site down and return 502 until Render restarts it. Log and
  // keep serving instead.
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception (server kept alive):', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection (server kept alive):', reason);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
