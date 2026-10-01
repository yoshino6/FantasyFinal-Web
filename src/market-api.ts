import { request } from './api';

export type MarketType = '全部' | '怪材' | '锻材' | '炼材' | '粒子' | '药剂' | '食物' | '其他';
export type MarketSort = 'price_asc' | 'price_desc' | 'newest';
export type MarketSide = 'sell' | 'buy';
export type MarketPage<T> = { page: number; totalPages: number; items: T[] };
export type MarketAccess = {
  ok: true; canTrade: boolean; reason: string | null; locationRequired: false; storyStage: number;
  types: MarketType[]; sorts: MarketSort[]; serverTime: string;
  feeProfile?: { gross: number; fees: number; cancellations: number; nextRate: number };
};
export type MarketCatalogItem = {
  id: number; name: string; category: string; reference: number;
  lowestSell: number | null; sellQuantity: number; highestBuy: number | null; buyQuantity: number;
  latestOrderAt: string | null;
};
export type MarketCatalog = MarketPage<MarketCatalogItem> & {
  ok: true; type: MarketType; keyword: string; sort: MarketSort; copper: number; serverTime: string;
};
export type MarketBand = { min: number; max: number };
export type MarketTradable = {
  id: number; name: string; category: string; description: string;
  stackLimit: number; reference: number; band: MarketBand;
};
export type MarketTradables = MarketPage<MarketTradable> & {
  ok: true; type: MarketType; keyword: string; copper: number; serverTime: string;
};
export type MarketSellableItem = { id: number; name: string; category: string; quantity: number; reference: number };
export type MarketSellable = MarketPage<MarketSellableItem> & { ok: true; keyword: string; serverTime: string };
export type MarketItemDetail = {
  id: number; name: string; category: string; description: string;
  reference: number; band: MarketBand; lowestSell: number | null; highestBuy: number | null; volume: number;
};
export type MarketOrder = {
  id: number; itemId: number; name: string; category: string; side: MarketSide;
  price: number; remaining: number; total: number; reservedCopper: number;
  status: string; createdAt: string; expiresAt: string;
};
export type MarketOrderPage = {
  ok: true; page: number; totalPages: number; total: number; copper: number;
  volume: { gross: number; fees: number; cancellations: number }; orders: MarketOrder[]; serverTime: string;
};
export type MarketListing = Omit<MarketOrder, 'side' | 'reservedCopper' | 'createdAt'>;
export type MarketTrade = {
  id: number; itemId: number; name: string; category: string; side: MarketSide;
  quantity: number; price: number; grossCopper: number; feeCopper: number; receivedCopper: number; createdAt: string;
};
export type MarketTradePage = {
  ok: true; page: number; totalPages: number; total: number; trades: MarketTrade[]; serverTime: string;
};
export type MarketQuote = {
  side: MarketSide; itemId: number; name: string; category: string; price: number; quantity: number;
  reference: number; band: MarketBand; copper: number; availableQuantity: number;
  reservedCopper: number; grossCopper: number; estimatedFeeCopper: number; estimatedNetCopper: number;
  matchableQuantityEstimate: number; orderExpiresHours: number;
};
export type MarketPreview<T> = {
  ok: true; token: string; idempotencyKey: string; expiresAt: string; quote: T; serverTime: string;
};
export type MarketCancelQuote = {
  orderId: number; itemId: number; side: MarketSide; price: number; quantity: number;
  reservedCopper: number; feeCopper: number; refundedCopper: number; returnedQuantity: number;
};
export type MarketOrderResult = {
  orderId: number; itemId: number; name: string; side: MarketSide; price: number; quantity: number;
  remaining: number; status: string; reservedCopper: number; expiresAt: string;
  matchedQuantity: number; tradedCopper: number; feeCopper: number; receivedCopper: number;
};
export type MarketCancelResult = { orderId: number; itemId: number; side: MarketSide; quantity: number; fee: number; refundedCopper: number };
const params = (query: Record<string, string | number>) => new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)])).toString();
const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const marketAccess = () => request<MarketAccess>('/market/access');
export const marketCatalog = (page = 1, type: MarketType = '全部', keyword = '', sort: MarketSort = 'price_asc') =>
  request<MarketCatalog>(`/market/catalog?${params({ page, type, keyword, sort })}`);
export const marketTradables = (page = 1, type: MarketType = '全部', keyword = '') =>
  request<MarketTradables>(`/market/tradables?${params({ page, type, keyword })}`);
export const marketSellable = (page = 1, keyword = '') =>
  request<MarketSellable>(`/market/sellable?${params({ page, keyword })}`);
export const marketItemDetail = async (itemId: number) =>
  (await request<{ ok: true; item: MarketItemDetail }>(`/market/items/${itemId}`)).item;
export const marketListings = async () =>
  (await request<{ ok: true; listings: MarketListing[] }>('/market/listings')).listings;
export const marketOrders = (page = 1) => request<MarketOrderPage>(`/market/orders?page=${page}`);
export const marketTrades = (page = 1) => request<MarketTradePage>(`/market/trades?page=${page}`);
export const previewMarketOrder = (side: MarketSide, itemId: number, price: number, quantity: number) =>
  post<MarketPreview<MarketQuote>>('/market/orders/preview', { side, itemId, price, quantity });
export const confirmMarketOrder = (token: string, idempotencyKey: string) =>
  post<{ ok: true; result: MarketOrderResult; refresh: string[] }>('/market/orders/confirm', { token, idempotencyKey });
export const previewMarketCancel = (orderId: number) =>
  post<MarketPreview<MarketCancelQuote>>(`/market/orders/${orderId}/cancel/preview`);
export const confirmMarketCancel = (orderId: number, token: string, idempotencyKey: string) =>
  post<{ ok: true; result: MarketCancelResult; refresh: string[] }>(`/market/orders/${orderId}/cancel/confirm`, { token, idempotencyKey });
