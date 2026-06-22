/**
 * EVENT DISPATCHER — Persistence Subscriber
 * 
 * Subscribes to the EventBus and persists every significant event to
 * the audit/metrics tables. This is the bridge between the in-memory
 * pub/sub system and the durable database layer.
 * 
 * Persisted events:
 *   OrderCreated    → t_order_audit
 *   OrderUpdated    → t_order_audit (submitted/accepted/filled/cancelled/rejected/modified)
 *   PositionOpened  → t_order_audit
 *   PositionClosed  → t_order_audit
 *   ChallengeUpdated → t_challenge_metrics
 *   RiskViolation   → t_risk_events
 *   BrokerSession   → t_broker_sessions
 * 
 * Architecture:
 *   EventBus.publish('order.created', ...) 
 *     → EventDispatcher._onOrderCreated() 
 *       → OrderAuditRepository.logOrderCreated()
 * 
 * All persistence is fire-and-forget — failures are logged but never
 * block the calling service or the event bus.
 */

import { eventBus } from '../events/index.js';
import { OrderAuditRepository } from '../repositories/order-audit.repository.js';
import { RiskEventRepository } from '../repositories/risk-event.repository.js';
import { ChallengeMetricsRepository } from '../repositories/challenge-metrics.repository.js';
import { BrokerSessionRepository } from '../repositories/broker-session.repository.js';

class EventDispatcher {
  constructor() {
    this.orderAuditRepo = new OrderAuditRepository();
    this.riskEventRepo = new RiskEventRepository();
    this.challengeMetricsRepo = new ChallengeMetricsRepository();
    this.brokerSessionRepo = new BrokerSessionRepository();
    this._subscriptions = [];
    this._initialized = false;
    this._stats = {
      persisted: 0,
      failed: 0,
      byEvent: {},
    };
  }

  /**
   * Initialize — subscribe to all relevant EventBus channels.
   * Safe to call multiple times (idempotent).
   */
  initialize() {
    if (this._initialized) return;
    this._initialized = true;

    // Order lifecycle
    this._sub('order.created', this._onOrderCreated.bind(this));
    this._sub('order.updated', this._onOrderUpdated.bind(this));

    // Position lifecycle
    this._sub('position.updated', this._onPositionUpdated.bind(this));

    // Challenge lifecycle
    this._sub('challenge.updated', this._onChallengeUpdated.bind(this));

    // Risk events
    this._sub('risk.alert', this._onRiskAlert.bind(this));

    // Broker session (these are dispatched directly, not via eventBus)
    // Broker events will be emitted via the direct API below.

    console.log('[EventDispatcher] Initialized — listening on EventBus for persistence');
  }

  // ─── EventBus Handlers ─────────────────────────────────────

  async _onOrderCreated(event) {
    const { payload, meta } = event;
    const accountId = meta.accountId || payload.accountId;
    try {
      await this.orderAuditRepo.logOrderCreated(
        payload.orderId,
        accountId,
        {
          symbol: payload.symbol,
          token: payload.token,
          segment: payload.segment,
          side: payload.side,
          orderType: payload.orderType,
          productType: payload.productType,
          qty: payload.qty,
          price: payload.price,
          triggerPrice: payload.triggerPrice,
        },
        payload.brokerProvider || null
      );
      this._track('OrderCreated');
    } catch (err) {
      this._fail('OrderCreated', err);
    }
  }

  async _onOrderUpdated(event) {
    const { payload, meta } = event;
    const accountId = meta.accountId || payload.accountId;
    try {
      const status = (payload.status || '').toUpperCase();

      switch (status) {
        case 'FILLED':
          await this.orderAuditRepo.logOrderFilled(
            payload.orderId,
            accountId,
            payload.symbol,
            payload.token,
            payload.segment,
            payload.side,
            payload.filledQty || payload.qty,
            payload.avgPrice || payload.price,
            payload.brokerOrderId,
            payload.brokerProvider,
            payload.latencyMs
          );
          this._track('OrderFilled');
          break;

        case 'CANCELLED':
          await this.orderAuditRepo.logOrderCancelled(
            payload.orderId,
            accountId,
            payload.symbol,
            payload.token,
            payload.segment,
            payload.reason
          );
          this._track('OrderCancelled');
          break;

        case 'REJECTED':
          await this.orderAuditRepo.logOrderRejected(
            payload.orderId,
            accountId,
            payload.symbol,
            payload.token,
            payload.segment,
            payload.rejectReason || payload.reason,
            payload.brokerProvider
          );
          this._track('OrderRejected');
          break;

        case 'OPEN':
          await this.orderAuditRepo.logOrderAccepted(
            payload.orderId,
            accountId,
            payload.symbol,
            payload.token,
            payload.segment,
            payload.brokerOrderId,
            payload.brokerProvider
          );
          this._track('OrderAccepted');
          break;

        case 'MODIFIED':
          await this.orderAuditRepo.logOrderModified(
            payload.orderId,
            accountId,
            payload.symbol,
            payload.token,
            payload.segment,
            { qty: payload.qty, price: payload.price, triggerPrice: payload.triggerPrice, orderType: payload.orderType }
          );
          this._track('OrderModified');
          break;

        default:
          // Generic order update — log as submitted
          await this.orderAuditRepo.logOrderSubmitted(
            payload.orderId,
            accountId,
            payload.symbol,
            payload.token,
            payload.segment,
            payload.brokerProvider,
            payload.latencyMs
          );
          this._track('OrderSubmitted');
      }
    } catch (err) {
      this._fail('OrderUpdated', err);
    }
  }

  async _onPositionUpdated(event) {
    const { payload, meta } = event;
    const accountId = meta.accountId || payload.accountId;
    try {
      const action = payload.action || payload.event || 'updated';

      switch (action) {
        case 'opened':
          await this.orderAuditRepo.logPositionOpened(
            payload.orderId,
            accountId,
            payload.symbol,
            payload.token,
            payload.segment,
            payload.side,
            payload.qty,
            payload.avgPrice
          );
          this._track('PositionOpened');
          break;

        case 'closed':
          await this.orderAuditRepo.logPositionClosed(
            payload.orderId,
            accountId,
            payload.symbol,
            payload.token,
            payload.segment,
            payload.side,
            payload.qty,
            payload.exitPrice,
            payload.pnl
          );
          this._track('PositionClosed');
          break;

        case 'reversed':
          await this.orderAuditRepo.logPositionReversed(
            payload.orderId,
            accountId,
            payload.symbol,
            payload.token,
            payload.segment,
            payload.oldSide,
            payload.newSide,
            payload.qty,
            payload.price
          );
          this._track('PositionReversed');
          break;

        case 'updated':
        default:
          await this.orderAuditRepo.logPositionUpdated(
            payload.orderId,
            accountId,
            payload.symbol,
            payload.token,
            payload.segment,
            payload.side,
            payload.addedQty || payload.qty,
            payload.newTotalQty || payload.totalQty,
            payload.newAvgPrice || payload.avgPrice
          );
          this._track('PositionUpdated');
      }
    } catch (err) {
      this._fail('PositionUpdated', err);
    }
  }

  async _onChallengeUpdated(event) {
    const { payload, meta } = event;
    const accountId = meta.accountId || payload.accountId;
    try {
      const action = payload.action || payload.event || 'updated';

      switch (action) {
        case 'started':
          await this.challengeMetricsRepo.logChallengeStarted(
            payload.challengeId,
            accountId,
            payload.initialBalance
          );
          this._track('ChallengeStarted');
          break;

        case 'passed':
          await this.challengeMetricsRepo.logChallengePassed(
            payload.challengeId,
            accountId,
            payload.finalBalance,
            payload.initialBalance,
            payload.tradingDays,
            payload.totalTrades,
            payload.winRate
          );
          this._track('ChallengePassed');
          break;

        case 'failed':
          await this.challengeMetricsRepo.logChallengeFailed(
            payload.challengeId,
            accountId,
            payload.reason,
            payload.data || {}
          );
          this._track('ChallengeFailed');
          break;

        case 'snapshot':
          await this.challengeMetricsRepo.logBalanceSnapshot(
            payload.challengeId,
            accountId,
            payload.data || payload
          );
          this._track('ChallengeSnapshot');
          break;

        case 'day_complete':
          await this.challengeMetricsRepo.logTradingDayComplete(
            payload.challengeId,
            accountId,
            payload.data || payload
          );
          this._track('ChallengeDayComplete');
          break;

        case 'drawdown_warning':
          await this.challengeMetricsRepo.logDrawdownWarning(
            payload.challengeId,
            accountId,
            payload.drawdown,
            payload.drawdownPercent,
            payload.maxAllowed
          );
          this._track('ChallengeDrawdownWarning');
          break;

        case 'drawdown_breach':
          await this.challengeMetricsRepo.logDrawdownBreach(
            payload.challengeId,
            accountId,
            payload.drawdown,
            payload.drawdownPercent,
            payload.maxAllowed
          );
          this._track('ChallengeDrawdownBreach');
          break;

        case 'profit_target':
          await this.challengeMetricsRepo.logProfitTargetReached(
            payload.challengeId,
            accountId,
            payload.pnl,
            payload.pnlPercent,
            payload.target
          );
          this._track('ChallengeProfitTarget');
          break;

        case 'milestone':
          await this.challengeMetricsRepo.logMilestone(
            payload.challengeId,
            accountId,
            payload.description,
            payload.metadata || {}
          );
          this._track('ChallengeMilestone');
          break;

        case 'updated':
        default:
          await this.challengeMetricsRepo.logChallengeUpdated(
            payload.challengeId,
            accountId,
            payload.data || payload
          );
          this._track('ChallengeUpdated');
      }
    } catch (err) {
      this._fail('ChallengeUpdated', err);
    }
  }

  async _onRiskAlert(event) {
    const { payload, meta } = event;
    const accountId = meta.accountId || payload.accountId;
    try {
      const severity = payload.severity || 'warning';

      switch (severity) {
        case 'critical':
        case 'fatal':
          await this.riskEventRepo.logViolation(
            accountId,
            payload.eventType || payload.type || 'violation',
            payload.ruleType,
            payload.ruleValue,
            payload.actualValue,
            payload.description || payload.message,
            payload.metadata || {}
          );
          this._track('RiskViolation');
          break;

        case 'warning':
          await this.riskEventRepo.logWarning(
            accountId,
            payload.ruleType,
            payload.ruleValue,
            payload.actualValue,
            payload.description || payload.message
          );
          this._track('RiskWarning');
          break;

        case 'info':
          await this.riskEventRepo.logCheckPassed(
            accountId,
            payload.ruleType,
            payload.actualValue,
            payload.orderId
          );
          this._track('RiskCheckPassed');
          break;

        default:
          await this.riskEventRepo.logCheckFailed(
            accountId,
            payload.ruleType,
            payload.ruleValue,
            payload.actualValue,
            payload.orderId,
            payload.description
          );
          this._track('RiskCheckFailed');
      }
    } catch (err) {
      this._fail('RiskAlert', err);
    }
  }

  // ─── Direct API (for broker session events not on EventBus) ──

  /**
   * Record broker connection established.
   */
  async brokerConnected(accountId, provider, clientId, expiresAt, feedToken = null) {
    try {
      const session = await this.brokerSessionRepo.recordConnect(
        accountId, provider, clientId, expiresAt, feedToken
      );
      this._track('BrokerConnected');
      return session;
    } catch (err) {
      this._fail('BrokerConnected', err);
      return null;
    }
  }

  /**
   * Record broker disconnection.
   */
  async brokerDisconnected(sessionId, reason = null) {
    try {
      await this.brokerSessionRepo.recordDisconnect(sessionId, reason);
      this._track('BrokerDisconnected');
    } catch (err) {
      this._fail('BrokerDisconnected', err);
    }
  }

  /**
   * Record broker session expiry.
   */
  async brokerSessionExpired(sessionId) {
    try {
      await this.brokerSessionRepo.recordExpired(sessionId);
      this._track('BrokerSessionExpired');
    } catch (err) {
      this._fail('BrokerSessionExpired', err);
    }
  }

  /**
   * Record broker connection failure.
   */
  async brokerConnectionFailed(accountId, provider, clientId, errorMessage, metadata = {}) {
    try {
      await this.brokerSessionRepo.recordFailure(
        accountId, provider, clientId, errorMessage, metadata
      );
      this._track('BrokerConnectionFailed');
    } catch (err) {
      this._fail('BrokerConnectionFailed', err);
    }
  }

  /**
   * Record broker failover event.
   */
  async brokerFailover(accountId, fromProvider, toProvider, reason) {
    try {
      await this.brokerSessionRepo.recordFailover(
        accountId, fromProvider, toProvider, reason
      );
      this._track('BrokerFailover');
    } catch (err) {
      this._fail('BrokerFailover', err);
    }
  }

  /**
   * Record account locked due to risk breach.
   */
  async accountLocked(accountId, reason, ruleType = null, metadata = {}) {
    try {
      await this.riskEventRepo.logAccountLocked(accountId, reason, ruleType, metadata);
      this._track('AccountLocked');
    } catch (err) {
      this._fail('AccountLocked', err);
    }
  }

  // ─── Internal Helpers ──────────────────────────────────────

  _sub(channel, handler) {
    const unsub = eventBus.subscribe(channel, handler);
    this._subscriptions.push(unsub);
  }

  _track(eventName) {
    this._stats.persisted++;
    if (!this._stats.byEvent[eventName]) this._stats.byEvent[eventName] = 0;
    this._stats.byEvent[eventName]++;
  }

  _fail(eventName, err) {
    this._stats.failed++;
    console.error(`[EventDispatcher] Failed to persist ${eventName}:`, err.message);
  }

  /**
   * Get dispatcher statistics.
   */
  getStats() {
    return {
      initialized: this._initialized,
      totalPersisted: this._stats.persisted,
      totalFailed: this._stats.failed,
      byEvent: { ...this._stats.byEvent },
    };
  }

  /**
   * Shutdown — unsubscribe from all channels.
   */
  destroy() {
    this._subscriptions.forEach(unsub => unsub());
    this._subscriptions = [];
    this._initialized = false;
    console.log('[EventDispatcher] Destroyed');
  }
}

// Singleton instance
export const eventDispatcher = new EventDispatcher();
