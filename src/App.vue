<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as api from './api';
import type { AutoBattleConfig, AutoBattleSkillChoice, ChatChannel, ChatMessage, Panel, Recruitment, PartyApplication, WebParty, SocialSummary, CommandActionResult, CommandCatalogItem, PanelInventoryStack, PanelInventoryInstance, PanelEquippedItem, WebNotification, GameMail, GameMailDetail, GameMailFilter, GameActionButton, GameActionMessage } from './api';
import CommandCatalog from './components/CommandCatalog.vue';
import AdventureManualDock from './components/AdventureManualDock.vue';
import AdventureManualPanel, { type ManualCategory, type ManualMessage } from './components/AdventureManualPanel.vue';
import HandbookContent from './components/HandbookContent.vue';
import type { HandbookSection } from './handbook-api';
import StoryDialog from './components/StoryDialog.vue';
import { createIdempotencyKey } from './idempotency-key';
import NotificationInbox from './components/NotificationInbox.vue';
import PartyPopup from './components/PartyPopup.vue';
import MarketPanel from './components/MarketPanel.vue';
import SkillPanel from './components/SkillPanel.vue';
import BankPanel from './components/BankPanel.vue';
import HomePanel from './components/HomePanel.vue';
import GuildShopPanel from './components/GuildShopPanel.vue';
import BookshopPanel from './components/BookshopPanel.vue';
import HomePurchasePanel from './components/HomePurchasePanel.vue';
import EvolutionPanel from './components/EvolutionPanel.vue';
import AdvancedProfessionPanel from './components/AdvancedProfessionPanel.vue';
import type { AdvancedMentor, AdvancedTrialStarted } from './advanced-profession-api';
import type { HomePurchaseSiteTarget } from './home-purchase-api';
import WorldMapPanel, { type ExploreMapPoint, type MapActionLock, type MapBounds, type MapPointAction, type MapPosition } from './components/WorldMapPanel.vue';
import RegionMapSidebar, { type RegionTravelRequest } from './components/RegionMapSidebar.vue';
import TurnBattlePanel, { type BattleAction, type BattleState } from './components/TurnBattlePanel.vue';
import NegotiationPanel from './components/NegotiationPanel.vue';
import InventoryItemIcon from './components/InventoryItemIcon.vue';
import CharacterPortrait from './components/CharacterPortrait.vue';
import { BgmPlayer, type BgmScene } from './bgm';

type Tab = 'character' | 'inventory' | 'explore' | 'social' | 'world';
type SocialSection = 'friends' | 'oath' | 'party';
type WorldSection = 'overview' | 'market' | 'home';
type CharacterSection = 'profile' | 'equipment' | 'skills' | 'evolution';
type StoryGuide = { text: string; buttons: GameActionButton[]; messages: GameActionMessage[] };
const tab = ref<Tab>('explore');
const socialSection = ref<SocialSection>('friends');
const characterSection = ref<CharacterSection>('profile');
const panel = ref<Panel | null>(null);
let panelRequestVersion = 0;
watch(panel, () => { panelRequestVersion += 1; }, { flush: 'sync' });
const battleLog = ref<NonNullable<BattleState['log']>>([]);
const negotiation = ref<api.NegotiationPanel | null>(null);
const storyGuide = ref<StoryGuide | null>(null);
const storyError = ref('');
const storyLoading = ref(false);
const dismissedStoryRevision = ref('');
let storyRequestVersion = 0;
const interactionOpen = ref(false);
const interactionTitle = ref('互动');
const interactionBuildingCode = ref<string | null>(null);
const commerceSide = ref<'buy' | 'sell'>('buy');
const interactionMessages = ref<ManualMessage[]>([]);
const interactionError = ref('');
const issuedActionRetryKeys = new Map<string, string>();
const busy = ref(false);
const criticalPendingSources = ref<Record<string, boolean>>({});
const criticalPending = computed(() => Object.values(criticalPendingSources.value).some(Boolean));
const setCriticalPending = (source: string, pending: boolean) => {
  criticalPendingSources.value = { ...criticalPendingSources.value, [source]: pending };
};
const notice = ref('');
const error = ref('');
const loginMode = ref<'login' | 'register'>('login');
const gameId = ref('');
const password = ref('');
const showPassword = ref(false);
const passwordConfirmation = ref('');
const showPasswordConfirmation = ref(false);
const registrationLoginId = ref('');
const loggedIn = ref(Boolean(api.token()));
const displayName = ref('');
const channels = ref<ChatChannel[]>([]);
const socialSummary = ref<SocialSummary>({ friends: [], friendRequests: [], oath: null, oathRequests: [], oathReleaseRequests: [] });
const socialGameId = ref('');
const activeChannel = ref('world');
const messages = ref<ChatMessage[]>([]);
const chatMessageListRef = ref<HTMLElement | null>(null);
const chatHasEarlier = ref(false);
const chatLoadingEarlier = ref(false);
const chatHasNewMessages = ref(false);
const chatAtLatest = ref(true);
const messageDraft = ref('');
const recruitments = ref<Recruitment[]>([]);
const applications = ref<PartyApplication[]>([]);
const currentParty = ref<WebParty | null>(null);
const partyLoading = ref(false);
const partyLoadingMore = ref(false);
const partyHasMore = ref(false);
const partyNextCursor = ref<number | null>(null);
const partyBusy = ref(false);
const partyError = ref('');
const partySearchFilters = ref<{ keyword: string; region: string; targetCount?: number }>({ keyword: '', region: '' });
let partyRequestVersion = 0;
const catalog = ref<CommandCatalogItem[]>([]);
const commandCatalogRef = ref<{ showInteractionResult: (result: CommandActionResult) => void; showInteractionError: (error: unknown) => void } | null>(null);
const catalogOpen = ref(false);
const catalogLoaded = ref(false);
const manualOpen = ref(false);
const handbookOpen = ref(false);
const bankOpen = ref(false);
const guildShopTargetId = ref<string | null>(null);
const bookshopOpen = ref(false);
const homePurchaseMode = ref<'purchase' | 'shop' | null>(null);
const homePurchaseSiteTarget = ref<HomePurchaseSiteTarget | null>(null);
const advancedProfessionOpen = ref(false);
const advancedMentorTarget = ref<AdvancedMentor | null>(null);
const homePanelRef = ref<{ refresh: () => void } | null>(null);
const handbookSection = ref<HandbookSection>('footprints');
const manualCategory = ref<ManualCategory>('主线');
const manualMessages = ref<ManualMessage[]>([]);
const manualBusy = ref(false);
const manualError = ref('');
let manualRequestVersion = 0;
const notificationOpen = ref(false);
const notificationItems = ref<WebNotification[]>([]);
const notificationUnreadCount = ref(0);
const notificationLoading = ref(false);
const notificationLoadingMore = ref(false);
const notificationHasMore = ref(false);
const notificationBeforeId = ref<number | null>(null);
const notificationError = ref('');
const notificationMarkingReadId = ref<number | null>(null);
let latestNotificationId = 0;
let notificationSyncing = false;
const mailItems = ref<GameMail[]>([]);
const mailUnreadCount = ref(0);
const mailFilter = ref<GameMailFilter>('all');
const mailLoading = ref(false);
const mailLoadingMore = ref(false);
const mailHasMore = ref(false);
const mailBeforeId = ref<number | null>(null);
const mailError = ref('');
const mailDetail = ref<GameMailDetail | null>(null);
const mailDetailLoading = ref(false);
const mailActionBusy = ref(false);
let mailLoadVersion = 0;
let mailDetailVersion = 0;
const inboxUnreadCount = computed(() => notificationUnreadCount.value + mailUnreadCount.value);
const settingsOpen = ref(false);
const worldSection = ref<WorldSection>('overview');
const musicVolume = ref(70);
const musicEnabled = ref(true);
let bgmPlayer: BgmPlayer | null = null;
const bgmScene = computed<BgmScene>(() => {
  if (!loggedIn.value) return 'homecoming';
  if (panel.value?.inBattle) return panel.value.battle?.targets?.some(target => target.isBoss) ? 'boss' : 'battle';
  return tab.value === 'explore' ? 'worldtree' : 'homecoming';
});
const unlockBgm = () => bgmPlayer?.unlock();
const toggleMusic = () => {
  musicEnabled.value = !musicEnabled.value;
  bgmPlayer?.update(bgmScene.value, musicEnabled.value, musicVolume.value);
  bgmPlayer?.unlock();
};
const settingsAvatar = ref('compass');
const settingsNickname = ref('');
const settingsGender = ref<'男' | '女'>('男');
const settingsCurrentPassword = ref('');
const settingsNewPassword = ref('');
const settingsPasswordConfirmation = ref('');
const showSettingsCurrentPassword = ref(false);
const showSettingsNewPassword = ref(false);
const showSettingsPasswordConfirmation = ref(false);
const settingsAvatarOptions = [
  { id: 'compass', label: '星图', icon: '✦' },
  { id: 'flame', label: '火花', icon: '✹' },
  { id: 'leaf', label: '叶灵', icon: '❧' },
  { id: 'moon', label: '月影', icon: '☾' }
] as const;
const persistLocalSetting = (key: string, value: string | number | boolean) => {
  try { localStorage.setItem(`fantasy-final.${key}`, String(value)); } catch { /* 浏览器禁用存储时仍可继续使用页面 */ }
};
const readLocalSetting = (key: string, fallback: string) => {
  try { return localStorage.getItem(`fantasy-final.${key}`) ?? fallback; } catch { return fallback; }
};
musicVolume.value = Math.min(100, Math.max(0, Number(readLocalSetting('music-volume', '70')) || 0));
musicEnabled.value = readLocalSetting('music-enabled', 'true') !== 'false';
settingsAvatar.value = readLocalSetting('avatar', 'compass');
watch(musicVolume, value => persistLocalSetting('music-volume', value));
watch(musicEnabled, value => persistLocalSetting('music-enabled', value));
watch([bgmScene, musicEnabled, musicVolume], ([scene, enabled, volume]) => bgmPlayer?.update(scene, enabled, volume));
watch(settingsAvatar, value => persistLocalSetting('avatar', value));
type RegionMapSidebarHandle = { openSidebar: (regionCode?: string) => void; closeSidebar: () => void };
const regionMapSidebarRef = ref<RegionMapSidebarHandle | null>(null);
type InventoryCategory = '全部' | '装备' | '道具' | '材料';
type InventoryEquipmentGroup = '全部' | '武器' | '防具' | '首饰';
const inventoryCategory = ref<InventoryCategory>('全部');
const inventoryCategories = ['全部', '装备', '道具', '材料'] as const;
const inventoryEquipmentGroup = ref<InventoryEquipmentGroup>('全部');
// 装备筛选只保留三个装备大类；“全部”仍作为内部默认筛选值，避免打开装备页时丢失其他部位。
const inventoryEquipmentGroups = ['武器', '防具', '首饰'] as const;
const inventorySubcategory = ref('全部');
const selectedInventoryItem = ref<InventoryDisplayItem | null>(null);
const feedbackToastKey = ref(0);
const pendingInteractions = ref<{ type: string; id: string; name: string; description?: string }[]>([]);
const realtime = ref<WebSocket | null>(null);
let refreshTimer: number | undefined;
let actionCountdownTimer: number | undefined;
let feedbackToastTimer: number | undefined;
let authGeneration = 0;
const CHAT_PAGE_SIZE = 20;
let loadedMessagesChannelId: string | null = null;
let chatOldestMessageId: number | null = null;
let chatNewestMessageId: number | null = null;
const miningRemaining = ref(0);
const travelRemaining = ref(0);
const travelPlanningTarget = ref('');
let miningAutoSettling = false;
let travelAutoSettling = false;
let nextTravelSettleAt = 0;
const autoBattleOpen = ref(false);
const autoBattleBusy = ref(false);
const autoBattleMode = ref<api.AutoBattleMode>('pve');
const autoBattleSettings = ref<AutoBattleConfig | null>(null);
const autoBattleSkillChoices = ref<AutoBattleSkillChoice[]>([]);
const autoBattlePotionChoices = ref<{ id: number; name: string }[]>([]);
const autoBattleHpThreshold = ref(30);
const autoBattleMpThreshold = ref(30);
type FloatingSocialPanel = 'chat' | 'party' | 'friend';
const floatingSocialOpen = ref<FloatingSocialPanel | null>(null);
const teamPopupOpen = ref(false);
const floatingDockExpanded = ref(false);
const floatingDockRef = ref<HTMLElement | null>(null);
const floatingSocialPanelRef = ref<HTMLElement | null>(null);
const teamPanelRef = ref<HTMLElement | null>(null);
const floatingDockOffset = ref({ x: 0, y: 0 });
type FloatingDockSide = 'left' | 'right';
const floatingDockSide = ref<FloatingDockSide>('right');
const floatingDockVerticalRatio = ref(0.5);
const floatingSocialPanelOffset = ref({ x: 0, y: 0 });
const teamPanelOffset = ref({ x: 0, y: 0 });
const floatingSocialHeight = ref(560);
let floatingDragState: { pointerId: number; startX: number; startY: number; originX: number; originY: number; originLeft: number; originTop: number; width: number; height: number; moved: boolean; captured: boolean } | null = null;
let modalDragState: { kind: 'social' | 'team'; pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean; captured: boolean } | null = null;
let socialResizeState: { pointerId: number; startY: number; originHeight: number; originOffsetY: number; minHeight: number; maxHeight: number; captured: boolean } | null = null;
let suppressFloatingClick = false;
let suppressFloatingClickTimer: number | undefined;

const recruitmentChannel = computed(() => channels.value.find(item => item.id === 'party:lobby'));
const currentPartyChannel = computed(() => channels.value.find(item => item.type === 'party' && item.id !== 'party:lobby'));
const isInParty = computed(() => Boolean(currentParty.value || currentPartyChannel.value));
const friendChannels = computed(() => channels.value.filter(item => item.type === 'friend'));

const floatingDockStyle = computed(() => ({
  '--float-x': `${floatingDockOffset.value.x}px`,
  '--float-y': `${floatingDockOffset.value.y}px`
} as Record<string, string>));
const saveFloatingDockPlacement = () => {
  try {
    window.localStorage.setItem('fantasy-final-floating-dock-v1', JSON.stringify({
      side: floatingDockSide.value,
      verticalRatio: floatingDockVerticalRatio.value
    }));
  } catch { /* Storage can be unavailable in private browsing. */ }
};
const restoreFloatingDockPlacement = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem('fantasy-final-floating-dock-v1') || 'null') as { side?: FloatingDockSide; verticalRatio?: number } | null;
    if (stored?.side === 'left' || stored?.side === 'right') floatingDockSide.value = stored.side;
    if (typeof stored?.verticalRatio === 'number' && Number.isFinite(stored.verticalRatio)) {
      floatingDockVerticalRatio.value = Math.min(1, Math.max(0, stored.verticalRatio));
    }
  } catch { /* Ignore an invalid saved position. */ }
};

const startFloatingDockDrag = (event: PointerEvent) => {
  if (event.button !== 0 && event.pointerType !== 'touch') return;
  // 按钮本身也可以作为拖动起点。只有指针实际移动超过阈值时才会
  // 抑制后续 click，因此轻触仍然会打开聊天或展开箭头。
  const dock = floatingDockRef.value;
  if (!dock) return;
  const rect = dock.getBoundingClientRect();
  const current = floatingDockOffset.value;
  floatingDragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: current.x,
    originY: current.y,
    originLeft: rect.left,
    originTop: rect.top,
    width: rect.width,
    height: rect.height,
    moved: false,
    captured: false
  };
  suppressFloatingClick = false;
  window.addEventListener('pointermove', moveFloatingDockDrag);
  window.addEventListener('pointerup', stopFloatingDockDrag);
  window.addEventListener('pointercancel', stopFloatingDockDrag);
};
const moveFloatingDockDrag = (event: PointerEvent) => {
  const state = floatingDragState;
  if (!state || event.pointerId !== state.pointerId) return;
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  if (!state.moved && Math.hypot(dx, dy) < 5) return;
  state.moved = true;
  suppressFloatingClick = true;
  if (!state.captured) {
    floatingDockRef.value?.setPointerCapture?.(event.pointerId);
    state.captured = true;
  }
  const baseLeft = state.originLeft - state.originX;
  const baseTop = state.originTop - state.originY;
  const minLeft = 0;
  const minTop = 8;
  const maxLeft = Math.max(minLeft, window.innerWidth - state.width);
  const maxTop = Math.max(minTop, window.innerHeight - state.height - 8);
  const left = Math.min(maxLeft, Math.max(minLeft, state.originLeft + dx));
  const top = Math.min(maxTop, Math.max(minTop, state.originTop + dy));
  floatingDockOffset.value = { x: left - baseLeft, y: top - baseTop };
  event.preventDefault();
};
const stopFloatingDockDrag = (event: PointerEvent) => {
  const state = floatingDragState;
  if (!state || event.pointerId !== state.pointerId) return;
  floatingDragState = null;
  window.removeEventListener('pointermove', moveFloatingDockDrag);
  window.removeEventListener('pointerup', stopFloatingDockDrag);
  window.removeEventListener('pointercancel', stopFloatingDockDrag);
  window.removeEventListener('pointermove', moveModalDrag);
  window.removeEventListener('pointerup', stopModalDrag);
  window.removeEventListener('pointercancel', stopModalDrag);
  if (suppressFloatingClickTimer) window.clearTimeout(suppressFloatingClickTimer);
  if (state.moved) suppressFloatingClickTimer = window.setTimeout(() => {
    suppressFloatingClick = false;
    suppressFloatingClickTimer = undefined;
  }, 260);
  else suppressFloatingClick = false;
  if (state.moved) {
    const rect = floatingDockRef.value?.getBoundingClientRect();
    if (rect) {
      const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
      floatingDockSide.value = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
      floatingDockVerticalRatio.value = maxTop > 8 ? Math.min(1, Math.max(0, (rect.top - 8) / (maxTop - 8))) : 0.5;
      saveFloatingDockPlacement();
      void constrainFloatingDock();
    }
  }
};
const modalOffsetFor = (kind: 'social' | 'team') => kind === 'social' ? floatingSocialPanelOffset.value : teamPanelOffset.value;
const setModalOffset = (kind: 'social' | 'team', offset: { x: number; y: number }) => {
  if (kind === 'social') floatingSocialPanelOffset.value = offset;
  else teamPanelOffset.value = offset;
};
const floatingSocialPanelStyle = computed(() => ({
  '--modal-x': `${floatingSocialPanelOffset.value.x}px`,
  '--modal-y': `${floatingSocialPanelOffset.value.y}px`,
  '--chat-height': `${floatingSocialHeight.value}px`
} as Record<string, string>));
const teamPanelStyle = computed(() => ({
  '--modal-x': `${teamPanelOffset.value.x}px`,
  '--modal-y': `${teamPanelOffset.value.y}px`
} as Record<string, string>));
const startModalDrag = (kind: 'social' | 'team', event: PointerEvent) => {
  if (event.button !== 0 && event.pointerType !== 'touch') return;
  const target = kind === 'social' ? floatingSocialPanelRef.value : teamPanelRef.value;
  if (!target) return;
  const offset = modalOffsetFor(kind);
  modalDragState = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y, moved: false, captured: false };
  window.addEventListener('pointermove', moveModalDrag);
  window.addEventListener('pointerup', stopModalDrag);
  window.addEventListener('pointercancel', stopModalDrag);
};
const moveModalDrag = (event: PointerEvent) => {
  const state = modalDragState;
  if (!state || event.pointerId !== state.pointerId) return;
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  if (!state.moved && Math.hypot(dx, dy) < 5) return;
  state.moved = true;
  if (!state.captured) {
    const target = state.kind === 'social' ? floatingSocialPanelRef.value : teamPanelRef.value;
    target?.setPointerCapture?.(event.pointerId);
    state.captured = true;
  }
  setModalOffset(state.kind, { x: state.originX + dx, y: state.originY + dy });
  event.preventDefault();
};
const stopModalDrag = (event: PointerEvent) => {
  const state = modalDragState;
  if (!state || event.pointerId !== state.pointerId) return;
  modalDragState = null;
  window.removeEventListener('pointermove', moveModalDrag);
  window.removeEventListener('pointerup', stopModalDrag);
  window.removeEventListener('pointercancel', stopModalDrag);
};
const startSocialResize = (event: PointerEvent) => {
  if (event.button !== 0 && event.pointerType !== 'touch') return;
  const panel = floatingSocialPanelRef.value;
  const panelTop = panel?.getBoundingClientRect().top ?? 10;
  const minHeight = 320;
  const maxHeight = Math.max(minHeight, Math.min(760, window.innerHeight - panelTop - 12));
  const originHeight = panel?.getBoundingClientRect().height ?? floatingSocialHeight.value;
  floatingSocialHeight.value = originHeight;
  socialResizeState = { pointerId: event.pointerId, startY: event.clientY, originHeight, originOffsetY: floatingSocialPanelOffset.value.y, minHeight, maxHeight, captured: false };
  window.addEventListener('pointermove', moveSocialResize);
  window.addEventListener('pointerup', stopSocialResize);
  window.addEventListener('pointercancel', stopSocialResize);
  event.preventDefault();
};
const moveSocialResize = (event: PointerEvent) => {
  const state = socialResizeState;
  if (!state || event.pointerId !== state.pointerId) return;
  if (!state.captured) {
    (event.currentTarget instanceof HTMLElement ? event.currentTarget : floatingSocialPanelRef.value)?.setPointerCapture?.(event.pointerId);
    state.captured = true;
  }
  const nextHeight = Math.min(state.maxHeight, Math.max(state.minHeight, state.originHeight + event.clientY - state.startY));
  const heightDelta = nextHeight - state.originHeight;
  floatingSocialHeight.value = nextHeight;
  // 面板以中心点定位；补偿一半高度变化，使顶部保持原位，只移动底边。
  floatingSocialPanelOffset.value = { x: floatingSocialPanelOffset.value.x, y: state.originOffsetY + heightDelta / 2 };
  event.preventDefault();
};
const stopSocialResize = (event: PointerEvent) => {
  const state = socialResizeState;
  if (!state || event.pointerId !== state.pointerId) return;
  socialResizeState = null;
  window.removeEventListener('pointermove', moveSocialResize);
  window.removeEventListener('pointerup', stopSocialResize);
  window.removeEventListener('pointercancel', stopSocialResize);
};
const focusFloatingChannel = (panelName: FloatingSocialPanel) => {
  if (panelName === 'chat') {
    selectChannel('world');
    return;
  }
  const channel = panelName === 'party'
    ? recruitmentChannel.value
    : channels.value.find(item => item.type === 'friend');
  if (channel) selectChannel(channel.id);
  else messages.value = [];
};
const openFloatingSocial = (panelName: FloatingSocialPanel) => {
  floatingSocialOpen.value = panelName;
  if (panelName === 'party') floatingDockExpanded.value = true;
  if (panelName === 'party') void refreshPartyData();
  focusFloatingChannel(panelName);
  void loadSocial().then(() => {
    if (floatingSocialOpen.value === panelName) focusFloatingChannel(panelName);
  });
};
const toggleFloatingSocial = (panelName: 'chat' | 'party') => {
  if (suppressFloatingClick) {
    suppressFloatingClick = false;
    return;
  }
  if (floatingSocialOpen.value === panelName) {
    closeFloatingSocial();
    return;
  }
  teamPopupOpen.value = false;
  openFloatingSocial(panelName);
};
const toggleTeamPopup = () => {
  if (suppressFloatingClick) {
    suppressFloatingClick = false;
    return;
  }
  if (teamPopupOpen.value) {
    teamPopupOpen.value = false;
    return;
  }
  floatingSocialOpen.value = null;
  teamPopupOpen.value = true;
  void loadSocial();
  void refreshPartyData();
};
const closeFloatingSocial = () => { floatingSocialOpen.value = null; };
const closeAllFloatingSocial = () => { floatingSocialOpen.value = null; teamPopupOpen.value = false; };
const constrainFloatingDock = async () => {
  await nextTick();
  const dock = floatingDockRef.value;
  if (!dock) return;
  const rect = dock.getBoundingClientRect();
  const current = floatingDockOffset.value;
  const baseLeft = rect.left - current.x;
  const baseTop = rect.top - current.y;
  const left = floatingDockSide.value === 'left' ? 0 : Math.max(0, window.innerWidth - rect.width);
  const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
  const top = 8 + (maxTop - 8) * floatingDockVerticalRatio.value;
  if (Math.abs(left - rect.left) > 0.5 || Math.abs(top - rect.top) > 0.5) {
    floatingDockOffset.value = { x: left - baseLeft, y: top - baseTop };
  }
};
watch(floatingDockRef, dock => { if (dock) void constrainFloatingDock(); }, { flush: 'post' });
watch(floatingDockExpanded, () => { void constrainFloatingDock(); }, { flush: 'post' });
const toggleFloatingDock = () => {
  // 从箭头拖动后浏览器仍会派发 click；这次 click 不能把刚设置的状态
  // 又切换回去，否则用户会感觉箭头“点了没用”。
  if (suppressFloatingClick) {
    suppressFloatingClick = false;
    return;
  }
  floatingDockExpanded.value = !floatingDockExpanded.value;
  void constrainFloatingDock();
};

const currentChannel = computed(() => channels.value.find(channel => channel.id === activeChannel.value) ?? channels.value[0]);
const title = computed(() => ({ character: '角色档案', inventory: '我的背包', explore: '探索世界', social: '社交', world: '世界' }[tab.value]));
const pageEyebrow = computed(() => ({ character: 'ADVENTURER', inventory: 'INVENTORY', explore: 'EXPLORATION', social: 'SOCIAL', world: 'WORLD' }[tab.value]));
const characterSections: { id: CharacterSection; label: string; icon: string }[] = [
  { id: 'profile', label: '角色', icon: '♙' },
  { id: 'equipment', label: '装备', icon: '⚔' },
  { id: 'skills', label: '技能', icon: '✦' },
  { id: 'evolution', label: '进化', icon: '◇' }
];
type CharacterEquipmentEntry = PanelEquippedItem;
type CharacterSkillEntry = {
  id?: number;
  name?: string;
  level?: number;
  category?: string;
  tier?: string;
  quickSlot?: number | null;
  quick_slot?: number | null;
  passiveLinked?: boolean;
  passive_linked?: number;
  description?: string;
};
const characterData = computed(() => {
  const source = panel.value as (Panel & {
    skills?: { skillPoints?: number; passiveLinkLimit?: number; skills?: CharacterSkillEntry[]; discoveries?: CharacterSkillEntry[] };
    evolution?: { unlocked?: boolean; level?: number; title?: string; progress?: number; nextRequirement?: string };
  }) | null;
  return {
    equipment: source?.summary?.equipment ?? source?.equipment ?? [],
    skills: source?.skills?.skills ?? [],
    discoveries: source?.skills?.discoveries ?? [],
    skillPoints: Number(source?.skills?.skillPoints ?? 0),
    passiveLinkLimit: Number(source?.skills?.passiveLinkLimit ?? 0),
    evolution: source?.evolution ?? {
      unlocked: Number(panel.value?.summary?.realmStage ?? 0) >= 3,
      level: Number(panel.value?.summary?.realmStage ?? 1),
      title: Number(panel.value?.summary?.realmStage ?? 0) >= 3 ? `进化阶段 ${panel.value?.summary?.realmStage}` : '初始形态',
      progress: 0,
      nextRequirement: Number(panel.value?.summary?.realmStage ?? 0) >= 3 ? '继续积累进化证据' : '完成开化后开放'
    },
    portrait: source?.summary?.portrait
  };
});
const equipmentSlotDefinitions = [
  { id: 'weapon', label: '主手', icon: '⚔' },
  { id: 'offhand', label: '副手', icon: '◈' },
  { id: 'shoulder', label: '头肩', icon: '◇' },
  { id: 'upper', label: '上装', icon: '▣' },
  { id: 'waist', label: '腰部', icon: '⌁' },
  { id: 'lower', label: '下装', icon: '▤' },
  { id: 'feet', label: '脚部', icon: '⌂' },
  { id: 'necklace', label: '项链', icon: '○' },
  { id: 'bracelet', label: '手镯', icon: '◎' },
  { id: 'ring', label: '戒指', icon: '◌' }
];
const equipmentForSlot = (slot: string) => characterData.value.equipment.find(item => item.slot === slot);
const equipmentRarityClass = (item?: CharacterEquipmentEntry) => {
  const rarityClass: Record<string, string> = {
    普通: 'common', 优秀: 'excellent', 精良: 'fine', 稀有: 'rare', 传说: 'legendary', 史诗: 'epic', 神器: 'artifact'
  };
  return `equipment-rarity-${rarityClass[String(item?.rarity ?? '')] ?? (item ? 'common' : 'empty')}`;
};
const equipmentArmorSlots = equipmentSlotDefinitions.filter(item => ['shoulder', 'upper', 'waist', 'lower', 'feet'].includes(item.id));
const equipmentCombatSlots = equipmentSlotDefinitions.filter(item => ['weapon', 'offhand', 'necklace', 'bracelet', 'ring'].includes(item.id));
const selectedEquipment = ref<CharacterEquipmentEntry | null>(null);
const activeAttributeHelp = ref<string | null>(null);
const combatStatDefinitions = [
  { key: 'physicalAttack', label: '物攻' }, { key: 'magicAttack', label: '魔攻' },
  { key: 'physicalDefense', label: '物防' }, { key: 'magicDefense', label: '魔防' },
  { key: 'accuracy', label: '命中' }, { key: 'evasion', label: '闪避' },
  { key: 'critRateBp', label: '暴击' }, { key: 'critDamageReductionBp', label: '暴免' },
  { key: 'critDamageBp', label: '暴伤' }, { key: 'critResistBp', label: '暴抗' },
  { key: 'tenacityPierce', label: '破韧' }, { key: 'tenacity', label: '韧性' },
  { key: 'speed', label: '速度' }
] as const;
type CombatStatKey = typeof combatStatDefinitions[number]['key'];
const combatStatValue = (key: CombatStatKey) => Number(panel.value?.summary?.[key] ?? 0);
const baseAttributeDefinitions = [
  { key: 'constitution', label: '体质' }, { key: 'spirit', label: '精神' },
  { key: 'strength', label: '力量' }, { key: 'intelligence', label: '智力' },
  { key: 'agility', label: '敏捷' }, { key: 'perception', label: '感知' }
] as const;
const elementNames = ['水', '火', '木', '土', '风', '冰', '雷', '光', '暗'];
const baseAttributeValue = (key: typeof baseAttributeDefinitions[number]['key']) => Number(panel.value?.summary?.attributes?.[key] ?? 0);
const formatAttributeValue = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const attributeHelpDescriptions: Record<string, string> = {
  constitution: '大幅影响生命上限（每点基础权重 19.9），中幅影响物防、暴抗与韧性，小幅影响攻防、命中、闪避、暴击与暴伤。',
  spirit: '大幅影响魔力上限（每点基础权重 17.8）、魔防与暴免，中幅影响韧性，小幅影响攻防、命中、闪避、暴击与暴伤。',
  strength: '大幅影响物攻（每点基础权重 2），中幅影响物防与暴伤，小幅影响魔攻、魔防、命中、闪避、暴击、暴抗、暴免与破韧。',
  intelligence: '大幅影响魔攻（每点基础权重 2），中幅影响命中、闪避与暴伤，小幅影响物攻、魔防、暴击、暴抗、暴免与破韧，并参与魔力上限计算。',
  agility: '大幅影响命中、闪避（每点基础权重 4.4）与速度（每点 8.6），中幅影响暴击，小幅影响攻防、暴伤、暴抗与暴免。',
  perception: '大幅影响暴击与暴伤（每点基础权重 4.4），中幅影响命中、闪避与破韧，小幅影响暴抗、暴免、韧性及攻防。',
  physicalAttack: '影响物理攻击的基础伤害；实际伤害还会经过技能倍率，并与目标物防进行结算。',
  magicAttack: '影响魔法攻击的基础伤害，也会参与部分魔法治疗量计算；实际效果还会受技能倍率与目标魔防影响。',
  physicalDefense: '降低受到的物理伤害；伤害结算使用攻击² ÷（攻击＋物防），并会受到破防效果影响。',
  magicDefense: '降低受到的魔法伤害；魔法攻击会与魔防进行同样的防御结算，并会受到魔法穿透影响。',
  accuracy: '与目标闪避进行对抗，基础命中概率为 1 − 0.5^(命中÷闪避)；技能与状态还可能追加命中修正。',
  evasion: '与攻击者命中进行对抗，降低对方的基础命中概率；自身闪避修正与控制状态可能继续改变最终结果。',
  critRateBp: '与目标暴抗进行对抗，基础暴击概率为 1 − 0.5^(暴击÷暴抗)；职业、装备和状态可追加暴击修正。',
  critDamageReductionBp: '暴免用于降低受到的暴击伤害；它参与暴伤对抗，数值越高，暴击额外伤害越低。',
  critDamageBp: '暴伤决定暴击的额外伤害；与目标暴免对抗后，额外倍率为 2×(1−0.5^(暴伤÷暴免))。',
  critResistBp: '暴抗用于降低被暴击的概率；它与攻击者暴击进行对抗，数值越高越不容易受到暴击。',
  tenacityPierce: '破韧用于压制目标韧性；控制系数为 min(1, 2×破韧÷(破韧＋韧性))，并影响控制、持续伤害与负面效果强度。',
  tenacity: '韧性用于抵抗破韧；它会降低被控制、持续伤害和负面效果的最终强度。',
  speed: '决定回合行动顺序；基础速度为 100＋敏捷×8.6，战斗中的减速、加速和状态会继续修正它。',
  damageBonusPct: '提高造成的最终伤害百分比，通常在攻击、防御和技能倍率结算后参与修正。',
  damageReductionPct: '降低受到的最终伤害百分比，通常在基础攻击与防御结算后参与修正。',
  magicDamagePct: '提高魔法类伤害的百分比，只作用于魔法攻击或魔法技能。',
  physicalSkillDamagePct: '提高物理技能造成的伤害百分比。',
  magicSkillDamagePct: '提高魔法技能造成的伤害百分比。',
  lightSkillBonusPct: '提高光属性技能造成的伤害百分比。',
  criticalDamageBonusPct: '提高暴击后的额外伤害百分比。',
  physicalCriticalFinalDamagePct: '额外提高物理攻击暴击后的最终伤害百分比。',
  physicalDamageReductionPct: '额外降低受到的物理伤害百分比。',
  magicDamageReductionPct: '额外降低受到的魔法伤害百分比。',
  ignoreDefensePct: '按比例忽略目标防御，降低目标防御值后再进行伤害计算。',
  lifestealPct: '按造成的有效伤害比例恢复自身生命。',
  hpRegenPct: '提高生命恢复效果的百分比。',
  mpRegenPct: '提高魔力恢复效果的百分比。',
  minimumHitRatePct: '设置最终命中率下限，避免命中率低于该百分比。',
  actualHitRatePct: '直接加入最终命中率的修正百分比。',
  physicalActualHitRatePct: '直接加入物理攻击最终命中率的修正百分比。',
  chantSpeedPct: '提高技能吟唱速度，缩短需要吟唱的技能准备时间。',
  chantReduction: '减少技能吟唱回合数。',
  magicChantBonus: '提高魔法技能吟唱相关的加成。',
  manaCostReduction: '减少技能施放时需要消耗的魔力。',
  elementMastery: '提高对应元素造成的伤害或元素效果强度；具体倍率由技能和元素规则决定。',
  elementResistance: '降低受到对应元素伤害或元素效果的强度。'
};
const attributeHelpText = (key: string) => attributeHelpDescriptions[key] ?? '该属性会参与角色的战斗计算，装备、技能和被动效果可能继续叠加。';
const toggleAttributeHelp = (key: string) => { activeAttributeHelp.value = activeAttributeHelp.value === key ? null : key; };
const closeAttributeHelp = () => { activeAttributeHelp.value = null; };
const elementMasteryEntries = computed(() => elementNames.map(element => [element, Number(panel.value?.summary?.elementMastery?.[element] ?? 0)] as const));
const elementResistanceEntries = computed(() => elementNames.map(element => [element, Number(panel.value?.summary?.elementResistance?.[element] ?? 0)] as const));
const extraAttributeMeta: Record<string, { label: string; unit: string; inverse?: boolean }> = {
  damageBonusPct: { label: '伤害', unit: '%' }, damageReductionPct: { label: '减伤', unit: '%' }, magicDamagePct: { label: '魔伤', unit: '%' }, physicalSkillDamagePct: { label: '物技', unit: '%' },
  magicSkillDamagePct: { label: '魔技', unit: '%' }, lightSkillBonusPct: { label: '光技', unit: '%' }, criticalDamageBonusPct: { label: '暴伤加', unit: '%' }, physicalCriticalFinalDamagePct: { label: '物暴伤', unit: '%' },
  physicalDamageReductionPct: { label: '物减', unit: '%' }, magicDamageReductionPct: { label: '魔减', unit: '%' }, ignoreDefensePct: { label: '破防', unit: '%' }, lifestealPct: { label: '吸血', unit: '%' },
  hpRegenPct: { label: '回生', unit: '%' }, mpRegenPct: { label: '回魔', unit: '%' }, minimumHitRatePct: { label: '最低命中', unit: '%' }, actualHitRatePct: { label: '实命', unit: '%' }, physicalActualHitRatePct: { label: '物实命', unit: '%' },
  chantSpeedPct: { label: '吟速', unit: '%' }, chantReduction: { label: '吟唱', unit: '回', inverse: true }, magicChantBonus: { label: '魔吟', unit: '回' }, manaCostReduction: { label: '耗蓝', unit: '', inverse: true }
};
const extraAttributeEntries = computed(() => Object.entries(panel.value?.summary?.extraAttributes ?? {}).filter(([, value]) => Number(value) !== 0).map(([key, value]) => {
  const meta = extraAttributeMeta[key] ?? { label: key, unit: '' };
  const actual = meta.inverse ? -Number(value) : Number(value);
  return { key, label: meta.label, value: actual, unit: meta.unit };
}));
const showStoryGuide = computed(() => Boolean(storyGuide.value));
const hpPercent = computed(() => panel.value?.summary ? Math.min(100, Math.max(0, panel.value.summary.hp.current / Math.max(1, panel.value.summary.hp.max) * 100)) : 0);
const mpPercent = computed(() => panel.value?.summary ? Math.min(100, Math.max(0, panel.value.summary.mp.current / Math.max(1, panel.value.summary.mp.max) * 100)) : 0);
const mapCurrent = computed<MapPosition>(() => {
  const current = panel.value?.mapData?.current;
  const position = panel.value?.summary?.position;
  return {
    name: current?.name ?? panel.value?.summary?.region ?? '未知区域',
    x: current?.x ?? position?.x ?? 0,
    y: current?.y ?? position?.y ?? 0,
    // 旧版面板可能只有 mapData.current 的 x/y；移动必须沿用角色真实 z 层。
    z: current?.z ?? position?.z ?? 0
  };
});
const mapBounds = computed<MapBounds | undefined>(() => {
  const current = panel.value?.mapData?.maps?.find(map => map.isCurrent);
  return current?.bounds;
});
const formatMiningDuration = (seconds: number) => {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (value < 60) return `${value} 秒`;
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
};
const mapActionLock = computed<MapActionLock | null>(() => {
  const mining = panel.value?.mining;
  if (mining) return {
    title: `正在开采：${mining.name}`,
    detail: `${mining.kind} · 同坐标资源采尽后会自动继续`,
    countdown: formatMiningDuration(miningRemaining.value),
    stopLabel: '停止开采',
    stopDisabled: busy.value
  };
  if (travelPlanningTarget.value) return {
    title: `正在规划前往${travelPlanningTarget.value}`,
    detail: '正在计算路线，请稍候'
  };
  const travel = panel.value?.summary?.travel;
  if (travel) return {
    title: travel.activityType === 'hunt' ? `正在寻怪：${travel.destination || '目标地点'}` : `正在前往${travel.destination || '目标地点'}`,
    detail: travel.activityType === 'hunt' ? '请等待寻怪完成，或停止本次行动' : '请等待抵达，或停止本次前往',
    countdown: formatMiningDuration(travelRemaining.value),
    stopLabel: travel.activityType === 'hunt' ? '停止寻怪' : '停止前往',
    stopDisabled: busy.value
  };
  return null;
});
const mapPoints = computed<ExploreMapPoint[]>(() => {
  const guildShopCodes = new Set(['guild_counter', 'world_tree_adventurer_guild', 'windbranch_guild', 'dragon_inn_counter']);
  const seenResourceCoordinates = new Set<string>();
  const points = (panel.value?.nearby?.points ?? []).filter(point => {
    if (point.type !== '矿脉' && point.type !== '植被' && point.type !== '资源') return true;
    const key = `${point.type}:${point.code ?? point.name}:${point.x}:${point.y}:${point.z ?? mapCurrent.value.z}`;
    if (seenResourceCoordinates.has(key)) return false;
    seenResourceCoordinates.add(key);
    return true;
  });
  return points.map(point => {
  const icon = point.type === '怪物' ? '◆' : point.type === 'NPC' || point.type === '域民' ? '☻' : point.type === '建筑' ? '⌂' : point.type === '资源' || point.type === '矿脉' ? '✦' : '•';
  const z = point.z;
  const atCurrent = point.x === mapCurrent.value.x && point.y === mapCurrent.value.y && (z === undefined || z === mapCurrent.value.z);
  const actions: ExploreMapPoint['actions'] = [];
  if (point.type === '怪物' && point.code) {
    if (!atCurrent) {
      if (point.observedOnly) {
        // 装备提供的额外感知只允许观察；先规划前往目标格，再从正常感知范围交互。
        actions.push({ id: 'travel', label: '前往', position: { x: point.x, y: point.y, z }, tone: 'primary' });
      } else {
        actions.push(
          { id: 'approach', label: '前往', command: `/前往目标 ${point.code}`, tone: 'primary' },
          { id: 'attack', label: '攻击', tone: 'danger' },
        );
      }
    } else {
      // H5 不复用 QQ 的“目标”按钮：QQ handler 会在锁定目标后启动自动战斗，
      // 网页必须显式打开手动战斗面板，避免未开启自动战斗时被后台推进回合。
      actions.push(
        { id: 'attack', label: '攻击', tone: 'danger' },
        { id: 'negotiate', label: '交涉', tone: 'soft' },
        { id: 'avoid', label: '躲避', tone: 'soft' },
      );
    }
  } else {
    if (!atCurrent) {
      const distance = Math.abs(point.x - mapCurrent.value.x) + Math.abs(point.y - mapCurrent.value.y);
      actions.push({ id: point.observedOnly || distance > mapMoveRange.value ? 'travel' : 'move', label: '前往', position: { x: point.x, y: point.y, z }, tone: 'primary' });
    }
    if (point.type === '资源' || point.type === '矿脉' || point.type === '植被') {
      // Nearby resource `code` is the item code (for display); the mine command
      // requires the concrete resource spawn id carried by interaction.id.
      const resourceId = Number(point.interaction?.id ?? point.code);
      if (Number.isSafeInteger(resourceId) && resourceId > 0 && atCurrent) {
        actions.push({ id: 'gather', label: '采集', resourceId, tone: 'primary' });
      }
    } else if (point.type === '地下入口' && point.code) {
      if (atCurrent) actions.push({ id: 'enter', label: '进入迷宫', command: `/下迷宫 ${point.code}`, tone: 'primary' });
    } else if (point.type === '建筑' && point.code === 'silver_bell_bank') {
      if (atCurrent) actions.push({ id: 'bank', label: '进入钱庄', tone: 'primary' });
    } else if (point.interaction) {
      if (atCurrent) actions.push({ id: 'interact', label: point.type === '建筑' ? '查看入口' : '互动', command: `/坐标互动 ${point.interaction.type} ${point.interaction.id}`, tone: 'primary' });
      if (atCurrent && point.type === '建筑' && point.code) actions.push({ id: 'enter', label: '进入', command: `/建筑进入 ${point.code}`, tone: 'soft' });
    }
    if (atCurrent && point.type === '建筑' && point.code && guildShopCodes.has(point.code)) {
      actions.push({ id: 'guildShop', label: '公会商店', tone: 'primary' });
    }
    if (atCurrent && point.type === '建筑' && point.code === 'bookshop') {
      actions.push({ id: 'bookshop', label: '进入书屋', tone: 'primary' });
    }
    if (atCurrent && point.type === '建筑' && point.code === 'baina_residence') {
      actions.push({ id: 'homeShop', label: '百纳居', tone: 'primary' });
    }
  }
  return {
    id: `${point.type}:${point.code ?? point.name}:${point.x}:${point.y}:${point.z ?? mapCurrent.value.z}`,
    code: point.code,
    name: point.name,
    type: point.type,
    icon,
    x: point.x,
    y: point.y,
    z,
    distance: point.distance,
    discovered: point.observedOnly !== true,
    interactable: actions.length > 0,
    description: point.observedOnly ? '这个目标还在感知边缘，可先规划路线前往。' : `位于 ${point.x}, ${point.y}，距离 ${point.distance} 格。${point.type === '建筑' && point.code && guildShopCodes.has(point.code) && point.code !== 'guild_counter' ? '首次使用公会商店，请先点“进入”登记到访。' : ''}`,
    ...(actions.length ? { actions } : {})
  };
  });
});
const mapMoveRange = computed(() => Math.max(1, Number(panel.value?.movement?.step ?? panel.value?.summary?.movementStep ?? 1)));
const mapSightRange = computed(() => Math.max(0, Number(panel.value?.nearby?.range ?? 0)));
const regionMap = computed(() => {
  const source = panel.value?.regionMap;
  const map = panel.value?.mapData;
  const current = map?.current;
  const members = source?.members ?? (map?.partyMembers ?? []).map(member => ({ id: String(member.id), name: member.name, x: member.x, y: member.y, z: member.z, regionCode: member.regionCode, regionName: member.regionName, isCurrent: member.isSelf }));
  const landmarks = [...(source?.landmarks ?? (map?.landmarks ?? []).map(landmark => ({ id: landmark.code, name: landmark.name, x: landmark.x, y: landmark.y, z: landmark.z, regionCode: landmark.regionCode, regionName: landmark.regionName, type: landmark.type })))];
  const regions = [...(source?.regions ?? (map?.maps ?? []).map(item => ({ code: item.code, name: item.name, danger: item.danger, isCurrent: item.isCurrent, current: item.isCurrent && current ? { x: current.x, y: current.y, z: current.z } : undefined })))];
  const purchaseTarget = homePurchaseSiteTarget.value;
  if (purchaseTarget) {
    if (!regions.some(region => region.code === purchaseTarget.regionCode)) regions.push({ code: purchaseTarget.regionCode, name: purchaseTarget.regionName });
    if (!landmarks.some(landmark => landmark.id === purchaseTarget.id)) landmarks.push({ id: purchaseTarget.id, name: purchaseTarget.name, x: purchaseTarget.x, y: purchaseTarget.y, z: purchaseTarget.z, regionCode: purchaseTarget.regionCode, regionName: purchaseTarget.regionName, type: '建筑' });
  }
  const mentorTarget = advancedMentorTarget.value;
  if (mentorTarget) {
    if (!regions.some(region => region.code === mentorTarget.regionCode)) regions.push({ code: mentorTarget.regionCode, name: '世界树' });
    if (!landmarks.some(landmark => landmark.id === mentorTarget.id)) landmarks.push({ id: mentorTarget.id, name: mentorTarget.name, x: mentorTarget.x, y: mentorTarget.y, z: mentorTarget.z, regionCode: mentorTarget.regionCode, regionName: '世界树', type: 'NPC' });
  }
  const focusedCodes = new Set([...(members ?? []).map(member => member.regionCode).filter(Boolean), ...(landmarks ?? []).map(landmark => landmark.regionCode).filter(Boolean)]);
  const currentRegionCode = source?.currentRegionCode ?? regions.find(region => region.isCurrent)?.code ?? '';
  return { currentRegionCode, regions: regions.filter(region => region.isCurrent || focusedCodes.has(region.code)), members, landmarks };
});
const openRegionMapSidebar = () => regionMapSidebarRef.value?.openSidebar();
type InventoryDisplayItem = (PanelInventoryStack & { instance?: false }) | (PanelInventoryInstance & { quantity: number; instance: true });
type InventoryFilterItem = { itemCategory?: string; itemType?: string; weaponType?: string | null; name?: string };
const armorInventoryCategories = new Set(['头肩', '头部', '头盔', '头冠', '帽', '护肩', '上装', '胸甲', '胸衣', '腰部', '下装', '腿铠', '护腿', '脚部', '鞋', '靴']);
const accessoryInventoryCategories = new Set(['项链', '手镯', '戒指', '耳环', '护符', '吊坠', '饰品']);
const weaponNamePatterns: readonly [RegExp, string][] = [
  [/拳刃|拳套|指虎/, '拳刃'],
  [/法书|魔导书|咒书|书籍/, '法书'],
  [/法球|魔球|灵球|宝珠/, '法球'],
  [/法杖|魔杖|权杖|手杖/, '法杖'],
  [/短刃|匕首|短剑/, '短刃'],
  [/长剑|大剑|太刀|巨剑/, '长剑'],
  [/盾牌|圣盾|护盾/, '盾牌'],
  [/弓弩|弩|长弓|短弓|弓/, '弓'],
  [/长枪|短枪|战枪|枪/, '长枪'],
  [/战斧|巨斧|斧/, '斧'],
  [/战锤|巨锤|锤/, '锤']
];
const inventoryEquipmentGroupFor = (item: InventoryFilterItem): Exclude<InventoryEquipmentGroup, '全部'> | null => {
  const category = String(item.itemCategory ?? '');
  if (category === '武器' || category === '副手') return '武器';
  if (armorInventoryCategories.has(category)) return '防具';
  if (accessoryInventoryCategories.has(category)) return '首饰';
  if (item.itemType !== 'equipment') return null;
  const text = `${item.name ?? ''} ${item.weaponType ?? ''}`;
  return weaponNamePatterns.some(([pattern]) => pattern.test(text)) ? '武器' : null;
};
const inventoryEquipmentSubtypeFor = (item: InventoryFilterItem) => {
  const group = inventoryEquipmentGroupFor(item);
  if (group === '武器') {
    const weaponType = String(item.weaponType ?? '').trim();
    if (weaponType) return weaponType;
    const text = String(item.name ?? '');
    const matched = weaponNamePatterns.find(([pattern]) => pattern.test(text));
    if (matched) return matched[1];
  }
  return String(item.itemCategory ?? '') || '其他';
};
const inventoryCategoryMatches = (item: InventoryFilterItem, category: InventoryCategory) => {
  if (category === '全部') return true;
  if (category === '装备') return item.itemType === 'equipment' || inventoryEquipmentGroupFor(item) !== null;
  if (category === '道具') return item.itemType === 'consumable';
  return item.itemType === 'material';
};
const inventoryEquipmentGroupMatches = (item: InventoryFilterItem) => inventoryEquipmentGroup.value === '全部' || inventoryEquipmentGroupFor(item) === inventoryEquipmentGroup.value;
const inventoryItems = computed<InventoryDisplayItem[]>(() => {
  const inventory = panel.value?.inventory;
  if (!inventory) return [];
  const category = inventoryCategory.value;
  const matches = (item: InventoryFilterItem) => inventoryCategoryMatches(item, category) && (category !== '装备' || inventoryEquipmentGroupMatches(item));
  const subcategory = inventorySubcategory.value;
  const withSubcategory = (item: InventoryFilterItem) => matches(item) && (subcategory === '全部' || inventoryEquipmentSubtypeFor(item) === subcategory);
  const stacked = (inventory.stacked ?? []).filter(withSubcategory).map(item => ({ ...item, instance: false as const }));
  const instances = (inventory.instances ?? []).filter(item => (category === '全部' || category === '装备') && withSubcategory(item)).map(item => ({ ...item, quantity: 1, instance: true as const }));
  return [...stacked, ...instances];
});
const inventorySubcategories = computed(() => {
  const inventory = panel.value?.inventory;
  if (!inventory || inventoryCategory.value === '全部') return ['全部'];
  const values = new Set<string>();
  const addItem = (item: InventoryFilterItem) => {
    if (!inventoryCategoryMatches(item, inventoryCategory.value)) return;
    if (inventoryCategory.value === '装备' && !inventoryEquipmentGroupMatches(item)) return;
    const subtype = inventoryEquipmentSubtypeFor(item);
    if (subtype) values.add(subtype);
  };
  for (const item of inventory.stacked ?? []) addItem(item);
  for (const item of inventory.instances ?? []) addItem(item);
  return ['全部', ...Array.from(values).sort((a, b) => a.localeCompare(b, 'zh-CN'))];
});
const battleState = computed<BattleState | null>(() => {
  const source = panel.value?.battle;
  if (!panel.value?.inBattle || !source) return null;
  const asIds = (values?: number[]) => values?.map(String);
  const ownMember = source.members?.find(member => member.id === source.characterId);
  const allies = (source.members ?? []).map(member => ({
    id: String(member.id), name: member.name, role: member.companion ? '伙伴' : '冒险者', hp: { current: Number(member.hp), max: Number(member.hpMax) }, mp: { current: Number(member.mp ?? 0), max: Number(member.mpMax ?? 0) }, defeated: Boolean(member.defeated), active: member.id === source.characterId && !member.pending && !member.defeated, status: member.statusText ? [member.statusText] : []
  }));
  const enemies = (source.targets ?? []).map(target => ({
    id: String(target.id), name: target.name, level: target.level ?? undefined, role: target.identified === false ? '未知目标' : target.isBossComponent ? '首领部位' : target.isBoss ? '首领' : '敌对目标', hp: { current: Number.isFinite(Number(target.hp)) ? Number(target.hp) : 0, max: Number.isFinite(Number(target.hpMax)) ? Number(target.hpMax) : 1 }, mp: { current: Number.isFinite(Number(target.mp)) ? Number(target.mp) : 0, max: Number.isFinite(Number(target.mpMax)) ? Number(target.mpMax) : 0 }, unknownHp: target.identified === false || typeof target.hp === 'string', defeated: Boolean(target.defeated), active: Number(source.selectedTargetId ?? 0) === Number(target.id), status: target.identified === false ? [] : [target.warning, target.breakSummary, target.statusText].filter((value): value is string => Boolean(value))
  }));
  const actions: BattleAction[] = [
    { id: 'attack', label: '普通攻击', category: 'normal', icon: '⚔', targeting: 'enemy', allowedTargets: { enemy: asIds(source.selectableEnemyIds) }, description: '选择敌方目标' },
    { id: 'defend', label: '防御', category: 'normal', icon: '◇', targeting: 'none', description: '本回合防御' },
    { id: 'escape', label: source.mode === 'spar' ? '认输' : '撤离', category: 'normal', icon: '↗', targeting: 'none', description: source.mode === 'spar' ? '结束切磋' : '尝试离开战斗' }
  ];
  for (const skill of source.quickSkills ?? []) {
    const targeting = skill.targeting ?? 'enemy';
    const targetIds = skill.targetIds ?? (targeting === 'ally' ? source.selectableAllyIds : source.selectableEnemyIds);
    actions.push({ id: `skill:${skill.slot}`, label: `${'①②③④'[skill.slot - 1] ?? skill.slot} ${skill.name}`, category: 'skill', icon: '✧', targeting, allowedTargets: { [targeting === 'ally' ? 'ally' : 'enemy']: asIds(targetIds) }, cost: skill.requiresSpecialInput ? undefined : `基础 ${skill.baseManaCost} MP${(skill.targetCount ?? 0) > 1 ? ' · 其余目标自动选取' : ''}`, cooldown: skill.cooldownRemaining, description: skill.requiresSpecialInput ? '需要专用选择，暂不可在此施放' : undefined, disabled: skill.cooldownRemaining > 0 || Boolean(skill.requiresSpecialInput) || (targeting !== 'none' && targetIds?.length === 0) });
  }
  for (const skill of source.advancedSkills ?? []) {
    const targeting = skill.targeting ?? 'enemy';
    const targetIds = skill.targetIds ?? (targeting === 'ally' ? source.selectableAllyIds : source.selectableEnemyIds);
    actions.push({ id: `advanced:${skill.id}`, label: skill.name, category: 'skill', icon: '✦', targeting, allowedTargets: { [targeting === 'ally' ? 'ally' : 'enemy']: asIds(targetIds) }, cost: skill.requiresSpecialInput ? undefined : `基础 ${skill.baseManaCost ?? 0} MP${(skill.targetCount ?? 0) > 1 ? ' · 其余目标自动选取' : ''}`, cooldown: skill.cooldownRemaining, description: skill.requiresSpecialInput ? '需要专用选择，暂不可在此施放' : undefined, disabled: (skill.cooldownRemaining ?? 0) > 0 || Boolean(skill.requiresSpecialInput) || (targeting !== 'none' && targetIds?.length === 0) });
  }
  if (source.mode !== 'spar') {
    for (const item of source.quickItems ?? []) actions.push({ id: `item:${item.slot}`, label: `${'①②③④'[item.slot - 1] ?? item.slot} ${item.name}`, category: 'item', icon: '✚', targeting: item.targeting, allowedTargets: { [item.targeting === 'ally' ? 'ally' : 'enemy']: asIds(item.targetIds) }, description: `持有 ${item.quantity}`, disabled: !item.usable || (item.targeting !== 'none' && item.targetIds?.length === 0) });
    for (const device of source.deviceSlots ?? []) for (const skill of device.skills) {
      const needsCharge = device.currentEnergy < skill.energyCost;
      const targeting = needsCharge || ['self', 'all_allies', 'all_enemies'].includes(skill.targetScope) ? 'none' : skill.targetScope === 'any' ? 'any' : skill.targetScope === 'ally' ? 'ally' : 'enemy';
      actions.push({ id: `device:${device.slot}:${skill.code}`, label: `${device.deviceName}·${skill.name}`, category: 'special', icon: '✺', targeting, allowedTargets: { ally: asIds(skill.allyTargetIds), enemy: asIds(skill.enemyTargetIds) }, description: needsCharge ? `能量 ${device.currentEnergy}/${device.maxEnergy}，本回合充能` : `消耗 ${skill.energyCost} 能量`, disabled: !skill.ready || (targeting !== 'none' && !skill.allyTargetIds?.length && !skill.enemyTargetIds?.length) });
    }
  }
  if (source.canLeafAnchor) actions.push({ id: 'anchor', label: '重新锚定', category: 'special', icon: '✥', targeting: 'none', description: '本场仅可使用一次' });
  const waiting = ownMember?.pending || source.canAct === false;
  return { revision: `${source.sessionId ?? ''}:${source.turn ?? 0}:${Boolean(source.bonusPhase)}`, title: source.mode === 'pvp' ? '玩家对战' : source.mode === 'spar' ? '切磋' : '野外遭遇战', round: Number(source.turn ?? 1), phase: waiting ? 'waiting' : 'player', turnLabel: ownMember?.pending ? '已提交行动，等待队友' : waiting ? '等待战斗推进' : '轮到你行动', statusText: '选择行动；需要指定目标时，再点击队伍卡片。', allies, enemies, actions, log: battleLog.value };
});
watch(() => panel.value?.battle?.sessionId, (next, previous) => { if (next !== previous) battleLog.value = []; });

const setError = (value: unknown) => {
  error.value = api.userFacingErrorMessage(value);
  if (!api.token()) {
    loggedIn.value = false;
    panel.value = null;
  }
};
const currentAuthRequest = () => ({ generation: authGeneration, token: api.token() });
const isCurrentAuthRequest = (request: { generation: number; token: string }) => request.generation === authGeneration && request.token !== '' && api.token() === request.token;
const loadPanel = async () => {
  const request = currentAuthRequest();
  if (!request.token) return;
  const version = ++panelRequestVersion;
  try {
    const nextPanel = await api.panel();
    if (isCurrentAuthRequest(request) && version === panelRequestVersion) panel.value = nextPanel;
  }
  catch (e) { if (isCurrentAuthRequest(request) && version === panelRequestVersion) setError(e); }
};
const mergeNotifications = (current: WebNotification[], incoming: WebNotification[]) => {
  const byId = new Map<number, WebNotification>();
  for (const item of [...current, ...incoming]) byId.set(item.id, item);
  return Array.from(byId.values()).sort((a, b) => b.id - a.id);
};
const resetNotificationState = () => {
  notificationOpen.value = false;
  notificationItems.value = [];
  notificationUnreadCount.value = 0;
  notificationLoading.value = false;
  notificationLoadingMore.value = false;
  notificationHasMore.value = false;
  notificationBeforeId.value = null;
  notificationError.value = '';
  notificationMarkingReadId.value = null;
  latestNotificationId = 0;
  notificationSyncing = false;
  mailItems.value = [];
  mailUnreadCount.value = 0;
  mailFilter.value = 'all';
  mailLoading.value = false;
  mailLoadingMore.value = false;
  mailHasMore.value = false;
  mailBeforeId.value = null;
  mailError.value = '';
  mailDetail.value = null;
  mailDetailLoading.value = false;
  mailActionBusy.value = false;
  mailLoadVersion += 1;
  mailDetailVersion += 1;
};
const loadNotifications = async () => {
  const request = currentAuthRequest();
  if (!request.token || notificationLoading.value) return;
  notificationLoading.value = true;
  notificationError.value = '';
  try {
    const page = await api.notifications();
    if (!isCurrentAuthRequest(request)) return;
    const hadItems = notificationItems.value.length > 0;
    notificationItems.value = mergeNotifications(notificationItems.value, page.items);
    notificationUnreadCount.value = page.unreadCount;
    latestNotificationId = Math.max(latestNotificationId, page.items[0]?.id ?? 0);
    if (!hadItems) {
      notificationHasMore.value = page.hasMore;
      notificationBeforeId.value = page.nextBeforeId;
    }
  } catch (e) {
    if (isCurrentAuthRequest(request) && notificationOpen.value) notificationError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request)) notificationLoading.value = false;
  }
};
const loadOlderNotifications = async () => {
  const request = currentAuthRequest();
  const beforeId = notificationBeforeId.value;
  if (!request.token || !beforeId || notificationLoadingMore.value || !notificationHasMore.value) return;
  notificationLoadingMore.value = true;
  notificationError.value = '';
  try {
    const page = await api.notifications(beforeId);
    if (!isCurrentAuthRequest(request)) return;
    notificationItems.value = mergeNotifications(notificationItems.value, page.items);
    notificationUnreadCount.value = page.unreadCount;
    notificationHasMore.value = page.hasMore;
    notificationBeforeId.value = page.nextBeforeId;
  } catch (e) {
    if (isCurrentAuthRequest(request)) notificationError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request)) notificationLoadingMore.value = false;
  }
};
const syncNotificationChanges = async () => {
  const request = currentAuthRequest();
  if (!request.token || notificationSyncing) return;
  if (!latestNotificationId) { await loadNotifications(); return; }
  notificationSyncing = true;
  try {
    let afterId = latestNotificationId;
    for (let page = 0; page < 10; page += 1) {
      const result = await api.notificationChanges(afterId);
      if (!isCurrentAuthRequest(request)) return;
      notificationItems.value = mergeNotifications(notificationItems.value, result.items);
      notificationUnreadCount.value = result.unreadCount;
      afterId = result.nextAfterId;
      latestNotificationId = Math.max(latestNotificationId, afterId);
      if (!result.hasMore) break;
    }
  } catch (e) {
    if (isCurrentAuthRequest(request) && notificationOpen.value) notificationError.value = api.userFacingErrorMessage(e);
  } finally { notificationSyncing = false; }
};
const loadNotificationUnread = async () => {
  const request = currentAuthRequest();
  if (!request.token) return;
  try {
    const result = await api.notificationUnread();
    if (isCurrentAuthRequest(request)) notificationUnreadCount.value = result.unreadCount;
  } catch { /* 通知角标读取失败不阻断游戏操作。 */ }
};
const mergeGameMails = (current: GameMail[], incoming: GameMail[]) => {
  const byId = new Map<number, GameMail>();
  for (const item of [...current, ...incoming]) byId.set(item.id, item);
  return Array.from(byId.values()).sort((a, b) => b.id - a.id);
};
const loadGameMails = async () => {
  const request = currentAuthRequest();
  const filter = mailFilter.value;
  if (!request.token) return;
  const version = ++mailLoadVersion;
  mailLoading.value = true;
  mailError.value = '';
  try {
    const page = await api.gameMails(filter);
    if (!isCurrentAuthRequest(request) || mailFilter.value !== filter || version !== mailLoadVersion) return;
    mailItems.value = page.items;
    mailUnreadCount.value = page.unreadCount;
    mailHasMore.value = page.hasMore;
    mailBeforeId.value = page.nextBeforeId;
  } catch (e) {
    if (isCurrentAuthRequest(request) && mailFilter.value === filter && version === mailLoadVersion) mailError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request) && version === mailLoadVersion) mailLoading.value = false;
  }
};
const loadOlderGameMails = async () => {
  const request = currentAuthRequest();
  const filter = mailFilter.value;
  const beforeId = mailBeforeId.value;
  if (!request.token || !beforeId || mailLoadingMore.value || !mailHasMore.value) return;
  mailLoadingMore.value = true;
  mailError.value = '';
  try {
    const page = await api.gameMails(filter, beforeId);
    if (!isCurrentAuthRequest(request) || mailFilter.value !== filter) return;
    mailItems.value = mergeGameMails(mailItems.value, page.items);
    mailUnreadCount.value = page.unreadCount;
    mailHasMore.value = page.hasMore;
    mailBeforeId.value = page.nextBeforeId;
  } catch (e) {
    if (isCurrentAuthRequest(request) && mailFilter.value === filter) mailError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request)) mailLoadingMore.value = false;
  }
};
const selectGameMailFilter = (filter: GameMailFilter) => {
  mailFilter.value = filter;
  mailItems.value = [];
  mailDetail.value = null;
  mailBeforeId.value = null;
  mailHasMore.value = false;
  void loadGameMails();
};
const loadGameMailDetail = async (id: number) => {
  const request = currentAuthRequest();
  if (!request.token) return;
  const version = ++mailDetailVersion;
  mailDetail.value = null;
  mailDetailLoading.value = true;
  mailError.value = '';
  try {
    const result = await api.gameMailDetail(id);
    if (!isCurrentAuthRequest(request) || version !== mailDetailVersion) return;
    mailDetail.value = result.item;
    mailUnreadCount.value = result.unreadCount;
    mailItems.value = mailItems.value.map(item => item.id === id ? { ...item, isRead: true } : item);
    if (mailFilter.value === 'unread') void loadGameMails();
  } catch (e) {
    if (isCurrentAuthRequest(request) && version === mailDetailVersion) mailError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request) && version === mailDetailVersion) mailDetailLoading.value = false;
  }
};
const loadGameMailUnread = async () => {
  const request = currentAuthRequest();
  if (!request.token) return;
  try {
    const result = await api.gameMailUnread();
    if (isCurrentAuthRequest(request)) mailUnreadCount.value = result.unreadCount;
  } catch { /* 邮件角标读取失败不阻断游戏操作。 */ }
};
const claimGameMail = async (id: number) => {
  const request = currentAuthRequest();
  if (!request.token || mailActionBusy.value) return;
  mailActionBusy.value = true;
  mailError.value = '';
  try {
    const result = await api.claimGameMail(id);
    if (!isCurrentAuthRequest(request)) return;
    mailUnreadCount.value = result.unreadCount;
    notice.value = `已领取 ${result.items.map(item => `${item.name}×${item.quantity}`).join('、')}。`;
    await Promise.all([loadGameMails(), loadGameMailDetail(id), loadPanel()]);
  } catch (e) {
    if (isCurrentAuthRequest(request)) mailError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request)) mailActionBusy.value = false;
  }
};
const claimAllGameMails = async () => {
  const request = currentAuthRequest();
  if (!request.token || mailActionBusy.value) return;
  mailActionBusy.value = true;
  mailError.value = '';
  try {
    const result = await api.claimAllGameMails();
    if (!isCurrentAuthRequest(request)) return;
    mailUnreadCount.value = result.unreadCount;
    notice.value = `已领取 ${result.mailCount} 封邮件的附件。`;
    await Promise.all([loadGameMails(), loadPanel()]);
    if (mailDetail.value) await loadGameMailDetail(mailDetail.value.id);
  } catch (e) {
    if (isCurrentAuthRequest(request)) mailError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request)) mailActionBusy.value = false;
  }
};
const deleteGameMail = async (id: number) => {
  const request = currentAuthRequest();
  if (!request.token || mailActionBusy.value) return;
  mailActionBusy.value = true;
  mailError.value = '';
  try {
    const result = await api.deleteGameMail(id);
    if (!isCurrentAuthRequest(request)) return;
    mailUnreadCount.value = result.unreadCount;
    mailDetail.value = null;
    mailItems.value = mailItems.value.filter(item => item.id !== id);
    notice.value = '邮件已删除。';
    await loadGameMails();
  } catch (e) {
    if (isCurrentAuthRequest(request)) mailError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request)) mailActionBusy.value = false;
  }
};
const openNotificationInbox = () => {
  notificationOpen.value = true;
  void loadNotifications();
  void loadGameMails();
};
const markNotificationRead = async (id: number) => {
  const request = currentAuthRequest();
  if (!request.token || notificationMarkingReadId.value !== null) return;
  notificationMarkingReadId.value = id;
  try {
    const result = await api.markNotificationRead(id);
    if (!isCurrentAuthRequest(request)) return;
    notificationItems.value = notificationItems.value.map(item => item.id === id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item);
    notificationUnreadCount.value = result.unreadCount;
  } catch (e) {
    if (isCurrentAuthRequest(request)) notificationError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request)) notificationMarkingReadId.value = null;
  }
};
const openNotificationCommand = (command: string) => {
  notificationOpen.value = false;
  void runCommand(command);
};
const loadCatalog = async () => {
  if (catalogLoaded.value) return;
  const request = currentAuthRequest();
  if (!request.token) return;
  try {
    const result = await api.commandCatalog();
    if (!isCurrentAuthRequest(request)) return;
    catalog.value = result.commands;
    catalogLoaded.value = true;
  } catch (e) {
    if (isCurrentAuthRequest(request)) setError(e);
  }
};
const refreshPartyData = async () => {
  const request = currentAuthRequest();
  if (!request.token) return;
  const version = ++partyRequestVersion;
  partyLoading.value = true;
  partyLoadingMore.value = false;
  partyError.value = '';
  try {
    const [partyResult, searchResult] = await Promise.all([
      api.currentParty(),
      api.searchParty(partySearchFilters.value)
    ]);
    if (!isCurrentAuthRequest(request) || version !== partyRequestVersion) return;
    currentParty.value = partyResult.party;
    recruitments.value = searchResult.recruitments;
    partyHasMore.value = searchResult.hasMore;
    partyNextCursor.value = searchResult.nextCursor;
    const recruitmentId = partyResult.party?.isLeader ? partyResult.party.recruitment?.id : undefined;
    if (recruitmentId) {
      const result = await api.partyApplications(recruitmentId);
      if (!isCurrentAuthRequest(request) || version !== partyRequestVersion) return;
      applications.value = result.applications;
    } else applications.value = [];
  } catch (e) {
    if (isCurrentAuthRequest(request) && version === partyRequestVersion) partyError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request) && version === partyRequestVersion) partyLoading.value = false;
  }
};
const searchParties = async (filters: { keyword: string; region: string; targetCount?: number }) => {
  partySearchFilters.value = filters;
  const request = currentAuthRequest();
  if (!request.token) return;
  const version = ++partyRequestVersion;
  partyLoading.value = true;
  partyLoadingMore.value = false;
  partyError.value = '';
  try {
    const result = await api.searchParty(filters);
    if (isCurrentAuthRequest(request) && version === partyRequestVersion) {
      recruitments.value = result.recruitments;
      partyHasMore.value = result.hasMore;
      partyNextCursor.value = result.nextCursor;
    }
  } catch (e) {
    if (isCurrentAuthRequest(request) && version === partyRequestVersion) partyError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request) && version === partyRequestVersion) partyLoading.value = false;
  }
};
const loadMoreParties = async () => {
  const request = currentAuthRequest();
  const cursor = partyNextCursor.value;
  const version = partyRequestVersion;
  if (!request.token || !partyHasMore.value || !cursor || partyLoading.value || partyLoadingMore.value) return;
  partyLoadingMore.value = true;
  partyError.value = '';
  try {
    const result = await api.searchParty({ ...partySearchFilters.value, cursor });
    if (!isCurrentAuthRequest(request) || version !== partyRequestVersion) return;
    const byId = new Map(recruitments.value.map(item => [item.id, item]));
    for (const item of result.recruitments) byId.set(item.id, item);
    recruitments.value = [...byId.values()];
    partyHasMore.value = result.hasMore;
    partyNextCursor.value = result.nextCursor;
  } catch (e) {
    if (isCurrentAuthRequest(request) && version === partyRequestVersion) partyError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request) && version === partyRequestVersion) partyLoadingMore.value = false;
  }
};
watch([tab, socialSection], ([selectedTab, selectedSection]) => {
  if (selectedTab === 'social' && selectedSection === 'party') void refreshPartyData();
});
const loadSocial = async () => {
  const request = currentAuthRequest();
  if (!request.token) return;
  try {
    const [result, summary] = await Promise.all([
      api.channels(),
      api.socialSummary().catch(() => ({ friends: [], friendRequests: [], oath: null, oathRequests: [], oathReleaseRequests: [] } as SocialSummary))
    ]);
    if (!isCurrentAuthRequest(request)) return;
    channels.value = result.channels;
    socialSummary.value = summary;
    if (!channels.value.some(item => item.id === activeChannel.value)) activeChannel.value = channels.value[0]?.id ?? 'world';
    await loadMessages();
    if (!isCurrentAuthRequest(request)) return;
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
};
const mergeChatMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const byId = new Map<number, ChatMessage>();
  for (const message of [...current, ...incoming]) byId.set(Number(message.id), message);
  return Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
};
const scrollChatToLatest = async () => {
  await nextTick();
  const list = chatMessageListRef.value;
  if (list) list.scrollTop = list.scrollHeight;
  chatAtLatest.value = true;
  chatHasNewMessages.value = false;
};
const handleChatScroll = () => {
  const list = chatMessageListRef.value;
  if (!list) return;
  const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
  chatAtLatest.value = distance <= 24;
  if (chatAtLatest.value) chatHasNewMessages.value = false;
};
const loadMessages = async (options: { reset?: boolean; forceLatest?: boolean } = {}) => {
  const request = currentAuthRequest();
  const channelId = activeChannel.value;
  if (!channelId) return;
  if (!request.token) return;
  try {
    const shouldReset = options.reset === true || loadedMessagesChannelId !== channelId;
    const result = await api.messages(channelId, undefined, CHAT_PAGE_SIZE);
    if (!isCurrentAuthRequest(request) || activeChannel.value !== channelId) return;
    if (shouldReset) {
      loadedMessagesChannelId = channelId;
      messages.value = result.messages;
      chatOldestMessageId = result.messages[0]?.id ?? null;
      chatNewestMessageId = result.messages.at(-1)?.id ?? null;
      chatHasEarlier.value = result.hasMore ?? result.messages.length >= CHAT_PAGE_SIZE;
      chatHasNewMessages.value = false;
      await scrollChatToLatest();
      return;
    }
    const previousNewestId = chatNewestMessageId ?? messages.value.at(-1)?.id ?? 0;
    const incomingNew = result.messages.some(message => Number(message.id) > Number(previousNewestId));
    messages.value = mergeChatMessages(messages.value, result.messages);
    chatOldestMessageId = messages.value[0]?.id ?? chatOldestMessageId;
    chatNewestMessageId = messages.value.at(-1)?.id ?? chatNewestMessageId;
    if (options.forceLatest === true || chatAtLatest.value) await scrollChatToLatest();
    else if (incomingNew) chatHasNewMessages.value = true;
  }
  catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
};
const refreshRecruitmentChatCard = async (messageId: number) => {
  if (activeChannel.value !== 'party:lobby') return;
  const request = currentAuthRequest();
  if (!request.token) return;
  if (!messages.value.some(message => message.id === messageId)) {
    await loadMessages();
    return;
  }
  try {
    const result = await api.messages('party:lobby', messageId + 1, 1);
    if (!isCurrentAuthRequest(request) || activeChannel.value !== 'party:lobby') return;
    const updated = result.messages.find(message => message.id === messageId);
    if (updated) messages.value = mergeChatMessages(messages.value, [updated]);
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
};
const loadEarlierMessages = async () => {
  const request = currentAuthRequest();
  const channelId = activeChannel.value;
  const beforeId = chatOldestMessageId ?? messages.value[0]?.id ?? null;
  if (!request.token || !channelId || !beforeId || chatLoadingEarlier.value || !chatHasEarlier.value) return;
  const list = chatMessageListRef.value;
  const previousHeight = list?.scrollHeight ?? 0;
  const previousTop = list?.scrollTop ?? 0;
  chatLoadingEarlier.value = true;
  try {
    const result = await api.messages(channelId, beforeId, CHAT_PAGE_SIZE);
    if (!isCurrentAuthRequest(request) || activeChannel.value !== channelId) return;
    messages.value = mergeChatMessages(result.messages, messages.value);
    chatOldestMessageId = messages.value[0]?.id ?? chatOldestMessageId;
    chatHasEarlier.value = result.hasMore ?? result.messages.length >= CHAT_PAGE_SIZE;
    await nextTick();
    const nextList = chatMessageListRef.value;
    if (nextList) nextList.scrollTop = nextList.scrollHeight - previousHeight + previousTop;
  } catch (e) {
    if (isCurrentAuthRequest(request)) setError(e);
  } finally {
    chatLoadingEarlier.value = false;
  }
};
const jumpToLatestMessages = async () => {
  await loadMessages({ forceLatest: true });
  await scrollChatToLatest();
};
const selectChannel = (channelId: string) => {
  activeChannel.value = channelId;
  loadedMessagesChannelId = null;
  messages.value = [];
  chatOldestMessageId = null;
  chatNewestMessageId = null;
  chatHasEarlier.value = false;
  chatHasNewMessages.value = false;
  chatAtLatest.value = true;
  void loadMessages({ reset: true });
  if (realtime.value?.readyState === WebSocket.OPEN) realtime.value.send(JSON.stringify({ type: 'subscribe', channelId }));
};
const connectRealtime = async () => {
  const request = currentAuthRequest();
  if (!request.token) return;
  try {
    const { ticket } = await api.realtimeTicket();
    if (!isCurrentAuthRequest(request)) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/api/web/v1/realtime?ticket=${encodeURIComponent(ticket)}`);
    realtime.value = socket;
    socket.addEventListener('open', () => {
      if (!isCurrentAuthRequest(request)) { socket.close(); return; }
      socket.send(JSON.stringify({ type: 'subscribe', channelId: activeChannel.value }));
    });
    socket.addEventListener('message', event => {
      if (!isCurrentAuthRequest(request)) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'ready' && Array.isArray(payload.channels)) channels.value = payload.channels;
        if (payload.type === 'notification') {
          if (Number.isFinite(Number(payload.unreadCount))) notificationUnreadCount.value = Math.max(0, Number(payload.unreadCount));
          if (Number(payload.latestId) > latestNotificationId) void syncNotificationChanges();
        }
        if (payload.type === 'channel-updated' && payload.channelId === 'party:lobby') {
          if (teamPopupOpen.value) void refreshPartyData();
          if (Number.isSafeInteger(Number(payload.messageId)) && Number(payload.messageId) > 0) void refreshRecruitmentChatCard(Number(payload.messageId));
        }
        if (payload.type === 'message' && payload.message?.channelId === activeChannel.value && !messages.value.some(item => item.id === payload.message.id)) {
          const wasAtLatest = chatAtLatest.value;
          messages.value = mergeChatMessages(messages.value, [payload.message]);
          chatNewestMessageId = messages.value.at(-1)?.id ?? chatNewestMessageId;
          if (wasAtLatest) void scrollChatToLatest();
          else chatHasNewMessages.value = true;
        }
      } catch { /* 实时消息异常不影响 REST 刷新 */ }
    });
    socket.addEventListener('close', () => { if (realtime.value === socket) realtime.value = null; });
  } catch { /* 老版本网关没有 WebSocket 时继续使用 REST 刷新 */ }
};
const commandMessages = (result: GameActionMessage & { messages?: GameActionMessage[] }): GameActionMessage[] =>
  result.messages?.length ? result.messages : [{ text: result.text, markdown: result.markdown, format: result.format, storyImage: result.storyImage, buttons: result.buttons ?? [] }];
const storyGuideFrom = (result: GameActionMessage & { messages?: GameActionMessage[] }): StoryGuide => {
  const messages = commandMessages(result);
  return {
    text: messages.map(message => message.text ?? '').filter(Boolean).join('\n\n') || result.text || '继续你的冒险。',
    buttons: messages.flatMap(message => message.buttons ?? []),
    messages
  };
};
const isStoryCommand = (command: string) => /^\/(?:注册|询问|选择去向|天堂|天赋目录|天赋详情|选择恩赐|初行选择|初章|继续剧情)(?:\s|$)/.test(command.trim());
type CommandSurface = 'story' | 'manual' | 'interaction' | 'catalog';
const showStoryResult = (result: CommandActionResult) => {
  storyGuide.value = storyGuideFrom(result);
  storyError.value = '';
  dismissedStoryRevision.value = '';
  interactionOpen.value = false;
  catalogOpen.value = false;
  tab.value = 'explore';
};
const leaveStory = () => {
  dismissedStoryRevision.value = String(panel.value?.pendingStory?.revision ?? '');
  storyGuide.value = null;
  storyError.value = '';
};
const presentCommandResult = (result: CommandActionResult, surface: CommandSurface) => {
  const nextMessages = commandMessages(result);
  if (result.presentation === 'story') { showStoryResult(result); return; }
  if (result.commerce) {
    commerceSide.value = result.commerce.mode ?? 'buy';
    leaveStory();
    interactionOpen.value = false;
    if (result.commerce.kind === 'bank') bankOpen.value = true;
    else if (result.commerce.kind === 'bookshop') bookshopOpen.value = true;
    else if (result.commerce.kind === 'homeShop') homePurchaseMode.value = 'shop';
    else {
      const nearbyGuild = panel.value?.nearby?.points?.find(point => ['guild_counter', 'world_tree_adventurer_guild', 'windbranch_guild', 'dragon_inn_counter'].includes(point.code ?? '') && point.x === mapCurrent.value.x && point.y === mapCurrent.value.y && (point.z ?? mapCurrent.value.z) === mapCurrent.value.z);
      guildShopTargetId.value = result.commerce.targetId ?? interactionBuildingCode.value ?? nearbyGuild?.code ?? null;
      if (!guildShopTargetId.value) {
        interactionError.value = '请在公会柜台打开商店。';
        interactionOpen.value = true;
      }
    }
    return;
  }
  if (surface === 'story') {
    if (result.presentation !== 'page') { showStoryResult(result); return; }
    leaveStory();
    const destination = result.destination;
    if (destination === 'character' || destination === 'inventory' || destination === 'explore') tab.value = destination;
    return;
  }
  if (surface === 'manual') manualMessages.value = nextMessages as ManualMessage[];
  else if (surface === 'catalog') commandCatalogRef.value?.showInteractionResult(result);
  else {
    interactionMessages.value = nextMessages as ManualMessage[];
    interactionOpen.value = true;
  }
};
const runIssuedAction = async (action: { actionId: string; revision: string }, surface: 'story' | 'manual' | 'interaction' | 'catalog' = 'interaction') => {
  const request = currentAuthRequest();
  if (!request.token || busy.value) return;
  const idempotencyKey = issuedActionRetryKeys.get(action.actionId) ?? createIdempotencyKey();
  issuedActionRetryKeys.set(action.actionId, idempotencyKey);
  busy.value = true;
  if (surface === 'manual') manualError.value = '';
  else if (surface === 'interaction') interactionError.value = '';
  else if (surface === 'story') storyError.value = '';
  else error.value = '';
  try {
    const result = await api.interactionAction(action.actionId, action.revision, idempotencyKey);
    if (!isCurrentAuthRequest(request)) return;
    issuedActionRetryKeys.delete(action.actionId);
    await loadPanel();
    if (!isCurrentAuthRequest(request)) return;
    presentCommandResult(result, surface);
  } catch (e) {
    if (!isCurrentAuthRequest(request)) return;
    const message = api.userFacingErrorMessage(e);
    if (surface === 'manual') manualError.value = message;
    else if (surface === 'interaction') interactionError.value = message;
    else if (surface === 'catalog') commandCatalogRef.value?.showInteractionError(e);
    else if (surface === 'story') storyError.value = message;
    else error.value = message;
  } finally {
    if (isCurrentAuthRequest(request)) busy.value = false;
  }
};
const loadRegistrationGuide = async () => {
  const request = currentAuthRequest();
  if (!request.token || storyLoading.value) return;
  storyLoading.value = true;
  storyGuide.value ??= { text: '', buttons: [], messages: [] };
  const version = ++storyRequestVersion;
  storyError.value = '';
  try {
    const result = await api.command('/注册');
    if (!isCurrentAuthRequest(request) || version !== storyRequestVersion) return;
    showStoryResult(result);
    await loadPanel();
  } catch (e) {
    if (isCurrentAuthRequest(request) && version === storyRequestVersion) {
      storyGuide.value ??= { text: '', buttons: [], messages: [] };
      storyError.value = api.userFacingErrorMessage(e);
    }
  } finally { if (version === storyRequestVersion) storyLoading.value = false; }
};
const refreshStoryGuide = async () => {
  if (busy.value) return;
  const request = currentAuthRequest();
  busy.value = true;
  try {
    await loadPanel();
    if (!isCurrentAuthRequest(request)) return;
    const snapshot = panel.value?.pendingStory;
    if (snapshot?.messages?.length) showStoryResult({ messages: snapshot.messages });
    else await loadRegistrationGuide();
  } finally { if (isCurrentAuthRequest(request)) busy.value = false; }
};
const submitAuth = async () => {
  const mode = loginMode.value;
  if (mode === 'register') {
    if (password.value.length < 8 || password.value.length > 64 || !password.value.trim()) {
      error.value = '密码需为 8～64 位，且不能全为空格。';
      return;
    }
    if (password.value !== passwordConfirmation.value) {
      error.value = '两次输入的密码不一致。';
      return;
    }
  }
  busy.value = true; error.value = '';
  try {
    const result = mode === 'login'
      ? await api.login(gameId.value, password.value)
      : await api.register(displayName.value, password.value, passwordConfirmation.value);
    api.saveToken(result.accessToken);
    loggedIn.value = true;
    authGeneration += 1;
    registrationLoginId.value = mode === 'register' ? result.loginId : '';
    notice.value = mode === 'login' ? '欢迎回来，正在打开冒险地图。' : '账号已创建，请保存登录号后开始冒险。';
    password.value = '';
    passwordConfirmation.value = '';
    await loadPanel();
    if (mode === 'register' || panel.value?.account?.hasCharacter === false) await loadRegistrationGuide();
    await loadSocial();
    await loadNotifications();
    await loadGameMailUnread();
    await connectRealtime();
  } catch (e) { setError(e); } finally { busy.value = false; }
};
const runCommand = async (command: string, options: { silent?: boolean; surface?: CommandSurface; title?: string } = {}) => {
  const request = currentAuthRequest();
  if (!request.token || busy.value) return;
  const surface = options.surface ?? (isStoryCommand(command) || panel.value?.account?.hasCharacter === false ? 'story' : undefined);
  if (surface === 'interaction') {
    if (options.title) interactionTitle.value = options.title;
    interactionOpen.value = true;
    interactionError.value = '';
  } else if (surface === 'story') storyError.value = '';
  busy.value = true; error.value = '';
  try {
    const result = await api.command(command);
    if (!isCurrentAuthRequest(request)) return;
    if (!options.silent) {
      const nextMessages = commandMessages(result);
      const hasButtons = nextMessages.some(message => message.buttons?.length);
      if (surface || result.presentation === 'story') presentCommandResult(result, surface ?? 'story');
      else if (hasButtons || nextMessages.length > 1) {
        interactionTitle.value = '互动';
        interactionError.value = '';
        presentCommandResult(result, 'interaction');
      } else notice.value = result.text ?? '操作完成。';
    }
    await loadPanel();
  } catch (e) {
    if (!isCurrentAuthRequest(request)) return;
    if (surface === 'story') storyError.value = api.userFacingErrorMessage(e);
    else if (surface === 'interaction') interactionError.value = api.userFacingErrorMessage(e);
    else setError(e);
  } finally { if (isCurrentAuthRequest(request)) busy.value = false; }
};
const runInteractionCommand = (command: string) => runCommand(command, { surface: 'interaction' });
watch([() => panel.value?.pendingStory, busy, storyLoading], ([pending, pendingAction, loading]) => {
  if (!loggedIn.value || pendingAction || loading || storyGuide.value || panel.value?.inBattle || !pending) return;
  if (pending.revision && String(pending.revision) === dismissedStoryRevision.value) return;
  if (pending.messages?.length) showStoryResult({ messages: pending.messages });
  else if (pending.command === '/注册') void loadRegistrationGuide();
}, { flush: 'post' });
const openCommandCatalog = async () => {
  if (criticalPending.value) return;
  catalogOpen.value = !catalogOpen.value;
  if (catalogOpen.value) await loadCatalog();
};
const loadManualCommand = async (command: string) => {
  const request = currentAuthRequest();
  if (!request.token) return;
  const version = ++manualRequestVersion;
  manualBusy.value = true;
  manualError.value = '';
  try {
    const result = await api.command(command);
    if (!isCurrentAuthRequest(request) || version !== manualRequestVersion) return;
    manualMessages.value = commandMessages(result);
    await loadPanel();
  } catch (e) {
    if (isCurrentAuthRequest(request) && version === manualRequestVersion) manualError.value = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request) && version === manualRequestVersion) manualBusy.value = false;
  }
};
const openAdventureManual = (section: 'tasks' | 'footprints' | 'codex' | 'warrants') => {
  if (section !== 'tasks') {
    manualOpen.value = false;
    handbookSection.value = section;
    handbookOpen.value = true;
    return;
  }
  handbookOpen.value = false;
  manualOpen.value = true;
  manualCategory.value = '主线';
  manualMessages.value = [];
  void loadManualCommand('/任务分类 主线');
};
const selectManualCategory = (category: ManualCategory) => {
  manualCategory.value = category;
  void loadManualCommand(`/任务分类 ${category}`);
};
const runManualCommand = (command: string) => {
  if (isStoryCommand(command)) {
    manualOpen.value = false;
    void runCommand(command, { surface: 'story' });
    return;
  }
  if (!/^\/(?:任务|任务分类 (?:主线|支线|悬赏|委托|其他)|任务页 (?:全部|主线|支线|悬赏|委托|其他) [1-9]\d*(?: .*)?)$/.test(command.trim())) {
    manualError.value = '请通过已开放的任务按钮继续操作。';
    return;
  }
  void loadManualCommand(command.trim());
};
const openWorldSection = (section: WorldSection) => {
  if (criticalPending.value) return;
  worldSection.value = section;
};
const locateHomePurchaseSite = async (target: HomePurchaseSiteTarget) => {
  homePurchaseSiteTarget.value = target;
  homePurchaseMode.value = null;
  tab.value = 'explore';
  await nextTick();
  regionMapSidebarRef.value?.openSidebar(target.regionCode);
};
const locateAdvancedMentor = async (mentor: AdvancedMentor) => {
  advancedMentorTarget.value = mentor;
  advancedProfessionOpen.value = false;
  tab.value = 'explore';
  await nextTick();
  regionMapSidebarRef.value?.openSidebar(mentor.regionCode);
};
const handleAdvancedTrialStarted = (result: AdvancedTrialStarted) => {
  if (!loggedIn.value || !advancedProfessionOpen.value || !result.panel?.inBattle) return;
  panel.value = result.panel;
  negotiation.value = null;
  pendingInteractions.value = [];
  advancedProfessionOpen.value = false;
  tab.value = 'explore';
  notice.value = '导师试炼已开始，请在战斗面板选择行动。';
};
const handleCatalogRefresh = async (regions: string[]) => {
  if (regions.length === 0 || regions.some(region => ['summary', 'map', 'battle', 'inventory', 'equipment', 'skills'].includes(region))) await loadPanel();
  if (regions.some(region => ['party', 'mail', 'social'].includes(region))) await loadSocial();
};
const handleCatalogResult = (result: CommandActionResult) => {
  if (result.text) notice.value = result.text;
  if (result.panel && typeof result.panel === 'object') panel.value = result.panel;
};
const runMapMove = async (position: MapPosition) => {
  const z = panel.value?.summary?.position?.z ?? position.z ?? mapCurrent.value.z ?? 0;
  const request = currentAuthRequest();
  if (!request.token) return;
  busy.value = true;
  error.value = '';
  // 先反馈点击动作，避免连续移动时必须等待接口和面板刷新后才看到提示。
  // 服务端返回的结果文本随后会覆盖这条临时提示，失败时由错误提示覆盖。
  notice.value = `正在移动到 ${position.x}, ${position.y}…`;
  try {
    const result = await api.exploreMove({ x: position.x, y: position.y, z });
    if (!isCurrentAuthRequest(request)) return;
    if (result.panel) panel.value = result.panel;
    else await loadPanel();
    if (result.presentation === 'story') {
      showStoryResult(result);
      notice.value = '';
    } else notice.value = result.text || `已移动到 ${position.x}, ${position.y}。`;
    pendingInteractions.value = result.panel?.inBattle ? [] : (result.interactionTargets?.slice(0, 6) ?? []);
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally { busy.value = false; }
};
const startBattleAtPoint = async (point: ExploreMapPoint) => {
  const spawnId = Number(point.id.split(':')[1] || 0);
  const request = currentAuthRequest();
  if (!request.token || !Number.isInteger(spawnId) || spawnId <= 0) return;
  busy.value = true;
  error.value = '';
  notice.value = `正在锁定 ${point.name}…`;
  try {
    const result = await api.startBattle(spawnId);
    if (!isCurrentAuthRequest(request)) return;
    negotiation.value = null;
    if (result.panel) panel.value = result.panel;
    else await loadPanel();
    pendingInteractions.value = [];
    notice.value = result.text || `已进入与${point.name}的战斗。`;
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally { busy.value = false; }
};
const openNegotiationAtPoint = async (point: ExploreMapPoint) => {
  const spawnId = Number(point.id.split(':')[1] || 0);
  const request = currentAuthRequest();
  if (!request.token || !Number.isInteger(spawnId) || spawnId <= 0) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await api.negotiate(spawnId, { type: 'view' });
    if (!isCurrentAuthRequest(request)) return;
    negotiation.value = result.negotiation;
    if (result.panel) panel.value = result.panel;
    notice.value = result.text || `已打开与${point.name}的交涉。`;
    pendingInteractions.value = [];
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally { busy.value = false; }
};
const runNegotiationAction = async (payload: { type: 'view' | 'talk' | 'gift' | 'fight' | 'leave'; itemId?: number; quantity?: number; page?: number }) => {
  const state = negotiation.value;
  const request = currentAuthRequest();
  if (!state?.sessionId || state.revision === undefined || !request.token) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await api.negotiate(state.spawnId, {
      ...payload,
      sessionId: state.sessionId,
      revision: state.revision
    });
    if (!isCurrentAuthRequest(request)) return;
    if (result.panel) panel.value = result.panel;
    else await loadPanel();
    if (result.negotiation?.kind === 'ongoing') {
      negotiation.value = result.negotiation;
    } else {
      negotiation.value = null;
      notice.value = result.negotiation?.text || result.text || '交涉已结束。';
    }
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally { busy.value = false; }
};
const avoidMonsterAtPoint = async (point: ExploreMapPoint) => {
  const spawnId = Number(point.id.split(':')[1] || 0);
  const request = currentAuthRequest();
  if (!request.token || !Number.isInteger(spawnId) || spawnId <= 0) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await api.avoidEncounter(spawnId);
    if (!isCurrentAuthRequest(request)) return;
    negotiation.value = null;
    if (result.panel) panel.value = result.panel;
    else await loadPanel();
    pendingInteractions.value = [];
    notice.value = result.text || `已躲避${point.name}。`;
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally { busy.value = false; }
};
const startMiningAtPoint = async (resourceId: number, point: ExploreMapPoint) => {
  const request = currentAuthRequest();
  if (!request.token || !Number.isSafeInteger(resourceId) || resourceId <= 0) return;
  busy.value = true;
  error.value = '';
  notice.value = `正在开始采集${point.name}…`;
  try {
    const result = await api.mineResource(resourceId);
    if (!isCurrentAuthRequest(request)) return;
    if (result.panel) panel.value = result.panel;
    else await loadPanel();
    notice.value = result.text || `已开始采集${point.name}。`;
    pendingInteractions.value = [];
  } catch (e) {
    if (isCurrentAuthRequest(request)) setError(e);
  } finally {
    busy.value = false;
  }
};
const runMapAction = (payload: { point: ExploreMapPoint; action: MapPointAction }) => {
  const action = payload.action;
  interactionBuildingCode.value = payload.point.type === '建筑' ? payload.point.code ?? null : null;
  if (action.id === 'bank' && payload.point.type === '建筑' && panel.value?.nearby?.points?.some(point => point.code === 'silver_bell_bank' && point.x === mapCurrent.value.x && point.y === mapCurrent.value.y && (point.z === undefined || point.z === mapCurrent.value.z))) {
    bankOpen.value = true;
    return;
  }
  if (action.id === 'guildShop' && payload.point.type === '建筑' && payload.point.code && panel.value?.nearby?.points?.some(point => point.code === payload.point.code && point.x === mapCurrent.value.x && point.y === mapCurrent.value.y && (point.z === undefined || point.z === mapCurrent.value.z))) {
    commerceSide.value = 'buy';
    guildShopTargetId.value = payload.point.code;
    return;
  }
  if (action.id === 'bookshop' && payload.point.type === '建筑' && payload.point.code === 'bookshop' && panel.value?.nearby?.points?.some(point => point.code === 'bookshop' && point.x === mapCurrent.value.x && point.y === mapCurrent.value.y && (point.z === undefined || point.z === mapCurrent.value.z))) {
    commerceSide.value = 'buy';
    bookshopOpen.value = true;
    return;
  }
  if (action.id === 'homeShop' && payload.point.type === '建筑' && payload.point.code === 'baina_residence' && panel.value?.nearby?.points?.some(point => point.code === 'baina_residence' && point.x === mapCurrent.value.x && point.y === mapCurrent.value.y && (point.z === undefined || point.z === mapCurrent.value.z))) {
    homePurchaseMode.value = 'shop';
    return;
  }
  if (action.id === 'attack') {
    void startBattleAtPoint(payload.point);
    return;
  }
  if (action.id === 'negotiate') {
    void openNegotiationAtPoint(payload.point);
    return;
  }
  if (action.id === 'avoid') {
    void avoidMonsterAtPoint(payload.point);
    return;
  }
  if (action.id === 'gather') {
    if (panel.value?.mining || busy.value) return;
    const resourceId = Number(action.resourceId);
    if (!Number.isSafeInteger(resourceId) || resourceId <= 0) {
      setError('当前资源编号无效，请刷新探索面板后重试。');
      return;
    }
    void startMiningAtPoint(resourceId, payload.point);
    return;
  }
  if (action.id === 'move' && action.position) {
    void runMapMove(action.position);
    return;
  }
  if (action.id === 'travel' && action.position) {
    void runRegionTravel({
      x: action.position.x,
      y: action.position.y,
      z: action.position.z ?? mapCurrent.value.z,
      targetId: payload.point.id,
      targetName: payload.point.name,
      targetKind: 'landmark'
    });
    return;
  }
  if (action.id === 'approach') notice.value = `正在前往${payload.point.name}…`;
  if (action.commands?.length) {
    void runCommands(action.commands);
    return;
  }
  if (action.command) void runCommand(action.command, payload.point.type === '建筑' || action.id === 'interact'
    ? { surface: 'interaction', title: payload.point.name }
    : {});
};
const openAutoBattle = async () => {
  if (autoBattleBusy.value) return;
  autoBattleOpen.value = true;
  error.value = '';
  autoBattleBusy.value = true;
  try {
    // 先读取主设置，技能与药剂列表失败时仍然保留可用的设置面板。
    const config = await api.autoBattleConfig(autoBattleMode.value);
    autoBattleSettings.value = config;
    autoBattleHpThreshold.value = config.settings.hpThreshold;
    autoBattleMpThreshold.value = config.settings.mpThreshold;
    const [skills, potions] = await Promise.allSettled([api.autoBattleSkills(), api.autoBattlePotions()]);
    if (skills.status === 'fulfilled') autoBattleSkillChoices.value = skills.value.choices;
    else setError(skills.reason);
    if (potions.status === 'fulfilled') autoBattlePotionChoices.value = potions.value.items;
    else setError(potions.reason);
  } catch (e) { setError(e); } finally { autoBattleBusy.value = false; }
};
const closeAutoBattle = () => { if (!autoBattleBusy.value) autoBattleOpen.value = false; };
const switchAutoBattleMode = async (mode: api.AutoBattleMode) => {
  if (autoBattleBusy.value || autoBattleMode.value === mode) return;
  autoBattleMode.value = mode;
  await openAutoBattle();
};
const saveAutoBattleSetting = async (payload: Parameters<typeof api.saveAutoBattleSetting>[0]) => {
  autoBattleBusy.value = true;
  try {
    autoBattleSettings.value = await api.saveAutoBattleSetting({ ...payload, mode: autoBattleMode.value });
    await loadPanel();
  } catch (e) { setError(e); } finally { autoBattleBusy.value = false; }
};
const saveAutoBattleThreshold = async (kind: 'hp' | 'mp') => {
  await saveAutoBattleSetting({ operation: 'threshold', kind, threshold: kind === 'hp' ? autoBattleHpThreshold.value : autoBattleMpThreshold.value });
};
const saveAutoBattlePotion = async (kind: 'hp' | 'mp', event: Event) => {
  const value = Number((event.target as HTMLSelectElement).value);
  await saveAutoBattleSetting({ operation: 'potion-item', kind, itemId: value > 0 ? value : null });
};
const saveAutoBattleActionSlot = async (sequence: number, event: Event) => {
  const value = Number((event.target as HTMLSelectElement).value);
  autoBattleBusy.value = true;
  try {
    autoBattleSettings.value = await api.saveAutoBattleAction({ sequence, skillId: value > 0 ? value : null, mode: autoBattleMode.value });
    await loadPanel();
  } catch (e) { setError(e); } finally { autoBattleBusy.value = false; }
};
const deleteAutoBattleActionSlot = async (sequence: number) => {
  autoBattleBusy.value = true;
  try {
    autoBattleSettings.value = await api.deleteAutoBattleAction(sequence, autoBattleMode.value);
    await loadPanel();
  } catch (e) { setError(e); } finally { autoBattleBusy.value = false; }
};
const autoBattleActionValue = (sequence: number) => {
  const action = autoBattleSettings.value?.actions.find(item => item.sequence === sequence);
  return action?.skillId ? String(action.skillId) : '0';
};
const autoBattleActionSlots = computed(() => {
  const max = Math.min(30, Math.max(5, (autoBattleSettings.value?.actions.length ?? 0) + 1));
  return Array.from({ length: max }, (_, index) => index + 1);
});
const cancelMining = () => {
  if (!panel.value?.mining || busy.value) return;
  void runCommand('/取消开采');
};
const stopMapAction = async () => {
  if (busy.value) return;
  if (panel.value?.mining) { cancelMining(); return; }
  if (!panel.value?.summary?.travel) return;
  const request = currentAuthRequest();
  if (!request.token) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await api.cancelExploreTravel();
    if (!isCurrentAuthRequest(request)) return;
    if (result.panel) panel.value = result.panel;
    else await loadPanel();
    notice.value = result.text || '本次前往已停止。';
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally { busy.value = false; }
};
const settleDueMapTravel = async () => {
  const request = currentAuthRequest();
  if (!request.token || !panel.value?.summary?.travel || travelAutoSettling || busy.value) return;
  travelAutoSettling = true;
  try {
    const result = await api.settleExploreTravel();
    if (!isCurrentAuthRequest(request)) return;
    if (result.panel) panel.value = result.panel;
    else await loadPanel();
    if (!panel.value?.summary?.travel && result.text) notice.value = result.text;
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally { travelAutoSettling = false; }
};
const runCommands = async (commands: string[]) => {
  for (const command of commands) {
    if (!api.token()) break;
    await runCommand(command);
    if (error.value || !api.token()) break;
  }
};
const runBattleAction = async (payload: { action: BattleAction; targetId?: string; targetKind?: 'member' | 'target' }) => {
  const source = panel.value?.battle;
  const request = currentAuthRequest();
  if (busy.value || !request.token || !source?.sessionId || !Number.isSafeInteger(source.turn)) return;
  const id = payload.action.id;
  const actionPayload: api.BattleActionPayload = { sessionId: source.sessionId, turn: Number(source.turn), bonusPhase: Boolean(source.bonusPhase), action: 'attack' };
  if (id === 'attack' || id === 'defend' || id === 'escape' || id === 'anchor') actionPayload.action = id;
  else if (id.startsWith('skill:')) { actionPayload.action = 'skill'; actionPayload.slot = Number(id.slice(6)); }
  else if (id.startsWith('advanced:')) { actionPayload.action = 'skill'; actionPayload.skillId = Number(id.slice(9)); }
  else if (id.startsWith('item:')) { actionPayload.action = 'item'; actionPayload.slot = Number(id.slice(5)); }
  else if (id.startsWith('device:')) {
    const [, slot, ...skillCode] = id.split(':');
    actionPayload.action = 'device';
    actionPayload.slot = Number(slot);
    actionPayload.deviceSkillCode = skillCode.join(':');
  } else return;
  if (payload.targetId && payload.targetKind) actionPayload.target = { kind: payload.targetKind, id: Number(payload.targetId) };
  if (!actionPayload.target && payload.action.targeting && payload.action.targeting !== 'none') return;
  busy.value = true;
  error.value = '';
  try {
    const result = await api.submitBattleAction(actionPayload);
    if (!isCurrentAuthRequest(request)) return;
    battleLog.value = [...battleLog.value, ...result.log.split(/\r?\n/).map(text => text.trim()).filter(Boolean).map(text => ({ text }))].slice(-40);
    if (result.panel) panel.value = result.panel;
    else await loadPanel();
    if (result.ended) {
      const nextStory = panel.value?.pendingStory?.messages;
      if (nextStory?.length) showStoryResult({ messages: [{ text: result.text }, ...nextStory] });
      else {
        interactionTitle.value = '战斗结算';
        interactionMessages.value = [{ text: result.text }];
        interactionError.value = '';
        interactionOpen.value = true;
      }
    } else if (result.waiting) notice.value = '行动已提交，等待队友。';
  } catch (e) {
    if (isCurrentAuthRequest(request)) {
      setError(e);
      await loadPanel();
    }
  } finally { busy.value = false; }
};
const sendChat = async () => {
  const content = messageDraft.value.trim();
  if (!content || !activeChannel.value) return;
  busy.value = true;
  try { await api.sendMessage(activeChannel.value, content); messageDraft.value = ''; await loadMessages({ forceLatest: true }); } catch (e) { setError(e); } finally { busy.value = false; }
};
const runPartyMutation = async (operation: () => Promise<unknown>, successMessage: string) => {
  const request = currentAuthRequest();
  if (!request.token || partyBusy.value) return;
  partyBusy.value = true;
  partyError.value = '';
  try {
    await operation();
    if (isCurrentAuthRequest(request)) notice.value = successMessage;
  } catch (e) {
    if (isCurrentAuthRequest(request)) {
      partyError.value = api.userFacingErrorMessage(e);
      setError(e);
    }
  } finally {
    if (isCurrentAuthRequest(request)) {
      await Promise.all([refreshPartyData(), loadSocial(), loadPanel()]);
      partyBusy.value = false;
    }
  }
};
const createWebParty = (payload: { name: string; description: string }) => runPartyMutation(async () => {
  await api.createParty(payload.name);
  if (payload.description) {
    try { await api.createRecruitment({ title: payload.name, description: payload.description, targetCount: 4 }); }
    catch (e) { throw new Error(`队伍已创建，但招募发送失败：${api.userFacingErrorMessage(e)}`); }
  }
}, payload.description ? '队伍已创建，招募已发送到组队频道。' : '队伍已创建。');
const publishPartyRecruitment = (payload: { description: string; targetCount: number }) => runPartyMutation(
  () => api.createRecruitment({ title: currentParty.value?.name, description: payload.description, targetCount: payload.targetCount }),
  '队伍招募已发送到组队频道。'
);
const leaveWebParty = () => runPartyMutation(() => api.leaveParty(), '已退出队伍。');
const renameWebParty = (name: string) => runPartyMutation(() => api.renameParty(name), '队伍名称已更新。');
const applyPartyById = (id: number) => runPartyMutation(() => api.applyRecruitment(id), '已提交入队申请，请等待队长处理。');
const applyChatRecruitment = async (message: ChatMessage) => {
  if (!message.recruitment) return;
  await applyPartyById(message.recruitment.id);
  await refreshRecruitmentChatCard(message.id);
};
const canApplyChatRecruitment = (item: Recruitment) =>
  !isInParty.value && !item.own && item.status === 'open' && (item.openSlots ?? item.targetCount - item.memberCount) > 0
  && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now())
  && !['pending', 'accepted'].includes(item.applicationStatus ?? '');
const chatRecruitmentStatus = (item: Recruitment) => {
  if (item.own) return '我的队伍';
  if (item.applicationStatus === 'pending') return '申请待处理';
  if (item.applicationStatus === 'accepted') return '已加入';
  if (item.status !== 'open' || (item.openSlots ?? item.targetCount - item.memberCount) <= 0) return '已结束';
  if (isInParty.value) return '已在队伍中';
  return '';
};
const respondApplicationById = (id: number, accept: boolean) => runPartyMutation(
  () => accept ? api.acceptApplication(id) : api.rejectApplication(id),
  accept ? '已同意入队申请。' : '已拒绝入队申请。'
);
const socialAction = async (command: string) => {
  await runCommand(command);
  if (!error.value) await loadSocial();
};
const selectSocialSection = (section: SocialSection) => {
  socialSection.value = section;
};
const addSocialFriend = async () => {
  const gameId = Number(socialGameId.value.trim());
  if (!Number.isSafeInteger(gameId) || gameId <= 0) { setError('请输入有效的 Game ID。'); return; }
  socialGameId.value = '';
  await socialAction(`/加好友 ${gameId}`);
};
const openSettings = () => {
  if (criticalPending.value && !showStoryGuide.value) return;
  settingsNickname.value = String(panel.value?.summary?.name ?? panel.value?.account?.displayName ?? displayName.value ?? '');
  const gender = panel.value?.summary?.gender;
  if (gender === '男' || gender === '女') settingsGender.value = gender;
  settingsOpen.value = true;
};
const closeSettings = () => { settingsOpen.value = false; };
const copyAccountId = async (value: string) => {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    notice.value = '登录号已复制。';
  } catch {
    notice.value = '复制未成功，请长按号码手动复制。';
  }
};
const saveSettingsPassword = async () => {
  if (settingsNewPassword.value.length < 8 || settingsNewPassword.value.length > 64 || !settingsNewPassword.value.trim()) {
    setError('新密码需为 8～64 位，且不能全为空格。');
    return;
  }
  if (settingsNewPassword.value !== settingsPasswordConfirmation.value) {
    setError('两次输入的新密码不一致。');
    return;
  }
  const changing = panel.value?.account?.passwordLoginEnabled !== false;
  busy.value = true;
  error.value = '';
  try {
    const result = changing
      ? await api.changePassword(settingsCurrentPassword.value, settingsNewPassword.value, settingsPasswordConfirmation.value)
      : await api.setPassword(settingsNewPassword.value, settingsPasswordConfirmation.value);
    realtime.value?.close();
    realtime.value = null;
    api.saveToken(result.accessToken);
    authGeneration += 1;
    settingsCurrentPassword.value = '';
    settingsNewPassword.value = '';
    settingsPasswordConfirmation.value = '';
    notice.value = changing ? '密码已修改。' : '密码已设置。';
    await loadPanel();
    await connectRealtime();
  } catch (e) { setError(e); } finally { busy.value = false; }
};
const saveSettingsNickname = async () => {
  const name = settingsNickname.value.trim().replace(/\s+/g, ' ');
  if (Array.from(name).length < 2 || Array.from(name).length > 24) {
    setError('昵称需要为 2～24 个字符。');
    return;
  }
  settingsNickname.value = name;
  await runCommand(`/角色改名 ${name}`);
};
const saveSettingsGender = async (gender: '男' | '女') => {
  settingsGender.value = gender;
  await runCommand(`/改性 ${gender}`);
};
const logout = () => {
  if (criticalPending.value) return;
  const hadToken = Boolean(api.token());
  authGeneration += 1;
  realtime.value?.close();
  realtime.value = null;
  if (hadToken) void api.logout().catch(() => undefined);
  api.clearToken();
  password.value = '';
  passwordConfirmation.value = '';
  registrationLoginId.value = '';
  settingsCurrentPassword.value = '';
  settingsNewPassword.value = '';
  settingsPasswordConfirmation.value = '';
  loggedIn.value = false;
  panel.value = null;
  negotiation.value = null;
  storyGuide.value = null;
  channels.value = [];
  messages.value = [];
  loadedMessagesChannelId = null;
  chatOldestMessageId = null;
  chatNewestMessageId = null;
  chatHasEarlier.value = false;
  chatHasNewMessages.value = false;
  chatLoadingEarlier.value = false;
  chatAtLatest.value = true;
  recruitments.value = [];
  socialSummary.value = { friends: [], friendRequests: [], oath: null, oathRequests: [], oathReleaseRequests: [] };
  applications.value = [];
  currentParty.value = null;
  partyError.value = '';
  partyLoading.value = false;
  partyLoadingMore.value = false;
  partyHasMore.value = false;
  partyNextCursor.value = null;
  partyBusy.value = false;
  partySearchFilters.value = { keyword: '', region: '' };
  partyRequestVersion += 1;
  catalog.value = [];
  catalogLoaded.value = false;
  catalogOpen.value = false;
  manualOpen.value = false;
  manualMessages.value = [];
  manualError.value = '';
  manualBusy.value = false;
  manualRequestVersion += 1;
  handbookOpen.value = false;
  criticalPendingSources.value = {};
  bankOpen.value = false;
  guildShopTargetId.value = null;
  bookshopOpen.value = false;
  homePurchaseMode.value = null;
  homePurchaseSiteTarget.value = null;
  advancedProfessionOpen.value = false;
  advancedMentorTarget.value = null;
  interactionOpen.value = false;
  interactionMessages.value = [];
  interactionError.value = '';
  issuedActionRetryKeys.clear();
  resetNotificationState();
  settingsOpen.value = false;
  worldSection.value = 'overview';
  autoBattleOpen.value = false;
  autoBattleSettings.value = null;
  floatingSocialOpen.value = null;
  teamPopupOpen.value = false;
  floatingDockExpanded.value = false;
  messages.value = [];
  loadedMessagesChannelId = null;
  chatOldestMessageId = null;
  chatNewestMessageId = null;
  chatHasEarlier.value = false;
  chatHasNewMessages.value = false;
  chatLoadingEarlier.value = false;
  chatAtLatest.value = true;
  floatingDockOffset.value = { x: 0, y: 0 };
  socialSummary.value = { friends: [], friendRequests: [], oath: null, oathRequests: [], oathReleaseRequests: [] };
  pendingInteractions.value = [];
  selectedInventoryItem.value = null;
  error.value = '';
  notice.value = '';
  tab.value = 'explore';
};
const handleAuthInvalidated = () => {
  authGeneration += 1;
  realtime.value?.close();
  realtime.value = null;
  loggedIn.value = false;
  panel.value = null;
  negotiation.value = null;
  storyGuide.value = null;
  storyError.value = '';
  storyLoading.value = false;
  storyRequestVersion += 1;
  dismissedStoryRevision.value = '';
  catalog.value = [];
  catalogLoaded.value = false;
  catalogOpen.value = false;
  manualOpen.value = false;
  manualMessages.value = [];
  manualError.value = '';
  manualBusy.value = false;
  manualRequestVersion += 1;
  handbookOpen.value = false;
  criticalPendingSources.value = {};
  bankOpen.value = false;
  guildShopTargetId.value = null;
  bookshopOpen.value = false;
  homePurchaseMode.value = null;
  homePurchaseSiteTarget.value = null;
  advancedProfessionOpen.value = false;
  advancedMentorTarget.value = null;
  interactionOpen.value = false;
  interactionMessages.value = [];
  interactionError.value = '';
  issuedActionRetryKeys.clear();
  resetNotificationState();
  settingsOpen.value = false;
  worldSection.value = 'overview';
  autoBattleOpen.value = false;
  autoBattleSettings.value = null;
  floatingSocialOpen.value = null;
  teamPopupOpen.value = false;
  floatingDockExpanded.value = false;
  currentParty.value = null;
  recruitments.value = [];
  applications.value = [];
  partyError.value = '';
  partyLoading.value = false;
  partyLoadingMore.value = false;
  partyHasMore.value = false;
  partyNextCursor.value = null;
  partyBusy.value = false;
  partyRequestVersion += 1;
  pendingInteractions.value = [];
  selectedInventoryItem.value = null;
  error.value = '登录已失效，请重新登录。';
};
const usePanelButton = (command: string) => void runCommand(command);
const togglePasswordVisibility = () => { showPassword.value = !showPassword.value; };
const selectCharacterSection = (section: CharacterSection) => {
  if (criticalPending.value) return;
  characterSection.value = section;
  if (section === 'equipment') void runCommand('/装备', { silent: true });
};
const inspectCharacterEquipment = (item: CharacterEquipmentEntry) => {
  selectedEquipment.value = item;
};
const closeCharacterEquipment = () => { selectedEquipment.value = null; };
const unequipSelectedEquipment = async () => {
  const item = selectedEquipment.value;
  if (!item) return;
  closeCharacterEquipment();
  await runCommand(`/卸下装备 ${item.slot}`);
};
const replaceSelectedEquipment = () => {
  closeCharacterEquipment();
  tab.value = 'inventory';
  inventoryCategory.value = '装备';
  inventoryEquipmentGroup.value = '全部';
  inventorySubcategory.value = '全部';
  void runCommand('/背包 装备', { silent: true });
};
const selectInventoryCategory = (category: InventoryCategory) => {
  inventoryCategory.value = category;
  inventoryEquipmentGroup.value = '全部';
  inventorySubcategory.value = '全部';
  void runCommand(category === '全部' ? '/背包' : `/背包 ${category}`, { silent: true });
};
const selectInventoryEquipmentGroup = (group: InventoryEquipmentGroup) => {
  inventoryCategory.value = '装备';
  inventoryEquipmentGroup.value = group;
  inventorySubcategory.value = '全部';
  void runCommand('/背包 装备', { silent: true });
};
const selectInventorySubcategory = (subcategory: string) => { inventorySubcategory.value = subcategory; };
const inspectInventoryItem = (item: InventoryDisplayItem) => {
  selectedInventoryItem.value = item;
};
const closeInventoryItem = () => { selectedInventoryItem.value = null; };
const useSelectedInventoryItem = async () => {
  const item = selectedInventoryItem.value;
  if (!item || item.instance || item.itemType !== 'consumable' || !item.id) return;
  closeInventoryItem();
  await runCommand(`/使用道具 ${item.id}`);
};
const inspectSelectedEquipment = async () => {
  const item = selectedInventoryItem.value;
  if (!item || !item.instance || !item.id) return;
  closeInventoryItem();
  await runCommand(`/装备详情 ${item.id}`);
};
const runRegionTravel = async (request: RegionTravelRequest) => {
  if (busy.value || panel.value?.summary?.travel || panel.value?.mining) return;
  const z = request.z ?? mapCurrent.value.z ?? 0;
  const auth = currentAuthRequest();
  if (!auth.token) return;
  busy.value = true;
  travelPlanningTarget.value = request.targetName;
  error.value = '';
  notice.value = `正在规划前往${request.targetName}的路线…`;
  try {
    const result = await api.exploreTravel({ x: request.x, y: request.y, z });
    if (!isCurrentAuthRequest(auth)) return;
    if (result.panel) panel.value = result.panel;
    else await loadPanel();
    notice.value = result.text || `已安排前往${request.targetName}。`;
  } catch (e) { if (isCurrentAuthRequest(auth)) setError(e); }
  finally { travelPlanningTarget.value = ''; busy.value = false; }
};

watch([notice, error], ([nextNotice, nextError]) => {
  if (feedbackToastTimer) window.clearTimeout(feedbackToastTimer);
  if (!nextNotice && !nextError) return;
  feedbackToastKey.value += 1;
  feedbackToastTimer = window.setTimeout(() => {
    notice.value = '';
    error.value = '';
    feedbackToastTimer = undefined;
  }, 2200);
});

watch(() => panel.value?.mining, (status) => {
  if (!status) {
    miningRemaining.value = 0;
    miningAutoSettling = false;
    return;
  }
  miningRemaining.value = Math.max(0, Number(status.remaining) || 0);
}, { deep: true });
watch(() => panel.value?.summary?.travel?.remaining, remaining => {
  travelRemaining.value = Math.max(0, Number(remaining) || 0);
  if (remaining === undefined) nextTravelSettleAt = 0;
}, { immediate: true });

onMounted(async () => {
  restoreFloatingDockPlacement();
  void constrainFloatingDock();
  bgmPlayer = new BgmPlayer();
  bgmPlayer.update(bgmScene.value, musicEnabled.value, musicVolume.value);
  window.addEventListener('pointerdown', unlockBgm, { passive: true });
  window.addEventListener('touchend', unlockBgm, { passive: true });
  window.addEventListener('click', unlockBgm);
  window.addEventListener('keydown', unlockBgm);
  window.addEventListener('fantasy-final-auth-invalidated', handleAuthInvalidated);
  if (loggedIn.value && api.token()) {
    authGeneration += 1;
    await loadPanel();
    if (panel.value?.account?.hasCharacter === false) await loadRegistrationGuide();
    await loadSocial();
    await loadNotifications();
    await loadGameMailUnread();
    await connectRealtime();
  }
  window.addEventListener('resize', constrainFloatingDock);
  let notificationPollCount = 0;
  refreshTimer = window.setInterval(() => {
    void loadPanel();
    if (tab.value === 'social' || floatingSocialOpen.value) { void loadMessages(); void loadSocial(); }
    notificationPollCount += 1;
    if (notificationPollCount % 2 === 0) {
      void loadNotificationUnread();
      void loadGameMailUnread();
      if (notificationOpen.value) void syncNotificationChanges();
    }
  }, 8000);
  actionCountdownTimer = window.setInterval(() => {
    if (panel.value?.summary?.travel) {
      if (travelRemaining.value > 0) travelRemaining.value = Math.max(0, travelRemaining.value - 1);
      else if (Date.now() >= nextTravelSettleAt) {
        nextTravelSettleAt = Date.now() + 4000;
        void settleDueMapTravel();
      }
    }
    if (!panel.value?.mining || busy.value) return;
    if (miningRemaining.value > 0) {
      miningRemaining.value = Math.max(0, miningRemaining.value - 1);
      return;
    }
    if (miningAutoSettling) return;
    miningAutoSettling = true;
    void runCommand('/刷新开采').finally(() => { miningAutoSettling = false; });
  }, 1000);
});
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', unlockBgm);
  window.removeEventListener('touchend', unlockBgm);
  window.removeEventListener('click', unlockBgm);
  window.removeEventListener('keydown', unlockBgm);
  bgmPlayer?.destroy();
  bgmPlayer = null;
  if (refreshTimer) window.clearInterval(refreshTimer);
  if (actionCountdownTimer) window.clearInterval(actionCountdownTimer);
  if (feedbackToastTimer) window.clearTimeout(feedbackToastTimer);
  realtime.value?.close();
  window.removeEventListener('fantasy-final-auth-invalidated', handleAuthInvalidated);
  window.removeEventListener('resize', constrainFloatingDock);
  window.removeEventListener('pointermove', moveFloatingDockDrag);
  window.removeEventListener('pointerup', stopFloatingDockDrag);
  window.removeEventListener('pointercancel', stopFloatingDockDrag);
  window.removeEventListener('pointermove', moveSocialResize);
  window.removeEventListener('pointerup', stopSocialResize);
  window.removeEventListener('pointercancel', stopSocialResize);
  if (suppressFloatingClickTimer) window.clearTimeout(suppressFloatingClickTimer);
});
</script>

<template>
  <div class="app-shell">
    <div v-if="!loggedIn" class="auth-screen">
      <img class="auth-art" src="/assets/loading/login-hero.webp" alt="梨子喵在森林里追逐一只狡黠的白色球兔" />
      <div class="auth-card-column">
        <h1 class="world-title" aria-label="幻想次元"><img src="/assets/loading/fantasy-logo.webp" alt="幻想次元" /></h1>
        <div class="auth-card card-surface">
        <div class="auth-tabs"><button :class="{ active: loginMode === 'login' }" @click="loginMode = 'login'; showPassword = false; showPasswordConfirmation = false">登录</button><button :class="{ active: loginMode === 'register' }" @click="loginMode = 'register'; showPassword = false; showPasswordConfirmation = false">注册</button></div>
        <form @submit.prevent="submitAuth">
          <label v-if="loginMode === 'register'" class="sr-only">旅人昵称</label><input v-if="loginMode === 'register'" v-model="displayName" maxlength="32" aria-label="旅人昵称" placeholder="输入昵称" />
          <label v-else class="sr-only">登录号或 Game ID</label><input v-if="loginMode === 'login'" v-model="gameId" inputmode="text" autocomplete="username" aria-label="登录号或 Game ID" placeholder="登录号 / Game ID" />
          <label class="sr-only">密码</label><div class="password-field"><input v-model="password" :type="showPassword ? 'text' : 'password'" :autocomplete="loginMode === 'login' ? 'current-password' : 'new-password'" aria-label="密码" placeholder="密码（8～64 位）" /><button type="button" class="password-toggle" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="togglePasswordVisibility">{{ showPassword ? '隐藏' : '显示' }}</button></div>
          <template v-if="loginMode === 'register'"><label class="sr-only">确认密码</label><div class="password-field"><input v-model="passwordConfirmation" :type="showPasswordConfirmation ? 'text' : 'password'" autocomplete="new-password" aria-label="确认密码" placeholder="再次输入密码" /><button type="button" class="password-toggle" :aria-label="showPasswordConfirmation ? '隐藏确认密码' : '显示确认密码'" @click="showPasswordConfirmation = !showPasswordConfirmation">{{ showPasswordConfirmation ? '隐藏' : '显示' }}</button></div></template>
          <button class="primary-button wide" :disabled="busy">{{ busy ? '连接中…' : loginMode === 'login' ? '登录' : '注册' }}</button>
        </form>
        <p v-if="error" class="error-text">{{ error }}</p>
        </div>
      </div>
    </div>

    <template v-else>
      <header class="topbar" :class="{ 'story-topbar': showStoryGuide }">
        <div class="page-brand"><img src="/assets/loading/fantasy-logo.webp" alt="幻想次元" /><div class="page-context"><span>{{ pageEyebrow }}</span><strong>{{ title }}</strong></div></div>
        <div class="top-actions"><span class="connection-dot">在线</span><button v-if="catalogOpen" class="ghost-button catalog-toggle" :disabled="showStoryGuide || Boolean(registrationLoginId)" @click="openCommandCatalog">{{ catalogOpen ? '返回页面' : '全部操作' }}</button><button type="button" class="inbox-button" :disabled="showStoryGuide || Boolean(registrationLoginId)" aria-label="打开消息信箱" title="消息信箱" :aria-expanded="notificationOpen" @click="openNotificationInbox"><span aria-hidden="true">✉</span><i v-if="inboxUnreadCount > 0">{{ inboxUnreadCount > 99 ? '99+' : inboxUnreadCount }}</i></button><button type="button" class="settings-button" aria-label="打开设置" title="设置" :aria-expanded="settingsOpen" @click="openSettings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.8 2.8h4.4l.5 2.1a7.4 7.4 0 0 1 1.7.7l1.9-1.1 3.1 3.1-1.1 1.9c.3.5.5 1.1.7 1.7l2.1.5v4.4l-2.1.5a7.4 7.4 0 0 1-.7 1.7l1.1 1.9-3.1 3.1-1.9-1.1a7.4 7.4 0 0 1-1.7.7l-.5 2.1H9.8l-.5-2.1a7.4 7.4 0 0 1-1.7-.7l-1.9 1.1-3.1-3.1 1.1-1.9a7.4 7.4 0 0 1-.7-1.7L.9 16v-4.4l2.1-.5c.2-.6.4-1.2.7-1.7L2.6 7.5l3.1-3.1 1.9 1.1c.5-.3 1.1-.5 1.7-.7z" transform="translate(0 -1.7) scale(.96)"/><circle cx="12" cy="12" r="3.2"/></svg></button></div>
      </header>

      <div v-if="registrationLoginId" class="account-onboarding-layer">
        <section class="account-onboarding card-surface" role="dialog" aria-modal="true" aria-labelledby="account-onboarding-title">
          <h2 id="account-onboarding-title">保存你的登录号</h2>
          <p>建角前就可以用它和密码重新登录。建角后也可以使用 Game ID。</p>
          <div class="account-id-row"><strong>{{ registrationLoginId }}</strong><button type="button" class="soft-button" @click="copyAccountId(registrationLoginId)">复制</button></div>
          <button type="button" class="primary-button wide" @click="registrationLoginId = ''">我已保存，开始冒险</button>
        </section>
      </div>

      <main class="page-content" :inert="showStoryGuide || Boolean(registrationLoginId)">
        <section v-if="catalogOpen" class="catalog-page">
          <div class="card-surface catalog-intro"><div><p class="eyebrow">ALL COMMANDS</p><h1>冒险操作目录</h1><p class="muted">所有已开放的本体指令都从这里进入。网页会自动生成参数控件，涉及消耗或变更的操作先预览再确认。</p></div><button class="soft-button" @click="openCommandCatalog">返回当前页面</button></div>
          <CommandCatalog ref="commandCatalogRef" :commands="catalog" :busy="busy" @refresh="regions => void handleCatalogRefresh(regions)" @executed="handleCatalogResult" @error="setError" @interaction-action="action => runIssuedAction(action, 'catalog')" />
        </section>

        <section v-else-if="tab === 'explore'" class="explore-page">
          <TurnBattlePanel v-if="battleState" :battle="battleState" :disabled="busy" @action="runBattleAction" />
          <NegotiationPanel v-else-if="negotiation" :negotiation="negotiation" :disabled="busy" @action="runNegotiationAction" />
          <template v-else>
          <div class="explore-frame card-surface">
            <div class="explore-status-strip" v-if="panel?.summary">
              <div class="stat-card"><span>生命</span><strong>{{ panel.summary.hp.current }} / {{ panel.summary.hp.max }}</strong><i><b :style="{ width: `${hpPercent}%` }" /></i></div>
              <div class="stat-card"><span>魔力</span><strong>{{ panel.summary.mp.current }} / {{ panel.summary.mp.max }}</strong><i class="mana"><b :style="{ width: `${mpPercent}%` }" /></i></div>
              <div class="stat-card"><span>体力</span><strong>{{ panel.summary.stamina.current }} / {{ panel.summary.stamina.max }}</strong><i class="stamina"><b :style="{ width: `${Math.min(100, Math.max(0, panel.summary.stamina.current / Math.max(1, panel.summary.stamina.max) * 100))}%` }" /></i></div>
            </div>
            <WorldMapPanel class="explore-map" :current="mapCurrent" :bounds="mapBounds" :points="mapPoints" :move-range="mapMoveRange" :sight-range="mapSightRange" :disabled="busy || Boolean(mapActionLock)" :action-lock="mapActionLock" @move="runMapMove" @action="runMapAction" @stop-action="stopMapAction" @open-region-map="openRegionMapSidebar" @open-auto-battle="openAutoBattle" />
          </div>
          <RegionMapSidebar ref="regionMapSidebarRef" :regions="regionMap.regions" :members="regionMap.members" :landmarks="regionMap.landmarks" :current-region-code="regionMap.currentRegionCode" :disabled="busy" :loading="busy" @travel="runRegionTravel" />
          <div v-if="pendingInteractions.length" class="interaction-choice-backdrop" role="presentation" @click.self="pendingInteractions = []">
            <div class="interaction-choice card-surface" role="dialog" aria-modal="true" aria-label="附近互动">
              <button class="dialog-close" aria-label="关闭互动选择" @click="pendingInteractions = []">×</button>
              <p class="eyebrow">NEW ENCOUNTER</p><h3>这里发现了目标</h3>
              <p class="muted">选择要查看的互动对象。</p>
              <div class="interaction-choice-list"><button v-for="target in pendingInteractions" :key="`${target.type}:${target.id}`" class="soft-button" :disabled="busy" @click="pendingInteractions = []; runCommand(`/坐标互动 ${target.type} ${target.id}`)">{{ target.name }}<small>{{ target.type }}</small></button></div>
            </div>
          </div>
          </template>
        </section>

        <div v-if="autoBattleOpen" class="auto-battle-backdrop" role="presentation" @click.self="closeAutoBattle">
          <section class="auto-battle-dialog card-surface" role="dialog" aria-modal="true" aria-label="自动战斗设置">
            <button type="button" class="dialog-close" aria-label="关闭自动战斗设置" @click="closeAutoBattle">×</button>
            <div class="section-heading auto-battle-heading"><div><p class="eyebrow">AUTO BATTLE</p><h2>自动战斗设置</h2></div><span class="auto-battle-state" :class="{ enabled: autoBattleSettings?.settings.enabled }">{{ autoBattleSettings?.settings.enabled ? '运行中' : '未开启' }}</span></div>
            <div v-if="autoBattleSettings" class="auto-battle-content">
              <div class="auto-battle-mode-tabs"><button type="button" :class="{ active: autoBattleMode === 'pve' }" :disabled="autoBattleBusy" @click="switchAutoBattleMode('pve')">PVE 探索</button><button type="button" :class="{ active: autoBattleMode === 'pvp' }" :disabled="autoBattleBusy" @click="switchAutoBattleMode('pvp')">PVP 对战</button></div>
              <div class="auto-battle-toggle-row"><span>自动战斗</span><button type="button" class="toggle-button" :class="{ active: autoBattleSettings.settings.enabled }" :disabled="autoBattleBusy" @click="saveAutoBattleSetting({ operation: 'enabled', enabled: !autoBattleSettings.settings.enabled })">{{ autoBattleSettings.settings.enabled ? '已开启' : '已关闭' }}</button><span>自动嗑药</span><button type="button" class="toggle-button" :class="{ active: autoBattleSettings.settings.autoPotionEnabled }" :disabled="autoBattleBusy" @click="saveAutoBattleSetting({ operation: 'potion', enabled: !autoBattleSettings.settings.autoPotionEnabled })">{{ autoBattleSettings.settings.autoPotionEnabled ? '已开启' : '已关闭' }}</button></div>
              <div v-if="autoBattleMode === 'pve'" class="auto-battle-default"><span>遇敌默认操作</span><select :value="autoBattleSettings.settings.defaultEncounterAction" :disabled="autoBattleBusy" @change="saveAutoBattleSetting({ operation: 'default-action' })"><option value="battle">直接战斗</option><option value="persuade">优先交涉</option></select></div>
              <div class="auto-battle-potion-grid"><label><span>生命低于 {{ autoBattleHpThreshold }}%</span><input v-model.number="autoBattleHpThreshold" type="range" min="1" max="99" step="1" @change="saveAutoBattleThreshold('hp')" /><select :value="autoBattleSettings.settings.hpItemId ?? 0" :disabled="autoBattleBusy" @change="saveAutoBattlePotion('hp', $event)"><option value="0">不使用药剂</option><option v-for="item in autoBattlePotionChoices" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label><span>魔力低于 {{ autoBattleMpThreshold }}%</span><input v-model.number="autoBattleMpThreshold" type="range" min="1" max="99" step="1" @change="saveAutoBattleThreshold('mp')" /><select :value="autoBattleSettings.settings.mpItemId ?? 0" :disabled="autoBattleBusy" @change="saveAutoBattlePotion('mp', $event)"><option value="0">不使用药剂</option><option v-for="item in autoBattlePotionChoices" :key="item.id" :value="item.id">{{ item.name }}</option></select></label></div>
              <div class="auto-battle-actions"><div class="auto-battle-actions-heading"><strong>出招顺序</strong><small>循环执行，未配置时使用普通攻击</small></div><div v-for="sequence in autoBattleActionSlots" :key="sequence" class="auto-battle-action-row"><b>{{ sequence }}</b><select :value="autoBattleActionValue(sequence)" :disabled="autoBattleBusy" @change="saveAutoBattleActionSlot(sequence, $event)"><option v-for="skill in autoBattleSkillChoices" :key="`${sequence}:${skill.id ?? 0}`" :value="skill.id ?? 0">{{ skill.name }}</option></select><button v-if="autoBattleSettings.actions.some(item => item.sequence === sequence)" type="button" class="ghost-button" :disabled="autoBattleBusy" @click="deleteAutoBattleActionSlot(sequence)">删除</button></div></div>
            </div>
            <div v-else-if="error" class="empty-state auto-battle-load-error">自动战斗设置读取失败：{{ error }}<button type="button" class="soft-button" :disabled="autoBattleBusy" @click="openAutoBattle">重新读取</button></div>
            <div v-else class="empty-state">正在读取自动战斗设置…</div>
          </section>
        </div>

        <section v-else-if="tab === 'character'" class="character-page">
          <div class="character-tabs card-surface" role="tablist" aria-label="角色页面子选项">
            <button v-for="item in characterSections" :key="item.id" type="button" role="tab" :aria-selected="characterSection === item.id" :class="{ active: characterSection === item.id }" :disabled="criticalPending" @click="selectCharacterSection(item.id)">
              <span class="character-tab-icon">{{ item.icon }}</span><span>{{ item.label }}</span>
            </button>
          </div>

          <div v-if="characterSection === 'profile'" class="character-panel-grid">
            <div class="profile-card character-profile-card card-surface">
              <CharacterPortrait class="character-profile-portrait" :portrait="characterData.portrait" :equipment="characterData.equipment" alt="当前角色立绘" />
              <div class="character-profile-info"><p class="eyebrow">ADVENTURER</p><h1>{{ panel?.summary?.name ?? '待登记旅人' }}</h1><p class="muted">{{ panel?.summary?.profession ?? '尚未选择职业' }} · Lv.{{ panel?.summary?.level ?? 1 }}</p><button type="button" class="soft-button" @click="advancedProfessionOpen = true">职业进阶</button><div class="character-identity"><div><span>Game ID</span><strong>{{ panel?.account?.uid ?? '未生成' }}</strong></div><div><span>性别</span><strong>{{ panel?.summary?.gender ?? '未设定' }}</strong></div><div><span>经验</span><strong>{{ panel?.summary?.experience ?? 0 }} / {{ panel?.summary?.experienceRequired ?? '—' }}</strong></div><div><span>天赋</span><strong>{{ panel?.summary?.giftName ?? '无' }}</strong></div><div><span>所在区域</span><strong>{{ panel?.summary?.region ?? '未进入地图' }}</strong></div><div><span>当前坐标</span><strong>{{ panel?.summary?.position ? `(${panel.summary.position.x}, ${panel.summary.position.y}, ${panel.summary.position.z})` : '—' }}</strong></div><div class="character-identity-buffs"><span>增益效果</span><strong>{{ panel?.summary?.activeBuffs?.length ? panel.summary.activeBuffs.join('、') : '暂无' }}</strong></div></div><div class="character-resource-list"><div><span>生命</span><strong>{{ panel?.summary?.hp.current ?? 0 }} / {{ panel?.summary?.hp.max ?? 0 }}</strong><i><b :style="{ width: `${hpPercent}%` }" /></i></div><div><span>魔力</span><strong>{{ panel?.summary?.mp.current ?? 0 }} / {{ panel?.summary?.mp.max ?? 0 }}</strong><i class="mana"><b :style="{ width: `${mpPercent}%` }" /></i></div><div><span>体力</span><strong>{{ panel?.summary?.stamina.current ?? 0 }} / {{ panel?.summary?.stamina.max ?? 0 }}</strong><i class="stamina"><b :style="{ width: `${Math.min(100, Math.max(0, (panel?.summary?.stamina.current ?? 0) / Math.max(1, panel?.summary?.stamina.max ?? 1) * 100))}%` }" /></i></div></div></div>
            </div>
            <div class="character-battle-stats card-surface" aria-label="角色战斗属性" @click="closeAttributeHelp">
              <h2>战斗属性</h2>
              <div class="character-battle-section"><h3>六维</h3><div class="character-battle-grid"><div v-for="stat in baseAttributeDefinitions" :key="stat.key" class="character-battle-item" @mouseleave="closeAttributeHelp"><span class="attribute-help-label"><span>{{ stat.label }}</span><button type="button" class="attribute-help-trigger" :aria-label="`查看${stat.label}说明`" :aria-expanded="activeAttributeHelp === `base:${stat.key}`" @click.stop="toggleAttributeHelp(`base:${stat.key}`)">?</button><span v-if="activeAttributeHelp === `base:${stat.key}`" class="attribute-help-popover" role="tooltip">{{ attributeHelpText(stat.key) }}</span></span><strong>{{ formatAttributeValue(baseAttributeValue(stat.key)) }}</strong></div></div></div>
              <div class="character-battle-section"><h3>战斗数值</h3><div class="character-battle-grid"><div v-for="stat in combatStatDefinitions" :key="stat.key" class="character-battle-item" @mouseleave="closeAttributeHelp"><span class="attribute-help-label"><span>{{ stat.label }}</span><button type="button" class="attribute-help-trigger" :aria-label="`查看${stat.label}说明`" :aria-expanded="activeAttributeHelp === `combat:${stat.key}`" @click.stop="toggleAttributeHelp(`combat:${stat.key}`)">?</button><span v-if="activeAttributeHelp === `combat:${stat.key}`" class="attribute-help-popover" role="tooltip">{{ attributeHelpText(stat.key) }}</span></span><strong>{{ combatStatValue(stat.key) }}</strong></div></div></div>
              <div class="character-battle-section" v-if="extraAttributeEntries.length"><h3>额外</h3><div class="character-battle-grid"><div v-for="item in extraAttributeEntries" :key="item.label" class="character-battle-item" @mouseleave="closeAttributeHelp"><span class="attribute-help-label"><span>{{ item.label }}</span><button type="button" class="attribute-help-trigger" :aria-label="`查看${item.label}说明`" :aria-expanded="activeAttributeHelp === `extra:${item.key}`" @click.stop="toggleAttributeHelp(`extra:${item.key}`)">?</button><span v-if="activeAttributeHelp === `extra:${item.key}`" class="attribute-help-popover" role="tooltip">{{ attributeHelpText(item.key) }}</span></span><strong>{{ item.value > 0 ? '+' : '' }}{{ item.value }}{{ item.unit }}</strong></div></div></div>
              <div class="character-element-mastery"><span class="attribute-help-label"><span>元素精通</span><button type="button" class="attribute-help-trigger" aria-label="查看元素精通说明" :aria-expanded="activeAttributeHelp === 'elementMastery'" @click.stop="toggleAttributeHelp('elementMastery')">?</button><span v-if="activeAttributeHelp === 'elementMastery'" class="attribute-help-popover" role="tooltip">{{ attributeHelpText('elementMastery') }}</span></span><div class="element-mastery-list"><span v-for="([element, value]) in elementMasteryEntries" :key="element">{{ element }} {{ value }}</span></div></div>
              <div class="character-element-mastery"><span class="attribute-help-label"><span>元素抗性</span><button type="button" class="attribute-help-trigger" aria-label="查看元素抗性说明" :aria-expanded="activeAttributeHelp === 'elementResistance'" @click.stop="toggleAttributeHelp('elementResistance')">?</button><span v-if="activeAttributeHelp === 'elementResistance'" class="attribute-help-popover" role="tooltip">{{ attributeHelpText('elementResistance') }}</span></span><div class="element-mastery-list"><span v-for="([element, value]) in elementResistanceEntries" :key="element">{{ element }} {{ value }}</span></div></div>
            </div>
          </div>

          <div v-else-if="characterSection === 'equipment'" class="character-subpanel card-surface">
            <div class="subpanel-intro"><div><p class="eyebrow">EQUIPMENT</p><h2>装备配置</h2></div><span class="muted">点击部位查看当前穿戴</span></div>
            <div class="equipment-layout">
              <div class="equipment-column equipment-armor-column" role="list" aria-label="防具部位"><h3>防具</h3><button v-for="slot in equipmentArmorSlots" :key="slot.id" type="button" class="equipment-slot" :class="{ filled: equipmentForSlot(slot.id), [equipmentRarityClass(equipmentForSlot(slot.id))]: true }" :aria-label="equipmentForSlot(slot.id)?.name ?? slot.label" @click="equipmentForSlot(slot.id) && inspectCharacterEquipment(equipmentForSlot(slot.id)!)"><span class="equipment-slot-icon"><InventoryItemIcon v-if="equipmentForSlot(slot.id)" :name="equipmentForSlot(slot.id)?.name" :code="equipmentForSlot(slot.id)?.code" :codex-id="equipmentForSlot(slot.id)?.codexId ?? undefined" item-type="equipment" :item-category="equipmentForSlot(slot.id)?.itemCategory" :instance="true" /><span v-else class="equipment-slot-placeholder">{{ slot.icon }}</span></span><span class="equipment-slot-name">{{ equipmentForSlot(slot.id)?.name ?? slot.label }}</span></button></div>
              <div class="equipment-summary"><CharacterPortrait class="equipment-portrait" :portrait="characterData.portrait" :equipment="characterData.equipment" alt="当前装备立绘" /><p class="equipment-profession">{{ panel?.summary?.profession ?? '尚未选择职业' }} · Lv.{{ panel?.summary?.level ?? 1 }}</p></div>
              <div class="equipment-column equipment-combat-column" role="list" aria-label="武器与饰品部位"><h3>武器与饰品</h3><button v-for="slot in equipmentCombatSlots" :key="slot.id" type="button" class="equipment-slot" :class="{ filled: equipmentForSlot(slot.id), [equipmentRarityClass(equipmentForSlot(slot.id))]: true }" :aria-label="equipmentForSlot(slot.id)?.name ?? slot.label" @click="equipmentForSlot(slot.id) && inspectCharacterEquipment(equipmentForSlot(slot.id)!)"><span class="equipment-slot-icon"><InventoryItemIcon v-if="equipmentForSlot(slot.id)" :name="equipmentForSlot(slot.id)?.name" :code="equipmentForSlot(slot.id)?.code" :codex-id="equipmentForSlot(slot.id)?.codexId ?? undefined" item-type="equipment" :item-category="equipmentForSlot(slot.id)?.itemCategory" :instance="true" /><span v-else class="equipment-slot-placeholder">{{ slot.icon }}</span></span><span class="equipment-slot-name">{{ equipmentForSlot(slot.id)?.name ?? slot.label }}</span></button></div>
            </div>
            <div v-if="selectedEquipment" class="inventory-item-backdrop" role="presentation" @click.self="closeCharacterEquipment"><div class="inventory-item-dialog card-surface" role="dialog" aria-modal="true" :aria-label="selectedEquipment.name"><button type="button" class="dialog-close" aria-label="关闭装备详情" @click="closeCharacterEquipment">×</button><InventoryItemIcon class="inventory-dialog-icon" :name="selectedEquipment.name" :code="selectedEquipment.code" :codex-id="selectedEquipment.codexId ?? undefined" item-type="equipment" :item-category="selectedEquipment.itemCategory" :instance="true" /><p class="eyebrow">{{ selectedEquipment.itemCategory || '装备' }}</p><h3>{{ selectedEquipment.name }}</h3><p class="inventory-dialog-description">{{ selectedEquipment.description || (selectedEquipment.appearanceName ? `外观：${selectedEquipment.appearanceName}` : '当前已穿戴装备') }}<span v-if="selectedEquipment.weaponType"> · {{ selectedEquipment.weaponType }}</span></p><div class="inventory-dialog-meta"><span v-if="selectedEquipment.rarity">{{ selectedEquipment.rarity }}</span><span v-if="selectedEquipment.requiredLevel">Lv.{{ selectedEquipment.requiredLevel }}</span><span v-if="selectedEquipment.quality !== undefined">品质 {{ selectedEquipment.quality }}%</span><span v-if="selectedEquipment.durability !== undefined">耐久 {{ selectedEquipment.durability }}/{{ selectedEquipment.durabilityMax ?? 0 }}</span></div><div class="inventory-dialog-actions"><button type="button" class="primary-button" :disabled="busy" @click="replaceSelectedEquipment">更换</button><button type="button" class="soft-button" :disabled="busy" @click="unequipSelectedEquipment">卸下</button><button type="button" class="soft-button" @click="closeCharacterEquipment">❌</button></div></div></div>
          </div>

          <SkillPanel v-else-if="characterSection === 'skills'" class="character-subpanel" @updated="loadPanel" @pending-change="value => setCriticalPending('skill', value)" />

          <EvolutionPanel v-else class="character-subpanel" @updated="loadPanel" @pending-change="value => setCriticalPending('evolution', value)" />
        </section>

        <section v-else-if="tab === 'inventory'" class="inventory-page">
          <div class="inventory-frame card-surface">
            <div class="inventory-tabs" role="tablist" aria-label="背包分类"><button v-for="category in inventoryCategories" :key="category" type="button" :class="{ active: inventoryCategory === category }" role="tab" :aria-selected="inventoryCategory === category" :title="category" :aria-label="category" @click="selectInventoryCategory(category)"><InventoryItemIcon class="inventory-category-icon" :name="category === '全部' ? '全部物品' : category" :item-type="category === '装备' ? 'equipment' : category === '道具' ? 'consumable' : 'material'" /><span class="inventory-category-label">{{ category }}</span></button></div>
            <div v-if="inventoryCategory === '装备'" class="inventory-equipment-tabs" role="tablist" aria-label="装备大类"><button v-for="group in inventoryEquipmentGroups" :key="group" type="button" :class="{ active: inventoryEquipmentGroup === group }" role="tab" :aria-selected="inventoryEquipmentGroup === group" :title="group" :aria-label="group" @click="selectInventoryEquipmentGroup(group)"><span class="inventory-category-label">{{ group }}</span></button></div>
            <div v-if="inventorySubcategories.length > 1" class="inventory-subtabs" role="tablist"><button v-for="subcategory in inventorySubcategories" :key="subcategory" :class="{ active: inventorySubcategory === subcategory }" role="tab" @click="selectInventorySubcategory(subcategory)">{{ subcategory }}</button></div>
            <div v-if="inventoryItems.length" class="inventory-grid"><button v-for="item in inventoryItems" :key="`${item.instance ? 'instance' : 'stack'}:${item.id ?? item.name}`" class="inventory-slot" :title="item.name" :aria-label="`${item.name}${item.instance ? '' : ` ×${item.quantity}`}`" @click="inspectInventoryItem(item)"><InventoryItemIcon :name="item.name" :code="item.code" :codex-id="item.instance ? item.definitionCodexId : item.codexId" :item-type="item.itemType" :item-category="item.itemCategory" :instance="item.instance" /><strong>{{ item.name }}</strong><small v-if="item.instance">{{ item.quality ?? 0 }}%</small><small v-else>×{{ item.quantity }}</small></button></div>
            <div v-else class="empty-state inventory-empty">背包中还没有这一类物品。</div>
          </div>
          <div v-if="selectedInventoryItem" class="inventory-item-backdrop" role="presentation" @click.self="closeInventoryItem">
            <div class="inventory-item-dialog card-surface" role="dialog" aria-modal="true" :aria-label="selectedInventoryItem.name">
              <button type="button" class="dialog-close" aria-label="关闭物品详情" @click="closeInventoryItem">×</button>
              <InventoryItemIcon class="inventory-dialog-icon" :name="selectedInventoryItem.name" :code="selectedInventoryItem.code" :codex-id="selectedInventoryItem.instance ? selectedInventoryItem.definitionCodexId : selectedInventoryItem.codexId" :item-type="selectedInventoryItem.itemType" :item-category="selectedInventoryItem.itemCategory" :instance="selectedInventoryItem.instance" />
              <p class="eyebrow">{{ selectedInventoryItem.itemCategory || (selectedInventoryItem.itemType === 'equipment' ? '装备' : selectedInventoryItem.itemType === 'material' ? '材料' : '道具') }}</p>
              <h3>{{ selectedInventoryItem.name }}</h3>
              <p class="inventory-dialog-description">{{ selectedInventoryItem.description || (selectedInventoryItem.instance ? `耐久 ${selectedInventoryItem.durability ?? 0}/${selectedInventoryItem.durabilityMax ?? 0}` : `数量 ×${selectedInventoryItem.quantity}`) }}</p>
              <div class="inventory-dialog-meta"><span v-if="selectedInventoryItem.instance">品质 {{ selectedInventoryItem.quality ?? 0 }}%</span><span v-else>数量 ×{{ selectedInventoryItem.quantity }}</span></div>
              <div class="inventory-dialog-actions">
                <button v-if="!selectedInventoryItem.instance && selectedInventoryItem.itemType === 'consumable' && selectedInventoryItem.id" type="button" class="primary-button" :disabled="busy" @click="useSelectedInventoryItem">使用</button>
                <button v-else-if="selectedInventoryItem.instance && selectedInventoryItem.id" type="button" class="primary-button" :disabled="busy" @click="inspectSelectedEquipment">查看装备</button>
                <button type="button" class="soft-button" @click="closeInventoryItem">❌</button>
              </div>
            </div>
          </div>
        </section>

        <section v-if="tab === 'social'" class="social-page">
          <div class="social-section-tabs" role="tablist" aria-label="社交功能">
            <button type="button" role="tab" :aria-selected="socialSection === 'friends'" :class="{ active: socialSection === 'friends' }" @click="selectSocialSection('friends')">好友</button>
            <button type="button" role="tab" :aria-selected="socialSection === 'oath'" :class="{ active: socialSection === 'oath' }" @click="selectSocialSection('oath')">星誓</button>
            <button type="button" role="tab" :aria-selected="socialSection === 'party'" :class="{ active: socialSection === 'party' }" @click="selectSocialSection('party')">队伍</button>
          </div>
          <div v-if="socialSection === 'friends'" class="social-overview-grid social-single-panel">
            <article class="card-surface social-summary-card">
              <div class="section-heading"><div><p class="eyebrow">FRIENDS</p><h3>好友</h3></div><span class="social-count">{{ socialSummary.friends.length }}</span></div>
              <form class="social-add-friend" @submit.prevent="addSocialFriend"><input v-model="socialGameId" inputmode="numeric" placeholder="输入 Game ID 添加好友" /><button class="soft-button" :disabled="busy">添加</button></form>
              <div v-if="socialSummary.friends.length" class="social-friend-list"><div v-for="friend in socialSummary.friends" :key="friend.gameId" class="social-friend-row"><span class="avatar-dot">{{ friend.name.slice(0, 1) }}</span><div><strong>{{ friend.name }}</strong><small>Game ID {{ friend.gameId }} · {{ friend.stage }} · 好感 {{ friend.affinity }}</small></div><em :class="{ oath: friend.status === 'oath' }">{{ friend.status === 'oath' ? '星誓' : '好友' }}</em><div class="social-row-actions"><button type="button" class="ghost-button" :disabled="busy" @click="socialAction(`/好友资料 ${friend.gameId}`)">资料</button><button type="button" class="ghost-button" :disabled="busy" @click="socialAction(`/玩家互动 ${friend.gameId}`)">互动</button></div></div></div>
              <div v-else class="social-empty">还没有好友，先在世界频道认识新的旅人。</div>
              <div v-if="socialSummary.friendRequests.length" class="social-request-list"><strong class="social-pending">待处理好友申请 {{ socialSummary.friendRequests.length }} 条</strong><div v-for="request in socialSummary.friendRequests" :key="request.id" class="social-request-row"><span>{{ request.name }} · {{ request.gameId }}</span><span class="social-row-actions"><button type="button" class="soft-button" :disabled="busy" @click="socialAction(`/同意好友 ${request.id}`)">接受</button><button type="button" class="ghost-button" :disabled="busy" @click="socialAction(`/拒绝好友 ${request.id}`)">拒绝</button></span></div></div>
            </article>
          </div>
          <div v-else-if="socialSection === 'oath'" class="social-overview-grid social-single-panel">
            <article class="card-surface social-summary-card oath-card">
              <div class="section-heading"><div><p class="eyebrow">STAR OATH</p><h3>星誓</h3></div><span class="social-count">{{ socialSummary.oath ? '1' : '0' }}</span></div>
              <div v-if="socialSummary.oath" class="oath-status"><img class="oath-emblem" src="/assets/social/social-emblem.png" alt="星誓" /><div><strong>{{ socialSummary.oath.name }}</strong><p>{{ socialSummary.oath.stage }} · 好感 {{ socialSummary.oath.affinity }}</p><small>{{ socialSummary.oath.status === 'active' ? '星誓关系进行中' : '等待仪式推进' }}</small></div><div class="social-row-actions"><button v-if="socialSummary.oath.status === 'ceremony_pending'" type="button" class="soft-button" :disabled="busy" @click="socialAction('/星誓仪式')">仪式</button><button v-if="socialSummary.oath.status === 'active'" type="button" class="ghost-button" :disabled="busy" @click="socialAction('/星誓纪念')">纪念</button></div></div>
              <div v-else class="social-empty">尚未建立星誓关系。与好友提升好感后，可以在教堂发起星誓。</div>
              <div v-if="socialSummary.oathRequests.length" class="social-request-list"><strong class="social-pending">收到星誓申请 {{ socialSummary.oathRequests.length }} 条</strong><div v-for="request in socialSummary.oathRequests" :key="request.id" class="social-request-row"><span>{{ request.name }} · 好感 {{ request.affinity }}</span><span class="social-row-actions"><button type="button" class="soft-button" :disabled="busy" @click="socialAction(`/接受星誓 ${request.id}`)">接受</button><button type="button" class="ghost-button" :disabled="busy" @click="socialAction(`/拒绝星誓 ${request.id}`)">拒绝</button></span></div></div>
              <div v-if="socialSummary.oathReleaseRequests.length" class="social-request-list"><strong class="social-pending">收到解除星誓申请 {{ socialSummary.oathReleaseRequests.length }} 条</strong><div v-for="request in socialSummary.oathReleaseRequests" :key="request.id" class="social-request-row"><span>{{ request.name }} · {{ request.gameId }}</span><span class="social-row-actions"><button type="button" class="soft-button" :disabled="busy" @click="socialAction(`/同意解除星誓 ${request.id}`)">同意</button><button type="button" class="ghost-button" :disabled="busy" @click="socialAction(`/拒绝解除星誓 ${request.id}`)">拒绝</button></span></div></div>
            </article>
          </div>
          <article v-else class="card-surface social-summary-card social-party-card">
            <PartyPopup :party="currentParty" :recruitments="recruitments" :applications="applications" :busy="partyBusy" :loading="partyLoading" :loading-more="partyLoadingMore" :has-more="partyHasMore" :error="partyError" @create="createWebParty" @search="searchParties" @load-more="loadMoreParties" @apply="applyPartyById" @publish="publishPartyRecruitment" @leave="leaveWebParty" @rename="renameWebParty" @refresh="refreshPartyData" @accept="id => respondApplicationById(id, true)" @reject="id => respondApplicationById(id, false)" />
          </article>
        </section>

        <section v-else-if="tab === 'world'" class="world-page card-surface" aria-label="世界">
          <div v-if="worldSection === 'overview'" class="world-entry-grid">
            <button type="button" class="world-entry" @click="openWorldSection('market')"><span class="world-entry-mark market" aria-hidden="true">❧</span><strong>万叶联市</strong><small>交易与寄售</small></button>
            <button type="button" class="world-entry" @click="openWorldSection('home')"><span class="world-entry-mark home" aria-hidden="true">⌂</span><strong>家园</strong><small>小屋与家具</small></button>
          </div>
          <div v-else class="world-selected-layout">
            <nav class="world-side-links" aria-label="世界功能">
              <button type="button" :class="{ active: worldSection === 'market' }" :disabled="criticalPending" @click="openWorldSection('market')"><span class="world-entry-mark market" aria-hidden="true">❧</span><span>万叶联市</span></button>
              <button type="button" :class="{ active: worldSection === 'home' }" :disabled="criticalPending" @click="openWorldSection('home')"><span class="world-entry-mark home" aria-hidden="true">⌂</span><span>家园</span></button>
            </nav>
            <div class="world-detail" :class="{ 'world-market-detail': worldSection === 'market' }">
            <button type="button" class="world-back" :disabled="criticalPending" @click="worldSection = 'overview'">‹ 返回世界</button>
            <template v-if="worldSection === 'market'">
              <MarketPanel :open="tab === 'world'" inline @close="worldSection = 'overview'" @updated="loadPanel" @pending-change="value => setCriticalPending('market', value)" />
            </template>
            <template v-else>
              <HomePanel ref="homePanelRef" @purchase="homePurchaseMode = 'purchase'" @updated="loadPanel" @pending-change="value => setCriticalPending('homeStorage', value)" />
            </template>
            </div>
          </div>
        </section>
      </main>

      <Transition name="settings-drawer">
        <div v-if="settingsOpen" class="settings-layer" :class="{ 'story-settings-layer': showStoryGuide }">
          <button type="button" class="settings-backdrop" aria-label="关闭设置" @click="closeSettings" />
          <aside class="settings-drawer card-surface" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header class="settings-header"><div><p class="eyebrow">PREFERENCES</p><h2 id="settings-title">设置</h2></div><button type="button" class="dialog-close" aria-label="关闭设置" @click="closeSettings">×</button></header>
            <div class="settings-content">
              <section class="settings-section"><div class="settings-section-heading"><div><h3>背景音乐</h3><p>随场景切换，音量设置保存在本机</p></div><button type="button" class="settings-switch" :class="{ active: musicEnabled }" @click="toggleMusic">{{ musicEnabled ? '开启' : '关闭' }}</button></div><label class="settings-range"><span>音量 {{ musicVolume }}%</span><input v-model.number="musicVolume" type="range" min="0" max="100" step="1" :disabled="!musicEnabled" /></label></section>
              <section class="settings-section"><div class="settings-section-heading"><div><h3>头像</h3><p>仅保存在当前浏览器</p></div></div><div class="avatar-picker" role="listbox" aria-label="选择头像"><button v-for="avatar in settingsAvatarOptions" :key="avatar.id" type="button" class="avatar-choice" :class="{ active: settingsAvatar === avatar.id }" :aria-label="avatar.label" :aria-selected="settingsAvatar === avatar.id" @click="settingsAvatar = avatar.id"><span>{{ avatar.icon }}</span><small>{{ avatar.label }}</small></button></div></section>
              <section class="settings-section"><div class="settings-section-heading"><div><h3>角色资料</h3><p>修改后会同步到角色面板</p></div></div><form class="settings-form" @submit.prevent="saveSettingsNickname"><label>昵称<input v-model="settingsNickname" maxlength="24" autocomplete="nickname" placeholder="输入角色昵称" /></label><button type="submit" class="primary-button" :disabled="busy">保存昵称</button></form><div class="settings-gender"><span>性别</span><div><button type="button" :class="{ active: settingsGender === '男' }" :disabled="busy" @click="saveSettingsGender('男')">男</button><button type="button" :class="{ active: settingsGender === '女' }" :disabled="busy" @click="saveSettingsGender('女')">女</button></div></div></section>
              <section class="settings-section settings-account">
                <h3>账号</h3>
                <div v-if="panel?.account?.loginId" class="account-id-row"><span>永久登录号</span><strong>{{ panel.account.loginId }}</strong><button type="button" class="soft-button" @click="copyAccountId(panel.account.loginId)">复制</button></div>
                <div v-if="panel?.account?.gameUserId" class="account-id-row"><span>Game ID</span><strong>{{ panel.account.gameUserId }}</strong><button type="button" class="soft-button" @click="copyAccountId(panel.account.gameUserId)">复制</button></div>
                <form v-if="panel?.account" class="settings-password-form" @submit.prevent="saveSettingsPassword">
                  <strong>{{ panel.account.passwordLoginEnabled === false ? '设置密码' : '修改密码' }}</strong>
                  <div v-if="panel.account.passwordLoginEnabled !== false" class="password-field"><input v-model="settingsCurrentPassword" :type="showSettingsCurrentPassword ? 'text' : 'password'" autocomplete="current-password" aria-label="当前密码" placeholder="当前密码" /><button type="button" class="password-toggle" :aria-label="showSettingsCurrentPassword ? '隐藏当前密码' : '显示当前密码'" @click="showSettingsCurrentPassword = !showSettingsCurrentPassword">{{ showSettingsCurrentPassword ? '隐藏' : '显示' }}</button></div>
                  <div class="password-field"><input v-model="settingsNewPassword" :type="showSettingsNewPassword ? 'text' : 'password'" autocomplete="new-password" aria-label="新密码" placeholder="新密码（8～64 位）" /><button type="button" class="password-toggle" :aria-label="showSettingsNewPassword ? '隐藏新密码' : '显示新密码'" @click="showSettingsNewPassword = !showSettingsNewPassword">{{ showSettingsNewPassword ? '隐藏' : '显示' }}</button></div>
                  <div class="password-field"><input v-model="settingsPasswordConfirmation" :type="showSettingsPasswordConfirmation ? 'text' : 'password'" autocomplete="new-password" aria-label="确认新密码" placeholder="再次输入新密码" /><button type="button" class="password-toggle" :aria-label="showSettingsPasswordConfirmation ? '隐藏确认密码' : '显示确认密码'" @click="showSettingsPasswordConfirmation = !showSettingsPasswordConfirmation">{{ showSettingsPasswordConfirmation ? '隐藏' : '显示' }}</button></div>
                  <button type="submit" class="primary-button wide" :disabled="busy">{{ panel.account.passwordLoginEnabled === false ? '设置密码' : '保存新密码' }}</button>
                </form>
                <p>退出后需要使用登录号或 Game ID 与密码重新登录。</p>
                <button type="button" class="danger-button wide" @click="logout">退出账号</button>
              </section>
            </div>
          </aside>
        </div>
      </Transition>

      <div class="floating-social-layer" :inert="showStoryGuide || Boolean(registrationLoginId)" aria-label="社交快捷入口">
        <div ref="floatingDockRef" class="floating-social-dock" :class="{ expanded: floatingDockExpanded, 'dock-side-left': floatingDockSide === 'left' }" :style="floatingDockStyle" @pointerdown="startFloatingDockDrag">
          <button type="button" class="floating-social-button floating-chat-button" :class="{ active: floatingSocialOpen === 'chat' }" aria-label="打开世界频道" @click="toggleFloatingSocial('chat')">
            <img class="floating-social-art" src="/assets/ui/dock-world.png" alt="" /><span>世界</span>
          </button>
          <button type="button" class="floating-social-toggle" :aria-expanded="floatingDockExpanded" aria-label="展开或收起更多社交入口" @click.stop="toggleFloatingDock">
            <span aria-hidden="true">⌄</span>
          </button>
          <Transition name="floating-party">
            <button v-if="floatingDockExpanded" type="button" class="floating-social-button floating-party-button floating-party-reveal" :class="{ active: teamPopupOpen }" aria-label="打开队伍信息" @click="toggleTeamPopup">
              <img class="floating-social-art" src="/assets/ui/dock-party.png" alt="" /><span>队伍</span>
            </button>
          </Transition>
        </div>

        <section v-if="floatingSocialOpen" ref="floatingSocialPanelRef" :style="floatingSocialPanelStyle" class="floating-social-panel card-surface" role="dialog" aria-modal="false" :aria-label="floatingSocialOpen === 'chat' ? '世界频道' : floatingSocialOpen === 'party' ? '组队频道' : '好友私信'">
          <div class="floating-social-panel-heading" @pointerdown="startModalDrag('social', $event)">
            <div class="floating-social-tabs" role="tablist" aria-label="社交频道">
              <button type="button" role="tab" :aria-selected="floatingSocialOpen === 'chat'" :class="{ active: floatingSocialOpen === 'chat' }" @click.stop="openFloatingSocial('chat')">世界频道</button>
              <button type="button" role="tab" :aria-selected="floatingSocialOpen === 'party'" :class="{ active: floatingSocialOpen === 'party' }" @click.stop="openFloatingSocial('party')">组队频道</button>
              <button type="button" role="tab" :aria-selected="floatingSocialOpen === 'friend'" :class="{ active: floatingSocialOpen === 'friend' }" @click.stop="openFloatingSocial('friend')">好友私信</button>
            </div>
            <button type="button" class="dialog-close floating-social-close" aria-label="关闭社交弹窗" @click.stop="closeFloatingSocial">❌</button>
          </div>

          <div v-if="floatingSocialOpen === 'chat'" class="chat-card floating-social-card">
            <button v-if="chatHasEarlier || chatLoadingEarlier" type="button" class="chat-history-button" :disabled="chatLoadingEarlier" @click="loadEarlierMessages">{{ chatLoadingEarlier ? '读取中…' : '查看更早消息' }}</button>
            <div ref="chatMessageListRef" class="message-list" @scroll="handleChatScroll"><div v-if="!messages.length" class="empty-state">这里还没有消息，和大家打个招呼吧。</div><div v-for="message in messages" :key="message.id" class="message-row" :class="{ own: message.own }"><span class="avatar-dot">{{ message.senderName.slice(0, 1) }}</span><div><strong>{{ message.senderName }}</strong><p>{{ message.content }}</p><small>{{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</small></div></div></div>
            <button v-if="chatHasNewMessages" type="button" class="chat-latest-button" @click="jumpToLatestMessages">有新消息，跳到最新 ↓</button>
            <form class="chat-input" @submit.prevent="sendChat"><input v-model="messageDraft" maxlength="200" :placeholder="`发送到 ${currentChannel?.name ?? '世界频道'}`" /><button class="primary-button" :disabled="busy">发送</button></form>
          </div>

          <div v-else-if="floatingSocialOpen === 'party'" class="chat-card floating-social-card">
            <div v-if="!recruitmentChannel" class="empty-state">正在连接组队频道…</div>
            <template v-else>
              <button v-if="chatHasEarlier || chatLoadingEarlier" type="button" class="chat-history-button" :disabled="chatLoadingEarlier" @click="loadEarlierMessages">{{ chatLoadingEarlier ? '读取中…' : '查看更早消息' }}</button>
              <div ref="chatMessageListRef" class="message-list" @scroll="handleChatScroll">
                <div v-if="!messages.length" class="empty-state">队伍频道还没有消息。</div>
                <div v-for="message in messages" :key="message.id" class="message-row" :class="{ own: message.own }">
                  <span class="avatar-dot">{{ message.senderName.slice(0, 1) }}</span>
                  <div class="message-body">
                    <strong>{{ message.senderName }}</strong>
                    <p v-if="!message.recruitment">{{ message.content }}</p>
                    <div v-else class="chat-recruitment-card">
                      <div class="chat-recruitment-heading"><strong>{{ message.recruitment.partyName }}</strong><span>{{ message.recruitment.memberCount }}/{{ message.recruitment.targetCount }} 人</span></div>
                      <p>{{ message.recruitment.description || '一起探索异世界。' }}</p>
                      <div class="chat-recruitment-footer"><span>{{ message.recruitment.regionName || '未知地区' }}</span><span v-if="chatRecruitmentStatus(message.recruitment)">{{ chatRecruitmentStatus(message.recruitment) }}</span><button v-if="canApplyChatRecruitment(message.recruitment)" type="button" :disabled="partyBusy" @click="applyChatRecruitment(message)">申请加入</button></div>
                    </div>
                    <small>{{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</small>
                  </div>
                </div>
              </div>
              <button v-if="chatHasNewMessages" type="button" class="chat-latest-button" @click="jumpToLatestMessages">有新消息，跳到最新 ↓</button>
              <form class="chat-input" @submit.prevent="sendChat"><input v-model="messageDraft" maxlength="200" :placeholder="`发送到 ${recruitmentChannel.name}`" /><button class="primary-button" :disabled="busy">发送</button></form>
            </template>
          </div>

          <div v-else class="friend-social-content floating-social-card">
            <div class="friend-channel-list" role="listbox" aria-label="好友私信对象">
              <button v-for="channel in friendChannels" :key="channel.id" type="button" class="friend-channel-option" :class="{ active: activeChannel === channel.id }" @click="selectChannel(channel.id)">{{ channel.name }}</button>
              <div v-if="!friendChannels.length" class="empty-state">还没有可用的好友私信频道。</div>
            </div>
            <div v-if="friendChannels.length && activeChannel.startsWith('friend:')" class="chat-card friend-chat-card">
              <button v-if="chatHasEarlier || chatLoadingEarlier" type="button" class="chat-history-button" :disabled="chatLoadingEarlier" @click="loadEarlierMessages">{{ chatLoadingEarlier ? '读取中…' : '查看更早消息' }}</button>
              <div ref="chatMessageListRef" class="message-list" @scroll="handleChatScroll"><div v-if="!messages.length" class="empty-state">还没有私信，先打个招呼吧。</div><div v-for="message in messages" :key="message.id" class="message-row" :class="{ own: message.own }"><span class="avatar-dot">{{ message.senderName.slice(0, 1) }}</span><div><strong>{{ message.senderName }}</strong><p>{{ message.content }}</p><small>{{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</small></div></div></div>
              <button v-if="chatHasNewMessages" type="button" class="chat-latest-button" @click="jumpToLatestMessages">有新消息，跳到最新 ↓</button>
              <form class="chat-input" @submit.prevent="sendChat"><input v-model="messageDraft" maxlength="200" :placeholder="`发送到 ${currentChannel?.name ?? '好友私信'}`" /><button class="primary-button" :disabled="busy">发送</button></form>
            </div>
          </div>
          <div class="floating-social-resize" role="separator" aria-orientation="horizontal" aria-label="调整聊天窗口高度" @pointerdown="startSocialResize">
            <span aria-hidden="true">↕️</span>
          </div>
        </section>

        <section v-if="teamPopupOpen" ref="teamPanelRef" :style="teamPanelStyle" class="floating-social-panel team-info-panel card-surface" role="dialog" aria-modal="false" aria-label="队伍信息">
          <div class="floating-social-panel-heading" @pointerdown="startModalDrag('team', $event)">
            <div><p class="eyebrow">PARTY</p><h3>队伍信息</h3></div>
            <button type="button" class="dialog-close floating-social-close" aria-label="关闭队伍信息" @click.stop="teamPopupOpen = false">❌</button>
          </div>
          <PartyPopup :party="currentParty" :recruitments="recruitments" :applications="applications" :busy="partyBusy" :loading="partyLoading" :loading-more="partyLoadingMore" :has-more="partyHasMore" :error="partyError" @create="createWebParty" @search="searchParties" @load-more="loadMoreParties" @apply="applyPartyById" @publish="publishPartyRecruitment" @leave="leaveWebParty" @rename="renameWebParty" @refresh="refreshPartyData" @accept="id => respondApplicationById(id, true)" @reject="id => respondApplicationById(id, false)" />
        </section>
      </div>

      <div v-if="notice || error" :key="feedbackToastKey" class="feedback-toast" role="status">
        {{ error || notice }}
      </div>

      <NotificationInbox :open="notificationOpen && !showStoryGuide" :items="notificationItems" :unread-count="notificationUnreadCount" :loading="notificationLoading" :loading-more="notificationLoadingMore" :has-more="notificationHasMore" :error="notificationError" :marking-read-id="notificationMarkingReadId" :mail-items="mailItems" :mail-unread-count="mailUnreadCount" :mail-filter="mailFilter" :mail-loading="mailLoading" :mail-loading-more="mailLoadingMore" :mail-has-more="mailHasMore" :mail-error="mailError" :mail-detail="mailDetail" :mail-detail-loading="mailDetailLoading" :mail-action-busy="mailActionBusy" @close="notificationOpen = false" @refresh="loadNotifications" @load-more="loadOlderNotifications" @mark-read="markNotificationRead" @open-command="openNotificationCommand" @mail-filter-change="selectGameMailFilter" @mail-refresh="loadGameMails" @mail-load-more="loadOlderGameMails" @open-mail="loadGameMailDetail" @claim-mail="claimGameMail" @delete-mail="deleteGameMail" @claim-all-mail="claimAllGameMails" />

      <StoryDialog :open="showStoryGuide && !registrationLoginId" :messages="storyGuide?.messages ?? []" :busy="busy || storyLoading" :error="storyError" :in-battle="Boolean(panel?.inBattle)" :can-finish="Boolean(panel?.account?.hasCharacter && !panel?.pendingStory && !storyGuide?.buttons.length)" @action="action => runIssuedAction(action, 'story')" @command="command => runCommand(command, { surface: 'story' })" @refresh="refreshStoryGuide" @finish="leaveStory" />
      <AdventureManualDock v-show="!showStoryGuide && !registrationLoginId" :sections="['tasks', 'footprints', 'codex', 'warrants']" @select="openAdventureManual" />
      <AdventureManualPanel :open="manualOpen && !showStoryGuide" title="任务" :category="manualCategory" :available-categories="['主线', '支线', '委托', '悬赏']" :messages="manualMessages" :busy="manualBusy || busy" :error="manualError" @close="manualOpen = false" @category="selectManualCategory" @command="runManualCommand" @action="action => runIssuedAction(action, 'manual')" />
      <HandbookContent :open="handbookOpen && !showStoryGuide" :section="handbookSection" @close="handbookOpen = false" @updated="() => loadPanel()" />
      <BankPanel :open="bankOpen && !showStoryGuide" @close="bankOpen = false" @updated="loadPanel" />
      <GuildShopPanel v-if="guildShopTargetId" :open="!showStoryGuide" :target-id="guildShopTargetId" :initial-side="commerceSide" @close="guildShopTargetId = null" @updated="loadPanel" />
      <BookshopPanel :open="bookshopOpen && !showStoryGuide" target-id="bookshop" :initial-side="commerceSide" @close="bookshopOpen = false" @updated="loadPanel" />
      <HomePurchasePanel v-if="homePurchaseMode" :open="true" :mode="homePurchaseMode" @close="homePurchaseMode = null" @updated="() => { loadPanel(); homePanelRef?.refresh(); }" @purchased="result => { notice = `已购得小屋，地块坐标 (${result.plot.x}, ${result.plot.y}, ${result.plot.z})。`; homePanelRef?.refresh(); }" @locate="locateHomePurchaseSite" @pending-change="value => setCriticalPending('homePurchase', value)" />
      <AdvancedProfessionPanel :open="advancedProfessionOpen && !showStoryGuide" @close="advancedProfessionOpen = false" @updated="loadPanel" @locate="locateAdvancedMentor" @trial-started="handleAdvancedTrialStarted" @pending-change="value => setCriticalPending('advancedProfession', value)" />
      <AdventureManualPanel :open="interactionOpen && !showStoryGuide" :title="interactionTitle" caption="地点互动" :messages="interactionMessages" :busy="busy" :error="interactionError" @close="interactionOpen = false" @command="runInteractionCommand" @action="action => runIssuedAction(action, 'interaction')" />

      <nav class="bottom-nav" :inert="showStoryGuide || Boolean(registrationLoginId)"><button :class="{ active: tab === 'character' }" :disabled="criticalPending" @click="tab = 'character'"><img src="/assets/ui/nav-character.png" alt="" /><span>角色</span></button><button :class="{ active: tab === 'inventory' }" :disabled="criticalPending" @click="tab = 'inventory'"><img src="/assets/ui/nav-inventory.png" alt="" /><span>背包</span></button><button class="explore-nav" :class="{ active: tab === 'explore' }" :disabled="criticalPending" @click="tab = 'explore'"><img src="/assets/ui/nav-explore.png" alt="" /><span>探索</span></button><button :class="{ active: tab === 'social' }" :disabled="criticalPending" @click="tab = 'social'"><img src="/assets/ui/nav-social.png" alt="" /><span>社交</span></button><button :class="{ active: tab === 'world' }" :disabled="criticalPending" @click="tab = 'world'"><img src="/assets/ui/nav-world.png" alt="" /><span>世界</span></button></nav>
    </template>
  </div>
</template>
