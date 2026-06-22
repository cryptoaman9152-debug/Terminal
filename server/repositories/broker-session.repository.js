/**
 * BROKER SESSION REPOSITORY
 * 
 * Manages broker connection lifecycle in t_broker_sessions.
 * Tracks connect/disconnect/failover events per account.
 * 
 * Schema columns: id, account_id, provider, client_id, status,
 *   connected_at, disconnected_at, expires_at, feed_token,
 *   error_message, metadata, created_at
 */

import { BaseRepository } from './base.repository.js';

export class BrokerSessionRepository extends BaseRepository {
  constructor() {
    super('broker_sessions');
  }

  /**
   * Get the active broker session for an account.
   */
  async findByAccountId(accountId, provider) {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('account_id', accountId)
      .eq('provider', provider)
      .eq('status', 'connected')
      .order('connected_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`[broker_sessions] findByAccountId failed: ${error.message}`);
    }
    return data || null;
  }

  /**
   * Check if a broker session is still valid (not expired, status connected).
   */
  async getValidSession(accountId, provider) {
    const session = await this.findByAccountId(accountId, provider);
    if (!session) return null;

    if (session.expires_at && new Date(session.expires_at) <= new Date()) {
      // Mark as expired
      await this.update(session.id, { status: 'expired', disconnected_at: new Date().toISOString() });
      return null;
    }

    return session;
  }

  /**
   * Create a new broker session (on connect).
   */
  async createSession(accountId, params) {
    const record = {
      account_id: accountId,
      provider: params.provider,
      client_id: params.clientId,
      status: 'connected',
      connected_at: new Date().toISOString(),
      expires_at: params.expiresAt || null,
      feed_token: params.feedToken || null,
      metadata: params.metadata || {},
    };

    return this.insert(record);
  }

  /**
   * Disconnect a session (on logout or token expiry).
   */
  async disconnectSession(sessionId, reason) {
    return this.update(sessionId, {
      status: reason || 'disconnected',
      disconnected_at: new Date().toISOString(),
    });
  }

  /**
   * Record a failed connection attempt.
   */
  async recordFailure(accountId, params) {
    const record = {
      account_id: accountId,
      provider: params.provider,
      client_id: params.clientId,
      status: 'failed',
      connected_at: new Date().toISOString(),
      disconnected_at: new Date().toISOString(),
      error_message: params.errorMessage || null,
      metadata: params.metadata || {},
    };

    return this.insert(record);
  }

  /**
   * Revoke/disconnect broker session for an account + provider.
   */
  async revokeSession(accountId, provider) {
    const session = await this.findByAccountId(accountId, provider);
    if (session) {
      return this.update(session.id, {
        status: 'disconnected',
        disconnected_at: new Date().toISOString(),
      });
    }
    return null;
  }

  /**
   * Get all expired sessions (for cleanup cron).
   */
  async findExpired() {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('status', 'connected')
      .lt('expires_at', new Date().toISOString());

    if (error) throw new Error(`[t_broker_sessions] findExpired failed: ${error.message}`);
    return data || [];
  }
}
