import { request } from './api';

export const BOOKSHOP_TARGET_ID = 'bookshop';
export type BookshopSide = 'buy' | 'sell';
export type BookshopTarget = { id: typeof BOOKSHOP_TARGET_ID; name: string; locationRequired: true };
export type BookshopPage<T> = {
  ok: true;
  target: BookshopTarget;
  page: number;
  totalPages: number;
  keyword: string;
  copper: number;
  items: T[];
  serverTime: string;
};
export type BookshopShelfItem = {
  id: number;
  codexId: string;
  name: string;
  category: string;
  description: string;
  price: number;
  stockQuantity: number;
  ownedQuantity: number;
};
export type BookshopSellableItem = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  price: number;
};
export type BookshopDetail = {
  ok: true;
  target: BookshopTarget;
  copper: number;
  item: BookshopShelfItem;
  serverTime: string;
};
type BookshopQuoteBase = {
  itemId: number;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  price: number;
  copperBefore: number;
  copperAfter: number;
};
export type BookshopBuyQuote = BookshopQuoteBase & {
  stockBefore: number;
  stockAfter: number;
  personalBound: boolean;
};
export type BookshopSellQuote = BookshopQuoteBase & {
  ownedBefore: number;
  ownedAfter: number;
};
export type BookshopQuote = BookshopBuyQuote | BookshopSellQuote;
export type BookshopPreview<T extends BookshopQuote = BookshopQuote> = {
  ok: true;
  token: string;
  idempotencyKey: string;
  expiresAt: string;
  target: BookshopTarget;
  quote: T;
  serverTime: string;
};
export type BookshopConfirm<T extends BookshopQuote = BookshopQuote> = {
  ok: true;
  result: T & { affinity?: unknown };
  refresh: string[];
  serverTime: string;
};

const path = (targetId: string) => `/places/${encodeURIComponent(targetId)}/bookshop`;
const query = (page: number, keyword: string) => new URLSearchParams({ page: String(page), keyword }).toString();
const post = <T>(url: string, body: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body) });

export const bookshopShelf = (targetId: string, page = 1, keyword = '') =>
  request<BookshopPage<BookshopShelfItem>>(`${path(targetId)}?${query(page, keyword)}`);
export const bookshopItem = (targetId: string, itemId: number) =>
  request<BookshopDetail>(`${path(targetId)}/items/${itemId}`);
export const bookshopSellable = (targetId: string, page = 1, keyword = '') =>
  request<BookshopPage<BookshopSellableItem>>(`${path(targetId)}/sellable?${query(page, keyword)}`);
export const previewBookshopTrade = <S extends BookshopSide>(targetId: string, side: S, itemId: number, quantity: number) =>
  post<BookshopPreview<S extends 'buy' ? BookshopBuyQuote : BookshopSellQuote>>(`${path(targetId)}/${side}/preview`, { itemId, quantity });
export const confirmBookshopTrade = <S extends BookshopSide>(targetId: string, side: S, token: string, idempotencyKey: string) =>
  post<BookshopConfirm<S extends 'buy' ? BookshopBuyQuote : BookshopSellQuote>>(`${path(targetId)}/${side}/confirm`, { token, idempotencyKey });
