import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { wsServer } from './src/server/websocket';
import { validateDashboardEnv } from './src/lib/validateEnv';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

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

  // Attach WebSocket server for handling /api/marketplace/ws upgrades on this port
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
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
