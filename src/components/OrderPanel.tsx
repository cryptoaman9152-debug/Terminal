import { useState } from 'react';
import { useTradingStore } from '@/store/tradingStore';
import { useAppStore } from '@/store/appStore';
import { useMarketStore } from '@/store/marketStore';
import { placeOrder } from '@/services/api';
import { cn, formatPrice } from '@/utils/helpers';
import type { OrderSide, OrderType, ProductType } from '@/types';

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'MARKET', label: 'MKT' },
  { value: 'LIMIT', label: 'LMT' },
  { value: 'SL', label: 'SL' },
  { value: 'SL-M', label: 'SL-M' },
];

const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'MIS', label: 'MIS' },
  { value: 'NRML', label: 'NRML' },
  { value: 'CNC', label: 'CNC' },
];

export function OrderPanel() {
  const { orderForm, setOrderForm } = useTradingStore();
  const { activeSymbol } = useAppStore();
  const quote = useMarketStore((s) => activeSymbol ? s.quotes[activeSymbol.token] : undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [bracketEnabled, setBracketEnabled] = useState(false);
  const [slPrice, setSlPrice] = useState<number>(0);
  const [tpPrice, setTpPrice] = useState<number>(0);

  const symbol = orderForm.symbol || activeSymbol?.symbol || '';
  const token = orderForm.token || activeSymbol?.token || '';

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  if (!symbol && !activeSymbol) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-3 py-4 bg-[#0f1118]">
        <p className="text-[11px] text-fw-text-secondary">Select a symbol</p>
        <p className="text-[9px] text-fw-text-muted">Ctrl+K to search</p>
      </div>
    );
  }

  const handleSubmit = async (side: OrderSide) => {
    if (!symbol || !token) return;
    setIsSubmitting(true);
    try {
      await placeOrder({ symbol, token, segment: activeSymbol?.segment || 'NSE', side, orderType: orderForm.orderType, productType: orderForm.productType, qty: orderForm.qty, price: orderForm.orderType === 'LIMIT' || orderForm.orderType === 'SL' ? orderForm.price : undefined, triggerPrice: orderForm.orderType === 'SL' || orderForm.orderType === 'SL-M' ? orderForm.triggerPrice : undefined });
      showToast(`${side} ${orderForm.qty}×${symbol} placed`);
    } catch (err: any) { showToast(err.message || 'Order failed'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f1118] overflow-y-auto">
      {/* Header */}
      <div className="px-2.5 py-1.5 border-b border-fw-border bg-[#12141c] flex items-center justify-between flex-shrink-0">
        <span className="text-[11px] font-bold text-fw-text-secondary uppercase tracking-wider">Order Entry</span>
        <span className="text-[11px] text-fw-text-muted font-mono">{symbol}</span>
      </div>

      {/* LTP */}
      {quote && (
        <div className="px-2.5 py-1 border-b border-fw-border/50 flex items-center justify-between">
          <span className={cn('text-[14px] font-mono font-bold tabular-nums', quote.changePercent >= 0 ? 'text-green' : 'text-red')}>
            {formatPrice(quote.ltp)}
          </span>
          <span className={cn('text-[10px] font-mono', quote.changePercent >= 0 ? 'text-green' : 'text-red')}>
            {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent?.toFixed(2)}%
          </span>
        </div>
      )}

      {/* BUY / SELL */}
      <div className="grid grid-cols-2 border-b border-fw-border">
        <button onClick={() => setOrderForm({ side: 'BUY' })} className={cn('py-2.5 text-[13px] font-bold transition-all', orderForm.side === 'BUY' ? 'bg-[var(--fw-green)] text-white shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-[#0d0f15] text-fw-text-secondary hover:text-green')}>BUY</button>
        <button onClick={() => setOrderForm({ side: 'SELL' })} className={cn('py-2.5 text-[13px] font-bold transition-all', orderForm.side === 'SELL' ? 'bg-[var(--fw-red)] text-white shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-[#0d0f15] text-fw-text-secondary hover:text-red')}>SELL</button>
      </div>

      {/* Order Type */}
      <div className="px-2 py-1.5 border-b border-fw-border/50">
        <div className="grid grid-cols-4 gap-0.5">
          {ORDER_TYPES.map((ot) => (
            <button key={ot.value} onClick={() => setOrderForm({ orderType: ot.value })} className={cn('py-1.5 text-[11px] font-semibold rounded', orderForm.orderType === ot.value ? 'bg-fw-accent text-white' : 'bg-[#0d0f15] text-fw-text-secondary border border-fw-border hover:text-fw-text')}>{ot.label}</button>
          ))}
        </div>
      </div>

      {/* Product */}
      <div className="px-2 py-1.5 border-b border-fw-border/50">
        <div className="grid grid-cols-3 gap-0.5">
          {PRODUCT_TYPES.map((pt) => (
            <button key={pt.value} onClick={() => setOrderForm({ productType: pt.value })} className={cn('py-1.5 text-[11px] font-semibold rounded', orderForm.productType === pt.value ? 'bg-fw-accent text-white' : 'bg-[#0d0f15] text-fw-text-secondary border border-fw-border hover:text-fw-text')}>{pt.label}</button>
          ))}
        </div>
      </div>

      {/* Qty */}
      <div className="px-2 py-1.5 border-b border-fw-border/50">
        <div className="flex items-center gap-0.5">
          <button onClick={() => setOrderForm({ qty: Math.max(1, orderForm.qty - 1) })} className="w-7 h-7 flex items-center justify-center bg-[#0d0f15] border border-fw-border rounded text-fw-text text-[14px] font-bold hover:bg-fw-hover">−</button>
          <input type="number" value={orderForm.qty} onChange={(e) => setOrderForm({ qty: Math.max(1, parseInt(e.target.value) || 1) })} className="flex-1 bg-[#0d0f15] border border-fw-border rounded text-center font-mono text-[13px] text-fw-text py-1.5 outline-none focus:border-fw-accent tabular-nums" min={1} />
          <button onClick={() => setOrderForm({ qty: orderForm.qty + 1 })} className="w-7 h-7 flex items-center justify-center bg-[#0d0f15] border border-fw-border rounded text-fw-text text-[14px] font-bold hover:bg-fw-hover">+</button>
        </div>
        <div className="grid grid-cols-6 gap-0.5 mt-1">
          {[1, 5, 10, 25, 50, 100].map((q) => (
            <button key={q} onClick={() => setOrderForm({ qty: q })} className={cn('py-0.5 text-[10px] rounded font-medium tabular-nums', orderForm.qty === q ? 'bg-fw-accent text-white' : 'bg-[#0d0f15] border border-fw-border text-fw-text-muted hover:text-fw-text')}>{q}</button>
          ))}
        </div>
      </div>

      {/* Price fields */}
      {(orderForm.orderType === 'LIMIT' || orderForm.orderType === 'SL') && (
        <div className="px-2 py-1.5 border-b border-fw-border/50">
          <label className="text-[8px] text-fw-text-muted uppercase mb-0.5 block">Price</label>
          <input type="number" value={orderForm.price || ''} onChange={(e) => setOrderForm({ price: parseFloat(e.target.value) || 0 })} placeholder={quote ? formatPrice(quote.ltp) : '0'} className="w-full bg-[#0d0f15] border border-fw-border rounded font-mono text-[11px] text-fw-text py-1 px-2 outline-none focus:border-fw-accent tabular-nums" />
        </div>
      )}
      {(orderForm.orderType === 'SL' || orderForm.orderType === 'SL-M') && (
        <div className="px-2 py-1.5 border-b border-fw-border/50">
          <label className="text-[8px] text-fw-text-muted uppercase mb-0.5 block">Trigger</label>
          <input type="number" value={orderForm.triggerPrice || ''} onChange={(e) => setOrderForm({ triggerPrice: parseFloat(e.target.value) || 0 })} className="w-full bg-[#0d0f15] border border-fw-border rounded font-mono text-[11px] text-fw-text py-1 px-2 outline-none focus:border-fw-accent tabular-nums" />
        </div>
      )}

      {/* Bracket */}
      <div className="px-2 py-1.5 border-b border-fw-border/50">
        <div className="flex items-center justify-between">
          <span className="text-[8px] text-fw-text-muted uppercase font-semibold">Bracket (SL+TP)</span>
          <button onClick={() => setBracketEnabled(!bracketEnabled)} className={cn('w-6 h-3.5 rounded-full transition-colors relative', bracketEnabled ? 'bg-fw-accent' : 'bg-fw-border')}>
            <div className={cn('absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform', bracketEnabled ? 'translate-x-3' : 'translate-x-0.5')} />
          </button>
        </div>
        {bracketEnabled && (
          <div className="grid grid-cols-2 gap-1 mt-1">
            <div>
              <label className="text-[7px] text-red font-bold">SL</label>
              <input type="number" value={slPrice || ''} onChange={(e) => setSlPrice(parseFloat(e.target.value) || 0)} className="w-full bg-[#0d0f15] border border-red-900/40 rounded font-mono text-[10px] text-fw-text py-0.5 px-1.5 outline-none focus:border-red tabular-nums" />
            </div>
            <div>
              <label className="text-[7px] text-green font-bold">TP</label>
              <input type="number" value={tpPrice || ''} onChange={(e) => setTpPrice(parseFloat(e.target.value) || 0)} className="w-full bg-[#0d0f15] border border-green-900/40 rounded font-mono text-[10px] text-fw-text py-0.5 px-1.5 outline-none focus:border-green tabular-nums" />
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions — ALL CLICKABLE */}
      <div className="px-2 py-1.5 border-b border-fw-border/50">
        <span className="text-[8px] text-fw-text-muted uppercase font-semibold mb-1 block">Actions</span>
        <div className="grid grid-cols-4 gap-0.5">
          <ActionBtn label="BE" onClick={() => showToast('Execution integration pending')} />
          <ActionBtn label="TP" onClick={() => showToast('Execution integration pending')} className="hover:text-green" />
          <ActionBtn label="SL" onClick={() => showToast('Execution integration pending')} className="hover:text-red" />
          <ActionBtn label="TSL" onClick={() => showToast('Execution integration pending')} className="hover:text-orange-400" />
          <ActionBtn label="REV" onClick={() => showToast('Execution integration pending')} className="hover:text-purple-400" />
          <ActionBtn label="EXIT" onClick={() => showToast('Execution integration pending')} className="hover:text-red" />
          <ActionBtn label="HALF" onClick={() => showToast('Execution integration pending')} className="hover:text-yellow-400" />
          <ActionBtn label="ALL" onClick={() => showToast('Execution integration pending')} className="hover:text-red" />
        </div>
      </div>

      {/* Advanced */}
      <div className="px-2 py-1.5 border-b border-fw-border/50">
        <div className="grid grid-cols-3 gap-0.5">
          <ActionBtn label="GTT" onClick={() => showToast('Execution integration pending')} />
          <ActionBtn label="AMO" onClick={() => showToast('Execution integration pending')} />
          <ActionBtn label="IOC" onClick={() => showToast('Execution integration pending')} />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mx-2 mt-1 px-2 py-1 rounded text-[9px] font-medium bg-orange-900/20 text-orange-300 border border-orange-800/30 animate-slide-up">
          {toast}
        </div>
      )}

      {/* Submit */}
      <div className="px-2 py-2 mt-auto">
        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => handleSubmit('BUY')} disabled={isSubmitting || !symbol} className="py-2.5 rounded text-[13px] font-bold text-white bg-[var(--fw-green)] hover:brightness-110 disabled:opacity-40 shadow-[0_2px_8px_rgba(34,197,94,0.2)]">BUY</button>
          <button onClick={() => handleSubmit('SELL')} disabled={isSubmitting || !symbol} className="py-2.5 rounded text-[13px] font-bold text-white bg-[var(--fw-red)] hover:brightness-110 disabled:opacity-40 shadow-[0_2px_8px_rgba(239,68,68,0.2)]">SELL</button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick} className={cn('py-1 rounded text-[9px] font-bold bg-[#0d0f15] border border-fw-border text-fw-text-secondary hover:text-fw-text transition-colors cursor-pointer', className)}>
      {label}
    </button>
  );
}
