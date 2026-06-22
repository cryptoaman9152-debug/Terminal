/**
 * ORDER REPOSITORY
 * 
 * Database operations for orders table.
 * All queries scoped by accountId.
 */

import { BaseRepository } from './base.repository.js';

export class OrderRepository extends BaseRepository {
  constructor() {
    super('trading_orders');
  }

  async findByAccountId(accountId, options = {}) {
    let query = this.db
      .from(this.tableName)
      .select('*')
      .eq('challenge_account_id', accountId)
      .order('created_at', { ascending: false });

    if (options.status) {
      query = query.eq('status', options.status);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[orders] findByAccountId failed: ${error.message}`);
    return data || [];
  }

  async findOpenOrders(accountId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('challenge_account_id', accountId)
      .in('status', ['PENDING', 'OPEN'])
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[orders] findOpenOrders failed: ${error.message}`);
    return data || [];
  }

  async findTodayOrders(accountId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('challenge_account_id', accountId)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[orders] findTodayOrders failed: ${error.message}`);
    return data || [];
  }

  async createOrder(accountId, params) {
    return this.insert({
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
    });
  }

  async updateStatus(orderId, status, updates = {}) {
    return this.update(orderId, {
      status,
      ...updates,
    });
  }

  async markFilled(orderId, filledQty, avgPrice, brokerOrderId = null) {
    return this.update(orderId, {
      status: 'FILLED',
      filled_qty: filledQty,
      average_price: avgPrice,
    });
  }

  async markRejected(orderId, reason) {
    return this.update(orderId, {
      status: 'REJECTED',
      rejection_reason: reason,
    });
  }

  async markCancelled(orderId) {
    return this.update(orderId, { status: 'CANCELLED' });
  }

  async countTodayTrades(accountId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count, error } = await this.db
      .from(this.tableName)
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'FILLED')
      .gte('placed_at', today.toISOString());

    if (error) throw new Error(`[orders] countTodayTrades failed: ${error.message}`);
    return count || 0;
  }
}

