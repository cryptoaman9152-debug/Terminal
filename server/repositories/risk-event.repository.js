/**
 * RISK EVENT REPOSITORY
 * 
 * Persists all risk checks, violations, and alerts.
 * Immutable audit trail for compliance and debugging.
 */

import { BaseRepository } from './base.repository.js';

export class RiskEventRepository extends BaseRepository {
  constructor() {
    super('risk_events');
  }

  /**
   * Log a risk check that passed.
   */
  async logCheckPassed(accountId, ruleType, actualValue, orderId = null) {
    return this.insert({
      account_id: accountId,
      event_type: 'check_passed',
      severity: 'info',
      rule_type: ruleType,
      actual_value: actualValue,
      order_id: orderId,
      description: `Risk check passed: ${ruleType}`,
    });
  }

  /**
   * Log a risk check that failed (order rejected).
   */
  async logCheckFailed(accountId, ruleType, ruleValue, actualValue, orderId = null, description = null) {
    return this.insert({
      account_id: accountId,
      event_type: 'check_failed',
      severity: 'warning',
      rule_type: ruleType,
      rule_value: ruleValue,
      actual_value: actualValue,
      order_id: orderId,
      description: description || `Risk check failed: ${ruleType}`,
    });
  }

  /**
   * Log a risk violation (limit breached during trading).
   */
  async logViolation(accountId, eventType, ruleType, ruleValue, actualValue, description, metadata = {}) {
    return this.insert({
      account_id: accountId,
      event_type: eventType,
      severity: 'critical',
      rule_type: ruleType,
      rule_value: ruleValue,
      actual_value: actualValue,
      description,
      metadata,
    });
  }

  /**
   * Log account lockout due to breach.
   */
  async logAccountLocked(accountId, reason, ruleType = null, metadata = {}) {
    return this.insert({
      account_id: accountId,
      event_type: 'account_locked',
      severity: 'fatal',
      rule_type: ruleType,
      description: reason,
      metadata,
    });
  }

  /**
   * Log a risk warning (approaching limit but not breached).
   */
  async logWarning(accountId, ruleType, ruleValue, actualValue, description) {
    return this.insert({
      account_id: accountId,
      event_type: 'warning',
      severity: 'warning',
      rule_type: ruleType,
      rule_value: ruleValue,
      actual_value: actualValue,
      description,
    });
  }

  /**
   * Mark a risk event as resolved (e.g. position closed, limit recovered).
   */
  async resolve(eventId) {
    return this.update(eventId, {
      resolved: true,
      resolved_at: new Date().toISOString(),
    });
  }

  /**
   * Get all unresolved events for an account.
   */
  async findUnresolved(accountId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('account_id', accountId)
      .eq('resolved', false)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[risk_events] findUnresolved failed: ${error.message}`);
    return data || [];
  }

  /**
   * Get events by severity.
   */
  async findBySeverity(accountId, severity, options = {}) {
    let query = this.db
      .from(this.tableName)
      .select('*')
      .eq('account_id', accountId)
      .eq('severity', severity)
      .order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[risk_events] findBySeverity failed: ${error.message}`);
    return data || [];
  }

  /**
   * Get all events for an account within a time range.
   */
  async findByDateRange(accountId, fromDate, toDate) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('account_id', accountId)
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[risk_events] findByDateRange failed: ${error.message}`);
    return data || [];
  }

  /**
   * Get today's violations count (for dashboard).
   */
  async countTodayViolations(accountId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count, error } = await this.db
      .from(this.tableName)
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .in('severity', ['critical', 'fatal'])
      .gte('created_at', today.toISOString());

    if (error) throw new Error(`[risk_events] countTodayViolations failed: ${error.message}`);
    return count || 0;
  }

  /**
   * Get the most recent critical/fatal event.
   */
  async findLatestCritical(accountId) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('account_id', accountId)
      .in('severity', ['critical', 'fatal'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`[risk_events] findLatestCritical failed: ${error.message}`);
    }
    return data || null;
  }
}
