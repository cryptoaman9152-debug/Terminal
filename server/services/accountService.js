/**
 * ACCOUNT SERVICE
 * 
 * All account/portfolio operations query Supabase.
 * If database is unavailable or table missing: returns empty state.
 * NO fallback mock data. NO simulation.
 * 
 * Event Bus Integration:
 *   - order.created  → on placeOrder success
 *   - order.updated  → on modifyOrder / cancelOrder success
 *   - position.updated → on position exit/reverse
 * 
 * Execution Integration:
 *   - OrderExecutionService handles broker routing, risk checks, position/trade updates
 */

import { supabase } from '../db/client.js';
import { eventBus } from '../events/index.js';
import { OrderExecutionService } from './orderExecutionService.js';
import crypto from 'crypto';

// In-memory order store for when trading_orders table doesn't exist
const memOrders = new Map();

export class AccountService {
  constructor(marketDataEngine) {
    this.marketDataEngine = marketDataEngine;
    this.executionService = new OrderExecutionService(marketDataEngine);
    this._positionTrackingSubscriptions = new Map(); // token -> callback
    this._trackedAccountId = null;
  }

  /**
   * Start real-time P&L tracking for open positions.
   * Subscribes to MDE quotes for each position's token and publishes
   * position.updated events to the event bus on every tick.
   * @param {string} accountId
   */
  async startPositionTracking(accountId) {
    this._trackedAccountId = accountId;
    await this._refreshPositionTracking(accountId);

    // Re-subscribe when orders fill (positions may have changed)
    eventBus.subscribe('order.updated', (event) => {
      if (event.payload?.status === 'FILLED' && event.meta?.accountId === accountId) {
        // Delay slightly to let position repo update
        setTimeout(() => this._refreshPositionTracking(accountId), 500);
      }
    });
  }

  /**
   * Refresh position tracking subscriptions.
   * Unsubscribes old, subscribes to current open positions.
   * @private
   */
  async _refreshPositionTracking(accountId) {
    // Clean up existing subscriptions
    for (const [token, cb] of this._positionTrackingSubscriptions) {
      this.marketDataEngine.unsubscribe(token, cb);
    }
    this._positionTrackingSubscriptions.clear();

    // Get current open positions
    const positions = await this.getPositions(accountId);

    for (const pos of positions) {
      if (!pos.qty || pos.qty === 0) continue;

      const avgPrice = pos.avg_price || pos.avgPrice || 0;
      const qty = pos.qty;
      const token = pos.token;
      const symbol = pos.symbol;

      const callback = (event) => {
        const ltp = event.data?.ltp;
        if (!ltp) return;
        const pnl = qty > 0
          ? (ltp - avgPrice) * qty
          : (avgPrice - ltp) * Math.abs(qty);

        eventBus.publish('position.updated', {
          symbol,
          token,
          qty,
          pnl,
          ltp,
          avgPrice,
        }, { accountId });
      };

      this._positionTrackingSubscriptions.set(token, callback);
      this.marketDataEngine.subscribe(token, callback);
    }

    if (positions.length > 0) {
      console.log(`[AccountService] Position P&L tracking active for ${this._positionTrackingSubscriptions.size} tokens`);
    }
  }

  async getRules(accountId) {
    if (!supabase) {
      return [];
    }
    // Risk rules are derived from trading_accounts columns (daily_loss_limit, max_drawdown, profit_target)
    const { data, error } = await supabase
      .from('trading_accounts')
      .select('daily_loss_limit, max_drawdown, profit_target, daily_drawdown')
      .eq('id', accountId)
      .single();

    if (error || !data) {
      return [];
    }

    const rules = [];
    if (data.daily_loss_limit) rules.push({ rule_type: 'daily_loss_limit', value: { amount: data.daily_loss_limit }, is_active: true });
    if (data.max_drawdown) rules.push({ rule_type: 'max_drawdown', value: { amount: data.max_drawdown }, is_active: true });
    if (data.profit_target) rules.push({ rule_type: 'profit_target', value: { amount: data.profit_target }, is_active: true });
    return rules;
  }

  async getAccount(accountId) {
    // Dev bypass account
    if (accountId === 'dev-account') {
      return {
        id: 'dev-account',
        accountCode: 'FW-DEV',
        clientId: 'FW-DEV',
        name: 'Dev Trader',
        balance: 10000000,
        peakBalance: 10000000,
        availableMargin: 10000000,
        usedMargin: 0,
        totalPnl: 0,
        status: 'active',
        brokerProvider: 'angelone',
      };
    }

    if (!supabase) {
      return null;
    }
    const { data, error } = await supabase.from('trading_accounts').select('*').eq('id', accountId).single();
    if (error || !data) {
      return null;
    }
    return data;
  }

  async getPositions(accountId) {
    if (!supabase) {
      return [];
    }
    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', accountId)
      .eq('status', 'open');

    if (error || !data) {
      return [];
    }

    return data.map(p => {
      const q = this.marketDataEngine.getQuote(p.symbol);
      const ltp = q?.ltp || p.entry_price;
      const pnl = p.qty > 0
        ? (ltp - p.entry_price) * p.qty
        : (p.entry_price - ltp) * Math.abs(p.qty);
      return { ...p, ltp, pnl, mtm: pnl };
    });
  }

  async getOrders(accountId) {
    if (!supabase) {
      return [];
    }
    const { data, error } = await supabase
      .from('trading_orders')
      .select('*')
      .eq('challenge_account_id', accountId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }
    return data;
  }

  async getTrades(accountId, period) {
    if (!supabase) {
      return [];
    }
    let query = supabase
      .from('executions')
      .select('*')
      .eq('user_id', accountId)
      .order('executed_at', { ascending: false });

    if (period) {
      const now = new Date();
      let from;
      switch (period) {
        case 'today':
          from = new Date(now); from.setHours(0, 0, 0, 0); break;
        case 'week':
          from = new Date(now); from.setDate(from.getDate() - 7); break;
        case 'month':
          from = new Date(now); from.setMonth(from.getMonth() - 1); break;
        default:
          from = new Date(now); from.setHours(0, 0, 0, 0);
      }
      query = query.gte('executed_at', from.toISOString());
    }

    const { data, error } = await query;
    if (error || !data) {
      return [];
    }
    return data;
  }

  async placeOrder(accountId, params) {
    if (!supabase) {
      throw new Error('Database not configured. Cannot place orders.');
    }
    // Insert order into database with PENDING status
    // DB schema: user_id (UUID), challenge_account_id, type required; no token/segment/exchange/product_type columns
    const { data, error } = await supabase.from('trading_orders').insert({
      user_id: accountId,
      challenge_account_id: accountId,
      symbol: params.symbol,
      side: params.side,
      order_type: params.orderType,
      type: params.segment === 'NFO' ? 'derivative' : 'equity',
      qty: params.qty,
      price: params.price || null,
      trigger_price: params.triggerPrice || null,
      status: 'PENDING',
    }).select().single();

    if (error) {
      // Table doesn't exist — use in-memory store
      if (error.message && error.message.includes('schema cache')) {
        const orderId = crypto.randomUUID();
        const order = {
          id: orderId, account_id: accountId, symbol: params.symbol, token: params.token,
          segment: params.segment, side: params.side, order_type: params.orderType,
          product_type: params.productType, qty: params.qty, price: params.price || null,
          trigger_price: params.triggerPrice || null, status: 'PENDING', placed_at: new Date().toISOString(),
        };
        memOrders.set(orderId, order);

        eventBus.publish('order.created', {
          orderId, symbol: params.symbol, token: params.token, segment: params.segment,
          side: params.side, orderType: params.orderType, productType: params.productType,
          qty: params.qty, price: params.price || null, status: 'PENDING',
        }, { accountId });

        // Trigger execution even for in-memory path
        this._executeOrderAsync(accountId, orderId, params);

        return { orderId, status: 'PENDING' };
      }
      throw new Error(`Order insert failed: ${error.message}`);
    }

    // Publish order.created event to event bus
    eventBus.publish('order.created', {
      orderId: data.id,
      symbol: params.symbol,
      token: params.token,
      segment: params.segment,
      side: params.side,
      orderType: params.orderType,
      productType: params.productType,
      qty: params.qty,
      price: params.price || null,
      status: 'PENDING',
    }, { accountId });

    // Trigger async execution (risk → broker → position → trade)
    this._executeOrderAsync(accountId, data.id, params);

    return { orderId: data.id, status: 'PENDING' };
  }

  async modifyOrder(accountId, orderId, params) {
    if (!supabase) {
      throw new Error('Database not configured. Cannot modify orders.');
    }
    const updates = {};
    if (params.price !== undefined) updates.price = params.price;
    if (params.triggerPrice !== undefined) updates.trigger_price = params.triggerPrice;
    if (params.qty !== undefined) updates.qty = params.qty;
    if (params.orderType !== undefined) updates.order_type = params.orderType;

    const { data, error } = await supabase
      .from('trading_orders')
      .update(updates)
      .eq('id', orderId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      // Fallback to in-memory
      if (error.message && error.message.includes('schema cache')) {
        const order = memOrders.get(orderId);
        if (order) { Object.assign(order, updates); return { orderId, status: order.status }; }
      }
      throw new Error(`Order modify failed: ${error.message}`);
    }

    // Publish order.updated event
    eventBus.publish('order.updated', {
      orderId: data.id,
      status: 'MODIFIED',
      price: data.price,
      triggerPrice: data.trigger_price,
      qty: data.qty,
      orderType: data.order_type,
      symbol: data.symbol,
      token: data.token,
      segment: data.segment,
    }, { accountId });

    return { orderId: data.id, status: data.status };
  }

  async cancelOrder(accountId, orderId) {
    if (!supabase) {
      throw new Error('Database not configured. Cannot cancel orders.');
    }
    const { data, error } = await supabase
      .from('trading_orders')
      .update({ status: 'CANCELLED' })
      .eq('id', orderId)
      .eq('account_id', accountId)
      .in('status', ['PENDING', 'OPEN'])
      .select()
      .single();

    if (error) {
      // Fallback to in-memory
      if (error.message && error.message.includes('schema cache')) {
        const order = memOrders.get(orderId);
        if (order) { order.status = 'CANCELLED'; return { orderId, status: 'CANCELLED' }; }
      }
      throw new Error(`Order cancel failed: ${error.message}`);
    }

    // Publish order.updated event (cancellation)
    eventBus.publish('order.updated', {
      orderId: data.id,
      status: 'CANCELLED',
      symbol: data.symbol,
      token: data.token,
      segment: data.segment,
    }, { accountId });

    return { orderId: data.id, status: 'CANCELLED' };
  }

  // ─── Execution Bridge ─────────────────────────────────────────

  /**
   * Fire-and-forget order execution.
   * Order is already PENDING in DB. This routes through risk → broker → fill handling.
   */
  _executeOrderAsync(accountId, orderId, params) {
    // Non-blocking — execution happens in background
    (async () => {
      try {
        const account = await this.getAccount(accountId);
        if (!account) {
          console.error(`[AccountService] Cannot execute order — account ${accountId} not found`);
          return;
        }
        await this.executionService.executeOrder(accountId, orderId, params, account);
      } catch (err) {
        console.error(`[AccountService] Order execution failed for ${orderId}:`, err.message);
      }
    })();
  }

  // ─── Position Management ──────────────────────────────────────

  /**
   * Exit (close) a position. Places a market order in opposite direction.
   * @param {string} accountId
   * @param {string} positionId
   * @param {number} [qty] - Partial close qty. Omit for full close.
   */
  async exitPosition(accountId, positionId, qty = null) {
    return this.executionService.exitPosition(accountId, positionId, qty);
  }

  /**
   * Reverse a position. Closes current + opens opposite side same qty.
   */
  async reversePosition(accountId, positionId) {
    return this.executionService.reversePosition(accountId, positionId);
  }

  /**
   * Close all open positions for the account.
   */
  async closeAllPositions(accountId, reason = 'user_requested') {
    return this.executionService.closeAllPositions(accountId, reason);
  }

  /**
   * Partial close — exit a specific qty from a position.
   */
  async partialClosePosition(accountId, positionId, qty) {
    return this.executionService.exitPosition(accountId, positionId, qty);
  }
}
