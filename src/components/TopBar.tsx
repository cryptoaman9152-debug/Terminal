import { Search, Moon, Palette, Monitor, Columns, Grid3X3, User, ChevronDown, Wifi, WifiOff, Zap } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useTradingStore } from '@/store/tradingStore';
import { useMarketStore } from '@/store/marketStore';
import { cn } from '@/utils/helpers';
import { AccountSelector } from './AccountSelector';
import { useState, useEffect } from 'react';
import { getMarginInfo } from '@/services/api';
import type { Theme } from '@/types';

function formatCompact(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${(val / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return val.toFixed(0);
}

export function TopBar() {
  const { theme, setTheme, setSearchOpen, showOptionChain, setShowOptionChain, panels, togglePanel } = useAppStore();
  const account = useTradingStore((s) => s.account);
  const marketStatus = useMarketStore((s) => s.marketStatus);
  const [marginInfo, setMarginInfo] = useState<{ usedMargin: number; availableMargin: number } | null>(null);

  // Fetch margin info periodically
  useEffect(() => {
    fetchMargin();
    const interval = setInterval(fetchMargin, 15000);
    return () => clearInterval(interval);
  }, [account?.id]);

  async function fetchMargin() {
    try {
      const info = await getMarginInfo();
      setMarginInfo(info);
    } catch { /* ignore */ }
  }

  const themes: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: 'dark', icon: <Moon size={12} />, label: 'Dark' },
    { value: 'fw-blue', icon: <Palette size={12} />, label: 'Blue' },
  ];

  return (
    <header className="h-[38px] min-h-[38px] bg-[#12141c] border-b border-fw-border flex items-center px-3 select-none overflow-hidden">
      {/* Brand */}
      <div data-brand className="flex items-center gap-2 mr-4 cursor-default flex-shrink-0">
        <div className="flex flex-col leading-none">
          <span className="text-[11px] font-extrabold tracking-wide bg-gradient-to-r from-[#00D4FF] via-[#4F46E5] to-[#7C3AED] bg-clip-text text-transparent">
            FUNDEDWEALTH
          </span>
          <span className="text-[8px] font-bold tracking-[0.25em] text-fw-accent/70 mt-[1px]">
            TERMINAL
          </span>
        </div>
      </div>

      {/* Challenge Phase Badge */}
      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-fw-accent/10 border border-fw-accent/20 mr-3 flex-shrink-0">
        <Zap size={11} className="text-fw-accent" />
        <span className="text-[10px] font-bold text-fw-accent">PHASE 1</span>
      </div>

      {/* Connection Status Badge */}
      <div className={cn(
        'flex items-center gap-1 px-2 py-0.5 rounded mr-3 flex-shrink-0',
        marketStatus === 'OPEN' ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'
      )}>
        {marketStatus === 'OPEN' ? <Wifi size={10} className="text-emerald-400" /> : <WifiOff size={10} className="text-red-400" />}
        <span className={cn('text-[10px] font-semibold', marketStatus === 'OPEN' ? 'text-emerald-400' : 'text-red-400')}>
          {marketStatus === 'OPEN' ? 'LIVE' : 'CLOSED'}
        </span>
      </div>

      {/* Market Status Badge */}
      <div className="flex items-center gap-1.5 mr-3 flex-shrink-0">
        <div className={cn('w-1.5 h-1.5 rounded-full', marketStatus === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')} />
        <span className="text-[11px] text-fw-text-secondary font-medium">
          {marketStatus === 'OPEN' ? 'NSE Open' : 'NSE Closed'}
        </span>
      </div>

      {/* Panel Toggles */}
      <div className="flex items-center gap-0.5 mr-3 pr-3 border-r border-fw-border/40 flex-shrink-0">
        <PanelBtn label="WL" active={panels.watchlist} onClick={() => togglePanel('watchlist')} />
        <PanelBtn label="ORD" active={panels.orderPanel} onClick={() => togglePanel('orderPanel')} />
        <PanelBtn label="OC" active={showOptionChain} onClick={() => setShowOptionChain(!showOptionChain)} />
        <PanelBtn label="DOM" active={panels.marketDepth} onClick={() => togglePanel('marketDepth')} />
        <PanelBtn label="BTM" active={panels.bottomPanel} onClick={() => togglePanel('bottomPanel')} />
      </div>

      {/* Layout Selector */}
      <div className="flex items-center gap-0.5 mr-3 flex-shrink-0">
        <button title="Single Chart" className="p-1 rounded text-fw-accent bg-fw-hover">
          <Monitor size={12} />
        </button>
        <button title="Split View — Backend integration pending" className="p-1 rounded text-fw-text-secondary hover:text-fw-text hover:bg-fw-hover transition-colors">
          <Columns size={12} />
        </button>
        <button title="Grid View — Backend integration pending" className="p-1 rounded text-fw-text-secondary hover:text-fw-text hover:bg-fw-hover transition-colors">
          <Grid3X3 size={12} />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Account Metrics */}
      {account && (
        <div className="flex items-center gap-3 mr-3 pr-3 border-r border-fw-border/40 flex-shrink-0">
          <MetricBlock label="Balance" value={formatCompact(account.balance || 0)} prefix="₹" />
          <MetricBlock label="Margin Used" value={formatCompact(marginInfo?.usedMargin || 0)} prefix="₹" className="text-orange-400" />
          <MetricBlock label="Free Margin" value={formatCompact(marginInfo?.availableMargin || account.balance || 0)} prefix="₹" className="text-emerald-400" />
          <MetricBlock label="P&L" value={formatCompact(account.totalPnl || 0)} prefix={account.totalPnl && account.totalPnl >= 0 ? '+₹' : '-₹'} className={(account.totalPnl || 0) >= 0 ? 'text-green' : 'text-red'} />
        </div>
      )}

      {/* Account Selector */}
      <AccountSelector />

      {/* Theme */}
      <div className="flex items-center bg-fw-bg rounded border border-fw-border p-0.5 mr-2 flex-shrink-0">
        {themes.map((t) => (
          <button key={t.value} onClick={() => setTheme(t.value)} title={t.label}
            className={cn('p-1 rounded transition-colors', theme === t.value ? 'bg-fw-accent text-white' : 'text-fw-text-secondary hover:text-fw-text')}>
            {t.icon}
          </button>
        ))}
      </div>

      {/* Search */}
      <button onClick={() => setSearchOpen(true)} className="p-1 rounded hover:bg-fw-hover text-fw-text-secondary hover:text-fw-text transition-colors flex-shrink-0" title="Search (Ctrl+K)">
        <Search size={13} />
      </button>
    </header>
  );
}

function MetricBlock({ label, value, className, prefix }: { label: string; value: string; className?: string; prefix?: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] text-fw-text-muted whitespace-nowrap uppercase tracking-wider">{label}</span>
      <span className={cn('text-[13px] font-mono font-bold text-fw-text whitespace-nowrap tabular-nums', className)}>{prefix || ''}{value}</span>
    </div>
  );
}

function PanelBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors', active ? 'bg-fw-accent/20 text-fw-accent' : 'text-fw-text-muted hover:text-fw-text')}>
      {label}
    </button>
  );
}
