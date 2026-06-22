import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { getOptionChain, getExpiries } from '@/services/api';
import { cn, formatPrice, formatNumber } from '@/utils/helpers';
import { useTradingStore } from '@/store/tradingStore';
import type { OptionChainEntry } from '@/types';

const INDEX_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'];

export function OptionChainModal() {
  const { setActiveSymbol } = useAppStore();
  const { setOrderForm } = useTradingStore();
  const [symbol, setSymbol] = useState('NIFTY');
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [chain, setChain] = useState<OptionChainEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
  }, []);

  useEffect(() => { loadExpiries(); }, [symbol]);
  useEffect(() => { if (selectedExpiry) loadChain(); }, [symbol, selectedExpiry]);

  const loadChain = async () => {
    if (!selectedExpiry) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getOptionChain(symbol, selectedExpiry);
      if (!isMountedRef.current) return;
      if (data && data.length > 0) {
        setChain(data);
        setRetryCount(0);
      } else {
        // Empty response — might be market closed or feed not ready. Auto-retry up to 3 times with backoff.
        setChain([]);
        if (retryCount < 3) {
          const delay = (retryCount + 1) * 5000; // 5s, 10s, 15s
          retryTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setRetryCount((c) => c + 1);
              loadChain();
            }
          }, delay);
        } else {
          setError('No option chain data available. Market may be closed or feed is connecting.');
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setChain([]);
      setError(err.message || 'Failed to load option chain');
      // Auto-retry on error with backoff
      if (retryCount < 3) {
        const delay = (retryCount + 1) * 5000;
        retryTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setRetryCount((c) => c + 1);
            loadChain();
          }
        }, delay);
      }
    } finally { if (isMountedRef.current) setIsLoading(false); }
  };

  const loadExpiries = async () => {
    try {
      const data = await getExpiries(symbol);
      if (!isMountedRef.current) return;
      setExpiries(data);
      if (data.length > 0) setSelectedExpiry(data[0]);
    } catch {
      if (!isMountedRef.current) return;
      // Fallback: generate nearest Thursday expiry for indices
      const now = new Date();
      const fallbackExpiries: string[] = [];
      for (let i = 0; i < 4; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() + ((4 - date.getDay() + 7) % 7) + i * 7);
        if (date > now) fallbackExpiries.push(date.toISOString().split('T')[0]);
      }
      setExpiries(fallbackExpiries);
      if (fallbackExpiries.length > 0 && !selectedExpiry) setSelectedExpiry(fallbackExpiries[0]);
    }
  };

  const handleManualRetry = () => {
    setRetryCount(0);
    setError(null);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    loadChain();
  };

  const handleStrikeClick = (strike: number, type: 'CE' | 'PE') => {
    setActiveSymbol({
      token: `${symbol}_${strike}_${type}`,
      symbol: `${symbol} ${strike} ${type}`,
      name: `${symbol} ${selectedExpiry} ${strike} ${type}`,
      segment: 'NFO',
      instrumentType: type,
      exchange: 'NSE',
      lotSize: symbol === 'BANKNIFTY' ? 15 : 50,
      tickSize: 0.05,
      expiry: selectedExpiry,
      strike,
      optionType: type,
    });
  };

  return (
    <div className="flex flex-col h-full bg-fw-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-fw-border">
        <span className="text-[12px] font-bold text-fw-text">OPTION CHAIN</span>
        <div className="flex items-center gap-0.5">
          {INDEX_SYMBOLS.map((s) => (
            <button key={s} onClick={() => setSymbol(s)}
              className={cn('px-1.5 py-0.5 text-[11px] rounded font-semibold', symbol === s ? 'bg-fw-accent text-white' : 'text-fw-text-secondary hover:text-fw-text')}>
              {s}
            </button>
          ))}
        </div>
        <select value={selectedExpiry} onChange={(e) => setSelectedExpiry(e.target.value)}
          className="ml-auto bg-fw-bg text-fw-text text-[11px] border border-fw-border rounded px-1.5 py-0.5 font-mono">
          {expiries.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto text-[11px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-5 h-5 border-2 border-fw-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-[13px] text-fw-text-secondary font-medium">Loading option chain...</p>
            <p className="text-[11px] text-fw-text-muted">{symbol} · {selectedExpiry}</p>
          </div>
        ) : chain.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-12 h-12 rounded-xl bg-fw-bg border border-fw-border flex items-center justify-center">
              <span className="text-[24px] text-fw-text-muted/60">⛓</span>
            </div>
            <div className="text-center">
              <p className="text-[14px] text-fw-text-secondary font-semibold">
                {error ? 'Option Chain Unavailable' : 'Loading Option Chain'}
              </p>
              <p className="text-[12px] text-fw-text-muted mt-1 max-w-[260px]">
                {error || 'Connecting to market data feed...'}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {retryCount > 0 && retryCount < 3 && !error && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  <span className="text-[11px] text-orange-400 font-medium">Retrying ({retryCount}/3)...</span>
                </div>
              )}
              <button
                onClick={handleManualRetry}
                className="px-3 py-1 text-[11px] font-semibold bg-fw-accent text-white rounded hover:brightness-110 transition-all"
              >
                Retry Now
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-fw-surface z-10">
              <tr className="border-b border-fw-border text-[9px] text-fw-text-secondary uppercase">
                <th className="px-1 py-1 text-center">B/S</th>
                <th className="px-1 py-1 text-right">OI</th>
                <th className="px-1 py-1 text-right">Vol</th>
                <th className="px-1 py-1 text-right">LTP</th>
                <th className="px-1.5 py-1 text-center bg-fw-bg font-bold text-fw-text border-x border-fw-border">STRIKE</th>
                <th className="px-1 py-1 text-left">LTP</th>
                <th className="px-1 py-1 text-left">Vol</th>
                <th className="px-1 py-1 text-left">OI</th>
                <th className="px-1 py-1 text-center">B/S</th>
              </tr>
            </thead>
            <tbody>
              {chain.map((e, idx) => {
                const isAtm = idx === Math.floor(chain.length / 2);
                return (
                  <tr key={e.strike} className={cn('border-b border-fw-border/20 hover:bg-fw-hover/40', isAtm && 'bg-fw-accent/5')}>
                    <td className="px-1 py-[3px] text-center">
                      <button onClick={() => { handleStrikeClick(e.strike, 'CE'); setOrderForm({ side: 'BUY' }); }} className="text-[8px] text-green-400 font-bold hover:bg-green-900/30 px-1 rounded">B</button>
                      <button onClick={() => { handleStrikeClick(e.strike, 'CE'); setOrderForm({ side: 'SELL' }); }} className="text-[8px] text-red-400 font-bold hover:bg-red-900/30 px-1 rounded">S</button>
                    </td>
                    <td className="px-1 py-[3px] text-right font-mono tabular-nums text-fw-text-secondary">{formatNumber(e.callOi)}</td>
                    <td className="px-1 py-[3px] text-right font-mono tabular-nums text-fw-text-secondary">{formatNumber(e.callVolume)}</td>
                    <td className="px-1 py-[3px] text-right font-mono tabular-nums text-green cursor-pointer hover:underline" onClick={() => handleStrikeClick(e.strike, 'CE')}>{formatPrice(e.callLtp)}</td>
                    <td className={cn('px-1.5 py-[3px] text-center font-mono font-bold bg-fw-bg border-x border-fw-border tabular-nums', isAtm ? 'text-fw-accent' : 'text-fw-text')}>{e.strike}</td>
                    <td className="px-1 py-[3px] text-left font-mono tabular-nums text-red cursor-pointer hover:underline" onClick={() => handleStrikeClick(e.strike, 'PE')}>{formatPrice(e.putLtp)}</td>
                    <td className="px-1 py-[3px] text-left font-mono tabular-nums text-fw-text-secondary">{formatNumber(e.putVolume)}</td>
                    <td className="px-1 py-[3px] text-left font-mono tabular-nums text-fw-text-secondary">{formatNumber(e.putOi)}</td>
                    <td className="px-1 py-[3px] text-center">
                      <button onClick={() => { handleStrikeClick(e.strike, 'PE'); setOrderForm({ side: 'BUY' }); }} className="text-[8px] text-green-400 font-bold hover:bg-green-900/30 px-1 rounded">B</button>
                      <button onClick={() => { handleStrikeClick(e.strike, 'PE'); setOrderForm({ side: 'SELL' }); }} className="text-[8px] text-red-400 font-bold hover:bg-red-900/30 px-1 rounded">S</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
