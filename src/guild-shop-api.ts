import { request } from './api';

export type GuildShopSide = 'buy' | 'sell';
export type GuildShopTarget = { id: string; regionCode: string; guildName: string; locationRequired: true };
export type GuildShopPage<T> = {
  ok: true;
  target: GuildShopTarget;
  items: T[];
  page: number;
  totalPages: number;
  keyword: string;
  contribution: number;
  serverTime: string;
};
export type GuildShopShelfItem = {
  id: number;
  codexId: string;
  name: string;
  category: string;
  description: string;
  price: number;
  stockQuantity: number | null;
  ownedQuantity: number;
};
export type GuildShopSellableItem = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  sellableQuantity: number;
  price: number;
};
export type GuildShopItemDetail = GuildShopShelfItem & { personalBound: boolean };
export type GuildShopDetailResponse = {
  ok: true;
  target: GuildShopTarget;
  item: GuildShopItemDetail;
  contribution: number;
  serverTime: string;
};
export type GuildShopBuyQuote = {
  itemId: number;
  name: string;
  category: string;
  quantity: number;
  price: number;
  contributionBefore: number;
  contributionAfter: number;
  stockBefore: number | null;
  stockAfter: number | null;
  personalBound: boolean;
  discountCredit: number;
  talentDiscount: number;
};
export type GuildShopSellQuote = {
  itemId: number;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  price: number;
  contributionBefore: number;
  contributionAfter: number;
  ownedBefore: number;
  ownedAfter: number;
  sellableBefore: number;
  sellableAfter: number;
};
export type GuildShopQuote = GuildShopBuyQuote | GuildShopSellQuote;
export type GuildShopPreview<T extends GuildShopQuote = GuildShopQuote> = {
  ok: true;
  token: string;
  idempotencyKey: string;
  expiresAt: string;
  target: GuildShopTarget;
  quote: T;
  serverTime: string;
};
export type GuildShopConfirm<T extends GuildShopQuote = GuildShopQuote> = {
  ok: true;
  result: T & { affinity?: unknown };
  refresh: string[];
  serverTime: string;
};

const shopPath = (targetId: string) => `/places/${encodeURIComponent(targetId)}/guild-shop`;
const query = (page: number, keyword: string) => new URLSearchParams({ page: String(page), keyword }).toString();
const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const guildShopShelf = (targetId: string, page = 1, keyword = '') =>
  request<GuildShopPage<GuildShopShelfItem>>(`${shopPath(targetId)}?${query(page, keyword)}`);
export const guildShopItem = (targetId: string, itemId: number) =>
  request<GuildShopDetailResponse>(`${shopPath(targetId)}/items/${itemId}`);
export const guildShopSellable = (targetId: string, page = 1, keyword = '') =>
  request<GuildShopPage<GuildShopSellableItem>>(`${shopPath(targetId)}/sellable?${query(page, keyword)}`);
export const previewGuildShopTrade = <S extends GuildShopSide>(targetId: string, side: S, itemId: number, quantity: number) =>
  post<GuildShopPreview<S extends 'buy' ? GuildShopBuyQuote : GuildShopSellQuote>>(`${shopPath(targetId)}/${side}/preview`, { itemId, quantity });
export const confirmGuildShopTrade = <S extends GuildShopSide>(targetId: string, side: S, token: string, idempotencyKey: string) =>
  post<GuildShopConfirm<S extends 'buy' ? GuildShopBuyQuote : GuildShopSellQuote>>(`${shopPath(targetId)}/${side}/confirm`, { token, idempotencyKey });
