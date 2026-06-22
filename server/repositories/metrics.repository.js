/**
 * METRICS REPOSITORY
 * 
 * Database operations for account_metrics table.
 * Daily snapshots for reporting and drawdown tracking.
 */

import { BaseRepository } from './base.repository.js';

export class MetricsRepository extends BaseRepository {
  constructor() {
    super('account_metrics');
  }

  async findByAccountId(accountId, options = {}) {
    let query = this.db
      .from(this.tableName)
      .select('*')
      .eq('account_id', accountId)
      .order('date', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[metrics] findByAccountId failed: ${error.message}`);
    return data || [];
  }

  async findByDate(accountId, date) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    return this.findOne({
      account_id: accountId,
      date: dateStr,
    });
  }

  async upsertDailyMetrics(accountId, metrics) {
    const dateStr = metrics.date || new Date().toISOString().split('T')[0];

    const existing = await this.findByDate(accountId, dateStr);

    const record = {
      account_id: accountId,
      date: dateStr,
      starting_balance: metrics.startingBalance,
      ending_balance: metrics.endingBalance,
      realized_pnl: metrics.realizedPnl || 0,
      unrealized_pnl: metrics.unrealizedPnl || 0,
      total_trades: metrics.totalTrades || 0,
      winning_trades: metrics.winningTrades || 0,
      losing_trades: metrics.losingTrades || 0,
      max_drawdown: metrics.maxDrawdown || 0,
      daily_loss: metrics.dailyLoss || 0,
      peak_balance: metrics.peakBalance || metrics.endingBalance,
    };

    if (existing) {
      return this.update(existing.id, record);
    } else {
      return this.insert(record);
    }
  }

  async getMaxDrawdown(accountId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('max_drawdown, peak_balance')
      .eq('account_id', accountId)
      .order('max_drawdown', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`[metrics] getMaxDrawdown failed: ${error.message}`);
    }
    return data || { max_drawdown: 0, peak_balance: 0 };
  }

  async getTradingDaysCount(accountId) {
    const { count, error } = await this.db
      .from(this.tableName)
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .gt('total_trades', 0);

    if (error) throw new Error(`[metrics] getTradingDaysCount failed: ${error.message}`);
    return count || 0;
  }

  async getRecentMetrics(accountId, days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('account_id', accountId)
      .gte('date', from.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) throw new Error(`[metrics] getRecentMetrics failed: ${error.message}`);
    return data || [];
  }
}

