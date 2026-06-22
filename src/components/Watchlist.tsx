import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, X, Search, Star, BarChart3, TrendingUp, Pin, Upload } from 'lucide-react';import { useAppStore } from '@/store/appStore';
import { useMarketStore } from '@/store/marketStore';
import { cn, formatPrice, getChangeColor } from '@/utils/helpers';
import type { WatchlistItem } from '@/types';

export function Watchlist() {
  const {
    watchlists, activeWorkspace, removeFromWatchlist, setActiveSymbol, setSearchOpen, activeSymbol, setWatchlists,
    pinnedTokens, togglePinToken, activeWatchlistTab, setActiveWatchlistTab,
  } = useAppStore();
  const [filter, setFilter] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');

  const currentWlId = activeWatchlistTab || activeWorkspace;
  const activeWatchlist = watchlists.find((wl) => wl.id === currentWlId);

  const filteredItems = useMemo(() => {
    if (!activeWatchlist) return [];
    let items = [...activeWatchlist.items];
    if (filter) {
      items = items.filter((item) =>
        item.symbol.toLowerCase().includes(filter.toLowerCase())
      );
    }
    items.sort((a, b) => {
      const aPinned = pinnedTokens.includes(a.token) ? 0 : 1;
      const bPinned = pinnedTokens.includes(b.token) ? 0 : 1;
      return aPinned - bPinned;
    });
    return items;
  }, [activeWatchlist, filter, pinnedTokens]);

  const handleSelectItem = (item: WatchlistItem) => {
    setActiveSymbol({
      token: item.token,
      symbol: item.symbol,
      name: item.symbol,
      segment: item.segment,
      instrumentType: item.segment === 'NFO' || item.segment === 'MCX' || item.segment === 'CDS' ? 'FUT' : 'EQ',
      exchange: item.segment === 'MCX' ? 'MCX' : item.segment === 'BSE' ? 'BSE' : 'NSE',
      lotSize: 1,
      tickSize: 0.05,
    });
  };

  const handleImport = () => {
    if (!importText.trim() || !activeWatchlist) return;
    const symbols = importText.split(/[,\n;]+/).map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0);
    const existingSymbols = new Set(activeWatchlist.items.map((i) => i.symbol));
    const newItems: WatchlistItem[] = symbols
      .filter((s) => !existingSymbols.has(s))
      .map((s) => ({ token: s + '_IMP_' + Date.now(), symbol: s, segment: 'NSE' as const }));
    if (newItems.length > 0) {
      const updated = watchlists.map((wl) => wl.id === currentWlId ? { ...wl, items: [...wl.items, ...newItems] } : wl);
      setWatchlists(updated);
    }
    setImportText('');
    setShowImport(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#0f1118] overflow-hidden">
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-fw-border flex items-center justify-between flex-shrink-0 bg-[#12141c]">
        <span className="text-[11px] font-bold text-fw-text-secondary uppercase tracking-wider">Watchlist</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setSearchOpen(true)} className="p-0.5 text-fw-text-secondary hover:text-fw-text rounded hover:bg-fw-hover" title="Add Symbol">
            <Plus size={12} />
          </button>
          <button onClick={() => setShowImport(!showImport)} className="p-0.5 text-fw-text-secondary hover:text-fw-text rounded hover:bg-fw-hover" title="Import">
            <Upload size={11} />
          </button>
        </div>
      </div>

      {/* Multi-watchlist tabs */}
      <div className="flex items-center border-b border-fw-border overflow-x-auto flex-shrink-0 scrollbar-none bg-[#0d0f15]">
        {watchlists.map((wl) => (
          <button
            key={wl.id}
            onClick={() => setActiveWatchlistTab(wl.id)}
            className={cn(
              'px-2.5 py-1.5 text-[10px] font-bold whitespace-nowrap border-b-2 transition-colors flex-shrink-0',
              currentWlId === wl.id
                ? 'text-fw-text border-fw-accent'
                : 'text-fw-text-muted border-transparent hover:text-fw-text-secondary'
            )}
            style={currentWlId === wl.id ? { borderColor: wl.color } : undefined}
          >
            {wl.name}
          </button>
        ))}
      </div>

      {/* Search Filter */}
      <div className="px-1.5 py-1 border-b border-fw-border flex-shrink-0">
        <div className="relative">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-fw-text-muted" />
          <input
            type="text"
            placeholder="Filter symbols..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-fw-bg border border-fw-border rounded text-[10px] text-fw-text pl-6 pr-2 py-1 outline-none focus:border-fw-accent"
          />
        </div>
      </div>

      {/* Import Panel */}
      {showImport && (
        <div className="px-2 py-1.5 border-b border-fw-border bg-fw-bg/50 space-y-1 flex-shrink-0">
          <textarea
            placeholder="RELIANCE, TCS, INFY"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={2}
            className="w-full bg-fw-bg border border-fw-border rounded text-[10px] px-2 py-1 text-fw-text outline-none focus:border-fw-accent resize-none"
          />
          <div className="flex gap-1">
            <button onClick={handleImport} className="px-2 py-0.5 text-[9px] bg-fw-accent text-white rounded font-semibold">Import</button>
            <button onClick={() => setShowImport(false)} className="px-2 py-0.5 text-[9px] text-fw-text-secondary border border-fw-border rounded">Cancel</button>
          </div>
        </div>
      )}

      {/* Column Headers */}
      <div className="grid grid-cols-[1fr_70px_52px] px-2 py-0.5 border-b border-fw-border/50 flex-shrink-0 bg-[#0d0f15]">
        <span className="text-[9px] text-fw-text-muted font-semibold uppercase">Symbol</span>
        <span className="text-[9px] text-fw-text-muted font-semibold uppercase text-right">LTP</span>
        <span className="text-[9px] text-fw-text-muted font-semibold uppercase text-right">Chg%</span>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-16 text-fw-text-muted">
            <p className="text-[10px]">No symbols</p>
            <button onClick={() => setSearchOpen(true)} className="mt-1 text-[9px] text-fw-accent hover:underline">+ Add</button>
          </div>
        ) : (
          filteredItems.map((item) => (
            <WatchlistRow
              key={item.token}
              item={item}
              isSelected={activeSymbol?.token === item.token}
              isPinned={pinnedTokens.includes(item.token)}
              onSelect={() => handleSelectItem(item)}
              onRemove={() => removeFromWatchlist(currentWlId, item.token)}
              onPin={() => togglePinToken(item.token)}
            />
          ))
        )}
      </div>

      {/* Add Button */}
      <div className="px-1.5 py-1 border-t border-fw-border flex-shrink-0">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-fw-text-muted hover:text-fw-accent rounded hover:bg-fw-hover transition-colors"
        >
          <Plus size={10} /> Add Symbol
        </button>
      </div>
    </div>
  );
}

function WatchlistRow({ item, isSelected, isPinned, onSelect, onRemove, onPin }: {
  item: WatchlistItem;
  isSelected: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onPin: () => void;
}) {
  const quote = useMarketStore((s) => s.quotes[item.token]);
  const prevLtpRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<'green' | 'red' | null>(null);

  // Tick flash effect
  useEffect(() => {
    if (!quote?.ltp || prevLtpRef.current === null) {
      prevLtpRef.current = quote?.ltp || null;
      return;
    }
    if (quote.ltp > prevLtpRef.current) {
      setFlash('green');
    } else if (quote.ltp < prevLtpRef.current) {
      setFlash('red');
    }
    prevLtpRef.current = quote.ltp;
    const timer = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(timer);
  }, [quote?.ltp]);

  return (
    <div
      className={cn(
        'group grid grid-cols-[1fr_70px_52px] items-center px-2 py-[6px] cursor-pointer border-b border-fw-border/10 transition-all',
        isSelected
          ? 'bg-fw-accent/5 border-l-2 border-l-fw-accent'
          : 'hover:bg-fw-hover/50 border-l-2 border-l-transparent'
      )}
      onClick={onSelect}
    >
      {/* Symbol */}
      <div className="flex items-center gap-1 min-w-0">
        {isPinned && <Star size={9} className="text-fw-accent flex-shrink-0 fill-fw-accent" />}
        <span className={cn('text-[13px] font-semibold truncate', isSelected ? 'text-fw-text' : 'text-fw-text/90')}>
          {item.symbol}
        </span>
        <span className="text-[8px] text-fw-text-muted uppercase ml-0.5">{item.segment}</span>
      </div>

      {/* LTP */}
      <span className={cn(
        'text-[13px] font-mono tabular-nums text-right font-medium transition-colors duration-300',
        quote ? getChangeColor(quote.changePercent) : 'text-fw-text-secondary',
        flash === 'green' && 'animate-[priceFlashGreen_0.6s_ease-out]',
        flash === 'red' && 'animate-[priceFlashRed_0.6s_ease-out]'
      )}>
        {quote ? formatPrice(quote.ltp) : '—'}
      </span>

      {/* Change % */}
      <div className="text-right">
        {quote ? (
          <span className={cn(
            'text-[10px] font-mono tabular-nums px-1 py-[1px] rounded font-medium',
            (quote.changePercent || 0) >= 0 ? 'text-green bg-green-dim' : 'text-red bg-red-dim'
          )}>
            {(quote.changePercent || 0) >= 0 ? '+' : ''}{(quote.changePercent || 0).toFixed(2)}%
          </span>
        ) : (
          <span className="text-[10px] text-fw-text-muted">—</span>
        )}
      </div>

      {/* Hover actions */}
      <div className="col-span-3 h-0 overflow-hidden group-hover:h-5 transition-all flex items-center gap-1 pl-1 mt-0.5">
        <button onClick={(e) => { e.stopPropagation(); onPin(); }} className="text-[8px] text-fw-text-muted hover:text-fw-accent" title={isPinned ? 'Unpin' : 'Pin'}>
          <Star size={9} className={isPinned ? 'fill-fw-accent text-fw-accent' : ''} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-[8px] text-red-400 hover:text-red-300" title="Remove">
          <X size={9} />
        </button>
      </div>
    </div>
  );
}
