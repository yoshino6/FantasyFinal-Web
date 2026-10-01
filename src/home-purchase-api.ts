import { request } from './api';

export const HOME_PURCHASE_TARGET_ID = 'baina_residence';
export type HomePurchaseSiteTarget = {
  id: typeof HOME_PURCHASE_TARGET_ID;
  name: string;
  regionId: number;
  regionCode: string;
  regionName: string;
  x: number;
  y: number;
  z: number;
  locationRequired: true;
};
export type HomePurchaseSite = {
  ok: true;
  owned: boolean;
  purchaseCopper: number;
  current: { regionCode: string; x: number; y: number; z: number };
  target: HomePurchaseSiteTarget;
  atSite: boolean;
  serverTime: string;
};
export type HomePurchaseQuote = {
  siteCode: typeof HOME_PURCHASE_TARGET_ID;
  name: string;
  price: number;
  copperBefore: number;
  copperAfter: number;
  plotAssignedOnConfirm: true;
};
export type HomePurchasePreview = {
  ok: true;
  token: string;
  idempotencyKey: string;
  expiresAt: string;
  target: { id: typeof HOME_PURCHASE_TARGET_ID; name: string; locationRequired: true };
  quote: HomePurchaseQuote;
  serverTime: string;
};
export type HomePurchaseResult = {
  plot: { x: number; y: number; z: number };
  copper: number;
  homeId: number;
  name: string;
};
export type HomePurchaseConfirm = { ok: true; result: HomePurchaseResult; refresh: string[]; serverTime: string };

export type HomeShopTarget = { id: typeof HOME_PURCHASE_TARGET_ID; name: string; locationRequired: true };
export type HomeShopOffer = {
  id: number;
  code: string;
  outputName: string;
  outputQuantity: number;
  inputName: string | null;
  inputQuantity: number;
  copperPrice: number;
};
export type HomeShopShelf = {
  ok: true;
  target: HomeShopTarget;
  copper: number;
  offers: HomeShopOffer[];
  serverTime: string;
};
export type HomeShopOfferDetail = HomeShopOffer & { inputOwnedQuantity: number | null };
export type HomeShopDetail = {
  ok: true;
  target: HomeShopTarget;
  copper: number;
  offer: HomeShopOfferDetail;
  serverTime: string;
};
export type HomeShopQuote = {
  offerId: number;
  code: string;
  name: string;
  quantity: number;
  tradeCount: number;
  outputItemId: number;
  unitOutputQuantity: number;
  inputItemId: number | null;
  unitInputQuantity: number;
  inputQuantity: number;
  inputOwnedBefore: number | null;
  inputOwnedAfter: number | null;
  inputBindingBefore: { unbound: number; trade: number; personal: number } | null;
  inputBindingUsed: { unbound: number; trade: number; personal: number } | null;
  outputBinding: { unbound: number; trade: number; personal: number };
  unitCopperPrice: number;
  price: number;
  copperBefore: number;
  copperAfter: number;
};
export type HomeShopPreview = {
  ok: true;
  token: string;
  idempotencyKey: string;
  expiresAt: string;
  target: HomeShopTarget;
  quote: HomeShopQuote;
  serverTime: string;
};
export type HomeShopConfirm = { ok: true; result: HomeShopQuote; refresh: string[]; serverTime: string };

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const shopPath = (targetId: string) => `/places/${encodeURIComponent(targetId)}/home-shop`;

export const homePurchaseSite = () => request<HomePurchaseSite>('/home/purchase-site');
export const previewHomePurchase = () => post<HomePurchasePreview>('/home/purchase/preview');
export const confirmHomePurchase = (token: string, idempotencyKey: string) =>
  post<HomePurchaseConfirm>('/home/purchase/confirm', { token, idempotencyKey });
export const homeShopShelf = (targetId: string) => request<HomeShopShelf>(shopPath(targetId));
export const homeShopOffer = (targetId: string, offerId: number) =>
  request<HomeShopDetail>(`${shopPath(targetId)}/offers/${offerId}`);
export const previewHomeShopTrade = (targetId: string, offerId: number, quantity: number) =>
  post<HomeShopPreview>(`${shopPath(targetId)}/trade/preview`, { offerId, quantity });
export const confirmHomeShopTrade = (targetId: string, token: string, idempotencyKey: string) =>
  post<HomeShopConfirm>(`${shopPath(targetId)}/trade/confirm`, { token, idempotencyKey });
