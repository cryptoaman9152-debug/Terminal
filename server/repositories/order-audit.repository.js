/**
 * ORDER AUDIT REPOSITORY
 * 
 * Logs order and position events to the production execution_audits table.
 * 
 * Production schema: id(serial), user_id(int), actor_type, action, entity, entity_id, details(json), created_at
 * 
 * Mapping:
 *   entity = 'order' | 'position'
 *   entity_id = orderId or positionId
 *   action = event_type (order_created, order_filled, position_opened, etc.)
 *   details = JSON with all metadata (symbol, token, side, qty, price, etc.)
 */

import { BaseRepository } from './base.repository.js';

export class OrderAuditRepository extends BaseRepository {
  constructor() {
    super('execution_audits');
  }

  /**
   * Internal: insert an audit record mapped to production schema.
   */
  async _logEvent(entity, entityId, action, details = {}) {
    try {
      return await super.insert({
        user_id: 0, // System-generated events (no user context in backend)
        actor_type: 'system',
        action,
        entity,
        entity_id: String(entityId),
        details,
      });
    } catch (err) {
      // Non-critical — log but don't crash
      console.error(`[execution_audits] insert failed: ${err.message}`);
      return null;
    }
  }

  // ─── Order Events ──────────────────────────────────────────

  async logOrderCreated(orderId, accountId, params, brokerProvider = null) {
    return this._logEvent('order', orderId, 'order_created', {
      account_id: accountId,
      symbol: params.symbol,
      token: params.token,
      segment: params.segment,
      side: params.side,
      qty: params.qty,
      price: params.price,
      order_type: params.orderType,
      product_type: params.productType,
      broker_provider: brokerProvider,
    });
  }

  async logOrderSubmitted(orderId, accountId, symbol, token, segment, brokerProvider, latencyMs = null) {
    return this._logEvent('order', orderId, 'order_submitted', {
      account_id: accountId, symbol, token, segment, broker_provider: brokerProvider, latency_ms: latencyMs,
    });
  }

  async logOrderAccepted(orderId, accountId, symbol, token, segment, brokerOrderId, brokerProvider) {
    return this._logEvent('order', orderId, 'order_accepted', {
      account_id: accountId, symbol, token, segment, broker_order_id: brokerOrderId, broker_provider: brokerProvider,
    });
  }

  async logOrderOpen(orderId, accountId, symbol, token, segment, brokerOrderId) {
    return this._logEvent('order', orderId, 'order_open', {
      account_id: accountId, symbol, token, segment, broker_order_id: brokerOrderId,
    });
  }

  async logOrderFilled(orderId, accountId, params) {
    return this._logEvent('order', orderId, 'order_filled', {
      account_id: accountId, ...params,
    });
  }

  async logOrderCancelled(orderId, accountId, symbol, token, segment) {
    return this._logEvent('order', orderId, 'order_cancelled', {
      account_id: accountId, symbol, token, segment,
    });
  }

  async logOrderRejected(orderId, accountId, symbol, token, segment, reason, brokerProvider) {
    return this._logEvent('order', orderId, 'order_rejected', {
      account_id: accountId, symbol, token, segment, reject_reason: reason, broker_provider: brokerProvider,
    });
  }

  async logOrderModified(orderId, accountId, symbol, token, segment, changes) {
    return this._logEvent('order', orderId, 'order_modified', {
      account_id: accountId, symbol, token, segment, changes,
    });
  }

  // ─── Position Events ───────────────────────────────────────

  async logPositionOpened(orderId, accountId, params) {
    return this._logEvent('position', orderId, 'position_opened', {
      account_id: accountId, ...params,
    });
  }

  async logPositionUpdated(orderId, accountId, params) {
    return this._logEvent('position', orderId, 'position_updated', {
      account_id: accountId, ...params,
    });
  }

  async logPositionClosed(orderId, accountId, params) {
    return this._logEvent('position', orderId, 'position_closed', {
      account_id: accountId, ...params,
    });
  }

  async logPositionReversed(orderId, accountId, params) {
    return this._logEvent('position', orderId, 'position_reversed', {
      account_id: accountId, ...params,
    });
  }

  // ─── Query Methods ─────────────────────────────────────────

  async findByOrderId(orderId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('entity', 'order')
      .eq('entity_id', String(orderId))
      .order('created_at', { ascending: true });

    if (error) throw new Error(`[execution_audits] findByOrderId failed: ${error.message}`);
    return data || [];
  }

  async findByAccountId(accountId, options = {}) {
    // Search within details JSON for account_id
    let query = this.db
      .from(this.tableName)
      .select('*')
      .contains('details', { account_id: accountId })
      .order('created_at', { ascending: false });

    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) return [];
    return data || [];
  }
}
