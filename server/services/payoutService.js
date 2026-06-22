/**
 * PAYOUT SERVICE
 * 
 * Calculates payout eligibility for funded accounts.
 * Manages payout requests and lifecycle.
 * 
 * Eligibility requires:
 *   1. Challenge type = 'funded'
 *   2. Account status = 'active'
 *   3. Net profit > 0
 *   4. Minimum trading days met
 *   5. No active risk violations
 *   6. No daily-loss lock currently active
 * 
 * Payout split: configurable per plan (default 80% trader / 20% firm)
 */

import { AccountRepository } from '../repositories/account.repository.js';
import { ChallengeRepository } from '../repositories/challenge.repository.js';
import { RiskRulesRepository } from '../repositories/risk-rules.repository.js';
import { MetricsRepository } from '../repositories/metrics.repository.js';
import { RiskEventRepository } from '../repositories/risk-event.repository.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { eventBus } from '../events/index.js';

const accountRepo = new AccountRepository();
const challengeRepo = new ChallengeRepository();
const riskRulesRepo = new RiskRulesRepository();
const metricsRepo = new MetricsRepository();
const riskEventRepo = new RiskEventRepository();
const auditRepo = new AuditRepository();

export class PayoutService {
  /**
   * Payout split configuration per plan.
   * trader_split + firm_split = 1.0
   */
  static getSplitConfig(plan) {
    const splits = {
      '10K': { traderSplit: 0.80, firmSplit: 0.20 },
      '25K': { traderSplit: 0.80, firmSplit: 0.20 },
      '50K': { traderSplit: 0.85, firmSplit: 0.15 },
      '1L':  { traderSplit: 0.90, firmSplit: 0.10 },
    };
    return splits[plan] || { traderSplit: 0.80, firmSplit: 0.20 };
  }

  /**
   * Check if an account is eligible for payout.
   * Returns detailed eligibility status with reasons.
   */
  static async checkEligibility(accountId) {
    const account = await accountRepo.getWithChallenge(accountId);

    if (!account) {
      return { eligible: false, reason: 'Account not found', checks: {} };
    }

    const challenge = account.challenge;
    if (!challenge) {
      return { eligible: false, reason: 'No challenge linked to account', checks: {} };
    }

    const rules = await riskRulesRepo.getRulesMap(accountId);
    const tradingDays = await metricsRepo.getTradingDaysCount(accountId);
    const unresolvedViolations = await riskEventRepo.findUnresolved(accountId);

    // Run all eligibility checks
    const checks = {
      isFunded: challenge.type === 'funded',
      isActive: account.status === 'active',
      hasProfit: false,
      minDaysMet: false,
      noViolations: unresolvedViolations.length === 0,
      notLocked: account.status !== 'locked',
    };

    // Calculate net profit
    const netProfit = account.balance - challenge.initial_balance;
    checks.hasProfit = netProfit > 0;

    // Check minimum trading days (default 5 for payout cycle)
    const minPayoutDays = rules.min_payout_days?.count || rules.min_trading_days?.count || 5;
    checks.minDaysMet = tradingDays >= minPayoutDays;

    // Determine overall eligibility
    const failedChecks = [];
    if (!checks.isFunded) failedChecks.push('Account is not a funded account (type must be "funded")');
    if (!checks.isActive) failedChecks.push(`Account status is "${account.status}" (must be "active")`);
    if (!checks.hasProfit) failedChecks.push(`No net profit (current P&L: ₹${netProfit.toFixed(0)})`);
    if (!checks.minDaysMet) failedChecks.push(`Need ${minPayoutDays - tradingDays} more trading days (${tradingDays}/${minPayoutDays})`);
    if (!checks.noViolations) failedChecks.push(`${unresolvedViolations.length} unresolved risk violation(s)`);

    const eligible = failedChecks.length === 0;

    // Calculate payout amount if eligible
    let payoutAmount = 0;
    let traderSplit = 0;
    let firmSplit = 0;

    if (eligible) {
      const splitConfig = this.getSplitConfig(challenge.plan);
      traderSplit = splitConfig.traderSplit;
      firmSplit = splitConfig.firmSplit;
      payoutAmount = Math.round(netProfit * traderSplit * 100) / 100;
    }

    // Update payout_eligible flag in database
    if (eligible !== account.payout_eligible) {
      await accountRepo.update(accountId, { payout_eligible: eligible });
    }

    return {
      eligible,
      reason: eligible ? 'All eligibility criteria met' : failedChecks[0],
      failedChecks,
      checks,
      financials: {
        accountBalance: Number(account.balance),
        initialBalance: Number(challenge.initial_balance),
        netProfit: Math.round(netProfit * 100) / 100,
        traderSplit,
        firmSplit,
        payoutAmount,
        firmAmount: Math.round(netProfit * firmSplit * 100) / 100,
      },
      tradingDays,
      minTradingDays: minPayoutDays,
      plan: challenge.plan,
      challengeType: challenge.type,
      accountStatus: account.status,
    };
  }

  /**
   * Request a payout (if eligible).
   * Deducts profit from account balance, resets to initial balance.
   * Returns payout record.
   */
  static async requestPayout(accountId, requestedBy) {
    // Verify eligibility first
    const eligibility = await this.checkEligibility(accountId);

    if (!eligibility.eligible) {
      return {
        success: false,
        reason: eligibility.reason,
        failedChecks: eligibility.failedChecks,
      };
    }

    const { netProfit, payoutAmount, firmAmount, initialBalance } = eligibility.financials;

    // Reset balance to initial (profit extracted)
    await accountRepo.updateBalance(accountId, initialBalance);
    await accountRepo.updatePeakBalance(accountId, initialBalance);

    // Mark payout processed
    await accountRepo.update(accountId, { payout_eligible: false });

    // Audit the payout
    await auditRepo.log({
      accountId,
      userId: requestedBy,
      eventType: 'payout_requested',
      eventData: {
        netProfit,
        payoutAmount,
        firmAmount,
        traderSplit: eligibility.financials.traderSplit,
        plan: eligibility.plan,
        tradingDays: eligibility.tradingDays,
        balanceAfter: initialBalance,
      },
    });

    // Emit event
    eventBus.publish('challenge.updated', {
      challengeId: eligibility.checks.isFunded ? accountId : 'unknown',
      status: 'payout_processed',
      payoutAmount,
    }, { accountId });

    return {
      success: true,
      payoutAmount,
      firmAmount,
      netProfit,
      balanceAfter: initialBalance,
      traderSplit: eligibility.financials.traderSplit,
      tradingDays: eligibility.tradingDays,
    };
  }

  /**
   * Get payout history for an account (from audit log).
   */
  static async getPayoutHistory(accountId) {
    try {
      const { data, error } = await accountRepo.db
        .from('audit_log')
        .select('*')
        .eq('account_id', accountId)
        .eq('event_type', 'payout_requested')
        .order('created_at', { ascending: false });

      if (error) return [];
      return (data || []).map(entry => ({
        id: entry.id,
        amount: entry.event_data?.payoutAmount || 0,
        netProfit: entry.event_data?.netProfit || 0,
        split: entry.event_data?.traderSplit || 0.8,
        plan: entry.event_data?.plan,
        tradingDays: entry.event_data?.tradingDays,
        requestedAt: entry.created_at,
      }));
    } catch {
      return [];
    }
  }
}
