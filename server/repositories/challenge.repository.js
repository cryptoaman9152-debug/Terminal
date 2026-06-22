/**
 * CHALLENGE REPOSITORY
 * 
 * Database operations for challenges table.
 * Challenge = evaluation or funded account lifecycle.
 */

import { BaseRepository } from './base.repository.js';

export class ChallengeRepository extends BaseRepository {
  constructor() {
    super('challenge_accounts');
  }

  async findByUserId(userId) {
    return this.findMany({ user_id: userId }, { orderBy: 'started_at', ascending: false });
  }

  async findActiveByUserId(userId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('started_at', { ascending: false });

    if (error) throw new Error(`[challenges] findActiveByUserId failed: ${error.message}`);
    return data || [];
  }

  async findByAccountId(accountId) {
    const { data, error } = await this.db
      .from('trading_accounts')
      .select('challenge_id')
      .eq('id', accountId)
      .single();

    if (error) throw new Error(`[challenges] findByAccountId failed: ${error.message}`);
    if (!data) return null;

    return this.findById(data.challenge_id);
  }

  async markPassed(challengeId) {
    return this.update(challengeId, {
      status: 'passed',
      passed_at: new Date().toISOString(),
    });
  }

  async markFailed(challengeId, reason) {
    return this.update(challengeId, {
      status: 'failed',
      failed_at: new Date().toISOString(),
      fail_reason: reason,
    });
  }

  async markExpired(challengeId) {
    return this.update(challengeId, {
      status: 'expired',
      failed_at: new Date().toISOString(),
      fail_reason: 'Time limit exceeded',
    });
  }

  async getProgress(challengeId, accountBalance) {
    const challenge = await this.findById(challengeId);
    if (!challenge) return null;

    const pnl = accountBalance - challenge.initial_balance;
    const pnlPercent = (pnl / challenge.initial_balance) * 100;

    return {
      challengeId: challenge.id,
      type: challenge.type,
      plan: challenge.plan,
      status: challenge.status,
      initialBalance: challenge.initial_balance,
      currentBalance: accountBalance,
      pnl,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      startedAt: challenge.started_at,
      expiresAt: challenge.expires_at,
    };
  }
}


