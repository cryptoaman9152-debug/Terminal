/**
 * AUDIT LOG REPOSITORY
 * 
 * Immutable event log for compliance and dispute resolution.
 * Records: account locks, breaches, challenge transitions, login events.
 * 
 * NEVER update or delete audit records.
 */

import { BaseRepository } from './base.repository.js';

export class AuditRepository extends BaseRepository {
  constructor() {
    super('audit_log');
  }

  /**
   * Log an event. Returns the created record.
   * @param {object} params
   * @param {string} params.accountId - Account involved (nullable)
   * @param {string} params.userId - User involved (nullable)
   * @param {string} params.eventType - e.g. 'account_locked', 'challenge_passed'
   * @param {object} params.eventData - Arbitrary JSON payload
   * @param {string} params.ipAddress - Client IP (optional)
   */
  async log({ accountId, userId, eventType, eventData = {}, ipAddress = null }) {
    return this.insert({
      account_id: accountId || null,
      user_id: userId || null,
      event_type: eventType,
      event_data: eventData,
      ip_address: ipAddress,
    });
  }

  async findByAccountId(accountId, options = {}) {
    let query = this.db
      .from(this.tableName)
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (options.eventType) {
      query = query.eq('event_type', options.eventType);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[audit_log] findByAccountId failed: ${error.message}`);
    return data || [];
  }

  async findByUserId(userId, options = {}) {
    let query = this.db
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options.eventType) {
      query = query.eq('event_type', options.eventType);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[audit_log] findByUserId failed: ${error.message}`);
    return data || [];
  }

  async findByEventType(eventType, options = {}) {
    let query = this.db
      .from(this.tableName)
      .select('*')
      .eq('event_type', eventType)
      .order('created_at', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.since) {
      query = query.gte('created_at', options.since);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[audit_log] findByEventType failed: ${error.message}`);
    return data || [];
  }

  // Override update/delete — audit log is immutable
  async update() {
    throw new Error('[audit_log] Audit records are immutable. Cannot update.');
  }

  async delete() {
    throw new Error('[audit_log] Audit records are immutable. Cannot delete.');
  }

  async deleteWhere() {
    throw new Error('[audit_log] Audit records are immutable. Cannot delete.');
  }
}
