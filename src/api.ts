import type { EnvironmentObjectView } from './map-environment';
import { surfaceSnapshotClock, validSurfaceScene, type MapSurfaceScene } from './map-surface';

export type Panel = {
  pendingStory?: { command?: string; revision?: string | number; messages?: GameActionMessage[] };
  text?: string;
  buttons?: GameActionButton[];
  messages?: GameActionMessage[];
  account?: { uid?: string; loginId?: string; gameUserId?: string; displayName?: string; hasCharacter?: boolean; passwordLoginEnabled?: boolean };
  equipment?: PanelEquippedItem[];
  skills?: PanelSkills;
  evolution?: PanelEvolution;
  summary?: {
    name: string; gender?: string; level: number; experience?: number; experienceRequired?: number; realmStage?: number; profession?: string; region?: string;
    hp: { current: number; max: number }; mp: { current: number; max: number };
    stamina: { current: number; max: number }; position?: { x: number; y: number; z: number };
    attributes?: Record<string, number>; extraAttributes?: Record<string, number>;
    physicalAttack?: number; magicAttack?: number;
    physicalDefense?: number; magicDefense?: number;
    accuracy?: number; evasion?: number;
    critRateBp?: number; critDamageBp?: number;
    critResistBp?: number; critDamageReductionBp?: number;
    tenacity?: number; tenacityPierce?: number; speed?: number;
    elementMastery?: Record<string, number>;
    elementResistance?: Record<string, number>;
    giftName?: string | null; staminaFullSeconds?: number; activeBuffs?: string[];
    equipment?: PanelEquippedItem[];
    portrait?: PanelPortrait;
    movementStep?: number; movementMaximum?: number; movement?: { speed?: number; maximum?: number }; perception?: number;
    activity?: string; travel?: { destination: string; remaining: number; activityType?: 'move' | 'hunt'; visual?: ExploreTravelVisual };
  };
  mapData?: {
    current?: { name: string; x: number; y: number; z: number };
    maps: { code: string; name: string; danger: number; isCurrent: boolean; bounds?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } }[];
    partyMembers?: { id: number; gameId: number; name: string; isLeader: boolean; isSelf: boolean; regionCode: string; regionName: string; x: number; y: number; z: number; portrait?: PanelPortrait }[];
    landmarks?: { code: string; name: string; type: 'building' | 'landmark'; regionCode: string; regionName: string; x: number; y: number; z: number }[];
  };
  inBattle?: boolean;
  mining?: {
    resourceId: number;
    name: string;
    kind: string;
    seconds: number;
    remaining: number;
    remainingVeins: number;
    estimatedQuantity: number | null;
    finished: boolean;
  };
  movement?: { step: number; maximum: number; speed?: number; showLandmarks?: boolean; showPlayers?: boolean };
  nearby?: { description?: string; range?: number; actionRange?: number; points?: PanelNearbyPoint[] };
  battle?: PanelBattleSnapshot;
  inventory?: PanelInventory;
  regionMap?: {
    currentRegionCode?: string;
    regions?: { code: string; name: string; danger?: string | number; isCurrent?: boolean; bounds?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }; current?: { x: number; y: number; z?: number } }[];
    members?: { id: string; name: string; x: number; y: number; z?: number; regionCode?: string; regionName?: string; icon?: string; isCurrent?: boolean; portrait?: PanelPortrait }[];
    landmarks?: { id: string; name: string; x: number; y: number; z?: number; regionCode?: string; regionName?: string; type?: string; icon?: string; description?: string; code?: string; templateCode?: string; siteType?: string }[];
  };
};

export type PanelInventoryStack = {
  id?: number;
  code?: string;
  codexId?: string;
  name: string;
  itemType?: string;
  itemCategory?: string;
  rarity?: string;
  weaponType?: string | null;
  quantity: number;
  description?: string;
};

export type PanelInventoryInstance = {
  id?: number;
  code?: string;
  definitionCodexId?: string;
  name: string;
  itemType?: string;
  itemCategory?: string;
  rarity?: string;
  weaponType?: string | null;
  quality?: number;
  durability?: number;
  durabilityMax?: number;
  description?: string;
};

export type PanelInventory = {
  category?: string;
  stacked?: PanelInventoryStack[];
  instances?: PanelInventoryInstance[];
  recent?: PanelInventoryStack[];
  weight?: number;
  capacity?: number;
};

export type PanelEquippedItem = {
  slot: string;
  id: number | null;
  code: string;
  codexId?: string | null;
  name: string;
  itemCategory: string;
  weaponType?: string | null;
  rarity?: string;
  requiredLevel?: number;
  quality?: number;
  durability?: number;
  durabilityMax?: number;
  description?: string;
  appearanceName?: string;
  appearanceCode?: string;
};

export type EquipmentDetailSection = { key: string; title: string; lines: string[] };
export type EquipmentDetailSet = {
  code: string; name: string; count: number; maxPieces: number;
  thresholds: Array<{ pieces: number; active: boolean; lines: string[] }>;
};
export type EquippedEquipmentDetails = { sections: EquipmentDetailSection[]; sets: EquipmentDetailSet[] };
export type EquippedEquipmentDetailResponse = {
  ok: true; slot: string; id: number | null; code: string | null; name: string | null;
  detail: EquippedEquipmentDetails | null;
};

export type PanelPortrait = {
  baseKey: string;
  poseKey: string;
  fallbackKey?: string;
};

export type PanelSkill = {
  id: number;
  code?: string;
  name: string;
  category?: string;
  tier?: string;
  level?: number;
  quickSlot?: number | null;
  passiveLinked?: boolean;
};

export type PanelEvolution = {
  unlocked: boolean;
  level: number;
  title: string;
  progress: number;
  nextRequirement: string;
};

export type PanelSkills = {
  skillPoints?: number;
  passiveLinkLimit?: number;
  skills?: PanelSkill[];
  discoveries?: { id: number; name: string; category?: string; tier?: string; learnCost?: number }[];
};

export type PanelNearbyPoint = {
  name: string;
  type: string;
  distance: number;
  x: number;
  y: number;
  z?: number;
  regionId?: number;
  regionCode?: string;
  code?: string;
  /** 绘图语义键；code 继续保留真实交互实例编号。 */
  templateCode?: string;
  level?: number;
  portrait?: PanelPortrait;
  interaction?: { type: string; id: string };
  observedOnly?: boolean;
  interactable?: boolean;
};

export type PanelBattleMember = {
  id: number;
  name: string;
  companion?: boolean;
  hp: number;
  hpMax: number;
  mp?: number;
  mpMax?: number;
  defeated?: boolean;
  pending?: boolean;
  statusText?: string;
};

export type PanelBattleTarget = {
  id: number;
  name: string;
  isBoss?: boolean;
  level?: number | null;
  hp: number | string;
  hpMax: number | string;
  mp?: number | string;
  mpMax?: number | string;
  defeated?: boolean;
  identified?: boolean;
  statusText?: string;
  isBossComponent?: boolean;
  warning?: string | null;
  breakSummary?: string | null;
};

export type PanelBattleSnapshot = {
  sessionId?: string;
  characterId?: number;
  mode?: string;
  bonusPhase?: boolean;
  turn?: number;
  canAct?: boolean;
  playerHp?: number;
  playerHpMax?: number;
  playerMp?: number;
  playerMpMax?: number;
  selectedAllyId?: number | null;
  selectedTargetId?: number | null;
  selectableEnemyIds?: number[];
  selectableAllyIds?: number[];
  members?: PanelBattleMember[];
  targets?: PanelBattleTarget[];
  skillSlots?: number[];
  readySkillSlots?: number[];
  itemSlots?: number[];
  quickSkills?: { id: number; slot: number; code: string; name: string; baseManaCost: number; targetScope: string; targeting?: 'enemy' | 'ally' | 'none'; targetCount?: number; targetIds?: number[]; disabledSelf?: boolean; cooldownRemaining: number; ready?: boolean; requiresSpecialInput?: boolean }[];
  quickItems?: { id: number; slot: number; name: string; quantity: number; targeting: 'enemy' | 'ally' | 'none'; targetIds?: number[]; usable: boolean }[];
  advancedSkills?: { id: number; code: string; name: string; ready?: boolean; baseManaCost?: number; targetScope?: string; targeting?: 'enemy' | 'ally' | 'none'; targetCount?: number; targetIds?: number[]; disabledSelf?: boolean; cooldownRemaining?: number; requiresSpecialInput?: boolean }[];
  deviceSlots?: { slot: number; instanceId: number; deviceName: string; currentEnergy: number; maxEnergy: number; skills: { code: string; name: string; description?: string; ready?: boolean; targetScope: 'self' | 'ally' | 'enemy' | 'all_allies' | 'all_enemies' | 'any'; energyCost: number; allyTargetIds?: number[]; enemyTargetIds?: number[] }[] }[];
  canLeafAnchor?: boolean;
};

export type BattleActionPayload = {
  sessionId: string;
  turn: number;
  bonusPhase: boolean;
  action: 'attack' | 'defend' | 'escape' | 'skill' | 'item' | 'device' | 'anchor';
  slot?: number;
  skillId?: number;
  deviceSkillCode?: string;
  target?: { kind: 'member' | 'target'; id: number };
};

export type BattleActionResult = {
  ok: true;
  kind: 'battle_action';
  text: string;
  log: string;
  ended: boolean;
  waiting: boolean;
  panel: Panel;
  refresh: string[];
  serverTime: string;
};

/** 当前怪物交涉会话；字段名称与 negotiation.service 的 QQ 端视图保持一致。 */
export type NegotiationItem = {
  id?: number;
  code: string;
  name: string;
  item_type?: string;
  item_category?: string;
  quantity?: number;
  available?: number;
  policy?: { usable?: boolean; category?: string; subtype?: string; reason?: string; value?: number };
};

export type NegotiationPanel = {
  kind: 'ongoing' | 'success' | 'combat_started' | 'combat_resumed' | 'closed' | string;
  actorId?: number;
  sessionId?: string;
  revision?: number;
  spawnId: number;
  name?: string;
  mood?: string;
  goodwill?: number;
  protection?: number;
  text?: string;
  completionText?: string;
  inventory?: {
    page: number;
    totalPages: number;
    total: number;
    keyword?: string;
    items: NegotiationItem[];
  };
};

export type AutoBattleMode = 'pve' | 'pvp';
export type AutoBattleAction = { sequence: number; skillId: number | null; name: string };
export type AutoBattleConfig = {
  mode: AutoBattleMode;
  settings: {
    enabled: boolean;
    defaultEncounterAction: 'battle' | 'persuade' | string;
    autoPotionEnabled: boolean;
    hpThreshold: number;
    hpItemId: number | null;
    hpItemName: string | null;
    mpThreshold: number;
    mpItemId: number | null;
    mpItemName: string | null;
  };
  actions: AutoBattleAction[];
};
export type AutoBattleSkillChoice = { id: number | null; name: string };
export type AutoBattlePotionChoice = { id: number; name: string };

export type SocialIdentity = { portrait?: PanelPortrait; gender?: string; level?: number; profession?: string };
export type AffinityProgress = { min: number; nextMin: number | null; toNext: number };
export type ChatChannel = SocialIdentity & { id: string; name: string; type: 'world' | 'friend' | 'party'; unreadCount?: number; gameId?: number };
export type ChatMessage = { id: number; senderName: string; senderId?: string; senderPortrait?: PanelPortrait; content: string; createdAt: string; own?: boolean; recruitmentId?: number; recruitment?: Recruitment };
export type SocialFriend = SocialIdentity & { name: string; gameId: number; status: 'friend' | 'oath' | string; affinity: number; stage: string; affinityProgress?: AffinityProgress };
export type SocialSummary = {
  friends: SocialFriend[];
  friendRequests: (SocialIdentity & { id: number; name: string; gameId: number; createdAt: string })[];
  oath: (SocialIdentity & { id: number; name: string; gameId: number; status: string; affinity: number; stage: string; affinityProgress?: AffinityProgress }) | null;
  oathRequests: (SocialIdentity & { id: number; name: string; gameId: number; affinity: number; stage: string; affinityProgress?: AffinityProgress; expiresAt: string })[];
  oathReleaseRequests: (SocialIdentity & { id: number; name: string; gameId: number; expiresAt: string })[];
};
export type Recruitment = { id: number; partyId: string; partyName: string; title?: string; description?: string; creatorName?: string; leaderGameId?: number; leaderPortrait?: PanelPortrait; regionCode?: string; regionName?: string; targetCount: number; memberCount: number; openSlots?: number; status?: 'open' | 'closed'; applicationStatus?: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired' | null; createdAt: string; expiresAt?: string; own?: boolean; applied?: boolean };
export type PartyApplication = SocialIdentity & { id: number; gameId: number; name: string; message: string; status: string; createdAt: string; respondedAt?: string | null };
export type WebPartyMember = SocialIdentity & { id: number; gameId: number; name: string; level: number; isLeader: boolean; isSelf: boolean; regionCode: string; regionName: string; position: { x: number; y: number; z: number } };
export type WebParty = { id: string; name: string; story: boolean; leaderId: number; leaderGameId: number | null; ownId: number; isLeader: boolean; leader: WebPartyMember | null; members: WebPartyMember[]; memberCount: number; maxMembers: number; regionCode: string; regionName: string; position: { x: number; y: number; z: number } | null; canLeave: boolean; canRename: boolean; canRecruit: boolean; canPublishRecruitment: boolean; recruitment: Recruitment | null; pendingApplicationCount: number };
export type PartySearchPage = { ok: true; recruitments: Recruitment[]; parties: Recruitment[]; hasMore: boolean; nextCursor: number | null };

/**
 * The schema returned by the web command catalogue.  `revision` and `token`
 * fields are deliberately represented here even though the UI renders them as
 * hidden state; they are returned by a preview and sent back on confirmation.
 */
export type CommandFieldType = 'enum' | 'number' | 'rest' | 'string' | 'revision' | 'token';
export type CommandFieldOption = { label: string; value: string | number };
export type CommandFieldSchema = {
  key: string;
  label?: string;
  type: CommandFieldType;
  required?: boolean;
  default?: string | number;
  placeholder?: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: CommandFieldOption[] | Array<string | number>;
};
export type CommandCatalogItem = {
  id: string;
  title: string;
  category?: string;
  description?: string;
  usage?: string;
  readOnly?: boolean;
  requiresCharacter?: boolean;
  enabled?: boolean;
  reason?: string;
  risk?: 'read' | 'write' | 'danger' | string;
  refresh?: string[];
  schema?: CommandFieldSchema[] | { fields?: CommandFieldSchema[] };
  fields?: CommandFieldSchema[];
  args?: CommandFieldSchema[];
};
export type CommandCatalogResponse = { commands: CommandCatalogItem[] };
export type CommandActionMode = 'execute' | 'preview' | 'confirm';
export type CommandActionPayload = { commandId: string; args?: Record<string, string | number>; mode?: CommandActionMode; revision?: string | number; token?: string };
export type CommandRefreshMeta = { regions?: string[]; [key: string]: unknown };
export type IssuedActionButton = { label: string; actionId: string; revision: string; expiresAt?: string; command?: never };
export type GameActionButton = { label: string; command: string; actionId?: never; revision?: never; expiresAt?: never } | IssuedActionButton;
export type StoryIllustration = { sceneKey: string; path: string; width: number; height: number; alt: string };
export type GameActionMessage = { text?: string; markdown?: string; format?: { type?: string; value?: unknown; options?: Record<string, unknown> }[]; storyImage?: StoryIllustration; buttons?: GameActionButton[] };
export type CommandActionResult = GameActionMessage & {
  movementVisual?: ExploreCommittedMovement;
  ok?: boolean;
  presentation?: 'story' | 'interaction' | 'page';
  destination?: 'character' | 'inventory' | 'explore' | 'evolution' | 'advancedProfession';
  commerce?: { kind: 'bank' | 'guildShop' | 'bookshop' | 'homeShop'; targetId?: string; mode?: 'buy' | 'sell' };
  text?: string;
  buttons?: GameActionButton[];
  messages?: GameActionMessage[];
  preview?: unknown;
  confirmToken?: string;
  revision?: string | number;
  refresh?: string[] | CommandRefreshMeta;
  panel?: Panel;
  [key: string]: unknown;
};

export type WebNotification = {
  id: number;
  category: 'system' | 'command' | 'quest' | 'achievement' | 'battle' | 'party' | 'friend' | 'mail' | 'world';
  title: string;
  messages: { text?: string; markdown?: string; format?: { type?: string; value?: unknown; options?: Record<string, unknown> }[]; buttons?: { label: string; command: string }[] }[];
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
};
export type WebNotificationPage = { ok: true; items: WebNotification[]; unreadCount: number; hasMore: boolean; nextBeforeId: number | null };
export type WebNotificationChanges = { ok: true; items: WebNotification[]; unreadCount: number; hasMore: boolean; nextAfterId: number };
export type GameMailFilter = 'all' | 'unread' | 'attachments';
export type GameMail = { id: number; title: string; senderName: string; createdAt: string; isRead: boolean; hasAttachments: boolean; claimedAt: string | null; preview: string };
export type GameMailAttachment = { itemId: number; code: string; name: string; quantity: number; rarity: string; itemType: string };
export type GameMailDetail = GameMail & { body: string; readAt: string | null; attachments: GameMailAttachment[] };
export type GameMailPage = { ok: true; items: GameMail[]; unreadCount: number; hasMore: boolean; nextBeforeId: number | null };

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api/web/v1').replace(/\/$/, '');
const TOKEN_KEY = 'fantasy-final-web-token';
const NETWORK_ERROR_MESSAGE = '网络连接异常，未收到服务器响应，请稍后重试。';

export const userFacingErrorMessage = (value: unknown): string => {
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
  const trimmed = message.trim();
  if (/^(?:TypeError:\s*)?(?:Failed to fetch|NetworkError.*|Load failed|fetch failed)$/i.test(trimmed)) return NETWORK_ERROR_MESSAGE;
  return /[\u3400-\u9fff]/.test(trimmed) ? trimmed : '操作未完成，请稍后重试。';
};

const httpErrorMessage = (status: number): string => {
  if (status === 429) return '请求过于频繁，请稍后重试。';
  if (status >= 500) return `服务暂时不可用（${status}），请稍后重试。`;
  return `请求失败（状态码 ${status}），请稍后重试。`;
};

export const token = () => sessionStorage.getItem(TOKEN_KEY) ?? '';
export const saveToken = (value: string) => sessionStorage.setItem(TOKEN_KEY, value);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const accessToken = token();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new Error(path === '/register'
      ? '网络连接异常，无法确认注册是否成功，请稍后检查账号状态再重试。'
      : NETWORK_ERROR_MESSAGE);
  }
  const parsed: unknown = await response.json().catch(() => null);
  const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  if (!response.ok || data?.ok === false) {
    if (response.status === 401 && accessToken && token() === accessToken) {
      clearToken();
      window.dispatchEvent(new Event('fantasy-final-auth-invalidated'));
    }
    const loginRouteMissing = response.status === 404 && (path === '/login' || path === '/register');
    const serverMessage = typeof data?.message === 'string' ? data.message.trim() : '';
    const message = loginRouteMissing
      ? '登录或注册接口未找到，请联系管理员检查网页接口配置。'
      : serverMessage ? userFacingErrorMessage(serverMessage) : httpErrorMessage(response.status);
    throw new ApiRequestError(message, response.status, typeof data?.code === 'string' ? data.code : undefined);
  }
  if (!data || ((path === '/login' || path === '/register') &&
    (typeof data.accessToken !== 'string' || !data.accessToken || typeof data.uid !== 'string' || (path === '/login' && !data.uid)))) {
    throw new Error('服务器返回内容异常，请稍后重试。');
  }
  return data as T;
}

export type AuthResult = { accessToken: string; uid: string; loginId: string; gameUserId: string; account?: { loginId: string; gameUserId: string; passwordLoginEnabled: boolean } };
export type PasswordResult = { accessToken: string; uid: string; loginId: string; gameUserId: string; passwordLoginEnabled: boolean };
export const register = (displayName: string, password: string, passwordConfirmation: string) => request<AuthResult>('/register', { method: 'POST', body: JSON.stringify({ displayName, password, passwordConfirmation }) });
export const login = (loginId: string, password: string) => request<AuthResult>('/login', { method: 'POST', body: JSON.stringify({ loginId, password }) });
export const setPassword = (newPassword: string, passwordConfirmation: string) => request<PasswordResult>('/password/set', { method: 'POST', body: JSON.stringify({ newPassword, passwordConfirmation }) });
export const changePassword = (currentPassword: string, newPassword: string, passwordConfirmation: string) => request<PasswordResult>('/password/change', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword, passwordConfirmation }) });
export const logout = () => request<{ ok: true }>('/logout', { method: 'POST' });
export const panel = () => request<Panel>('/panel');
export const equippedEquipmentDetail = (slot: string, signal?: AbortSignal) => request<EquippedEquipmentDetailResponse>(`/equipment/${encodeURIComponent(slot)}/detail`, { signal });
export const autoBattleConfig = (mode: AutoBattleMode = 'pve') => request<AutoBattleConfig>(`/auto-battle/config?mode=${mode}`);
export const autoBattleSkills = (page = 1, keyword = '') => request<{ choices: AutoBattleSkillChoice[]; page: number; total: number }>(`/auto-battle/skills?page=${page}&keyword=${encodeURIComponent(keyword)}`);
export const autoBattlePotions = (page = 1, keyword = '') => request<{ items: AutoBattlePotionChoice[]; page: number; total: number }>(`/auto-battle/potions?page=${page}&keyword=${encodeURIComponent(keyword)}`);
export const saveAutoBattleSetting = (payload: { operation: 'enabled' | 'potion' | 'threshold' | 'potion-item' | 'default-action'; mode?: AutoBattleMode; enabled?: boolean; kind?: 'hp' | 'mp'; threshold?: number; itemId?: number | null }) => request<AutoBattleConfig>('/auto-battle/settings', { method: 'POST', body: JSON.stringify(payload) });
export const saveAutoBattleAction = (payload: { sequence: number; skillId: number | null; mode?: AutoBattleMode }) => request<AutoBattleConfig>('/auto-battle/actions', { method: 'POST', body: JSON.stringify(payload) });
export const deleteAutoBattleAction = (sequence: number, mode: AutoBattleMode = 'pve') => request<AutoBattleConfig>(`/auto-battle/actions/${sequence}?mode=${mode}`, { method: 'DELETE' });
export const command = (value: string) => request<CommandActionResult>('/command', { method: 'POST', body: JSON.stringify({ command: value }) });
export const exploreMove = (position: { x: number; y: number; z: number }) => request<CommandActionResult & { kind: string; text: string; position: { x: number; y: number; z: number }; interactionTargets?: { type: string; id: string; name: string; description?: string }[] }>('/explore/move', { method: 'POST', body: JSON.stringify(position) });
export type ExploreRoutePosition = { x: number; y: number; z: number; regionId: number };
export type ExploreTravelVisualPoint = ExploreRoutePosition & { regionCode: string; regionName: string };
export type ExploreCommittedMovement = { id: string; origin: ExploreTravelVisualPoint; target: ExploreTravelVisualPoint; totalDistance: number; movementSpeed?: number; waypoints: (ExploreTravelVisualPoint & { distance: number })[] };
export type ExploreTravelVisual = {
  id: string; serverNow: number; startAt: number; arrivalAt: number;
  start: ExploreTravelVisualPoint; target: ExploreTravelVisualPoint; totalDistance: number;
  segments: { kind: 'walk' | 'portal' | 'guild'; instant: boolean; from: ExploreTravelVisualPoint; to: ExploreTravelVisualPoint; distance: number; startAt: number; arrivalAt: number; waypoints: (ExploreTravelVisualPoint & { distance: number; at: number })[] }[];
};
export type ExploreGroundWindow = { cells: { x: number; y: number; z: number; regionId: number; regionCode: string }[]; terrainFields: MapSurfaceScene['terrainFields']; padding?: number; scopeToken?: 'world:0' };
export type ExploreLocalMap = { ok: true; origin: ExploreRoutePosition; range: number; actionRange: number; movement: { step: number; maximum: number; speed?: number }; cells: { x: number; y: number; z: number; regionId?: number; regionCode?: string; passable: boolean; reachable?: boolean }[]; environment?: EnvironmentObjectView[]; environmentJob?: EnvironmentJobView | null; surfaceScene?: MapSurfaceScene; groundWindow?: ExploreGroundWindow; travelView?: { id: string; serverNow: number; position: ExploreTravelVisualPoint; committedOrigin: ExploreRoutePosition }; nearby?: { points: PanelNearbyPoint[]; range: number; actionRange: number } };
export type EnvironmentJobView = { id: string; objectId: string; objectName: string; finishesAt: string; remainingSeconds: number; ready: boolean };
export type EnvironmentActionResult = { kind: 'clearing' | 'cancelled' | 'idle' | 'settled'; message: string; text?: string; job?: EnvironmentJobView | null; objectId?: string; alreadySettled?: boolean; rewards?: { code: string; name: string; quantity: number }[]; panel?: Panel };
export type ExploreRoutePreview = { ok: true; origin: ExploreRoutePosition; sightRange: number; actionRange: number; moveRange: number; path: ExploreRoutePosition[]; stepMilliseconds: number };
export type ExploreStepState = { position: ExploreRoutePosition; region: string; hp: number; mp: number; stamina: number; movement: ExploreLocalMap['movement']; nearby: { points: PanelNearbyPoint[]; range: number; actionRange: number } };
export type ExploreRouteStep = CommandActionResult & { kind: string; text: string; position: ExploreRoutePosition; moved: boolean; localMap?: Omit<ExploreLocalMap, 'ok'>; stepState?: ExploreStepState };
export const exploreLocalMap = (signal?: AbortSignal, view?: 'travel') => request<ExploreLocalMap>(`/explore/local-map${view === 'travel' ? '?view=travel' : ''}`, { signal }).then(result => {
  if (validSurfaceScene(result.surfaceScene)) surfaceSnapshotClock(result.surfaceScene, performance.now());
  return result;
});
export const clearEnvironment = (id: string) => request<EnvironmentActionResult>('/explore/environment/clear', { method: 'POST', body: JSON.stringify({ id }) });
export const cancelEnvironment = () => request<EnvironmentActionResult>('/explore/environment/cancel', { method: 'POST' });
export const settleEnvironment = (objectId: string) => request<EnvironmentActionResult>('/explore/environment/settle', { method: 'POST', body: JSON.stringify({ objectId }) });
export const exploreRoutePreview = (position: { x: number; y: number; z: number }, signal?: AbortSignal) => request<ExploreRoutePreview>('/explore/route/preview', { method: 'POST', body: JSON.stringify(position), signal });
export const exploreRouteStep = (position: { x: number; y: number; z: number }, expectedFrom: ExploreRoutePosition, signal?: AbortSignal) => request<ExploreRouteStep>('/explore/route/step', { method: 'POST', body: JSON.stringify({ ...position, expectedFrom, compact: true }), signal }).then(result => {
  // A committed step may wait in the animation queue. Its traces start ageing
  // on receipt, rather than becoming new again when that leg is displayed.
  if (validSurfaceScene(result.localMap?.surfaceScene)) surfaceSnapshotClock(result.localMap!.surfaceScene!, performance.now());
  return result;
});
export const mineResource = (resourceId: number) => request<{ kind: string; text: string; resourceId: number; panel?: Panel }>('/explore/mine', { method: 'POST', body: JSON.stringify({ resourceId }) });
export const exploreTravel = (position: { x: number; y: number; z: number }) => request<{ kind: string; text: string; position: { x: number; y: number; z: number }; remaining?: number; movementVisual?: ExploreCommittedMovement; travel?: { remaining: number; destination?: string; activityType?: 'move' | 'hunt'; visual?: ExploreTravelVisual }; panel?: Panel }>('/explore/travel', { method: 'POST', body: JSON.stringify(position) });
export const cancelExploreTravel = () => request<{ kind: 'cancelled'; text: string; position?: ExploreRoutePosition; panel?: Panel }>('/explore/travel/cancel', { method: 'POST' });
export const settleExploreTravel = () => request<{ kind: string; text: string; remaining: number; position?: ExploreRoutePosition; travel?: { remaining: number; destination?: string; activityType?: 'move' | 'hunt'; visual?: ExploreTravelVisual }; panel?: Panel }>('/explore/travel/settle', { method: 'POST' });
export type NegotiationCommandPayload = {
  type: 'view' | 'talk' | 'gift' | 'leave' | 'fight';
  sessionId?: string;
  revision?: number;
  itemId?: number;
  quantity?: number;
  page?: number;
  keyword?: string;
};
export const startBattle = (spawnId: number) => request<{ kind: string; text: string; spawnId: number; panel?: Panel }>('/battle/start', { method: 'POST', body: JSON.stringify({ spawnId }) });
export const submitBattleAction = (payload: BattleActionPayload) => request<BattleActionResult>('/battle/actions', { method: 'POST', body: JSON.stringify(payload) });
export const avoidEncounter = (spawnId: number) => request<{ kind: string; text: string; spawnId: number; panel?: Panel }>('/encounter/avoid', { method: 'POST', body: JSON.stringify({ spawnId }) });
export const negotiate = (spawnId: number, command: NegotiationCommandPayload = { type: 'view' }) => request<{ kind: string; text?: string; spawnId: number; negotiation: NegotiationPanel; panel?: Panel }>('/negotiation', { method: 'POST', body: JSON.stringify({ spawnId, ...command }) });
export const commandCatalog = () => request<CommandCatalogResponse>('/command-catalog');
export const commandAction = (payload: CommandActionPayload) => request<CommandActionResult>('/command/action', { method: 'POST', body: JSON.stringify(payload) });
export const interactionAction = (actionId: string, revision: string, idempotencyKey: string) => request<CommandActionResult>('/interactions/actions', { method: 'POST', body: JSON.stringify({ actionId, revision, idempotencyKey }) });
export const notifications = (beforeId?: number, limit = 20) => {
  const query = new URLSearchParams({ limit: String(limit) });
  if (beforeId !== undefined) query.set('beforeId', String(beforeId));
  return request<WebNotificationPage>(`/notifications?${query.toString()}`);
};
export const notificationChanges = (afterId: number, limit = 100) => request<WebNotificationChanges>(`/notifications/changes?afterId=${afterId}&limit=${limit}`);
export const notificationUnread = () => request<{ ok: true; unreadCount: number }>('/notifications/unread');
export const markNotificationRead = (id: number) => request<{ ok: true; updated: number; unreadCount: number }>(`/notifications/${id}/read`, { method: 'POST' });
export const gameMails = (filter: GameMailFilter = 'all', beforeId?: number, limit = 20) => {
  const query = new URLSearchParams({ filter, limit: String(limit) });
  if (beforeId !== undefined) query.set('beforeId', String(beforeId));
  return request<GameMailPage>(`/mail?${query.toString()}`);
};
export const gameMailUnread = () => request<{ ok: true; unreadCount: number }>('/mail/unread');
export const gameMailDetail = (id: number) => request<{ ok: true; item: GameMailDetail; unreadCount: number }>(`/mail/${id}`);
export const claimGameMail = (id: number) => request<{ ok: true; items: { name: string; quantity: number }[]; unreadCount: number }>(`/mail/${id}/claim`, { method: 'POST' });
export const claimAllGameMails = () => request<{ ok: true; mailCount: number; items: { name: string; quantity: number }[]; unreadCount: number }>('/mail/claim-all', { method: 'POST' });
export const deleteGameMail = (id: number) => request<{ ok: true; unreadCount: number }>(`/mail/${id}`, { method: 'DELETE' });
export const channels = () => request<{ channels: ChatChannel[] }>('/chat/channels');
export const socialSummary = () => request<SocialSummary>('/social/summary');
export const realtimeTicket = () => request<{ ticket: string; expiresIn: number }>('/realtime-ticket');
export const messages = (channelId: string, beforeId?: number, limit = 20) => {
  const query = new URLSearchParams({ limit: String(limit) });
  if (Number.isSafeInteger(beforeId) && Number(beforeId) > 0) query.set('beforeId', String(beforeId));
  return request<{ messages: ChatMessage[]; hasMore?: boolean }>(`/chat/channels/${encodeURIComponent(channelId)}/messages?${query.toString()}`);
};
export const sendMessage = (channelId: string, content: string) => request<{ message: ChatMessage }>(`/chat/channels/${encodeURIComponent(channelId)}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
export const currentParty = () => request<{ ok: true; party: WebParty | null }>('/party/current');
export const createParty = (name: string) => request<{ ok: true; party: WebParty }>('/party/create', { method: 'POST', body: JSON.stringify({ name }) });
export const leaveParty = () => request<{ ok: true; party: WebParty | null }>('/party/leave', { method: 'POST' });
export const renameParty = (name: string) => request<{ ok: true; party: WebParty }>('/party/rename', { method: 'POST', body: JSON.stringify({ name }) });
export const searchParty = (filters: { keyword?: string; region?: string; targetCount?: number; cursor?: number; limit?: number } = {}) => request<PartySearchPage>(`/party/search?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)])).toString()}`);
export const recruitments = () => request<{ recruitments: Recruitment[] }>('/party/recruitments');
export const createRecruitment = (input: { description: string; targetCount: number; title?: string }) => request<{ ok: true; recruitment: Recruitment }>('/party/recruitments', { method: 'POST', body: JSON.stringify({ ...input, expiresMinutes: 60 }) });
export const applyRecruitment = (id: number) => request<{ ok: true }>(`/party/recruitments/${id}/apply`, { method: 'POST' });
export const partyApplications = (id: number) => request<{ applications: PartyApplication[] }>(`/party/recruitments/${id}/applications`);
export const acceptApplication = (id: number) => request<{ application: PartyApplication }>(`/party/applications/${id}/accept`, { method: 'POST' });
export const rejectApplication = (id: number) => request<{ application: PartyApplication }>(`/party/applications/${id}/reject`, { method: 'POST' });
