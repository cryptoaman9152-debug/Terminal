/**
 * WebSocket Handler
 * Manages real-time market data streaming to connected clients.
 * Requires valid JWT (cookie or query param) to subscribe to data.
 */
import { validateWSAuth } from '../middleware/auth.js';
import { config } from 'dotenv';

config();

export function setupWebSocket(wss, marketDataEngine) {
  console.log('[WebSocket] Server initialized');

  wss.on('connection', (ws, request) => {
    // Dev bypass: allow through without auth in dev mode
    let user;
    if (process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_AUTH === 'true') {
      user = { userId: 'dev-user', accountId: 'dev-account', accountCode: 'FW-DEV' };
    } else {
      user = validateWSAuth(request);
    }

    if (!user) {
      ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    console.log(`[WebSocket] Client connected (account: ${user.accountCode || user.accountId})`);
    const subscriptions = new Map(); // token -> callback
    const depthSubscriptions = new Map();

    // Send market status
    ws.send(JSON.stringify({
      type: 'market_status',
      status: getMarketStatus(),
    }));

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        handleMessage(ws, data, subscriptions, depthSubscriptions, marketDataEngine);
      } catch (err) {
        console.error('[WebSocket] Message parse error:', err);
      }
    });

    ws.on('close', () => {
      // Clean up subscriptions
      subscriptions.forEach((callback, token) => {
        marketDataEngine.unsubscribe(token, callback);
      });
      depthSubscriptions.forEach((callback, token) => {
        marketDataEngine.unsubscribeDepth(token, callback);
      });
      subscriptions.clear();
      depthSubscriptions.clear();
      console.log('[WebSocket] Client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Client error:', err.message);
    });
  });

  // Periodic market status broadcast
  setInterval(() => {
    const status = getMarketStatus();
    const message = JSON.stringify({ type: 'market_status', status });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }, 30000);
}

function handleMessage(ws, data, subscriptions, depthSubscriptions, marketDataEngine) {
  switch (data.type) {
    case 'subscribe': {
      const tokens = data.tokens || [];
      tokens.forEach((token) => {
        if (subscriptions.has(token)) return;

        const callback = (quoteData) => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify(quoteData));
          }
        };

        subscriptions.set(token, callback);
        marketDataEngine.subscribe(token, callback);
      });
      break;
    }

    case 'unsubscribe': {
      const tokens = data.tokens || [];
      tokens.forEach((token) => {
        const callback = subscriptions.get(token);
        if (callback) {
          marketDataEngine.unsubscribe(token, callback);
          subscriptions.delete(token);
        }
      });
      break;
    }

    case 'subscribe_depth': {
      const tokens = data.tokens || [];
      tokens.forEach((token) => {
        if (depthSubscriptions.has(token)) return;

        const callback = (depthData) => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify(depthData));
          }
        };

        depthSubscriptions.set(token, callback);
        marketDataEngine.subscribeDepth(token, callback);

        // If no cached depth available, fetch via REST immediately
        const cached = marketDataEngine.getDepth(token);
        if (!cached || (!cached.bids?.length && !cached.asks?.length)) {
          // Send a request to fetch depth on-demand (async, best-effort)
          // The REST depth service will push into marketDataEngine which will trigger our callback
        }
      });
      break;
    }

    case 'unsubscribe_depth': {
      const tokens = data.tokens || [];
      tokens.forEach((token) => {
        const callback = depthSubscriptions.get(token);
        if (callback) {
          marketDataEngine.unsubscribeDepth(token, callback);
          depthSubscriptions.delete(token);
        }
      });
      break;
    }

    case 'ping':
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
      break;
  }
}

function getMarketStatus() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;
  const day = now.getDay();

  // Weekend
  if (day === 0 || day === 6) return 'CLOSED';

  // IST market hours
  if (time >= 555 && time < 570) return 'PRE_OPEN'; // 9:15 AM - 9:30 AM
  if (time >= 570 && time < 930) return 'OPEN'; // 9:30 AM - 3:30 PM
  if (time >= 930 && time < 960) return 'POST_CLOSE'; // 3:30 PM - 4:00 PM

  return 'CLOSED';
}
