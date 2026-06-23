/**
 * FUNDEDWEALTH TERMINAL — SERVER ENTRY POINT
 * 
 * Wires together all backend components:
 * - Express REST API with auth middleware
 * - SSO authentication routes
 * - WebSocket server for real-time market data
 * - Supabase database connection
 * - Market data engine
 * - Instrument service
 * - Cron scheduler
 * 
 * NO simulation. NO fake data. All data flows from Supabase or broker adapters.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';

config();

import { supabase, testConnection } from './db/client.js';
import { createApiRouter } from './routes/api.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { setupWebSocket } from './routes/websocket.js';
import { setupAdminWebSocket } from './routes/admin.ws.js';
import { AccountService } from './services/accountService.js';
import { InstrumentService } from './services/instrumentService.js';
import { MarketDataEngine } from './services/marketDataEngine.js';
import { CandleService } from './services/candleService.js';
import { DepthService } from './services/depthService.js';
import { OptionChainService } from './services/optionChainService.js';
import { scheduleDailyChecks } from './cron/dailyChecks.js';
import { RealtimeServer } from './realtime/socketio.server.js';
import { RedisPubSub } from './realtime/redis.pubsub.js';
import { TradingViewDatafeed } from './realtime/tradingview.datafeed.js';
import { BrokerFactory } from './brokers/broker.factory.js';
import { HealthMonitor } from './brokers/health.monitor.js';
import { AngelFeedConnector } from './brokers/angelone/angel.feed.connector.js';
import { eventBus, EventBridge } from './events/index.js';
import { eventDispatcher } from './services/eventDispatcher.js';

const PORT = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Initialize Services ─────────────────────────────────────────
const marketDataEngine = new MarketDataEngine();
const instrumentService = new InstrumentService();
const accountService = new AccountService(marketDataEngine);
const candleService = new CandleService(marketDataEngine);
const depthService = new DepthService(marketDataEngine);
const optionChainService = new OptionChainService();
const redisPubSub = new RedisPubSub();
const healthMonitor = new HealthMonitor({ interval: 30000 });
const angelFeed = new AngelFeedConnector(marketDataEngine);
const eventBridge = new EventBridge();
let tradingViewDatafeed = null;
let realtimeServer = null;

// ─── Express App ─────────────────────────────────────────────────
const app = express();
const server = createServer(app);

const isProduction = process.env.NODE_ENV === 'production';
const corsOrigins = isProduction
  ? [FRONTEND_URL]
  : [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(express.json());

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Let frontend handle CSP
  crossOriginEmbedderPolicy: false, // Allow WebSocket/Socket.IO
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests. Please slow down.' },
});

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 auth attempts per 5 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many authentication attempts.' },
});

const orderLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 orders per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Order rate limit exceeded.' },
});

app.use('/api', apiLimiter);
app.use('/auth', authLimiter);

// Health check (no auth) — lightweight, no DB queries, for Railway health monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// Full market status (no auth, for monitoring)
app.get('/api/market/live', (req, res) => {
  const feedStatus = angelFeed.getStatus();
  const sioStatus = realtimeServer ? realtimeServer.getStatus() : { clients: 0, rooms: 0, subscriptions: 0 };
  const symbols = {};
  for (const [token, quote] of marketDataEngine.quotes) {
    symbols[token] = { ltp: quote.ltp, exchange: quote.exchange, timestamp: quote.timestamp };
  }
  res.json({
    feed: {
      connected: feedStatus.connected,
      subscribedTokens: feedStatus.subscribedTokens,
      tickCount: feedStatus.tickCount,
      uptimeMs: feedStatus.uptimeMs,
    },
    socketIO: sioStatus,
    symbols,
  });
});

// Auth routes (SSO, logout, verify)
app.use('/auth', createAuthRouter());

// API routes (protected + public)
app.use('/api', createApiRouter(accountService, instrumentService, marketDataEngine, candleService, depthService, optionChainService));

// Order rate limit (more restrictive)
app.use('/api/orders', orderLimiter);

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const { default: path } = await import('path');
  const { default: fs } = await import('fs');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, '../dist');
  const distExists = fs.existsSync(distPath);
  if (distExists) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      // Don't serve index.html for API/auth/health routes
      if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/health') || req.path.startsWith('/ws')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Global error handler — prevents stack trace leaks
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  console.error(`[ERROR] ${req.method} ${req.path}:`, isProduction ? err.message : err.stack);

  res.status(status).json({
    error: status >= 500 ? 'internal_error' : 'request_error',
    message: isProduction ? 'An unexpected error occurred.' : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

// ─── WebSocket Server ────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss, marketDataEngine);

// Admin WebSocket feed (for admin.fundedwealth.com)
const adminWss = new WebSocketServer({ server, path: '/ws/admin' });
setupAdminWebSocket(adminWss);

// ─── Startup ─────────────────────────────────────────────────────
async function startup() {
  console.log('════════════════════════════════════════════════');
  console.log('  FUNDEDWEALTH TERMINAL — Server Starting');
  console.log('════════════════════════════════════════════════');
  console.log(`  Port: ${PORT}`);
  console.log(`  Env:  ${process.env.NODE_ENV || 'development'}`);
  console.log('');

  // 1. Test Supabase Connection
  console.log('[Startup] Testing Supabase connection...');
  const dbResult = await testConnection();
  if (dbResult.connected) {
    console.log('[Startup] ✓ Supabase connected');
  } else {
    console.warn(`[Startup] ✗ Supabase NOT connected: ${dbResult.reason}`);
    console.warn('[Startup]   Server will run in dev-bypass mode (auth middleware allows through)');
  }

  // 2. Initialize Market Data Engine
  console.log('[Startup] Initializing market data engine...');
  await marketDataEngine.initialize();
  console.log('[Startup] ✓ Market data engine ready (awaiting broker adapter)');

  // 2b. Initialize Event Dispatcher (persistence subscriber)
  console.log('[Startup] Initializing event dispatcher (persistence layer)...');
  eventDispatcher.initialize();
  console.log('[Startup] ✓ Event dispatcher active — all events will be persisted');

  // 3. Initialize Redis Pub/Sub (optional)
  console.log('[Startup] Initializing Redis Pub/Sub...');
  const redisConnected = await redisPubSub.initialize();
  if (redisConnected) {
    console.log('[Startup] ✓ Redis Pub/Sub connected');
  } else {
    console.log('[Startup] ○ Redis not configured — single-instance mode');
  }

  // 4. Initialize TradingView Datafeed
  tradingViewDatafeed = new TradingViewDatafeed(instrumentService, marketDataEngine);
  console.log('[Startup] ✓ TradingView Datafeed layer ready');

  // 5. Schedule daily checks (only if Supabase is connected)
  if (dbResult.connected) {
    scheduleDailyChecks();
    console.log('[Startup] ✓ Daily checks scheduler active');
  }

  // 6. Start HTTP server
  server.listen(PORT, () => {
    // 7. Initialize Socket.IO (needs server to be listening)
    realtimeServer = new RealtimeServer(server, marketDataEngine, {
      corsOrigin: corsOrigins,
    });
    console.log('[Startup] ✓ Socket.IO server initialized');

    // 7b. Start Event Bridge (connects eventBus → Socket.IO/WS clients)
    eventBridge.setRealtimeServer(realtimeServer);
    eventBridge.setWss(wss);
    eventBridge.start();
    console.log('[Startup] ✓ Event Bridge active (7 channels → client)');

    // 8. Start Broker Health Monitor
    healthMonitor.start();
    console.log('[Startup] ✓ Broker health monitor active');

    console.log('');
    console.log(`[Startup] ✓ Server listening on http://localhost:${PORT}`);
    console.log(`[Startup] ✓ WebSocket (legacy) on ws://localhost:${PORT}/ws`);
    console.log(`[Startup] ✓ WebSocket (admin) on ws://localhost:${PORT}/ws/admin`);
    console.log(`[Startup] ✓ Socket.IO on http://localhost:${PORT}/socket.io`);
    console.log('');
    console.log('  Broker Status:');
    const bh = BrokerFactory.getHealthReport();
    console.log(`    Angel One: configured=${bh._available.angelone.configured}, connected=${bh._available.angelone.status}`);
    console.log(`    Dhan:      configured=${bh._available.dhan.configured}, status=${bh._available.dhan.status}`);
    console.log('');
    console.log('════════════════════════════════════════════════');

    // 9. Connect Angel Feed (live market data) — fire and forget
    connectAngelFeed();
  });
}

async function connectAngelFeed() {
  try {
    await angelFeed.connect();
    marketDataEngine.connectAdapter('angelone-smartstream');

    // Wire token propagation via callback (replaces old 60-second setInterval)
    const propagateToken = (session) => {
      if (session) {
        candleService.setAuthToken(session.jwtToken);
        depthService.setAuthToken(session.jwtToken);
        optionChainService.setAuthToken(session.jwtToken);

        // Also update the shared broker adapter session
        const clientId = session.clientId || process.env.ANGEL_CLIENT_ID || 'default';
        const existing = BrokerFactory.get('angelone', clientId);
        if (existing) {
          existing.session.token = session.jwtToken;
          existing.session.refreshToken = session.refreshToken;
          existing.session.feedToken = session.feedToken;
          existing.session.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
        }
      }
    };

    // Register callback for immediate token propagation on refresh/reconnect
    angelFeed.onTokenRefresh(propagateToken);

    // Initial propagation
    propagateToken(angelFeed.session);

    // Wire refresh callbacks so services can self-heal on 403
    const refreshFn = async () => {
      const token = await angelFeed.ensureValidToken();
      return token;
    };
    candleService.setRefreshCallback(refreshFn);
    depthService.setRefreshCallback(refreshFn);
    optionChainService.setRefreshCallback(refreshFn);

    // Register a shared AngelOneAdapter instance for order execution
    const { AngelOneAdapter } = await import('./brokers/angelone/angelone.adapter.js');
    const sharedAdapter = new AngelOneAdapter();
    sharedAdapter.session = {
      provider: 'angelone',
      clientId: angelFeed.session.clientId,
      token: angelFeed.session.jwtToken,
      refreshToken: angelFeed.session.refreshToken,
      feedToken: angelFeed.session.feedToken,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    sharedAdapter._isConnected = true;
    sharedAdapter.feedToken = angelFeed.session.feedToken;
    BrokerFactory.registerInstance('angelone', sharedAdapter, angelFeed.session.clientId);

    const defaultTokens = [
      { token: '99926000', exchange: 'NSE' },  // NIFTY 50
      { token: '99926009', exchange: 'NSE' },  // BANKNIFTY
      { token: '99926037', exchange: 'NSE' },  // FINNIFTY
      { token: '99926074', exchange: 'NSE' },  // MIDCPNIFTY
      { token: '2885', exchange: 'NSE' },      // RELIANCE
      { token: '3045', exchange: 'NSE' },      // SBIN
      { token: '1333', exchange: 'NSE' },      // HDFCBANK
      { token: '11536', exchange: 'NSE' },     // TCS
      { token: '1594', exchange: 'NSE' },      // INFY
    ];

    // Register token exchanges for candle service
    defaultTokens.forEach(t => candleService.registerTokenExchange(t.token, t.exchange));

    // Split tokens: indices (mode 1 LTP) vs stocks (mode 2 Quote)
    const indexTokens = defaultTokens.filter(t => t.token.startsWith('999'));
    const stockTokens = defaultTokens.filter(t => !t.token.startsWith('999'));

    if (indexTokens.length > 0) {
      angelFeed.subscribe(indexTokens, 1); // LTP mode for indices (no order book)
    }
    if (stockTokens.length > 0) {
      angelFeed.subscribe(stockTokens, 2); // Quote mode for stocks (OHLC + volume + change)
    }
    console.log(`[AngelFeed] ✓ ${indexTokens.length} indices (mode 1) + ${stockTokens.length} stocks (mode 2) subscribed`);

    // Hook live ticks into candle aggregation
    for (const t of defaultTokens) {
      marketDataEngine.subscribe(t.token, (event) => {
        if (event.data?.ltp) {
          candleService.processLiveTick(t.token, event.data.ltp, event.data.volume, event.data.timestamp);
        }
      });
    }

    // Start real-time position P&L tracking (dev mode or authenticated account)
    if (process.env.DEV_BYPASS_AUTH === 'true') {
      accountService.startPositionTracking('dev-account').catch(err => {
        console.warn(`[AngelFeed] Position tracking init skipped: ${err.message}`);
      });
    }
  } catch (err) {
    console.warn(`[AngelFeed] ✗ Connection failed: ${err.message}`);
    console.warn('[AngelFeed]   Market data will be empty until feed connects');
  }
}

startup().catch((err) => {
  console.error('[Startup] FATAL:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Shutdown] SIGTERM received, closing...');
  eventDispatcher.destroy();
  healthMonitor.stop();
  eventBridge.stop();
  angelFeed.disconnect();
  marketDataEngine.destroy();
  eventBus.destroy();
  if (tradingViewDatafeed) tradingViewDatafeed.destroy();
  if (realtimeServer) realtimeServer.close();
  await redisPubSub.shutdown();
  await BrokerFactory.disconnectAll();
  adminWss.close();
  wss.close();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('[Shutdown] SIGINT received, closing...');
  eventDispatcher.destroy();
  healthMonitor.stop();
  eventBridge.stop();
  angelFeed.disconnect();
  marketDataEngine.destroy();
  eventBus.destroy();
  if (tradingViewDatafeed) tradingViewDatafeed.destroy();
  if (realtimeServer) realtimeServer.close();
  await redisPubSub.shutdown();
  await BrokerFactory.disconnectAll();
  adminWss.close();
  wss.close();
  server.close(() => process.exit(0));
});
