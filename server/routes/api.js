import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';

import { TradingViewDatafeed } from '../realtime/tradingview.datafeed.js';

export function createApiRouter(accountService, instrumentService, marketDataEngine, candleService, depthService, optionChainService) {
  const router = Router();
  const tvDatafeed = new TradingViewDatafeed(instrumentService, marketDataEngine);

  // === PROTECTED ===

  router.get('/account', requireAuth, async (req, res) => {
    try {
      res.json(await accountService.getAccount(req.user.accountId));
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.get('/account/challenge', requireAuth, async (req, res) => {
    try {
      const { ChallengeService } = await import('../services/challengeService.js');
      const progress = await ChallengeService.getProgress(req.user.accountId);
      res.json(progress || {});
    } catch (err) {
      if (err.message && err.message.includes('schema cache')) {
        return res.json({});
      }
      res.status(500).json({ message: err.message });
    }
  });

  // Payout eligibility check
  router.get('/account/payout/eligibility', requireAuth, async (req, res) => {
    try {
      const { PayoutService } = await import('../services/payoutService.js');
      const eligibility = await PayoutService.checkEligibility(req.user.accountId);
      res.json(eligibility);
    } catch (err) {
      if (err.message && err.message.includes('schema cache')) {
        return res.json({ eligible: false, reason: 'Service unavailable' });
      }
      res.status(500).json({ message: err.message });
    }
  });

  // Request payout
  router.post('/account/payout/request', requireAuth, async (req, res) => {
    try {
      const { PayoutService } = await import('../services/payoutService.js');
      const result = await PayoutService.requestPayout(req.user.accountId, req.user.userId);
      if (!result.success) {
        return res.status(422).json(result);
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // Payout history
  router.get('/account/payout/history', requireAuth, async (req, res) => {
    try {
      const { PayoutService } = await import('../services/payoutService.js');
      const history = await PayoutService.getPayoutHistory(req.user.accountId);
      res.json(history);
    } catch (err) {
      res.json([]);
    }
  });

  // Challenge phase promotion (manual trigger for admin/testing)
  router.post('/account/challenge/promote', requireAuth, async (req, res) => {
    try {
      const { ChallengeService } = await import('../services/challengeService.js');
      const result = await ChallengeService.promoteToNextPhase(req.user.accountId);
      if (!result) {
        return res.status(422).json({ success: false, reason: 'Not eligible for promotion (challenge must be passed)' });
      }
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  router.get('/account/rules', requireAuth, async (req, res) => {
    try {
      const rules = await accountService.getRules(req.user.accountId);
      res.json(rules);
    } catch (err) {
      if (err.message && err.message.includes('schema cache')) {
        return res.json([]);
      }
      res.status(500).json({ message: err.message });
    }
  });

  // Margin info
  router.get('/account/margin', requireAuth, async (req, res) => {
    try {
      const { MarginService } = await import('../services/marginService.js');
      const account = await accountService.getAccount(req.user.accountId);
      if (!account) return res.json({ balance: 0, usedMargin: 0, availableMargin: 0 });
      const balance = parseFloat(account.balance) || 0;
      const marginInfo = await MarginService.getAvailableMargin(req.user.accountId, balance);
      res.json(marginInfo);
    } catch (err) {
      res.json({ balance: 0, usedMargin: 0, availableMargin: 0 });
    }
  });

  // Holiday/market status
  router.get('/market/holiday', async (req, res) => {
    try {
      const { HolidayService } = await import('../services/holidayService.js');
      const status = HolidayService.checkMarketClosed();
      const upcoming = HolidayService.getUpcomingHolidays(5);
      res.json({ ...status, upcoming });
    } catch (err) {
      res.json({ isClosed: false, upcoming: [] });
    }
  });

  // Multiple accounts for a user
  router.get('/accounts', requireAuth, async (req, res) => {
    try {
      const { AccountRepository } = await import('../repositories/account.repository.js');
      const accounts = await new AccountRepository().findByUserId(req.user.userId);
      res.json(accounts || []);
    } catch (err) {
      if (err.message && err.message.includes('schema cache')) {
        return res.json([]);
      }
      res.json([]);
    }
  });

  // Switch active account (returns new account info)
  router.get('/accounts/:id', requireAuth, async (req, res) => {
    try {
      const account = await accountService.getAccount(req.params.id);
      if (!account) return res.status(404).json({ message: 'Account not found' });
      res.json(account);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  router.get('/positions', requireAuth, async (req, res) => {
    try {
      res.json(await accountService.getPositions(req.user.accountId));
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.post('/positions/close-all', requireAuth, requirePermission('trade'), async (req, res) => {
    try {
      const results = await accountService.closeAllPositions(req.user.accountId, req.body?.reason || 'user_requested');
      res.json({ status: 'closed', results });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.post('/positions/:id/exit', requireAuth, requirePermission('trade'), async (req, res) => {
    try {
      const qty = req.body?.qty ? parseInt(req.body.qty) : null;
      const result = await accountService.exitPosition(req.user.accountId, req.params.id, qty);
      res.json({ status: 'exited', orderId: result.orderId });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.post('/positions/:id/reverse', requireAuth, requirePermission('trade'), async (req, res) => {
    try {
      const result = await accountService.reversePosition(req.user.accountId, req.params.id);
      res.json({ status: 'reversed', orderId: result.orderId });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.get('/orders', requireAuth, async (req, res) => {
    try {
      res.json(await accountService.getOrders(req.user.accountId));
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.post('/orders/place', requireAuth, requirePermission('trade'), async (req, res) => {
    try {
      const p = req.body;
      if (!p.symbol || !p.token || !p.side || !p.orderType || !p.qty) {
        return res.status(400).json({ message: 'Missing required order parameters' });
      }
      const result = await accountService.placeOrder(req.user.accountId, p);
      res.json(result);
    } catch (err) {
      res.status(err.message.includes('rejected') ? 422 : 500).json({ message: err.message });
    }
  });

  router.put('/orders/:id/modify', requireAuth, requirePermission('trade'), async (req, res) => {
    try {
      res.json(await accountService.modifyOrder(req.user.accountId, req.params.id, req.body));
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.delete('/orders/:id/cancel', requireAuth, requirePermission('trade'), async (req, res) => {
    try {
      res.json(await accountService.cancelOrder(req.user.accountId, req.params.id));
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.get('/trades', requireAuth, async (req, res) => {
    try {
      res.json(await accountService.getTrades(req.user.accountId, req.query.period));
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // Watchlists
  router.get('/watchlists', requireAuth, async (req, res) => {
    try {
      const { WatchlistRepository } = await import('../repositories/watchlist.repository.js');
      const data = await new WatchlistRepository().findByUserId(req.user.userId);
      res.json(data);
    } catch (err) {
      // Table may not exist — return empty array
      if (err.message && err.message.includes('schema cache')) {
        return res.json([]);
      }
      res.status(500).json({ message: err.message });
    }
  });

  router.post('/watchlists', requireAuth, async (req, res) => {
    try {
      const { WatchlistRepository } = await import('../repositories/watchlist.repository.js');
      res.json(await new WatchlistRepository().createWatchlist(req.user.userId, req.body));
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.put('/watchlists/:id', requireAuth, async (req, res) => {
    try {
      const { WatchlistRepository } = await import('../repositories/watchlist.repository.js');
      const repo = new WatchlistRepository();
      const { items, name, color } = req.body;
      if (items !== undefined) await repo.updateItems(req.params.id, items);
      if (name !== undefined) await repo.updateName(req.params.id, name);
      if (color !== undefined) await repo.updateColor(req.params.id, color);
      res.json(await repo.findById(req.params.id));
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.delete('/watchlists/:id', requireAuth, async (req, res) => {
    try {
      const { WatchlistRepository } = await import('../repositories/watchlist.repository.js');
      await new WatchlistRepository().deleteWatchlist(req.params.id);
      res.json({ status: 'deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // === PUBLIC ===

  router.get('/instruments/search', (req, res) => {
    const { q, segment } = req.query;
    if (!q) return res.json([]);
    res.json(instrumentService.search(q, segment));
  });

  router.get('/instruments', (req, res) => {
    const { segment } = req.query;
    if (!segment) return res.json([]);
    res.json(instrumentService.getBySegment(segment));
  });

  router.get('/market/history', async (req, res) => {
    const { token, tf, from, to } = req.query;
    if (!token || !tf) return res.status(400).json({ message: 'token and tf required' });

    // Use CandleService for historical data from Angel One API
    if (candleService) {
      const candles = await candleService.getHistoricalCandles(
        token, tf,
        from ? parseInt(from) : undefined,
        to ? parseInt(to) : undefined
      );
      if (candles.length > 0) return res.json(candles);
    }

    // Fallback: return empty
    res.json([]);
  });

  router.get('/market/depth', async (req, res) => {
    const { token, exchange } = req.query;
    if (!token) return res.status(400).json({ message: 'token required' });
    if (depthService) {
      const depth = await depthService.getDepth(token, exchange || 'NSE');
      return res.json(depth);
    }
    res.json(marketDataEngine.getDepth(token));
  });

  router.get('/market/quote', (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'token required' });
    const quote = marketDataEngine.getQuote(token);
    if (!quote) return res.json(null);
    res.json(quote);
  });

  router.get('/market/status', (req, res) => {
    const mdeStatus = marketDataEngine.getStatus();
    const symbols = {};
    for (const [token, quote] of marketDataEngine.quotes) {
      symbols[token] = { ltp: quote.ltp, exchange: quote.exchange, timestamp: quote.timestamp };
    }
    res.json({
      feed: {
        connected: mdeStatus.isLive,
        adapterName: mdeStatus.adapterName,
        subscribedSymbols: mdeStatus.cachedQuotes,
      },
      symbols,
      socketClients: 0, // Will be populated when realtimeServer is accessible
    });
  });

  router.get('/market/option-chain', async (req, res) => {
    const { symbol, expiry } = req.query;
    if (!symbol || !expiry) return res.status(400).json({ message: 'symbol and expiry required' });
    if (optionChainService) {
      console.log(`[OptionChain] Request: symbol=${symbol}, expiry=${expiry}`);
      const chain = await optionChainService.getOptionChain(symbol, expiry);
      console.log(`[OptionChain] Response: ${chain.length} strikes returned`);
      return res.json(chain);
    }
    res.json([]);
  });

  router.get('/market/expiries', (req, res) => {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ message: 'symbol required' });
    res.json(instrumentService.getExpiries(symbol));
  });

  // === TRADINGVIEW DATAFEED ENDPOINTS ===

  router.get('/tv/config', (req, res) => {
    res.json({
      supported_resolutions: ['1', '3', '5', '15', '30', '60', '240', 'D', 'W', 'M'],
      supports_group_request: false,
      supports_marks: false,
      supports_search: true,
      supports_timescale_marks: false,
      exchanges: [
        { value: 'NSE', name: 'NSE', desc: 'National Stock Exchange' },
        { value: 'NFO', name: 'NFO', desc: 'NSE Futures & Options' },
        { value: 'MCX', name: 'MCX', desc: 'Multi Commodity Exchange' },
        { value: 'CDS', name: 'CDS', desc: 'Currency Derivatives' },
      ],
    });
  });

  router.get('/tv/symbols', (req, res) => {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ s: 'error', errmsg: 'symbol required' });
    const info = tvDatafeed.resolveSymbol(symbol);
    if (!info) return res.status(404).json({ s: 'error', errmsg: 'Symbol not found' });
    res.json(info);
  });

  router.get('/tv/search', (req, res) => {
    const { query, type, exchange, limit } = req.query;
    const results = tvDatafeed.searchSymbols(query || '', type, exchange);
    res.json(results.slice(0, parseInt(limit) || 30));
  });

  router.get('/tv/history', async (req, res) => {
    const { symbol, resolution, from, to } = req.query;
    if (!symbol || !resolution) {
      return res.json({ s: 'error', errmsg: 'symbol and resolution required' });
    }

    // Resolve token from symbol name
    const info = tvDatafeed.resolveSymbol(symbol);
    const token = info?.token || symbol;

    // Fetch from CandleService (Angel One historical API)
    const candles = candleService
      ? await candleService.getHistoricalCandles(token, resolution, parseInt(from) || undefined, parseInt(to) || undefined)
      : [];

    if (!candles || candles.length === 0) {
      return res.json({ s: 'no_data' });
    }

    // TradingView UDF format
    res.json({
      s: 'ok',
      t: candles.map(b => b.time),
      o: candles.map(b => b.open),
      h: candles.map(b => b.high),
      l: candles.map(b => b.low),
      c: candles.map(b => b.close),
      v: candles.map(b => b.volume),
    });
  });

  // Broker health endpoint (for monitoring)
  router.get('/broker/health', async (req, res) => {
    try {
      const { BrokerFactory } = await import('../brokers/broker.factory.js');
      res.json(BrokerFactory.getHealthReport());
    } catch {
      res.json({ error: 'broker factory not available' });
    }
  });

  return router;
}
