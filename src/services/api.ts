import type {
  Instrument,
  Order,
  Position,
  Trade,
  AccountInfo,
  OrderSide,
  OrderType,
  ProductType,
  OptionChainEntry,
  OHLC,
} from '@/types';

const BASE_URL = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    const err = new Error(error.message || error.error || `HTTP ${response.status}`);
    (err as any).status = response.status;
    (err as any).code = error.error;
    throw err;
  }

  return response.json();
}

// Account
export const getAccount = (signal?: AbortSignal) => request<AccountInfo>('/account', signal ? { signal } : undefined);

// Multiple accounts
export const getAccounts = () => request<AccountInfo[]>('/accounts');
export const getAccountById = (id: string) => request<AccountInfo>(`/accounts/${id}`);

// Margin
export const getMarginInfo = () => request<{ balance: number; usedMargin: number; availableMargin: number }>('/account/margin');

// Holiday/market status
export const getHolidayStatus = () => request<{ isClosed: boolean; reason: string | null; holidayName: string | null; isWeekend: boolean; upcoming: { date: string; name: string }[] }>('/market/holiday');

// Search
export const searchInstruments = (query: string, segment?: string) =>
  request<Instrument[]>(`/instruments/search?q=${encodeURIComponent(query)}${segment ? `&segment=${segment}` : ''}`);

// Orders
export const getPositions = () => request<Position[]>('/positions');
export const getOrders = () => request<Order[]>('/orders');
export const getTrades = (period?: 'today' | 'week' | 'month') =>
  request<Trade[]>(`/trades${period ? `?period=${period}` : ''}`);

export interface PlaceOrderParams {
  symbol: string;
  token: string;
  segment: string;
  side: OrderSide;
  orderType: OrderType;
  productType: ProductType;
  qty: number;
  price?: number;
  triggerPrice?: number;
}

export const placeOrder = (params: PlaceOrderParams) =>
  request<{ orderId: string; status: string }>('/orders/place', {
    method: 'POST',
    body: JSON.stringify(params),
  });

export const modifyOrder = (orderId: string, params: Partial<PlaceOrderParams>) =>
  request<{ status: string }>(`/orders/${orderId}/modify`, {
    method: 'PUT',
    body: JSON.stringify(params),
  });

export const cancelOrder = (orderId: string) =>
  request<{ status: string }>(`/orders/${orderId}/cancel`, {
    method: 'DELETE',
  });

// Positions
export const exitPosition = (positionId: string) =>
  request<{ status: string }>(`/positions/${positionId}/exit`, {
    method: 'POST',
  });

export const partialClosePosition = (positionId: string, qty: number) =>
  request<{ status: string }>(`/positions/${positionId}/exit`, {
    method: 'POST',
    body: JSON.stringify({ qty }),
  });

export const reversePosition = (positionId: string) =>
  request<{ status: string }>(`/positions/${positionId}/reverse`, {
    method: 'POST',
  });

export const closeAllPositions = () =>
  request<{ status: string; results: any[] }>('/positions/close-all', {
    method: 'POST',
    body: JSON.stringify({ reason: 'user_requested' }),
  });

// Market Data
export const getHistoricalData = (token: string, timeframe: string, from?: number, to?: number) =>
  request<OHLC[]>(`/market/history?token=${token}&tf=${timeframe}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`);

export const getOptionChain = (symbol: string, expiry: string) =>
  request<OptionChainEntry[]>(`/market/option-chain?symbol=${symbol}&expiry=${expiry}`);

export const getExpiries = (symbol: string) =>
  request<string[]>(`/market/expiries?symbol=${symbol}`);

export const getMarketDepth = (token: string) =>
  request<any>(`/market/depth?token=${token}`);

// Instruments
export const getInstruments = (segment: string) =>
  request<Instrument[]>(`/instruments?segment=${segment}`);
