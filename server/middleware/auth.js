/**
 * AUTH MIDDLEWARE
 * 
 * Validates JWT on every protected route.
 * Extracts user claims and attaches to req.user.
 * 
 * Token sources (checked in order):
 * 1. Cookie: "fw_session"
 * 2. Header: "Authorization: Bearer <token>"
 * 
 * If invalid/missing: returns 401.
 */

import { verifySessionJWT } from '../services/auth.service.js';
import { isSessionValid } from '../services/session.service.js';

/**
 * Require valid authentication.
 * Use on all /api/* routes that need user context.
 * In dev mode (no Supabase): bypasses auth with mock user context.
 */
export function requireAuth(req, res, next) {
  // Dev bypass: if DEV_BYPASS_AUTH is set, allow through with dev user context
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_AUTH === 'true') {
    req.user = {
      userId: 'dev-user',
      accountId: 'dev-account',
      challengeId: 'dev-challenge',
      accountCode: 'FW-DEV',
      brokerProvider: 'angelone',
      permissions: ['trade', 'view_positions', 'view_orders'],
    };
    return next();
  }

  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'No session token provided. Please login via FundedWealth Dashboard.',
    });
  }

  const result = verifySessionJWT(token);

  if (!result.valid) {
    return res.status(401).json({
      error: result.error === 'expired' ? 'session_expired' : 'invalid_token',
      message: result.error === 'expired'
        ? 'Session expired. Please re-open terminal from Dashboard.'
        : 'Invalid session token.',
    });
  }

  // Attach user claims to request
  req.user = result.claims;
  req.token = token;
  next();
}

/**
 * Check if user has a specific permission.
 * Must be used AFTER requireAuth.
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Not authenticated' });
    }
    const perms = req.user.permissions || [];
    if (!perms.includes(permission)) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Permission '${permission}' required.`,
      });
    }
    next();
  };
}

/**
 * Optional auth — does not reject if no token.
 * Attaches user if present, allows anonymous if not.
 * Use for public endpoints that benefit from user context (e.g., instrument search).
 */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (token) {
    const result = verifySessionJWT(token);
    if (result.valid) {
      req.user = result.claims;
      req.token = token;
    }
  }

  next();
}

/**
 * Validate WebSocket connection auth.
 * Called during WS upgrade before allowing subscription.
 * Returns user claims or null.
 */
export function validateWSAuth(request) {
  // Try cookie first
  const cookieHeader = request.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies['fw_session'];

  if (!token) {
    // Try query param (for WS connections that can't send cookies)
    const url = new URL(request.url, `http://${request.headers.host}`);
    const queryToken = url.searchParams.get('token');
    if (!queryToken) return null;

    const result = verifySessionJWT(queryToken);
    return result.valid ? result.claims : null;
  }

  const result = verifySessionJWT(token);
  return result.valid ? result.claims : null;
}

/**
 * Extract token from request (cookie or Authorization header).
 */
function extractToken(req) {
  // 1. Check cookie
  if (req.cookies && req.cookies.fw_session) {
    return req.cookies.fw_session;
  }

  // Parse cookie header manually if cookie-parser not used
  const cookieHeader = req.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  if (cookies['fw_session']) {
    return cookies['fw_session'];
  }

  // 2. Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Parse raw cookie header into key-value object.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [key, ...vals] = cookie.trim().split('=');
    if (key) {
      cookies[key.trim()] = vals.join('=').trim();
    }
  });

  return cookies;
}
