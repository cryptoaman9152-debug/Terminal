/**
 * ACCOUNT REPOSITORY
 * 
 * Database operations for accounts table.
 * All queries scoped by accountId or userId.
 */

import { BaseRepository } from './base.repository.js';

export class AccountRepository extends BaseRepository {
  constructor() {
    super('trading_accounts');
  }

  async findByUserId(userId) {
    return this.findMany({ user_id: userId }, { orderBy: 'created_at', ascending: false });
  }

  async findByAccountCode(accountCode) {
    return this.findOne({ account_code: accountCode });
  }

  async findActiveByUserId(userId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) throw new Error(`[accounts] findActiveByUserId failed: ${error.message}`);
    return data || [];
  }

  async updateBalance(accountId, newBalance) {
    return this.update(accountId, { balance: newBalance });
  }

  async updatePeakBalance(accountId, peakBalance) {
    return this.update(accountId, { peak_balance: peakBalance });
  }

  async lockAccount(accountId, reason) {
    return this.update(accountId, { status: 'locked', locked_reason: reason });
  }

  async breachAccount(accountId, reason) {
    return this.update(accountId, { status: 'breached', locked_reason: reason });
  }

  async completeAccount(accountId) {
    return this.update(accountId, { status: 'completed' });
  }

  async getWithChallenge(accountId) {
    // Get the trading account first
    const { data: account, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('id', accountId)
      .single();

    if (error) throw new Error(`[accounts] getWithChallenge failed: ${error.message}`);
    if (!account) return null;

    // Look up challenge account by the same user_id
    const { data: challenge } = await this.db
      .from('challenge_accounts')
      .select('*')
      .eq('user_id', account.user_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return { ...account, challenge: challenge || null };
  }
}

