/**
 * ADMIN WEBSOCKET FEED
 * 
 * Real-time trade/event feed for admin.fundedwealth.com.
 * Broadcasts:
 *   - order_placed: Every order placed by any user
 *   - position_opened / position_closed
 *   - account_locked / account_breached
 *   - challenge_passed / challenge_promoted
 * 
 * Auth: Requires ADMIN_SECRET header or query param.
 */

import { eventBus } from '../events/index.js';

export function setupAdminWebSocket(wss) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  wss.on('connection', (ws, request) => {
    // Validate admin auth
    const url = new URL(request.url, `http://${request.headers.host}`);
    const secret = url.searchParams.get('secret') || request.headers['x-admin-secret'];

    if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
      ws.send(JSON.stringify({ type: 'error', message: 'Admin authentication required' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    console.log('[AdminWS] Admin client connected');

    // Subscribe to all relevant events
    const subscriptions = [];

    const orderSub = eventBus.subscribe('order.created', (event) => {
      safeSend(ws, {
        type: 'order_placed',
        timestamp: Date.now(),
        data: {
          orderId: event.payload.orderId,
          accountId: event.meta?.accountId,
          symbol: event.payload.symbol,
          side: event.payload.side,
          orderType: event.payload.orderType,
          qty: event.payload.qty,
          price: event.payload.price,
          status: event.payload.status,
        },
      });
    });
    subscriptions.push(() => eventBus.unsubscribe('order.created', orderSub));

    const orderUpdateSub = eventBus.subscribe('order.updated', (event) => {
      if (event.payload.status === 'FILLED') {
        safeSend(ws, {
          type: 'order_filled',
          timestamp: Date.now(),
          data: {
            orderId: event.payload.orderId,
            accountId: event.meta?.accountId,
            symbol: event.payload.symbol,
            side: event.payload.side,
            filledQty: event.payload.filledQty,
            avgPrice: event.payload.avgPrice,
          },
        });
      }
    });
    subscriptions.push(() => eventBus.unsubscribe('order.updated', orderUpdateSub));

    const positionSub = eventBus.subscribe('position.updated', (event) => {
      safeSend(ws, {
        type: 'position_update',
        timestamp: Date.now(),
        data: {
          accountId: event.meta?.accountId,
          symbol: event.payload.symbol,
          qty: event.payload.qty,
          pnl: event.payload.pnl,
          ltp: event.payload.ltp,
        },
      });
    });
    subscriptions.push(() => eventBus.unsubscribe('position.updated', positionSub));

    const lockSub = eventBus.subscribe('account.locked', (event) => {
      safeSend(ws, {
        type: 'account_locked',
        timestamp: Date.now(),
        data: {
          accountId: event.payload.accountId,
          reason: event.payload.reason,
        },
      });
    });
    subscriptions.push(() => eventBus.unsubscribe('account.locked', lockSub));

    const breachSub = eventBus.subscribe('account.breached', (event) => {
      safeSend(ws, {
        type: 'account_breached',
        timestamp: Date.now(),
        data: {
          accountId: event.payload.accountId,
          reason: event.payload.reason,
        },
      });
    });
    subscriptions.push(() => eventBus.unsubscribe('account.breached', breachSub));

    const challengeSub = eventBus.subscribe('challenge.updated', (event) => {
      safeSend(ws, {
        type: 'challenge_update',
        timestamp: Date.now(),
        data: {
          challengeId: event.payload.challengeId,
          status: event.payload.status,
          reason: event.payload.reason,
          phase: event.payload.phase,
          accountId: event.meta?.accountId,
        },
      });
    });
    subscriptions.push(() => eventBus.unsubscribe('challenge.updated', challengeSub));

    const riskSub = eventBus.subscribe('risk.alert', (event) => {
      safeSend(ws, {
        type: 'risk_alert',
        timestamp: Date.now(),
        data: {
          accountId: event.meta?.accountId,
          type: event.payload.type,
          ruleType: event.payload.ruleType,
          message: event.payload.message,
          percentUsed: event.payload.percentUsed,
        },
      });
    });
    subscriptions.push(() => eventBus.unsubscribe('risk.alert', riskSub));

    ws.on('close', () => {
      subscriptions.forEach(unsub => unsub());
      console.log('[AdminWS] Admin client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[AdminWS] Error:', err.message);
    });

    // Send connection confirmation
    safeSend(ws, { type: 'connected', timestamp: Date.now(), message: 'Admin feed active' });
  });
}

function safeSend(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}
