/**
 * TRADE REPOSITORY
 * 
 * Database operations for trades table.
 * Trades are immutable execution records.
 */

import { BaseRepository } from './base.repository.js';
import { eventBus } from '../events/index.js';

export class TradeRepository extends BaseRepository {
  constructor() {
    super('executions');
  }

  async findByAccountId(accountId, options = {}) {
    let query = this.db
      .from(this.tableName)
      .select('*')
      .eq('user_id', accountId)
      .order('executed_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[trades] findByAccountId failed: ${error.message}`);
    return data || [];
  }

  async findTodayTrades(accountId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('user_id', accountId)
      .gte('executed_at', today.toISOString())
      .order('executed_at', { ascending: false });

    if (error) throw new Error(`[trades] findTodayTrades failed: ${error.message}`);
    return data || [];
  }

  async findByPeriod(accountId, period) {
    const now = new Date();
    let from;

    switch (period) {
      case 'today':
        from = new Date(now);
        from.setHours(0, 0, 0, 0);
        break;
      case 'week':
        from = new Date(now);
        from.setDate(from.getDate() - 7);
        break;
      case 'month':
        from = new Date(now);
        from.setMonth(from.getMonth() - 1);
        break;
      default:
        from = new Date(now);
        from.setHours(0, 0, 0, 0);
    }

    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('user_id', accountId)
      .gte('executed_at', from.toISOString())
      .order('executed_at', { ascending: false });

    if (error) throw new Error(`[trades] findByPeriod failed: ${error.message}`);
    return data || [];
  }

  async recordTrade(accountId, orderId, params) {
    const result = await this.insert({
      user_id: accountId,
      order_id: orderId,
      symbol: params.symbol,
      side: params.side,
      qty: params.qty,
      price: params.price,
    });

    // Publish trade.executed event
    if (result) {
      eventBus.publish('trade.executed', {
        tradeId: result.id || `${orderId}-${Date.now()}`,
        orderId,
        symbol: params.symbol,
        token: params.token,
        side: params.side,
        qty: params.qty,
        price: params.price,
        segment: params.segment,
      }, { accountId });
    }

    return result;
  }

  async getTodayRealizedPnl(accountId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await this.db
      .from(this.tableName)
      .select('side, qty, price, symbol')
      .eq('user_id', accountId)
      .gte('executed_at', today.toISOString())
      .order('executed_at', { ascending: true });

    if (error) throw new Error(`[trades] getTodayRealizedPnl failed: ${error.message}`);
    return data || [];
  }

  async countTodayTrades(accountId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count, error } = await this.db
      .from(this.tableName)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', accountId)
      .gte('executed_at', today.toISOString());

    if (error) throw new Error(`[trades] countTodayTrades failed: ${error.message}`);
    return count || 0;
  }
}

