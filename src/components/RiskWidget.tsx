import { useTradingStore } from '@/store/tradingStore';
import { cn } from '@/utils/helpers';
import { Shield, Calendar, Target } from 'lucide-react';

export function RiskWidget() {
  const account = useTradingStore((s) => s.account);
  const positions = useTradingStore((s) => s.positions);

  const balance = account?.balance || 0;
  const initialBalance = account?.challenge?.initialBalance || 10000000;
  const dailyLimit = balance * 0.05;
  const maxDrawdownLimit = balance * 0.10;

  const totalMTM = positions.reduce((sum, p) => sum + (p.pnl || p.mtm || 0), 0);
  const dailyLoss = totalMTM < 0 ? Math.abs(totalMTM) : 0;

  const peakBalance = Math.max(balance, initialBalance);
  const drawdown = peakBalance - (balance + totalMTM);

  const profitTarget = initialBalance * 0.10;
  const profitAchieved = (balance + totalMTM) - initialBalance;

  const dailyPct = dailyLimit > 0 ? (dailyLoss / dailyLimit) * 100 : 0;
  const ddPct = maxDrawdownLimit > 0 ? (Math.max(0, drawdown) / maxDrawdownLimit) * 100 : 0;
  const targetPct = profitTarget > 0 ? (Math.max(0, profitAchieved) / profitTarget) * 100 : 0;

  const phase = account?.challenge?.type || 'Phase 1';

  return (
    <div className="px-2.5 py-2 border-b border-fw-border bg-fw-bg/40">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Shield size={12} className="text-fw-accent" />
          <span className="text-[11px] font-bold text-fw-text-secondary uppercase tracking-wider">Risk</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-mono font-bold px-1.5 py-0.5 rounded',
            dailyPct > 70 ? 'bg-red-900/20 text-red-400' : ddPct > 50 ? 'bg-orange-900/20 text-orange-400' : 'bg-emerald-900/20 text-emerald-400'
          )}>
            {dailyPct > 70 ? 'HIGH' : ddPct > 50 ? 'CAUTION' : 'SAFE'}
          </span>
        </div>
      </div>

      {/* Challenge Info */}
      <div className="flex items-center gap-2 mb-2 px-1.5 py-1 bg-fw-surface rounded border border-fw-border/50">
        <div className="flex items-center gap-1">
          <Target size={10} className="text-fw-accent" />
          <span className="text-[10px] font-bold text-fw-accent">{phase}</span>
        </div>
        <div className="w-px h-3 bg-fw-border" />
        <div className="flex items-center gap-1">
          <Calendar size={10} className="text-fw-text-muted" />
          <span className="text-[10px] text-fw-text-secondary font-mono">Day 1/30</span>
        </div>
      </div>

      {/* Risk Bars */}
      <div className="space-y-1.5">
        <RiskBar
          label="Daily Loss"
          pct={dailyPct}
          color="red"
        />
        <RiskBar
          label="Max DD"
          pct={ddPct}
          color="orange"
        />
        <RiskBar
          label="Target"
          pct={targetPct}
          color="green"
        />
      </div>
    </div>
  );
}

function RiskBar({ label, pct, color }: {
  label: string; pct: number; color: 'red' | 'orange' | 'green';
}) {
  const barColor = color === 'red' ? 'bg-red-500' : color === 'orange' ? 'bg-orange-500' : 'bg-emerald-500';
  const textColor = color === 'red' ? 'text-red' : color === 'orange' ? 'text-orange-400' : 'text-green';
  const bgTint = color === 'red' ? 'bg-red-500/10' : color === 'orange' ? 'bg-orange-500/10' : 'bg-emerald-500/10';

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="text-fw-text-secondary font-medium">{label}</span>
        <span className={cn('font-mono font-semibold tabular-nums', textColor)}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className={cn('h-2 rounded-full overflow-hidden', bgTint)}>
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
