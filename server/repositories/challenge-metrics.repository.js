/**
 * CHALLENGE METRICS REPOSITORY
 * 
 * Granular event log for challenge progression.
 * Every state change in the challenge lifecycle is captured here.
 */

import { BaseRepository } from './base.repository.js';

export class ChallengeMetricsRepository extends BaseRepository {
  constructor() {
    super('challenge_progress');
  }

  /**
   * Log challenge started.
   */
  async logChallengeStarted(challengeId, accountId, initialBalance) {
    return this.insert({
      challenge_id: challengeId,
      account_id: accountId,
      event_type: 'challenge_started',
      balance_before: initialBalance,
      balance_after: initialBalance,
      pnl: 0,
      pnl_percent: 0,
      peak_balance: initialBalance,
      trading_days_elapsed: 0,
      total_trades: 0,
      description: 'Challenge started',
    });
  }

  /**
   * Log challenge updated (generic state change).
   */
  async logChallengeUpdated(challengeId, accountId, data) {
    return this.insert({
      challenge_id: challengeId,
      account_id: accountId,
      event_type: 'challenge_updated',
      balance_before: data.balanceBefore,
      balance_after: data.balanceAfter,
      pnl: data.pnl,
      pnl_percent: data.pnlPercent,
      drawdown: data.drawdown,
      drawdown_percent: data.drawdownPercent,
      peak_balance: data.peakBalance,
      trading_days_elapsed: data.tradingDays,
      total_trades: data.totalTrades,
      win_rate: data.winRate,
      description: data.description || 'Challenge metrics updated',
      metadata: data.metadata || {},
    });
  }

  /**
   * Log challenge passed.
   */
  async logChallengePassed(challengeId, accountId, finalBalance, initialBalance, tradingDays, totalTrades, winRate) {
    const pnl = finalBalance - initialBalance;
    return this.insert({
      challenge_id: challengeId,
      account_id: accountId,
      event_type: 'challenge_passed',
      balance_before: initialBalance,
      balance_after: finalBalance,
      pnl,
      pnl_percent: (pnl / initialBalance) * 100,
      peak_balance: finalBalance,
      trading_days_elapsed: tradingDays,
      total_trades: totalTrades,
      win_rate: winRate,
      description: `Challenge passed with ${((pnl / initialBalance) * 100).toFixed(2)}% profit`,
    });
  }

  /**
   * Log challenge failed.
   */
  async logChallengeFailed(challengeId, accountId, reason, data = {}) {
    return this.insert({
      challenge_id: challengeId,
      account_id: accountId,
      event_type: 'challenge_failed',
      balance_before: data.balanceBefore,
      balance_after: data.balanceAfter,
      pnl: data.pnl,
      pnl_percent: data.pnlPercent,
      drawdown: data.drawdown,
      drawdown_percent: data.drawdownPercent,
      peak_balance: data.peakBalance,
      trading_days_elapsed: data.tradingDays,
      total_trades: data.totalTrades,
      win_rate: data.winRate,
      description: `Challenge failed: ${reason}`,
    });
  }

  /**
   * Log end-of-day balance snapshot.
   */
  async logBalanceSnapshot(challengeId, accountId, data) {
    return this.insert({
      challenge_id: challengeId,
      account_id: accountId,
      event_type: 'balance_snapshot',
      balance_before: data.openBalance,
      balance_after: data.closeBalance,
      pnl: data.dayPnl,
      pnl_percent: data.dayPnlPercent,
      drawdown: data.drawdown,
      drawdown_percent: data.drawdownPercent,
      peak_balance: data.peakBalance,
      trading_days_elapsed: data.tradingDays,
      total_trades: data.totalTrades,
      win_rate: data.winRate,
      description: `Day ${data.tradingDays} complete: PnL ₹${data.dayPnl}`,
    });
  }

  /**
   * Log trading day complete event.
   */
  async logTradingDayComplete(challengeId, accountId, data) {
    return this.insert({
      challenge_id: challengeId,
      account_id: accountId,
      event_type: 'trading_day_complete',
      balance_after: data.endBalance,
      pnl: data.dayPnl,
      pnl_percent: data.dayPnlPercent,
      trading_days_elapsed: data.tradingDays,
      total_trades: data.dayTrades,
      win_rate: data.dayWinRate,
      description: `Trading day ${data.tradingDays} closed`,
      metadata: { trades_today: data.dayTrades, winners: data.winners, losers: data.losers },
    });
  }

  /**
   * Log drawdown warning (approaching limit).
   */
  async logDrawdownWarning(challengeId, accountId, drawdown, drawdownPercent, maxAllowed) {
    return this.insert({
      challenge_id: challengeId,
      account_id: accountId,
      event_type: 'drawdown_warning',
      drawdown,
      drawdown_percent: drawdownPercent,
      description: `Drawdown warning: ${drawdownPercent.toFixed(2)}% (limit: ${maxAllowed}%)`,
      metadata: { max_allowed_percent: maxAllowed },
    });
  }

  /**
   * Log drawdown breach (challenge failed).
   */
  async logDrawdownBreach(challengeId, accountId, drawdown, drawdownPercent, maxAllowed) {
    return this.insert({
      challenge_id: challengeId,
      account_id: accountId,
      event_type: 'drawdown_breach',
      drawdown,
      drawdown_percent: drawdownPercent,
      description: `Drawdown breached: ${drawdownPercent.toFixed(2)}% exceeds limit of ${maxAllowed}%`,
      metadata: { max_allowed_percent: maxAllowed },
    });
  }

  /**
   * Log profit target reached.
   */
  async logProfitTargetReached(challengeId, accountId, pnl, pnlPercent, target) {
    return this.insert({
      challenge_id: challengeId,
      account_id: accountId,
      event_type: 'profit_target_reached',
      pnl,
      pnl_percent: pnlPercent,
      description: `Profit target reached: ${pnlPercent.toFixed(2)}% (target: ${target}%)`,
      metadata: { target_percent: target },
    });
  }

  /**
   * Log milestone (e.g. 50% of target, 5 consecutive winning days).
   */
  async logMilestone(challengeId, accountId, description, metadata = {}) {
    return this.insert({
      challenge_id: challengeId,
      account_id: accountId,
      event_type: 'milestone_reached',
      description,
      metadata,
    });
  }

  /**
   * Get full event history for a challenge.
   */
  async findByChallengeId(challengeId, options = {}) {
    let query = this.db
      .from(this.tableName)
      .select('*')
      .eq('challenge_id', challengeId)
      .order('created_at', { ascending: options.ascending ?? false });

    if (options.eventType) {
      query = query.eq('event_type', options.eventType);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[challenge_metrics] findByChallengeId failed: ${error.message}`);
    return data || [];
  }

  /**
   * Get daily snapshots for equity curve rendering.
   */
  async getDailySnapshots(challengeId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('balance_after, pnl, pnl_percent, drawdown, trading_days_elapsed, created_at')
      .eq('challenge_id', challengeId)
      .eq('event_type', 'balance_snapshot')
      .order('created_at', { ascending: true });

    if (error) throw new Error(`[challenge_metrics] getDailySnapshots failed: ${error.message}`);
    return data || [];
  }

  /**
   * Get latest metrics for a challenge.
   */
  async getLatest(challengeId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('challenge_id', challengeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`[challenge_metrics] getLatest failed: ${error.message}`);
    }
    return data || null;
  }
}
