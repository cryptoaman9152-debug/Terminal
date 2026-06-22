/**
 * POSITION REPOSITORY
 * 
 * Database operations for positions table.
 * All queries scoped by accountId.
 */

import { BaseRepository } from './base.repository.js';
import { eventBus } from '../events/index.js';

export class PositionRepository extends BaseRepository {
  constructor() {
    super('positions');
  }

  async findOpenByAccountId(accountId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('user_id', accountId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false });

    if (error) throw new Error(`[positions] findOpenByAccountId failed: ${error.message}`);
    return data || [];
  }

  async findAllByAccountId(accountId, options = {}) {
    let query = this.db
      .from(this.tableName)
      .select('*')
      .eq('user_id', accountId)
      .order('opened_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[positions] findAllByAccountId failed: ${error.message}`);
    return data || [];
  }

  async findOpenPosition(accountId, token, productType) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('user_id', accountId)
      .eq('symbol', token)
      .eq('status', 'open')
      .is('closed_at', null)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`[positions] findOpenPosition failed: ${error.message}`);
    }
    return data || null;
  }

  async upsertPosition(accountId, params) {
    // Check if open position exists for this token + product type
    const existing = await this.findOpenPosition(accountId, params.token, params.productType);

    if (existing) {
      // Update existing position (add to qty, recalculate avg)
      const isSameDirection = (existing.qty > 0 && params.side === 'BUY') ||
                              (existing.qty < 0 && params.side === 'SELL');

      let newQty, newAvgPrice, realizedPnl;

      if (isSameDirection) {
        // Adding to position
        const addQty = params.side === 'BUY' ? params.qty : -params.qty;
        newQty = existing.qty + addQty;
        newAvgPrice = ((existing.entry_price * Math.abs(existing.qty)) + (params.price * params.qty)) /
                      (Math.abs(existing.qty) + params.qty);
        realizedPnl = existing.pnl;
      } else {
        // Reducing or reversing position
        const closeQty = Math.min(params.qty, Math.abs(existing.qty));
        const pnlPerUnit = existing.qty > 0
          ? (params.price - existing.entry_price)
          : (existing.entry_price - params.price);
        realizedPnl = (existing.pnl || 0) + (pnlPerUnit * closeQty);

        const remainingQty = Math.abs(existing.qty) - closeQty;
        const excessQty = params.qty - closeQty;

        if (remainingQty === 0 && excessQty === 0) {
          // Position fully closed
          const result = await this.update(existing.id, {
            qty: 0,
            pnl: realizedPnl,
            exit_price: params.price,
            status: 'closed',
            closed_at: new Date().toISOString(),
          });

          // Publish position.updated (closed)
          eventBus.publish('position.updated', {
            symbol: existing.symbol,
            token: existing.token,
            qty: 0,
            pnl: realizedPnl,
            avgPrice: existing.entry_price,
            status: 'closed',
          }, { accountId });

          return result;
        } else if (remainingQty > 0) {
          // Position reduced
          newQty = existing.qty > 0 ? remainingQty : -remainingQty;
          newAvgPrice = existing.entry_price;
        } else {
          // Position reversed
          newQty = params.side === 'BUY' ? excessQty : -excessQty;
          newAvgPrice = params.price;
        }
      }

      const result = await this.update(existing.id, {
        qty: newQty,
        entry_price: Math.round(newAvgPrice * 100) / 100,
        pnl: Math.round((realizedPnl || 0) * 100) / 100,
      });

      // Publish position.updated
      eventBus.publish('position.updated', {
        symbol: existing.symbol,
        token: existing.token,
        qty: newQty,
        pnl: Math.round((realizedPnl || 0) * 100) / 100,
        avgPrice: Math.round(newAvgPrice * 100) / 100,
        status: 'open',
      }, { accountId });

      return result;
    } else {
      // Create new position
      const result = await this.insert({
        user_id: accountId,
        symbol: params.symbol,
        side: params.side,
        qty: params.side === 'BUY' ? params.qty : -params.qty,
        entry_price: params.price,
      });

      // Publish position.updated (new)
      eventBus.publish('position.updated', {
        symbol: params.symbol,
        token: params.token,
        qty: params.side === 'BUY' ? params.qty : -params.qty,
        pnl: 0,
        avgPrice: params.price,
        status: 'open',
      }, { accountId });

      return result;
    }
  }

  async closePosition(positionId, exitPrice) {
    const position = await this.findById(positionId);
    if (!position) throw new Error('Position not found');

    const pnlPerUnit = position.qty > 0
      ? (exitPrice - position.avg_price)
      : (position.avg_price - exitPrice);
    const realizedPnl = (position.realized_pnl || 0) + (pnlPerUnit * Math.abs(position.qty));

    return this.update(positionId, {
      qty: 0,
      realized_pnl: Math.round(realizedPnl * 100) / 100,
      closed_at: new Date().toISOString(),
    });
  }

  async countOpenPositions(accountId) {
    const { count, error } = await this.db
      .from(this.tableName)
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .is('closed_at', null)
      .neq('qty', 0);

    if (error) throw new Error(`[positions] countOpenPositions failed: ${error.message}`);
    return count || 0;
  }

  async getTotalUnrealizedPnl(accountId, quoteProvider) {
    const positions = await this.findOpenByAccountId(accountId);
    let totalPnl = 0;

    for (const pos of positions) {
      if (pos.qty === 0) continue;
      const ltp = quoteProvider ? quoteProvider(pos.token) : pos.avg_price;
      const pnl = pos.qty > 0
        ? (ltp - pos.avg_price) * pos.qty
        : (pos.avg_price - ltp) * Math.abs(pos.qty);
      totalPnl += pnl;
    }

    return Math.round(totalPnl * 100) / 100;
  }
}

