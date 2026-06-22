import { useAppStore } from '@/store/appStore';
import { useDepth } from '@/hooks/useMarketData';
import { useMarketStore } from '@/store/marketStore';
import { useTradingStore } from '@/store/tradingStore';
import { cn, formatPrice } from '@/utils/helpers';
import type { MarketDepthLevel } from '@/types';

function fmtQty(n: number): string {
  if (n >= 10_000_000) return (n / 10_000_000).toFixed(1) + 'Cr';
  if (n >= 100_000) return (n / 100_000).toFixed(1) + 'L';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

export function MarketDepthPanel() {
  const { activeSymbol } = useAppStore();
  const liveDepth = useDepth(activeSymbol?.token);
  const quote = useMarketStore((s) => activeSymbol ? s.quotes[activeSymbol.token] : undefined);
  const { setOrderForm } = useTradingStore();

  const depth = liveDepth ?? { bids: [] as MarketDepthLevel[], asks: [] as MarketDepthLevel[], totalBuyQty: 0, totalSellQty: 0 };
  const hasData = depth.bids.length > 0 || depth.asks.length > 0;

  const maxBidQty = Math.max(...depth.bids.map((b) => b.qty), 1);
  const maxAskQty = Math.max(...depth.asks.map((a) => a.qty), 1);

  const totalBid = depth.totalBuyQty || depth.bids.reduce((s, b) => s + b.qty, 0);
  const totalAsk = depth.totalSellQty || depth.asks.reduce((s, a) => s + a.qty, 0);
  const grandTotal = totalBid + totalAsk;
  const bidPct = grandTotal > 0 ? (totalBid / grandTotal) * 100 : 50;

  return (
    <div className="flex flex-col bg-[#0d0f15] select-none" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-fw-border bg-[#12141c] flex-shrink-0">
        <span className="text-[11px] font-bold text-fw-text-secondary uppercase tracking-wider">Market Depth</span>
        {quote && (
          <span className={cn('font-mono font-bold text-[13px] tabular-nums', quote.changePercent >= 0 ? 'text-green' : 'text-red')}>
            {formatPrice(quote.ltp)}
          </span>
        )}
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-[1fr_80px_80px_1fr] px-1 py-[2px] border-b border-fw-border/40 flex-shrink-0">
        <span className="text-[9px] text-fw-text-muted font-semibold uppercase text-right pr-1">Bid Qty</span>
        <span className="text-[9px] text-green font-semibold uppercase text-right pr-1">Bid</span>
        <span className="text-[9px] text-red font-semibold uppercase text-left pl-1">Ask</span>
        <span className="text-[9px] text-fw-text-muted font-semibold uppercase text-left pl-1">Ask Qty</span>
      </div>

      {/* 5 Depth Levels */}
      <div className="flex-1 overflow-hidden min-h-0">
        {[0, 1, 2, 3, 4].map((i) => {
          const bid = depth.bids[i];
          const ask = depth.asks[i];
          const bidBarW = bid ? Math.min((bid.qty / maxBidQty) * 100, 100) : 0;
          const askBarW = ask ? Math.min((ask.qty / maxAskQty) * 100, 100) : 0;

          return (
            <div key={i} className={cn('grid grid-cols-[1fr_80px_80px_1fr] items-center relative border-b border-fw-border/10 hover:bg-fw-hover/20', i === 0 && 'border-b-fw-border/40')}>
              {/* Bid bar background */}
              <div className="absolute right-1/2 top-0 bottom-0 pointer-events-none" style={{ width: `${bidBarW * 0.45}%`, background: 'var(--fw-green)', opacity: 0.08 }} />
              {/* Ask bar background */}
              <div className="absolute left-1/2 top-0 bottom-0 pointer-events-none" style={{ width: `${askBarW * 0.45}%`, background: 'var(--fw-red)', opacity: 0.08 }} />

              <div className="text-right pr-1 py-[3px] text-[12px] font-mono tabular-nums text-green font-medium cursor-pointer hover:text-white" onClick={() => bid && setOrderForm({ price: bid.price, side: 'BUY' })}>
                {bid ? fmtQty(bid.qty) : '—'}
              </div>
              <div className={cn('text-right pr-1 py-[3px] text-[12px] font-mono tabular-nums font-semibold cursor-pointer hover:text-green', i === 0 ? 'text-green' : 'text-fw-text')} onClick={() => bid && setOrderForm({ price: bid.price, side: 'BUY' })}>
                {bid ? formatPrice(bid.price) : '—'}
              </div>
              <div className={cn('text-left pl-1 py-[3px] text-[12px] font-mono tabular-nums font-semibold cursor-pointer hover:text-red', i === 0 ? 'text-red' : 'text-fw-text')} onClick={() => ask && setOrderForm({ price: ask.price, side: 'SELL' })}>
                {ask ? formatPrice(ask.price) : '—'}
              </div>
              <div className="text-left pl-1 py-[3px] text-[12px] font-mono tabular-nums text-red font-medium cursor-pointer hover:text-white" onClick={() => ask && setOrderForm({ price: ask.price, side: 'SELL' })}>
                {ask ? fmtQty(ask.qty) : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="border-t border-fw-border bg-[#12141c] px-2 py-1 flex-shrink-0">
        <div className="flex justify-between text-[11px] mb-0.5">
          <span className="font-mono text-green font-bold">{fmtQty(totalBid)}</span>
          <span className="font-mono text-red font-bold">{fmtQty(totalAsk)}</span>
        </div>
        <div className="h-1 rounded-full overflow-hidden bg-fw-border flex">
          <div className="h-full rounded-full" style={{ width: `${bidPct}%`, background: 'var(--fw-green)' }} />
          <div className="h-full flex-1" style={{ background: 'var(--fw-red)' }} />
        </div>
      </div>
    </div>
  );
}
