/**
 * RISK RULES REPOSITORY
 * 
 * Derives risk rules from trading_accounts columns.
 * Production schema stores limits directly on the account:
 *   daily_loss_limit, max_drawdown, profit_target
 */

import { BaseRepository } from './base.repository.js';

export class RiskRulesRepository extends BaseRepository {
  constructor() {
    super('trading_accounts');
  }

  /**
   * Get risk rules for an account by reading the account's own limit columns.
   * Returns array of { rule_type, value, is_active } objects (compatible with RiskEngine).
   */
  async findByAccountId(accountId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('daily_loss_limit, max_drawdown, profit_target, daily_drawdown')
      .eq('id', accountId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`[risk_rules] findByAccountId failed: ${error.message}`);
    }
    if (!data) return [];

    // Convert account columns to rule objects
    const rules = [];
    if (data.daily_loss_limit) {
      rules.push({ rule_type: 'daily_loss_limit', value: { amount: data.daily_loss_limit }, is_active: true });
    }
    if (data.max_drawdown) {
      rules.push({ rule_type: 'max_drawdown', value: { amount: data.max_drawdown }, is_active: true });
    }
    if (data.profit_target) {
      rules.push({ rule_type: 'profit_target', value: { amount: data.profit_target }, is_active: true });
    }
    return rules;
  }

  async findRule(accountId, ruleType) {
    const rules = await this.findByAccountId(accountId);
    return rules.find(r => r.rule_type === ruleType) || null;
  }

  async getRulesMap(accountId) {
    const rules = await this.findByAccountId(accountId);
    const map = {};
    for (const rule of rules) {
      map[rule.rule_type] = rule.value;
    }
    return map;
  }

  async upsertRule(accountId, ruleType, value) {
    // Map rule_type back to account column
    const columnMap = {
      'daily_loss_limit': 'daily_loss_limit',
      'max_drawdown': 'max_drawdown',
      'profit_target': 'profit_target',
    };
    const column = columnMap[ruleType];
    if (!column) return null;

    const { data, error } = await this.db
      .from(this.tableName)
      .update({ [column]: value.amount || value })
      .eq('id', accountId)
      .select()
      .single();

    if (error) throw new Error(`[risk_rules] upsertRule failed: ${error.message}`);
    return data;
  }

  async deactivateRule(accountId, ruleType) {
    // Cannot deactivate account-level rules — they're always active
    return null;
  }
}

