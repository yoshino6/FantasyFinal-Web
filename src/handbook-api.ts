import { request } from './api';

export type HandbookSection = 'footprints' | 'codex' | 'warrants';
export type CodexKind = '装备' | '道具' | '材料' | '怪物' | '技能';
export type WarrantFilter = '全部' | '已暴露' | '近期露面' | '无行踪';
type Envelope<T> = { ok: true; data: T };
type Page<T> = { page: number; totalPages: number; entries: T[]; total?: number; pageSize?: number };
const query = (values: Record<string, string | number>) => new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)])).toString();
const get = async <T>(path: string) => (await request<Envelope<T>>(path)).data;
const post = async <T>(path: string, body: unknown) => (await request<Envelope<T>>(path, { method: 'POST', body: JSON.stringify(body) })).data;

export type AchievementEntry = {
  id: string; name: string; category: string; description: string; rarity: string;
  attribute: string; rank: number; percentage: string; completedAt: string;
  status: 'completed'; actions: [];
};
export type AchievementPage = Page<AchievementEntry> & {
  category: string; categories: readonly string[]; visibleCategories: readonly string[];
  scope: 'completed_only'; total: number;
};
export type AchievementRewards = {
  boxes: Record<string, number>;
  items: { key: string; name: string; description: string; quantity: number; rarity: string }[];
  actions: { id: 'open_box'; boxKey: string; name: string; available: number }[];
};
export type BoxOpenResult = {
  boxKey: string; boxName: string; quantity: number;
  items: { key: string; name: string; description: string; quantity: number }[];
};
export const achievements = (category = '全部', page = 1) => get<AchievementPage>(`/handbook/achievements?${query({ category, page })}`);
export const achievementDetail = (id: string) => get<AchievementEntry>(`/handbook/achievements/${encodeURIComponent(id)}`);
export const achievementRewards = () => get<AchievementRewards>('/handbook/achievements/rewards');
export const openAchievementBox = (boxKey: string, requestId: string, quantity: number) =>
  post<BoxOpenResult>(`/handbook/achievements/rewards/${encodeURIComponent(boxKey)}/open`, { requestId, quantity });

export type CodexEntry = { id: number; code?: string; name: string; category: string; rarity: string | null; detailId: string };
export type CodexPage = Page<CodexEntry> & {
  kind: CodexKind; category: string; rarity: string; keyword: string; kinds: readonly CodexKind[];
  categories: { label: string; value: string }[]; rarities: readonly string[]; total: number; pageSize: number; scope: 'discovered_only';
};
export type CodexDetail = {
  kind: CodexKind; detailId: string; detail: Record<string, unknown>; actions: [];
};
export const codex = (kind: CodexKind, category = '全部', page = 1, keyword = '', rarity = '全部', pageSize = 5) =>
  get<CodexPage>(`/handbook/codex?${query({ kind, category, page, keyword, rarity, pageSize })}`);
export const codexDetail = (kind: CodexKind, id: string) =>
  get<CodexDetail>(`/handbook/codex/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`);

export type WarrantEntry = {
  id: number; name: string; regionName: string; stars: number; skulls: number;
  rewardCopper: number; rewardItems: number; trace: 'exposed' | 'recent' | 'unknown';
  position: { x: number; y: number; z: number } | null;
};
export type WarrantDetail = WarrantEntry & { actions: { id: 'add_reward'; requiresPreview: true }[] };
export type WarrantPage = Page<WarrantEntry> & { regionName: string; filter: WarrantFilter; total: number; pageSize: number };
export type WarrantPost = {
  id: number; warrantId: number; wantedName: string; regionName: string; warrantStatus: string;
  itemId: number | null; itemName: string | null; quantity: number; copper: number;
  postedAt: string; claimedAt: string | null; claimedBy: string | null;
};
export type PursuitRecord = {
  warrantId: number; wantedName: string; regionName: string; capturedBySelf: boolean;
  recordType: 'capture' | 'reward_claim'; capturedAt: string | null;
  rewardCopper: number; rewardItems: number; rewardClaimedAt: string | null;
};
export type WarrantRewardItem = { itemId: number; name: string; codexId: string; available: number };
export type WarrantRewardInput =
  | { kind: 'copper'; amount: number }
  | { kind: 'item'; itemId: number; quantity: number };
export type WarrantRewardPreview = {
  warrantId: number; kind: 'copper' | 'item'; available: number; canSubmit: boolean; reason: string | null;
  amount?: number; itemId?: number; itemName?: string | null; quantity?: number;
};
export const warrants = (filter: WarrantFilter = '全部', page = 1) => get<WarrantPage>(`/handbook/warrants?${query({ filter, page })}`);
export const warrantDetail = (id: number) => get<WarrantDetail>(`/handbook/warrants/${id}`);
export const warrantPosts = (page = 1) => get<Page<WarrantPost>>(`/handbook/warrants/posts?page=${page}`);
export const warrantPursuits = (page = 1) => get<Page<PursuitRecord>>(`/handbook/warrants/pursuits?page=${page}`);
export const warrantRewardItems = (page = 1) => get<Page<WarrantRewardItem>>(`/handbook/warrants/reward-items?page=${page}`);
export const previewWarrantReward = (id: number, input: WarrantRewardInput) =>
  post<WarrantRewardPreview>(`/handbook/warrants/${id}/reward-preview`, input);
export const addWarrantReward = (id: number, input: WarrantRewardInput) =>
  post<Record<string, unknown>>(`/handbook/warrants/${id}/rewards`, input);
