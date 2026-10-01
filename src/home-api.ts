import { request } from './api';

export type HomeRoom = {
  columns: number;
  rows: number;
  canvasPixels: number;
  floorLeft: number;
  floorTop: number;
  floorRight: number;
  floorBottom: number;
  cellWidth: number;
  cellHeight: number;
};

export type HomeFurniture = {
  id: number;
  code: string;
  name: string;
  description: string;
  effects: Record<string, number>;
  gridX: number | null;
  gridY: number | null;
  width: number;
  height: number;
  rotation: number;
  slotCost: number;
  layerOrder: number;
};

export type HomeFloor = {
  number: number;
  room: HomeRoom;
  slotsTotal: number;
  slotsUsed: number;
  layoutPending: boolean;
  furniture: HomeFurniture[];
};

export type HomeLocation = { regionId: number; x: number; y: number; z: number };
export type HomeStorage = {
  available: boolean;
  capacityKg: number;
  usedKg: number;
  stackedKinds: number;
  stackedQuantity: number;
  instanceCount: number;
};
export type Home = {
  id: number;
  name: string;
  level: number;
  floorCount: number;
  location: HomeLocation;
  inHome: boolean;
  atPlot: boolean;
  effects: Record<string, number>;
  materials: { code: string; name: string; quantity: number }[];
  furnitureCount: number;
  floors: HomeFloor[];
  storage: HomeStorage;
};

type HomePurchase = { siteCode: string; copper: number; locationRequired: true };
export type HomeOverview = {
  ok: true;
  serverTime: string;
  purchase: HomePurchase;
} & ({ owned: false; home: null } | { owned: true; home: Home });

export type HomeFloorDetail = {
  ok: true;
  serverTime: string;
  home: Pick<Home, 'id' | 'name' | 'level' | 'floorCount' | 'location' | 'inHome'>;
  floor: HomeFloor;
};

export const homeOverview = () => request<HomeOverview>('/home');
export const homeFloor = (number: number) => request<HomeFloorDetail>(`/home/floors/${number}`);

export type HomeStorageScope = 'backpack' | 'storage';
export type HomeStorageCategory = '装备' | '道具' | '材料';
export type HomeStorageSide = 'deposit' | 'withdraw';
type HomeStorageItemBase = {
  id: number; code: string; codexId: string; name: string; itemCategory: string;
  description: string; weight: number;
};
export type HomeStorageItem =
  | (HomeStorageItemBase & { kind: 'stacked'; quantity: number;
      binding: { unbound: number; trade: number; personal: number }; transferable: true })
  | (HomeStorageItemBase & { kind: 'instance'; quantity: 1; quality: number; durability: number;
      durabilityMax: number; transferable: false });
export type HomeStoragePage = {
  ok: true; scope: HomeStorageScope; category: HomeStorageCategory; keyword: string;
  page: number; pages: number; count: number; pageSize: number; capacityKg: number; usedKg: number;
  locationRequired: false; depositAvailable: boolean; items: HomeStorageItem[]; serverTime: string;
};
export type HomeStorageQuote = {
  side: HomeStorageSide; itemId: number; name: string; quantity: number;
  ownedBefore: number; weightEach: number; usedWeightBefore: number;
  usedWeightAfter: number; capacity: number;
  bindingBefore: { unbound: number; trade: number; personal: number };
  bindingUsed: { unbound: number; trade: number; personal: number };
  bindingReturned: { unbound: number; trade: number; personal: number };
};
export type HomeStoragePreview = {
  ok: true; token: string; idempotencyKey: string; expiresAt: string;
  quote: HomeStorageQuote; serverTime: string;
};
export type HomeStorageConfirm = {
  ok: true; result: HomeStorageQuote; refresh: string[]; serverTime: string;
};

export const homeStoragePage = (scope: HomeStorageScope, category: HomeStorageCategory, page = 1, keyword = '') => {
  const query = new URLSearchParams({ scope, category, page: String(page), keyword });
  return request<HomeStoragePage>(`/home/storage?${query}`);
};
export const previewHomeStorageTransfer = (side: HomeStorageSide, itemId: number, quantity: number) =>
  request<HomeStoragePreview>(`/home/storage/${side}/preview`, {
    method: 'POST', body: JSON.stringify({ itemId, quantity })
  });
export const confirmHomeStorageTransfer = (side: HomeStorageSide, token: string, idempotencyKey: string) =>
  request<HomeStorageConfirm>(`/home/storage/${side}/confirm`, {
    method: 'POST', body: JSON.stringify({ token, idempotencyKey })
  });
