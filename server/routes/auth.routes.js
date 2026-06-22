/**
 * AUTH ROUTES
 * 
 * Handles SSO login, logout, and session verification.
 * 
 * Endpoints:
 *   GET  /auth/sso?token=<sso_token>  — SSO login from Dashboard
 *   POST /auth/logout                  — Revoke session
 *   GET  /auth/verify                  — Check if current session is valid
 */

import { Router } from 'express';
import { validateSSOToken, generateTestSSOToken } from '../services/sso.service.js';
import { revokeSession } from '../services/session.service.js';
import { hashToken, verifySessionJWT } from '../services/auth.service.js';

export function createAuthRouter() {
  const router = Router();

  /**
   * SSO Login — called when user clicks "Open Terminal" in FW Dashboard.
   * Validates SSO token, creates session, sets cookie, redirects to terminal.
   */
  router.get('/sso', async (req, res) => {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        error: 'missing_token',
        message: 'SSO token is required. Open terminal from FundedWealth Dashboard.',
      });
    }

    const result = await validateSSOToken(token, {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    if (!result.success) {
      // In production: redirect to dashboard with error
      const dashboardUrl = process.env.FW_DASHBOARD_URL || 'https://fundedwealth.com';
      return res.redirect(`${dashboardUrl}/terminal-error?reason=${encodeURIComponent(result.error)}`);
    }

    // Set httpOnly secure cookie with terminal JWT
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('fw_session', result.jwt, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    // Redirect to terminal main page
    res.redirect('/');
  });

  /**
   * Logout — revoke current session.
   */
  router.post('/logout', async (req, res) => {
    const cookieHeader = req.headers.cookie || '';
    const token = extractCookie(cookieHeader, 'fw_session');

    if (token) {
      const tokenHash = hashToken(token);
      await revokeSession(tokenHash);
    }

    res.clearCookie('fw_session', { path: '/' });
    res.json({ success: true, message: 'Logged out' });
  });

  /**
   * Verify — check if current session is still valid.
   * Frontend calls this on mount to decide: show terminal or redirect.
   */
  router.get('/verify', (req, res) => {
    const cookieHeader = req.headers.cookie || '';
    let token = extractCookie(cookieHeader, 'fw_session');

    // Also check Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({ valid: false, reason: 'no_session' });
    }

    const result = verifySessionJWT(token);

    if (!result.valid) {
      res.clearCookie('fw_session', { path: '/' });
      return res.status(401).json({ valid: false, reason: result.error });
    }

    res.json({
      valid: true,
      user: {
        userId: result.claims.userId,
        accountId: result.claims.accountId,
        accountCode: result.claims.accountCode,
        brokerProvider: result.claims.brokerProvider,
      },
    });
  });

  /**
   * DEV ONLY — Generate test SSO token for development.
   * Remove this endpoint in production.
   */
  if (process.env.NODE_ENV !== 'production') {
    router.get('/dev/generate-sso', (req, res) => {
      const token = generateTestSSOToken({
        fwUserId: req.query.userId || 'usr_test_001',
        accountId: req.query.accountId || '33333333-3333-3333-3333-333333333333',
        challengeId: req.query.challengeId || '22222222-2222-2222-2222-222222222222',
      });

      res.json({
        ssoToken: token,
        loginUrl: `/auth/sso?token=${encodeURIComponent(token)}`,
        note: 'DEV ONLY — use loginUrl to simulate Dashboard SSO flow',
      });
    });
  }

  return router;
}

function extractCookie(cookieHeader, name) {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}
