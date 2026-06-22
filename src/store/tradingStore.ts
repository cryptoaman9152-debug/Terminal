import { create } from 'zustand';
import type { Position, Order, Trade, AccountInfo, OrderSide, OrderType, ProductType } from '@/types';

interface OrderForm {
  symbol: string;
  token: string;
  side: OrderSide;
  orderType: OrderType;
  productType: ProductType;
  qty: number;
  price: number;
  triggerPrice: number;
}

interface TradingState {
  positions: Position[];
  orders: Order[];
  trades: Trade[];
  account: AccountInfo | null;
  orderForm: OrderForm;

  setPositions: (positions: Position[]) => void;
  updatePosition: (id: string, update: Partial<Position>) => void;
  setOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  updateOrder: (id: string, update: Partial<Order>) => void;
  setTrades: (trades: Trade[]) => void;
  setAccount: (account: AccountInfo) => void;
  setOrderForm: (form: Partial<OrderForm>) => void;
  resetOrderForm: () => void;
}

const defaultOrderForm: OrderForm = {
  symbol: '',
  token: '',
  side: 'BUY',
  orderType: 'MARKET',
  productType: 'MIS',
  qty: 1,
  price: 0,
  triggerPrice: 0,
};

export const useTradingStore = create<TradingState>((set) => ({
  positions: [],
  orders: [],
  trades: [],
  account: null,
  orderForm: { ...defaultOrderForm },

  setPositions: (positions) => set({ positions }),
  updatePosition: (id, update) =>
    set((state) => ({
      positions: state.positions.map((p) => (p.id === id ? { ...p, ...update } : p)),
    })),
  setOrders: (orders) => set({ orders }),
  addOrder: (order) => set((state) => ({ orders: [order, ...state.orders] })),
  updateOrder: (id, update) =>
    set((state) => ({
      orders: state.orders.map((o) => (o.id === id ? { ...o, ...update } : o)),
    })),
  setTrades: (trades) => set({ trades }),
  setAccount: (account) => set({ account }),
  setOrderForm: (form) =>
    set((state) => ({ orderForm: { ...state.orderForm, ...form } })),
  resetOrderForm: () => set({ orderForm: { ...defaultOrderForm } }),
}));
