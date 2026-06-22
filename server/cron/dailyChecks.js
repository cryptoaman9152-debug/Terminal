/**
 * DAILY CHECKS — CRON SERVICE
 * 
 * Runs at start of each trading day:
 *   - Unlocks accounts locked for daily loss (new day reset)
 *   - Checks challenge expiry
 *   - Records previous day's metrics if missing
 * 
 * Can be triggered by:
 *   - External cron (e.g., Railway cron, Supabase Edge Function, GitHub Action)
 *   - Manual call to POST /admin/daily-checks (with admin auth)
 *   - setInterval at server startup (simple approach)
 */

import { supabase } from '../db/client.js';
import { ChallengeService } from '../services/challengeService.js';
import { RiskEngine } from '../services/riskEngine.js';

/**
 * Run daily checks for all active accounts.
 * Call this at 09:00 IST (before market open).
 */
export async function runDailyChecks() {
  if (!supabase) {
    console.warn('[DailyChecks] Supabase not configured — skipping');
    return { processed: 0, results: [] };
  }

  console.log('[DailyChecks] Starting daily checks...');

  // Get all accounts that are active or locked (not breached/completed/expired)
  const { data: accounts, error } = await supabase
    .from('trading_accounts')
    .select('id, status, user_id')
    .in('status', ['active', 'locked']);

  if (error) {
    console.error('[DailyChecks] Failed to fetch accounts:', error.message);
    return { processed: 0, error: error.message };
  }

  const results = [];

  for (const account of accounts) {
    try {
      const checkResults = await ChallengeService.dailyCheck(account.id);
      if (checkResults.length > 0) {
        results.push({ accountId: account.id, actions: checkResults });
      }
    } catch (err) {
      results.push({ accountId: account.id, error: err.message });
    }
  }

  console.log(`[DailyChecks] Processed ${accounts.length} accounts, ${results.length} had actions`);
  return { processed: accounts.length, results };
}

/**
 * Record end-of-day metrics for all active accounts.
 * Call this at 15:45 IST (after market close).
 */
export async function runEndOfDayMetrics() {
  if (!supabase) {
    console.warn('[EODMetrics] Supabase not configured — skipping');
    return { processed: 0 };
  }

  console.log('[EODMetrics] Recording end-of-day metrics...');

  const { data: accounts, error } = await supabase
    .from('trading_accounts')
    .select('id')
    .eq('status', 'active');

  if (error) {
    console.error('[EODMetrics] Failed to fetch accounts:', error.message);
    return { processed: 0, error: error.message };
  }

  let processed = 0;

  for (const account of accounts) {
    try {
      await RiskEngine.recordDailyMetrics(account.id);
      processed++;
    } catch (err) {
      console.error(`[EODMetrics] Failed for account ${account.id}:`, err.message);
    }
  }

  console.log(`[EODMetrics] Recorded metrics for ${processed}/${accounts.length} accounts`);
  return { processed };
}

/**
 * Schedule daily checks using setInterval.
 * Simple approach — checks every minute if it's time to run.
 * For production, use external cron (Supabase Edge Function, Railway, etc.).
 */
export function scheduleDailyChecks() {
  let lastDailyRun = null;
  let lastEodRun = null;

  setInterval(async () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const dateKey = now.toISOString().split('T')[0];

    // Run daily checks at 09:00 IST
    if (hours === 9 && minutes === 0 && lastDailyRun !== dateKey) {
      lastDailyRun = dateKey;
      await runDailyChecks();
    }

    // Run EOD metrics at 15:45 IST
    if (hours === 15 && minutes === 45 && lastEodRun !== dateKey) {
      lastEodRun = dateKey;
      await runEndOfDayMetrics();
    }
  }, 60000); // Check every minute

  console.log('[Cron] Daily checks scheduler started (09:00 daily unlock, 15:45 EOD metrics)');
}

