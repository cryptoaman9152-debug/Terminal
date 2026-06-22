import { useState, useEffect } from 'react';
import { useTradingStore } from '@/store/tradingStore';
import { useAppStore } from '@/store/appStore';
import { getPositions, getOrders, getTrades, exitPosition, partialClosePosition, reversePosition, cancelOrder, placeOrder, closeAllPositions } from '@/services/api';
import { cn, formatPrice, formatPnl, getChangeColor } from '@/utils/helpers';
import { RefreshCw, X, RotateCcw, Plus, Edit, TrendingUp, Shield, Target, StopCircle, Activity } from 'lucide-react';
import { JournalPanel } from '@/components/JournalPanel';
import { AlertsPanel } from '@/components/AlertsPanel';
import { AnalyticsPanel } from '@/components/AnalyticsPanel';
import { RiskPanel } from '@/components/RiskPanel';
import type { Position, Order, Trade } from '@/types';

type OrderFilter = 'all' | 'open' | 'filled' | 'cancelled' | 'rejected';
type TradeFilter = 'today' | 'week' | 'month';

export function BottomPanel() {
  const { bottomTab, setBottomTab } = useAppStore();
  const { positions, orders, trades, setPositions, setOrders, setTrades } = useTradingStore();
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>('today');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const [posData, ordData, trdData] = await Promise.all([
        getPositions().catch(() => []),
        getOrders().catch(() => []),
        getTrades(tradeFilter).catch(() => []),
      ]);
      setPositions(posData);
      setOrders(ordData);
      setTrades(trdData);
    } catch (e) {
      // Silent fail
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [tradeFilter]);

  const filteredOrders = orders.filter((o) => {
    if (orderFilter === 'all') return true;
    return o.status.toLowerCase() === orderFilter;
  });

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalMtm = positions.reduce((sum, p) => sum + p.mtm, 0);

  const handleExitPosition = async (id: string) => {
    try { await exitPosition(id); refreshData(); } catch (e) {}
  };

  const handlePartialClose = async (id: string, pct: number) => {
    const pos = positions.find(p => p.id === id);
    if (!pos) return;
    const closeQty = Math.max(1, Math.round(Math.abs(pos.qty) * (pct / 100)));
    try { await partialClosePosition(id, closeQty); refreshData(); } catch (e) {}
  };

  const handleCloseAll = async () => {
    try {
      await closeAllPositions();
      refreshData();
    } catch (e) {}
  };

  const handleReversePosition = async (id: string) => {
    try { await reversePosition(id); refreshData(); } catch (e) {}
  };

  const handleCancelOrder = async (id: string) => {
    try { await cancelOrder(id); refreshData(); } catch (e) {}
  };

  const tabs = [
    { id: 'positions' as const, label: 'Positions', count: positions.length },
    { id: 'orders' as const, label: 'Orders', count: orders.filter((o) => o.status === 'OPEN').length },
    { id: 'trades' as const, label: 'Trade Book', count: trades.length },
    { id: 'journal' as const, label: 'Journal', count: 0 },
    { id: 'alerts' as const, label: 'Alerts', count: 0 },
    { id: 'analytics' as const, label: 'Analytics', count: 0 },
    { id: 'risk' as const, label: 'Risk', count: 0 },
  ];

  return (
    <div className="h-full flex flex-col bg-[#0f1118]">
      {/* Tabs */}
      <div className="flex items-center border-b border-fw-border px-2 bg-[#12141c]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setBottomTab(tab.id)}
            className={cn(
              'px-3 py-1.5 text-[12px] font-semibold border-b-2 transition-all',
              bottomTab === tab.id
                ? 'text-fw-accent border-fw-accent'
                : 'text-fw-text-muted border-transparent hover:text-fw-text-secondary'
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 px-1 text-[9px] bg-fw-surface rounded-full font-mono">
                {tab.count}
              </span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        {/* Total P&L + Close All */}
        {bottomTab === 'positions' && positions.length > 0 && (
          <div className="flex items-center gap-3 mr-3">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-fw-text-secondary">MTM:</span>
              <span className={cn('text-[12px] font-mono font-semibold tabular-nums', getChangeColor(totalMtm))}>
                {formatPnl(totalMtm)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-fw-text-secondary">Total:</span>
              <span className={cn('text-[12px] font-mono font-bold tabular-nums', getChangeColor(totalPnl))}>
                {formatPnl(totalPnl)}
              </span>
            </div>
            <button
              onClick={handleCloseAll}
              className="px-2.5 py-1 text-[10px] font-bold text-red-400 bg-red-900/20 border border-red-800/30 rounded hover:bg-red-900/40 transition-colors"
              title="Close all open positions"
            >
              CLOSE ALL
            </button>
          </div>
        )}

        {/* Order Filters */}
        {bottomTab === 'orders' && (
          <div className="flex items-center gap-1 mr-3">
            {(['all', 'open', 'filled', 'cancelled', 'rejected'] as OrderFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setOrderFilter(f)}
                className={cn(
                  'px-2 py-1 text-[11px] rounded-md capitalize font-medium transition-colors',
                  orderFilter === f ? 'bg-fw-accent text-white' : 'text-fw-text-secondary hover:text-fw-text hover:bg-fw-hover'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {/* Trade Filters */}
        {bottomTab === 'trades' && (
          <div className="flex items-center gap-1 mr-3">
            {(['today', 'week', 'month'] as TradeFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setTradeFilter(f)}
                className={cn(
                  'px-2 py-1 text-[11px] rounded-md capitalize font-medium transition-colors',
                  tradeFilter === f ? 'bg-fw-accent text-white' : 'text-fw-text-secondary hover:text-fw-text hover:bg-fw-hover'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={refreshData}
          className={cn('p-1.5 rounded-md hover:bg-fw-hover text-fw-text-secondary transition-colors', isRefreshing && 'animate-spin')}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {bottomTab === 'positions' && (
          <PositionsTable
            positions={positions}
            onExit={handleExitPosition}
            onPartialClose={handlePartialClose}
            onReverse={handleReversePosition}
          />
        )}
        {bottomTab === 'orders' && <OrdersTable orders={filteredOrders} onCancel={handleCancelOrder} />}
        {bottomTab === 'trades' && <TradesTable trades={trades} />}
        {bottomTab === 'journal' && <JournalPanel />}
        {bottomTab === 'alerts' && <AlertsPanel />}
        {bottomTab === 'analytics' && <AnalyticsPanel />}
        {bottomTab === 'risk' && <RiskPanel />}
      </div>
    </div>
  );
}

// ─── Positions Table (TASK 2 + TASK 3) ────────────────────────────────────────

function PositionsTable({ positions, onExit, onPartialClose, onReverse }: {
  positions: Position[];
  onExit: (id: string) => void;
  onPartialClose: (id: string, pct: number) => void;
  onReverse: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (positions.length === 0) {
    return <EmptyState message="No open positions" icon={<TrendingUp size={28} className="text-fw-border" />} />;
  }

  return (
    <table className="fw-table">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Side</th>
          <th>Qty</th>
          <th>Avg Price</th>
          <th>LTP</th>
          <th>MTM</th>
          <th>Realized</th>
          <th>Unrealized</th>
          <th>Margin</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((pos) => {
          const side = pos.qty > 0 ? 'LONG' : 'SHORT';
          const unrealized = (pos.ltp - pos.avgPrice) * pos.qty;
          const marginUsed = pos.avgPrice * Math.abs(pos.qty) * 0.2;
          const isExpanded = expandedId === pos.id;

          return (
            <tr key={pos.id} className="group">
              <td>
                <div className="flex items-center gap-2">
                  <div className={cn('w-1.5 h-5 rounded-full', pos.qty > 0 ? 'bg-green' : 'bg-red')} />
                  <div>
                    <span className="font-semibold text-fw-text text-[13px]">{pos.symbol}</span>
                    <span className="ml-2 text-[10px] text-fw-text-muted bg-fw-bg px-1 py-0.5 rounded">{pos.productType}</span>
                  </div>
                </div>
              </td>
              <td>
                <span className={cn('text-[12px] font-semibold px-1.5 py-0.5 rounded', pos.qty > 0 ? 'text-green bg-green-dim' : 'text-red bg-red-dim')}>
                  {side}
                </span>
              </td>
              <td className={cn('font-mono font-medium tabular-nums', pos.qty > 0 ? 'text-green' : 'text-red')}>
                {Math.abs(pos.qty)}
              </td>
              <td className="font-mono tabular-nums">{formatPrice(pos.avgPrice)}</td>
              <td className="font-mono font-medium tabular-nums">{formatPrice(pos.ltp)}</td>
              <td className={cn('font-mono font-semibold tabular-nums', getChangeColor(pos.mtm))}>{formatPnl(pos.mtm)}</td>
              <td className={cn('font-mono tabular-nums', getChangeColor(pos.pnl - unrealized))}>{formatPnl(pos.pnl - unrealized)}</td>
              <td className={cn('font-mono tabular-nums', getChangeColor(unrealized))}>{formatPnl(unrealized)}</td>
              <td className="font-mono tabular-nums text-fw-text-secondary">₹{formatPrice(marginUsed)}</td>
              <td>
                <div className="flex items-center gap-0.5 flex-wrap">
                  {/* ── TASK 3: Position Actions ──────────────────── */}

                  {/* Partial Close toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : pos.id)}
                    className={cn(
                      'px-1.5 py-1 rounded text-[9px] font-bold transition-colors',
                      isExpanded ? 'bg-fw-accent text-white' : 'bg-fw-bg border border-fw-border text-fw-text-secondary hover:text-fw-text hover:border-fw-accent'
                    )}
                    title="Partial Close"
                  >
                    %
                  </button>

                  {/* Exit (100%) */}
                  <button onClick={() => onExit(pos.id)} className="p-1 rounded hover:bg-red-900/30 text-red-400 transition-colors" title="Exit 100%">
                    <X size={12} />
                  </button>

                  {/* Reverse */}
                  <button onClick={() => onReverse(pos.id)} className="p-1 rounded hover:bg-fw-hover text-fw-text-secondary hover:text-fw-text transition-colors" title="Reverse">
                    <RotateCcw size={12} />
                  </button>

                  {/* Break Even */}
                  <PosActionBtn label="BE" title="Break Even — Set SL at entry price" />

                  {/* Take Profit */}
                  <PosActionBtn label="TP" title="Take Profit" className="hover:text-green hover:border-green" />

                  {/* Stop Loss */}
                  <PosActionBtn label="SL" title="Stop Loss" className="hover:text-red hover:border-red" />

                  {/* Trailing Stop Loss */}
                  <PosActionBtn label="TSL" title="Trailing Stop Loss" className="hover:text-orange-400 hover:border-orange-400" />

                  {/* Modify */}
                  <button className="p-1 rounded hover:bg-fw-hover text-fw-text-secondary hover:text-fw-text transition-colors" title="Modify SL/Target">
                    <Edit size={12} />
                  </button>

                  {/* Add */}
                  <button className="p-1 rounded hover:bg-fw-hover text-fw-text-secondary hover:text-fw-text transition-colors" title="Add to position">
                    <Plus size={12} />
                  </button>

                  {/* ── TASK 2: Partial Close row (expanded) ──── */}
                  {isExpanded && (
                    <div className="flex items-center gap-0.5 ml-1 pl-1.5 border-l border-fw-border">
                      {[25, 50, 75, 100].map((pct) => (
                        <button
                          key={pct}
                          onClick={() => { onPartialClose(pos.id, pct); setExpandedId(null); }}
                          className={cn(
                            'px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors',
                            pct === 100
                              ? 'bg-red-900/30 text-red-400 border border-red-800/40 hover:bg-red-900/50'
                              : 'bg-fw-bg border border-fw-border text-fw-text-secondary hover:text-fw-text hover:border-fw-accent'
                          )}
                          title={`Close ${pct}% of position (${Math.max(1, Math.round(Math.abs(pos.qty) * pct / 100))} qty)`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PosActionBtn({ label, title, className }: { label: string; title: string; className?: string }) {
  return (
    <button
      title={title}
      className={cn(
        'px-1.5 py-0.5 rounded text-[9px] font-bold bg-fw-bg border border-fw-border',
        'text-fw-text-secondary hover:text-fw-text transition-colors',
        className
      )}
    >
      {label}
    </button>
  );
}

// ─── Orders Table ─────────────────────────────────────────────────────────────

function OrdersTable({ orders, onCancel }: { orders: Order[]; onCancel: (id: string) => void }) {
  if (orders.length === 0) {
    return <EmptyState message="No orders" />;
  }

  return (
    <table className="fw-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Symbol</th>
          <th>Side</th>
          <th>Type</th>
          <th>Product</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <td className="text-fw-text-secondary font-mono text-[12px] tabular-nums">{new Date(order.timestamp).toLocaleTimeString()}</td>
            <td className="font-semibold text-fw-text">{order.symbol}</td>
            <td>
              <span className={cn('text-[12px] font-semibold px-1.5 py-0.5 rounded', order.side === 'BUY' ? 'text-green bg-green-dim' : 'text-red bg-red-dim')}>
                {order.side}
              </span>
            </td>
            <td className="text-fw-text-secondary">{order.orderType}</td>
            <td className="text-fw-text-secondary">{order.productType}</td>
            <td className="font-mono tabular-nums">{order.filledQty}/{order.qty}</td>
            <td className="font-mono tabular-nums">{order.price ? `₹${formatPrice(order.price)}` : 'MKT'}</td>
            <td>
              <span className={cn(
                'px-2 py-0.5 text-[11px] rounded-md font-semibold',
                order.status === 'FILLED' && 'bg-green-900/20 text-green-400',
                order.status === 'OPEN' && 'bg-blue-900/20 text-blue-400',
                order.status === 'CANCELLED' && 'bg-yellow-900/20 text-yellow-400',
                order.status === 'REJECTED' && 'bg-red-900/20 text-red-400',
                order.status === 'PENDING' && 'bg-orange-900/20 text-orange-400',
              )}>
                {order.status}
              </span>
            </td>
            <td>
              {order.status === 'OPEN' && (
                <button onClick={() => onCancel(order.id)} className="p-1.5 rounded-md hover:bg-red-900/30 text-red-400 transition-colors" title="Cancel">
                  <X size={13} />
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Trades Table ─────────────────────────────────────────────────────────────

function TradesTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return <EmptyState message="No trades executed" />;
  }

  return (
    <table className="fw-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Symbol</th>
          <th>Side</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Segment</th>
          <th>Order ID</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade) => (
          <tr key={trade.id}>
            <td className="text-fw-text-secondary font-mono text-[12px] tabular-nums">{new Date(trade.timestamp).toLocaleTimeString()}</td>
            <td className="font-semibold text-fw-text">{trade.symbol}</td>
            <td>
              <span className={cn('text-[12px] font-semibold px-1.5 py-0.5 rounded', trade.side === 'BUY' ? 'text-green bg-green-dim' : 'text-red bg-red-dim')}>
                {trade.side}
              </span>
            </td>
            <td className="font-mono tabular-nums">{trade.qty}</td>
            <td className="font-mono tabular-nums">₹{formatPrice(trade.price)}</td>
            <td className="text-fw-text-secondary">{trade.segment}</td>
            <td className="text-fw-text-muted text-[11px] font-mono">{trade.orderId}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-fw-text-secondary gap-2 py-8">
      {icon || (
        <div className="w-10 h-10 rounded-xl bg-fw-bg border border-fw-border flex items-center justify-center">
          <Activity size={18} className="text-fw-text-muted/50" />
        </div>
      )}
      <span className="text-[12px] font-medium">{message}</span>
      <span className="text-[10px] text-fw-text-muted">Data will appear when you start trading</span>
    </div>
  );
}
