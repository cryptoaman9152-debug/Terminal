/**
 * SSO SERVICE
 * 
 * Handles the FundedWealth Dashboard → Terminal SSO flow.
 * 
 * Flow:
 * 1. Dashboard generates signed SSO token with user/account info
 * 2. User redirected to terminal.fundedwealth.com/auth/sso?token=<token>
 * 3. This service validates the SSO token
 * 4. If valid: creates terminal session, returns JWT
 * 5. If invalid: returns error
 * 
 * SSO Token Format (signed JWT from Dashboard):
 * {
 *   sub: "fw_user_id",
 *   accountId: "uuid",
 *   challengeId: "uuid",
 *   nonce: "random-string",
 *   iat: timestamp,
 *   exp: timestamp (short-lived, ~60 seconds)
 * }
 */

import jwt from 'jsonwebtoken';
import { supabase } from '../db/client.js';
import { generateSessionJWT } from './auth.service.js';
import { createSession } from './session.service.js';
import { config } from 'dotenv';

config();

const SSO_SHARED_SECRET = process.env.SSO_SHARED_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('FATAL: SSO_SHARED_SECRET must be set in production'); })()
  : 'fw-sso-dev-secret-change-in-production');

// Track used nonces to prevent replay attacks (in production, use Redis)
const usedNonces = new Set();

/**
 * Validate an SSO token from FundedWealth Dashboard.
 * Returns terminal JWT if valid, error if not.
 */
export async function validateSSOToken(ssoToken, { ipAddress, userAgent } = {}) {
  // Step 1: Verify SSO token signature and expiry
  let decoded;
  try {
    decoded = jwt.verify(ssoToken, SSO_SHARED_SECRET, { maxAge: '120s' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { success: false, error: 'SSO token expired. Please try again from Dashboard.' };
    }
    return { success: false, error: 'Invalid SSO token signature.' };
  }

  // Step 2: Check nonce (replay protection)
  if (decoded.nonce) {
    if (usedNonces.has(decoded.nonce)) {
      return { success: false, error: 'SSO token already used (replay detected).' };
    }
    usedNonces.add(decoded.nonce);
    // Clean old nonces (keep set from growing)
    if (usedNonces.size > 10000) {
      const arr = Array.from(usedNonces);
      arr.splice(0, 5000).forEach((n) => usedNonces.delete(n));
    }
  }

  // Step 3: Extract claims
  const fwUserId = decoded.sub;
  const accountId = decoded.accountId;
  const challengeId = decoded.challengeId;

  if (!fwUserId || !accountId) {
    return { success: false, error: 'SSO token missing required claims (sub, accountId).' };
  }

  // Step 4: Lookup user in database
  let user = null;
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('id, fw_user_id, full_name, email, is_active')
      .eq('fw_user_id', fwUserId)
      .single();

    if (error || !data) {
      // If table doesn't exist (schema cache error), fallback to dev user
      if (error && error.message && error.message.includes('schema cache')) {
        user = { id: fwUserId, fw_user_id: fwUserId, name: 'Dev User', status: 'active' };
      } else {
        return { success: false, error: 'User not found in terminal database.' };
      }
    } else {
      if (data.is_active === false) {
        return { success: false, error: 'User account is suspended.' };
      }
      user = { ...data, name: data.full_name, status: data.is_active !== false ? 'active' : 'suspended' };
    }
  } else {
    // Dev mode without Supabase — allow through with minimal data
    user = { id: fwUserId, fw_user_id: fwUserId, name: 'Dev User', status: 'active' };
  }

  // Step 5: Lookup account
  let account = null;
  if (supabase) {
    const { data, error } = await supabase
      .from('trading_accounts')
      .select('id, account_code, user_id, plan, phase, status, virtual_balance')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      // If table doesn't exist, use dev account
      if (error && error.message && error.message.includes('schema cache')) {
        account = { id: accountId, account_code: 'FW-DEV', broker_provider: 'angelone', status: 'active' };
      } else {
        return { success: false, error: 'Trading account not found.' };
      }
    } else {
      if (data.status !== 'active') {
        return { success: false, error: `Trading account is ${data.status}. Cannot trade.` };
      }
      account = { ...data, balance: data.virtual_balance, broker_provider: 'angelone' };
    }
  } else {
    account = { id: accountId, account_code: 'FW-DEV', broker_provider: 'angelone', status: 'active' };
  }

  // Step 6: Generate terminal session JWT
  const terminalJWT = generateSessionJWT({
    userId: user.id,
    accountId: account.id,
    challengeId: challengeId || account.challenge_id,
    accountCode: account.account_code,
    brokerProvider: account.broker_provider,
    permissions: ['trade', 'view_positions', 'view_orders'],
  });

  // Step 7: Persist session
  await createSession({
    userId: user.id,
    accountId: account.id,
    token: terminalJWT,
    ipAddress,
    userAgent,
  });

  return {
    success: true,
    jwt: terminalJWT,
    account: {
      id: account.id,
      code: account.account_code,
      broker: account.broker_provider,
    },
    user: {
      id: user.id,
      name: user.name,
    },
  };
}

/**
 * Generate a test SSO token (for development/testing only).
 * In production, only the FW Dashboard generates these.
 */
export function generateTestSSOToken(payload) {
  return jwt.sign(
    {
      sub: payload.fwUserId,
      accountId: payload.accountId,
      challengeId: payload.challengeId,
      nonce: crypto.randomUUID(),
    },
    SSO_SHARED_SECRET,
    { expiresIn: '60s' }
  );
}

