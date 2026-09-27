export type Panel = {
  text?: string;
  buttons?: { label: string; command: string }[];
  account?: { uid?: string; displayName?: string; hasCharacter?: boolean };
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
    movementStep?: number; movementMaximum?: number; perception?: number;
    activity?: string; travel?: { destination: string; remaining: number };
  };
  mapData?: {
    current?: { name: string; x: number; y: number; z: number };
    maps: { code: string; name: string; danger: number; isCurrent: boolean; bounds?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } }[];
    partyMembers?: { id: number; gameId: number; name: string; isLeader: boolean; isSelf: boolean; regionCode: string; regionName: string; x: number; y: number; z: number }[];
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
  movement?: { step: number; maximum: number; showLandmarks?: boolean; showPlayers?: boolean };
  nearby?: { description?: string; range?: number; actionRange?: number; points?: PanelNearbyPoint[] };
  battle?: PanelBattleSnapshot;
  inventory?: PanelInventory;
  regionMap?: {
    currentRegionCode?: string;
    regions?: { code: string; name: string; danger?: string | number; isCurrent?: boolean; current?: { x: number; y: number; z?: number } }[];
    members?: { id: string; name: string; x: number; y: number; z?: number; regionCode?: string; regionName?: string; icon?: string; isCurrent?: boolean }[];
    landmarks?: { id: string; name: string; x: number; y: number; z?: number; regionCode?: string; regionName?: string; type?: string; icon?: string; description?: string }[];
  };
};

export type PanelInventoryStack = {
  id?: number;
  code?: string;
  codexId?: string;
  name: string;
  itemType?: string;
  itemCategory?: string;
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

export type PanelPortrait = {
  baseKey: string;
  poseKey: string;
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
  code?: string;
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
  level?: number | null;
  hp: number | string;
  hpMax: number | string;
  mp?: number | string;
  mpMax?: number | string;
  defeated?: boolean;
  identified?: boolean;
  statusText?: string;
};

export type PanelBattleSnapshot = {
  mode?: string;
  turn?: number;
  canAct?: boolean;
  playerHp?: number;
  playerHpMax?: number;
  playerMp?: number;
  playerMpMax?: number;
  selectedTargetId?: number | null;
  members?: PanelBattleMember[];
  targets?: PanelBattleTarget[];
  skillSlots?: number[];
  readySkillSlots?: number[];
  itemSlots?: number[];
  advancedSkills?: { id: number; code: string; name: string; ready?: boolean }[];
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

export type ChatChannel = { id: string; name: string; type: 'world' | 'friend' | 'party'; unreadCount?: number };
export type ChatMessage = { id: number; senderName: string; senderId?: string; content: string; createdAt: string; own?: boolean };
export type SocialFriend = { name: string; gameId: number; status: 'friend' | 'oath' | string; affinity: number; stage: string };
export type SocialSummary = {
  friends: SocialFriend[];
  friendRequests: { id: number; name: string; gameId: number; createdAt: string }[];
  oath: { id: number; name: string; gameId: number; status: string; affinity: number; stage: string } | null;
  oathRequests: { id: number; name: string; gameId: number; affinity: number; stage: string; expiresAt: string }[];
  oathReleaseRequests: { id: number; name: string; gameId: number; expiresAt: string }[];
};
export type Recruitment = { id: number; partyId: string; partyName: string; title?: string; description?: string; creatorName?: string; targetCount: number; memberCount: number; createdAt: string; expiresAt?: string; own?: boolean; applied?: boolean };
export type PartyApplication = { id: number; gameId: number; name: string; message: string; status: string; createdAt: string; respondedAt?: string | null };

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
export type CommandActionResult = {
  ok?: boolean;
  text?: string;
  buttons?: { label: string; command: string }[];
  preview?: unknown;
  confirmToken?: string;
  revision?: string | number;
  refresh?: string[] | CommandRefreshMeta;
  panel?: Panel;
  [key: string]: unknown;
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api/web/v1').replace(/\/$/, '');
const TOKEN_KEY = 'fantasy-final-web-token';

export const token = () => sessionStorage.getItem(TOKEN_KEY) ?? '';
export const saveToken = (value: string) => sessionStorage.setItem(TOKEN_KEY, value);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const accessToken = token();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    if (response.status === 401 && accessToken && token() === accessToken) {
      clearToken();
      window.dispatchEvent(new Event('fantasy-final-auth-invalidated'));
    }
    const loginRouteMissing = response.status === 404 && (path === '/login' || path === '/register');
    const message = loginRouteMissing
      ? '网页登录接口未找到：请确认 server 已重新 npm run build 并重启，同时检查 Nginx/Caddy 是否把 /api 转发到 17117。'
      : String(data.message ?? `请求失败（${response.status}）`);
    throw new Error(message);
  }
  return data as T;
}

export const register = (displayName: string) => request<{ accessToken: string; uid: string }>('/register', { method: 'POST', body: JSON.stringify({ displayName }) });
export const login = (gameId: string, password: string) => request<{ accessToken: string; uid: string }>('/login', { method: 'POST', body: JSON.stringify({ gameId, password }) });
export const logout = () => request<{ ok: true }>('/logout', { method: 'POST' });
export const panel = () => request<Panel>('/panel');
export const autoBattleConfig = (mode: AutoBattleMode = 'pve') => request<AutoBattleConfig>(`/auto-battle/config?mode=${mode}`);
export const autoBattleSkills = (page = 1, keyword = '') => request<{ choices: AutoBattleSkillChoice[]; page: number; total: number }>(`/auto-battle/skills?page=${page}&keyword=${encodeURIComponent(keyword)}`);
export const autoBattlePotions = (page = 1, keyword = '') => request<{ items: AutoBattlePotionChoice[]; page: number; total: number }>(`/auto-battle/potions?page=${page}&keyword=${encodeURIComponent(keyword)}`);
export const saveAutoBattleSetting = (payload: { operation: 'enabled' | 'potion' | 'threshold' | 'potion-item' | 'default-action'; mode?: AutoBattleMode; enabled?: boolean; kind?: 'hp' | 'mp'; threshold?: number; itemId?: number | null }) => request<AutoBattleConfig>('/auto-battle/settings', { method: 'POST', body: JSON.stringify(payload) });
export const saveAutoBattleAction = (payload: { sequence: number; skillId: number | null; mode?: AutoBattleMode }) => request<AutoBattleConfig>('/auto-battle/actions', { method: 'POST', body: JSON.stringify(payload) });
export const deleteAutoBattleAction = (sequence: number, mode: AutoBattleMode = 'pve') => request<AutoBattleConfig>(`/auto-battle/actions/${sequence}?mode=${mode}`, { method: 'DELETE' });
export const command = (value: string) => request<Panel>('/command', { method: 'POST', body: JSON.stringify({ command: value }) });
export const exploreMove = (position: { x: number; y: number; z: number }) => request<{ kind: string; text: string; position: { x: number; y: number; z: number }; interactionTargets?: { type: string; id: string; name: string; description?: string }[]; panel?: Panel }>('/explore/move', { method: 'POST', body: JSON.stringify(position) });
export const mineResource = (resourceId: number) => request<{ kind: string; text: string; resourceId: number; panel?: Panel }>('/explore/mine', { method: 'POST', body: JSON.stringify({ resourceId }) });
export const exploreTravel = (position: { x: number; y: number; z: number }) => request<{ kind: string; text: string; position: { x: number; y: number; z: number }; remaining?: number; panel?: Panel }>('/explore/travel', { method: 'POST', body: JSON.stringify(position) });
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
export const avoidEncounter = (spawnId: number) => request<{ kind: string; text: string; spawnId: number; panel?: Panel }>('/encounter/avoid', { method: 'POST', body: JSON.stringify({ spawnId }) });
export const negotiate = (spawnId: number, command: NegotiationCommandPayload = { type: 'view' }) => request<{ kind: string; text?: string; spawnId: number; negotiation: NegotiationPanel; panel?: Panel }>('/negotiation', { method: 'POST', body: JSON.stringify({ spawnId, ...command }) });
export const commandCatalog = () => request<CommandCatalogResponse>('/command-catalog');
export const commandAction = (payload: CommandActionPayload) => request<CommandActionResult>('/command/action', { method: 'POST', body: JSON.stringify(payload) });
export const channels = () => request<{ channels: ChatChannel[] }>('/chat/channels');
export const socialSummary = () => request<SocialSummary>('/social/summary');
export const realtimeTicket = () => request<{ ticket: string; expiresIn: number }>('/realtime-ticket');
export const messages = (channelId: string, beforeId?: number, limit = 20) => {
  const query = new URLSearchParams({ limit: String(limit) });
  if (Number.isSafeInteger(beforeId) && Number(beforeId) > 0) query.set('beforeId', String(beforeId));
  return request<{ messages: ChatMessage[]; hasMore?: boolean }>(`/chat/channels/${encodeURIComponent(channelId)}/messages?${query.toString()}`);
};
export const sendMessage = (channelId: string, content: string) => request<{ message: ChatMessage }>(`/chat/channels/${encodeURIComponent(channelId)}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
export const recruitments = () => request<{ recruitments: Recruitment[] }>('/party/recruitments');
export const createRecruitment = (summary: string) => request<{ recruitment: Recruitment }>('/party/recruitments', { method: 'POST', body: JSON.stringify({ title: '冒险队伍招募', description: summary, targetCount: 4, expiresMinutes: 60 }) });
export const applyRecruitment = (id: number) => request<{ ok: true }>(`/party/recruitments/${id}/apply`, { method: 'POST' });
export const partyApplications = (id: number) => request<{ applications: PartyApplication[] }>(`/party/recruitments/${id}/applications`);
export const acceptApplication = (id: number) => request<{ application: PartyApplication }>(`/party/applications/${id}/accept`, { method: 'POST' });
export const rejectApplication = (id: number) => request<{ application: PartyApplication }>(`/party/applications/${id}/reject`, { method: 'POST' });
