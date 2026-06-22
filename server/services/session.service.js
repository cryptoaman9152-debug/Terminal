/**
 * SESSION SERVICE
 * 
 * Manages terminal sessions in the database.
 * Sessions are created on SSO login, revoked on logout.
 * 
 * Uses: supabase client, auth.service for hashing.
 */

import { supabase } from '../db/client.js';
import { hashToken } from './auth.service.js';

/**
 * Create a new session record in the database.
 * Called after successful SSO validation and JWT generation.
 */
export async function createSession({ userId, accountId, token, ipAddress, userAgent }) {
  if (!supabase) {
    console.warn('[Session] Supabase not configured — session not persisted');
    return { id: null };
  }

  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      account_id: accountId,
      token_hash: tokenHash,
      ip_address: ipAddress,
      user_agent: userAgent,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Session] Failed to create session:', error.message);
    return { id: null, error: error.message };
  }

  return { id: data.id };
}

/**
 * Revoke a session (logout).
 * Sets revoked_at timestamp — token hash remains for audit.
 */
export async function revokeSession(tokenHash) {
  if (!supabase) return;

  const { error } = await supabase
    .from('sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('revoked_at', null);

  if (error) {
    console.error('[Session] Failed to revoke session:', error.message);
  }
}

/**
 * Revoke all sessions for a user (force logout everywhere).
 */
export async function revokeAllUserSessions(userId) {
  if (!supabase) return;

  const { error } = await supabase
    .from('sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error) {
    console.error('[Session] Failed to revoke all sessions:', error.message);
  }
}

/**
 * Check if a session token hash is still valid (not revoked, not expired).
 */
export async function isSessionValid(token) {
  if (!supabase) return true; // If no DB, allow (dev mode)

  const tokenHash = hashToken(token);

  const { data, error } = await supabase
    .from('sessions')
    .select('id, expires_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (error || !data) return false;

  return new Date(data.expires_at) > new Date();
}

