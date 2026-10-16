<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import * as api from './api';
import type { AutoBattleConfig, AutoBattleSkillChoice, ChatChannel, ChatMessage, Panel, Recruitment, PartyApplication, WebParty, SocialSummary, CommandActionResult, CommandCatalogItem, PanelInventoryStack, PanelInventoryInstance, PanelEquippedItem, WebNotification, GameMail, GameMailDetail, GameMailFilter, GameActionButton, GameActionMessage } from './api';
import CommandCatalog from './components/CommandCatalog.vue';
import AdventureManualDock from './components/AdventureManualDock.vue';
import AdventureManualPanel, { type ManualCategory, type ManualMessage } from './components/AdventureManualPanel.vue';
import type { HandbookSection } from './handbook-api';
import StoryDialog from './components/StoryDialog.vue';
import { createIdempotencyKey } from './idempotency-key';
import ExploreChatPanel, { type ExploreChatTab } from './components/ExploreChatPanel.vue';
import PlayerCardDialog from './components/PlayerCardDialog.vue';
import PartyInvitationsDialog from './components/PartyInvitationsDialog.vue';
import { usePlayerCard } from './usePlayerCard';
import LazyPanelState from './components/LazyPanelState.vue';
import type { AdvancedMentor, AdvancedTrialStarted } from './advanced-profession-api';
import type { HomePurchaseSiteTarget } from './home-purchase-api';
import type { ExploreMapPoint, MapActionLock, MapBounds, MapPointAction, MapPosition, MapHeading } from './components/WorldMapPanel.vue';
import type { EnvironmentObjectView } from './map-environment';
import RegionMapSidebar, { type RegionTravelRequest } from './components/RegionMapSidebar.vue';
import type { BattleAction, BattleState } from './components/TurnBattlePanel.vue';
import InventoryItemIcon from './components/InventoryItemIcon.vue';
import { normalizeItemRarity } from './item-rarity';
import { vItemRaritySparkle } from './item-rarity-sparkle';
import EquipmentDetailSections from './components/EquipmentDetailSections.vue';
import './anime-inventory-panel.css';
import CharacterPortrait from './components/CharacterPortrait.vue';
import CharacterInfoPanel from './components/CharacterInfoPanel.vue';
import AnimeIcon from './components/AnimeIcon.vue';
import AvatarCropDialog from './components/AvatarCropDialog.vue';
import GameUiFeedbackArt from './components/GameUiFeedbackArt.vue';
import TabArtIcon, { type TabArtKey } from './components/TabArtIcon.vue';
import SocialAvatar from './components/SocialAvatar.vue';
import SocialGlyph from './components/SocialGlyph.vue';
import './anime-social-refinement.css';
import ExplorePotionGlyph from './components/ExplorePotionGlyph.vue';
import './anime-exploration-refinement.css';
import './anime-exploration-canvas.css';
import './game-ui-world.css';
import { knownExplorationRoute, useExplorationRoute } from './exploration-route';
import { adjacentVision, committedReplayVision } from './exploration-vision';
import { useExplorationViewport } from './exploration-viewport';
import { useExplorationTravelMotion } from './exploration-travel-motion';
import { useExplorationTravelVision } from './exploration-travel-vision';
import { compactStepPanel } from './exploration-compact-step';
import { useCommittedExplorationMotion } from './exploration-committed-motion';
import { stoppedMovementPointIds, isCurrentEncounterBlock, isTargetMovementStop, type MapTargetPopupRequest, type MovementStopResult } from './exploration-target-popup';
import AuthGlyph from './components/AuthGlyph.vue';
import AuthTabFrame from './components/AuthTabFrame.vue';
import GearSlotIcon from './components/GearSlotIcon.vue';
import { ANIME_AUTH_ART, ANIME_LOGO, ANIME_MAIN_SCENES, ANIME_NAV_ART, ANIME_SCENES } from './anime-assets';
import { portraitBaseAsset } from './character-assets';
import { terrainForRegion, mapTargetArt } from './exploration-assets';
import { useDialogNavigation } from './dialog-navigation';
import { useCharacterSceneFraming, type CharacterScene } from './scene-framing';
import { BgmPlayer, type BgmScene } from './bgm';
import { useAppViewport } from './useAppViewport';
import { useViewportPagination } from './useViewportPagination';
import ViewportPagination from './components/ViewportPagination.vue';
import { preparePlayerAssets, type BootProgress } from './boot-assets';
import { createCommonAssetPaths, createPlayerAssetPlan } from './player-asset-plan';

// Keep unopened gameplay screens out of the login module graph. A failed code
// download waits for an explicit page reload and never repeats a gameplay action.
function lazyPanel<T extends Component>(loader: () => Promise<{ default: T }>, waitForOpen = false,
  reload = () => window.location.reload()): T {
  const createPanel = (visible = () => true, close?: () => void) => {
    const failed = ref(false);
    const loadingState = defineComponent({
      inheritAttrs: false,
      setup: () => () => visible() ? h(LazyPanelState, {
        failed: failed.value,
        overlay: waitForOpen,
        onClose: close,
        onReload: reload
      }) : null
    });
    return defineAsyncComponent<T>({
      loader,
      loadingComponent: loadingState,
      delay: 120,
      // Browsers retain failed dynamic imports in their module map. Keep the
      // error visible; only the player's explicit page reload resets that map.
      onError: () => { failed.value = true; }
    });
  };
  if (!waitForOpen) return createPanel();
  return defineComponent({
    inheritAttrs: false,
    setup: (_props, { attrs, slots }) => {
      const activated = ref(Boolean(attrs.open));
      watch(() => attrs.open, open => { if (open) activated.value = true; });
      const panel = createPanel(() => Boolean(attrs.open), () => {
        if (typeof attrs.onClose === 'function') attrs.onClose();
      });
      // Once opened, preserve the panel's existing close/watch/state lifecycle.
      return () => activated.value ? h(panel, attrs, slots) : null;
    }
  }) as T;
}

const WorldMapPanel = lazyPanel(() => import('./components/WorldMapPanel.vue'));
const SkillPanel = lazyPanel(() => import('./components/SkillPanel.vue'));
const SkillIcon = defineComponent({
  inheritAttrs: false,
  setup(_props, { attrs }) {
    // Vue only passes `error` to errorComponent. Capture this icon's size so
    // both pending and failed downloads retain the same compact PNG fallback.
    const fallback = defineComponent({
      inheritAttrs: false,
      setup: () => () => {
        const size = Number(attrs.size) || 64;
        return h('img', {
          class: 'skill-icon', src: '/assets/light-anime/skills-imagegen-v2/__fallback.png',
          alt: '通用技能', width: size, height: size,
          style: { display: 'block', width: `${size}px`, height: `${size}px`, flex: '0 0 auto', objectFit: 'contain' }
        });
      }
    });
    const icon = defineAsyncComponent({
      loader: () => import('./components/SkillIcon.vue'),
      loadingComponent: fallback, errorComponent: fallback, delay: 0
    });
    return () => h(icon, attrs);
  }
});
const MarketPanel = lazyPanel(() => import('./components/MarketPanel.vue'));
const HomePanel = lazyPanel(() => import('./components/HomePanel.vue'));
const GuildShopPanel = lazyPanel(() => import('./components/GuildShopPanel.vue'));
const HomePurchasePanel = lazyPanel(() => import('./components/HomePurchasePanel.vue'));
const EvolutionPanel = lazyPanel(() => import('./components/EvolutionPanel.vue'));
const AdvancedProfessionPanel = lazyPanel(() => import('./components/AdvancedProfessionPanel.vue'));
const PartyPopup = lazyPanel(() => import('./components/PartyPopup.vue'));
const TurnBattlePanel = lazyPanel(() => import('./components/TurnBattlePanel.vue'));
const NegotiationPanel = lazyPanel(() => import('./components/NegotiationPanel.vue'));
const BookshopPanel = lazyPanel(() => import('./components/BookshopPanel.vue'), true);
const BankPanel = lazyPanel(() => import('./components/BankPanel.vue'), true);
const HandbookContent = lazyPanel(() => import('./components/HandbookContent.vue'), true);
const NotificationInbox = lazyPanel(() => import('./components/NotificationInbox.vue'), true);

useDialogNavigation();

type Tab = 'character' | 'inventory' | 'explore' | 'social' | 'world';
type SocialSection = 'friends' | 'oath' | 'party';
type WorldSection = 'overview' | 'market' | 'home';
type CharacterSection = 'profile' | 'equipment' | 'skills' | 'evolution' | 'advancedProfession';
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
const gameReady = ref(false);
const gameLoadStatus = ref('正在读取角色资料…');
const gameLoadError = ref('');
const gameLoadNeedsReload = ref(false);
const gameLoadProgress = ref<BootProgress>({ fraction: 0, completed: 0, total: 0, loadedBytes: 0, totalBytes: 0 });
let gameLoadController: AbortController | null = null;
let backgroundLoadController: AbortController | null = null;
let backgroundLoadTimer: number | undefined;
let gameLoadVersion = 0;
const gameLoadElapsed = ref(0);
let gameLoadStartedAt = performance.now();
let gameLoadElapsedTimer: number | undefined;
let authPreloadController: AbortController | null = null;
let authPreloadPromise: Promise<void> | undefined;
const authPreloadedPaths = new Set<string>();
let appDisposed = false;
const stopAuthPreloading = async () => {
  authPreloadController?.abort();
  await authPreloadPromise;
};
const startAuthPreloading = () => {
  if (appDisposed || loggedIn.value || authPreloadController) return;
  const controller = new AbortController();
  authPreloadController = controller;
  // Public interface art is shared by every account. Account-specific artwork
  // is still selected only after the server returns this player's current state.
  const paths = [
    '/assets/light-anime/auth-v4/loading-scene-wide-v1.webp',
    '/assets/light-anime/auth-v4/register-scene-wide-v1.webp',
    ...createCommonAssetPaths()
  ].filter(path => !authPreloadedPaths.has(path));
  let next = 0;
  const worker = async () => {
    while (next < paths.length && !controller.signal.aborted) {
      const path = paths[next++];
      try {
        await preparePlayerAssets([path], () => {}, controller.signal);
        authPreloadedPaths.add(path);
      } catch { /* Optional preloading never blocks authentication; foreground loading can retry. */ }
    }
  };
  authPreloadPromise = Promise.all([worker(), worker()]).then(() => {}).finally(() => {
    if (authPreloadController === controller) authPreloadController = null;
  });
};
watch(loggedIn, value => {
  if (value) {
    gameLoadStartedAt = performance.now();
    gameLoadElapsed.value = 0;
    gameLoadStatus.value = '正在读取角色资料…';
    void stopAuthPreloading();
  }
  else void stopAuthPreloading().then(startAuthPreloading);
});
const cancelBackgroundLoading = () => {
  if (backgroundLoadTimer !== undefined) window.clearTimeout(backgroundLoadTimer);
  backgroundLoadTimer = undefined;
  backgroundLoadController?.abort();
  backgroundLoadController = null;
};
const cancelGamePreparation = () => {
  gameLoadVersion += 1;
  gameLoadController?.abort();
  gameLoadController = null;
  cancelBackgroundLoading();
  gameReady.value = false;
  gameLoadError.value = '';
  gameLoadProgress.value = { fraction: 0, completed: 0, total: 0, loadedBytes: 0, totalBytes: 0 };
};
const appShell = ref<HTMLElement | null>(null);
const appViewportStyle = useAppViewport();
const characterScene = computed<CharacterScene | undefined>(() => loggedIn.value && tab.value === 'character'
  && (characterSection.value === 'profile' || characterSection.value === 'equipment' || characterSection.value === 'evolution')
  ? characterSection.value : undefined);
const { sceneFramingStyle, sceneFramed } = useCharacterSceneFraming(appShell, characterScene);
const displayName = ref('');
const channels = ref<ChatChannel[]>([]);
const socialSummary = ref<SocialSummary>({ friends: [], friendRequests: [], oath: null, oathRequests: [], oathReleaseRequests: [] });
const socialFriendView = ref<'friends' | 'requests'>('friends');
const socialOathView = ref<'partner' | 'requests' | 'release'>('partner');
const socialViewport = ref<HTMLElement | null>(null);
const socialPagingOptions = { container: socialViewport, rowHeight: () => window.innerHeight < 450 ? 108 : 152, gap: 6 };
const friendPaging = useViewportPagination(() => socialSummary.value.friends, socialPagingOptions);
const friendRequestPaging = useViewportPagination(() => socialSummary.value.friendRequests, socialPagingOptions);
const oathRequestPaging = useViewportPagination(() => socialSummary.value.oathRequests, socialPagingOptions);
const oathReleasePaging = useViewportPagination(() => socialSummary.value.oathReleaseRequests, socialPagingOptions);
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
const exploreCanvasActive = computed(() => loggedIn.value && gameReady.value && tab.value === 'explore' && !panel.value?.inBattle && !negotiation.value && !catalogOpen.value);
const explorationViewportStyle = useExplorationViewport(appShell, exploreCanvasActive);
const catalogLoaded = ref(false);
const manualOpen = ref(false);
const handbookOpen = ref(false);
const bankOpen = ref(false);
const guildShopTargetId = ref<string | null>(null);
const bookshopOpen = ref(false);
const homePurchaseMode = ref<'purchase' | 'shop' | null>(null);
const homePurchaseSiteTarget = ref<HomePurchaseSiteTarget | null>(null);
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
const settingsPage = ref<'overview' | 'password'>('overview');
const settingsExpanded = ref<'game' | 'account' | null>(null);
const settingsRenderExploration = ref(true);
const settingsAvatarInput = ref<HTMLInputElement | null>(null);
const settingsAvatarSource = ref('');
const settingsAvatarError = ref('');
const settingsAvatarBusy = ref(false);
let settingsAvatarVersion = 0;
let settingsAvatarController: AbortController | undefined;
const settingsRedeemCode = ref('');
const settingsRedeemBusy = ref(false);
const settingsRedeemFeedback = ref('');
const settingsRedeemFailed = ref(false);
const settingsUploadedAvatar = computed(() => {
  const value = panel.value?.account?.avatarUrl;
  return typeof value === 'string' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : '';
});
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
const settingsNickname = ref('');
const settingsGender = ref<'男' | '女' | ''>('');
const selectedSettingsGender = (gender: unknown) => gender === '男' || gender === '女' ? gender : '';
type SettingsIdentityChange = { kind: 'rename' | 'gender'; value: string; status: Awaited<ReturnType<typeof api.identityChanges>>; error: string };
const settingsIdentityChange = ref<SettingsIdentityChange | null>(null);
const settingsIdentityBusy = ref(false);
const settingsProfileFeedback = ref('');
const settingsIdentityCost = computed(() => {
  const change = settingsIdentityChange.value;
  return change ? change.kind === 'rename' ? change.status.rename : change.status.genderChange : null;
});
const settingsIdentityAvailable = computed(() => Boolean(settingsIdentityCost.value && (settingsIdentityCost.value.freeRemaining > 0 || settingsIdentityCost.value.cardQuantity >= settingsIdentityCost.value.requiredQuantity)));
const settingsCurrentPassword = ref('');
const settingsNewPassword = ref('');
const settingsPasswordConfirmation = ref('');
const showSettingsCurrentPassword = ref(false);
const showSettingsNewPassword = ref(false);
const showSettingsPasswordConfirmation = ref(false);
const persistLocalSetting = (key: string, value: string | number | boolean) => {
  try { localStorage.setItem(`fantasy-final.${key}`, String(value)); } catch { /* 浏览器禁用存储时仍可继续使用页面 */ }
};
const readLocalSetting = (key: string, fallback: string) => {
  try { return localStorage.getItem(`fantasy-final.${key}`) ?? fallback; } catch { return fallback; }
};
musicVolume.value = Math.min(100, Math.max(0, Number(readLocalSetting('music-volume', '70')) || 0));
musicEnabled.value = readLocalSetting('music-enabled', 'true') !== 'false';
settingsRenderExploration.value = readLocalSetting('exploration-render', 'true') !== 'false';
watch(musicVolume, value => persistLocalSetting('music-volume', value));
watch(musicEnabled, value => persistLocalSetting('music-enabled', value));
watch([bgmScene, musicEnabled, musicVolume], ([scene, enabled, volume]) => bgmPlayer?.update(scene, enabled, volume));
watch(settingsRenderExploration, value => persistLocalSetting('exploration-render', value));
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
const inventoryKeyword = ref('');
const inventoryPreviewKey = ref('');
const selectedInventoryItem = ref<InventoryDisplayItem | null>(null);
const inventoryUsePreview = ref(false);
watch(selectedInventoryItem, () => { inventoryUsePreview.value = false; });
watch(inventoryUsePreview, value => setCriticalPending('inventoryUse', value));
const feedbackToastKey = ref(0);
const pendingInteractions = ref<{ type: string; id: string; name: string; description?: string }[]>([]);
const pendingInteractionSelection = ref('');
const selectedPendingInteraction = computed(() => pendingInteractions.value.find(target => `${target.type}:${target.id}` === pendingInteractionSelection.value) ?? pendingInteractions.value[0]);
const openSelectedPendingInteraction = () => {
  const target = selectedPendingInteraction.value;
  if (!target || busy.value) return;
  pendingInteractions.value = [];
  void runCommand(`/坐标互动 ${target.type} ${target.id}`, { surface: 'interaction', title: target.name });
};
const pendingInteractionArtwork = (target: { type: string; id: string; name: string }) => {
  const point = panel.value?.nearby?.points?.find(point => point.interaction?.type === target.type && point.interaction.id === target.id);
  const type = ({ resource: '资源', player: '玩家', npc: '域民', entrance: '入口' } as Record<string, string>)[target.type] ?? target.type;
  return mapTargetArt(point ?? { type, name: target.name }).src;
};
const interactionTypeName = (type: string) => ({ resource: '资源', building: '建筑', player: '玩家', npc: '人物', entrance: '入口', landmark: '地标' }[type] ?? type);
const realtime = ref<WebSocket | null>(null);
let refreshTimer: number | undefined;
let actionCountdownTimer: number | undefined;
let feedbackToastTimer: number | undefined;
let authGeneration = 0;
const currentAuthRequest = () => ({ generation: authGeneration, token: api.token() });
const isCurrentAuthRequest = (request: { generation: number; token: string }) => request.generation === authGeneration && request.token !== '' && api.token() === request.token;
const CHAT_PAGE_SIZE = 20;
let loadedMessagesChannelId: string | null = null;
let chatChannelVersion = 0;
let chatOldestMessageId: number | null = null;
let chatNewestMessageId: number | null = null;
const miningRemaining = ref(0);
const travelRemaining = ref(0);
const travelPlanningTarget = ref('');
const localExplorationMap = ref<api.ExploreLocalMap>();
const committedMapSnapshot = ref<api.ExploreLocalMap>();
let committedVisionRequest: AbortController | undefined;
const routeVisionStep = ref<api.ExploreRouteStep>();
const routeVisionMap = ref<Omit<api.ExploreLocalMap, 'ok'>>();
const environmentRemaining = ref(0);
let environmentSettlement: { generation: number; token: string; jobId: string } | null = null;
let nextEnvironmentSettleAt = 0;
let localMapRequestVersion = 0;
let mapRouteRefreshNeeded = false;
const mapTargetPopupRequest = ref<MapTargetPopupRequest>();
let mapTargetPopupId = 0;
let mapRouteStoppedResult: MovementStopResult | undefined;
const mapRoute = useExplorationRoute({
  current: () => mapCurrent.value,
  session: () => currentAuthRequest(),
  isCurrentSession: request => isCurrentAuthRequest(request),
  active: () => loggedIn.value && tab.value === 'explore' && !panel.value?.inBattle && !negotiation.value && !storyGuide.value && !catalogOpen.value,
  localPreview: to => knownExplorationRoute(localExplorationMap.value, mapCurrent.value, to, localExplorationMap.value?.nearby?.points ?? panel.value?.nearby?.points ?? []),
  preview: api.exploreRoutePreview,
  step: api.exploreRouteStep,
  vision: (result, previous) => {
    const snapshot = result?.localMap;
    routeVisionStep.value = result?.moved && snapshot && ['x', 'y', 'z', 'regionId'].every(key =>
      snapshot.origin[key as keyof api.ExploreRoutePosition] === result.position[key as keyof api.ExploreRoutePosition]) ? result : undefined;
    routeVisionMap.value = routeVisionStep.value && snapshot ? adjacentVision(previous?.localMap ?? localExplorationMap.value, snapshot, performance.now()) : undefined;
  },
  apply: async (result, show) => {
    const request = currentAuthRequest();
    const compact = compactStepPanel(panel.value, result);
    if (result.panel) panel.value = result.panel;
    else if (compact) { panel.value = compact; mapRouteRefreshNeeded = true; }
    else {
      // Preserve the confirmed landing even if a follow-up panel read fails.
      if (panel.value?.summary) panel.value = { ...panel.value, summary: { ...panel.value.summary, position: result.position }, mapData: panel.value.mapData ? { ...panel.value.mapData, current: { name: mapCurrent.value.name ?? '未知区域', ...result.position } } : undefined };
      if (mapRoute.replaying.value) mapRouteRefreshNeeded = true;
      else await loadPanel();
    }
    if (!isCurrentAuthRequest(request)) return;
    if (result.localMap && result.moved && ['x', 'y', 'z', 'regionId'].every(key =>
      result.localMap!.origin[key as keyof api.ExploreRoutePosition] === result.position[key as keyof api.ExploreRoutePosition])) {
      localMapRequestVersion += 1;
      localExplorationMap.value = { ok: true, ...result.localMap };
    }
    pendingInteractions.value = [];
    if (show && result.presentation === 'story') { showStoryResult(result); notice.value = ''; }
    else if (show) notice.value = result.text;
    if (show) mapRouteStoppedResult = result;
    if (!result.localMap && !mapRoute.replaying.value) void loadLocalExplorationMap();
  },
  failed: async value => {
    if (isCurrentEncounterBlock(value)) mapRouteStoppedResult = { message: api.userFacingErrorMessage(value), position: { ...mapCurrent.value }, regionCode: regionMap.value.currentRegionCode };
    setError(value); await loadPanel();
  }
});
const committedMapMotion = useCommittedExplorationMotion();
const mapRestingHeading = ref<MapHeading>('down');
const mapMovePending = computed(() => mapRoute.pending.value || committedMapMotion.pending.value);
const mapMovementTarget = computed(() => mapRoute.target.value ?? committedMapMotion.target.value ?? travelVisual.value?.target);
const travelVisual = computed(() => panel.value?.summary?.travel?.activityType !== 'hunt' ? panel.value?.summary?.travel?.visual : undefined);
const mapTravelMotion = useExplorationTravelMotion(travelVisual, computed(() => loggedIn.value && gameReady.value && tab.value === 'explore' && !panel.value?.inBattle && !negotiation.value));
const travelMapVision = useExplorationTravelVision({
  visual: travelVisual, frame: mapTravelMotion,
  enabled: computed(() => loggedIn.value && gameReady.value && tab.value === 'explore' && !panel.value?.inBattle && !negotiation.value && !mapMovePending.value),
  session: () => currentAuthRequest(), isCurrentSession: session => isCurrentAuthRequest(session),
  load: signal => api.exploreLocalMap(signal, 'travel')
});
const travelMapSnapshot = computed(() => travelVisual.value?.id && travelMapVision.snapshot.value?.travelView?.id === travelVisual.value.id
  ? travelMapVision.snapshot.value : undefined);
const mapSceneMotion = computed(() => committedMapMotion.frame.value ?? mapTravelMotion.value);
const mapDisplayPosition = computed(() => mapRoute.displayPosition.value ?? mapSceneMotion.value?.position);
const mapTravelVisualCenter = computed(() => {
  const position = mapSceneMotion.value?.position;
  return !mapRoute.pending.value && position ? { x: Math.round(position.x), y: Math.round(position.y), z: position.z, name: position.regionName, regionCode: position.regionCode } : undefined;
});
const mapMovementHeading = computed(() => mapRoute.pending.value ? undefined : mapSceneMotion.value?.heading ?? mapRestingHeading.value);
const mapMovementSpeed = computed(() => mapRoute.pending.value ? mapRoute.speed.value : mapSceneMotion.value?.speed);
const mapActualMovementSpeed = computed(() => [mapMovementSpeed.value, mapRenderSnapshot.value?.movement.speed, panel.value?.movement?.speed, panel.value?.summary?.movement?.speed]
  .find(value => typeof value === 'number' && Number.isFinite(value) && value > 0));
const mapAuthoritativeMovementSpeed = computed(() => [panel.value?.movement?.speed, panel.value?.summary?.movement?.speed, panel.value?.movement?.maximum, panel.value?.summary?.movementMaximum].find(value => typeof value === 'number' && Number.isFinite(value) && value > 0) ?? 1);
const clearMapMoveAnimation = () => { mapTargetPopupRequest.value = undefined; mapRouteStoppedResult = undefined; mapRestingHeading.value = 'down'; mapRoute.reset(); committedMapMotion.reset(); travelMapVision.reset(); committedVisionRequest?.abort(); committedMapSnapshot.value = undefined; };
let mapNavigationVersion = 0;
watch(tab, () => { mapNavigationVersion += 1; mapTargetPopupRequest.value = undefined; catalogOpen.value = false; }, { flush: 'sync' });
watch([tab, loggedIn], ([nextTab, authenticated]) => {
  if (!authenticated) { clearMapMoveAnimation(); localExplorationMap.value = undefined; travelPlanningTarget.value = ''; travelAutoSettling = false; travelRemaining.value = 0; }
  else if (nextTab !== 'explore' && mapMovePending.value) { mapRoute.cancel(); committedMapMotion.cancel(); }
}, { flush: 'sync' });
const mapAvatarMoving = computed(() => {
  if (tab.value !== 'explore' || !loggedIn.value || panel.value?.inBattle || negotiation.value || panel.value?.mining) return false;
  return mapRoute.animating.value || Boolean(mapSceneMotion.value?.moving);
});
let miningAutoSettling = false;
let travelAutoSettling = false;
let nextTravelSettleAt = 0;
const autoBattleOpen = ref(false);
const autoBattleBusy = ref(false);
const autoBattleMode = ref<api.AutoBattleMode>('pve');
const autoBattleSettings = ref<AutoBattleConfig | null>(null);
const autoBattleLoadError = ref('');
const autoBattleSkillChoices = ref<AutoBattleSkillChoice[]>([]);
const autoBattlePotionChoices = ref<{ id: number; name: string }[]>([]);
const autoBattleHpThreshold = ref(30);
const autoBattleMpThreshold = ref(30);
type FloatingSocialPanel = 'chat' | 'party' | 'team' | 'friend' | 'system';
const floatingSocialOpen = ref<FloatingSocialPanel | null>(null);
const chatDrafts = new Map<string, string>();
const lastFriendChatChannel = ref('');
const exploreChatTabs: Record<FloatingSocialPanel, ExploreChatTab> = { chat: 'world', party: 'recruitment', team: 'team', friend: 'friend', system: 'system' };
const exploreChatTab = computed(() => exploreChatTabs[floatingSocialOpen.value ?? 'chat']);
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
const floatingSocialHeight = ref(0);
let floatingDragState: { pointerId: number; startX: number; startY: number; originX: number; originY: number; originLeft: number; originTop: number; width: number; height: number; moved: boolean; captured: boolean } | null = null;
let modalDragState: { kind: 'social' | 'team'; pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean; captured: boolean } | null = null;
let socialResizeState: { pointerId: number; startY: number; originHeight: number; originOffsetY: number; minHeight: number; maxHeight: number; captured: boolean } | null = null;
let suppressFloatingClick = false;
let suppressFloatingClickTimer: number | undefined;

const recruitmentChannel = computed(() => channels.value.find(item => item.id === 'party:lobby'));
const currentPartyChannel = computed(() => channels.value.find(item => item.type === 'party' && item.id !== 'party:lobby'));
const isInParty = computed(() => Boolean(currentParty.value || currentPartyChannel.value));
const friendChannels = computed(() => channels.value.filter(item => item.type === 'friend'));
const exploreChatCanSend = computed(() => {
  const selected = floatingSocialOpen.value;
  if (!selected || selected === 'system') return false;
  if (selected === 'chat') return activeChannel.value === 'world' && channels.value.some(channel => channel.id === 'world');
  if (selected === 'party') return activeChannel.value === recruitmentChannel.value?.id;
  if (selected === 'team') return Boolean(currentPartyChannel.value && activeChannel.value === currentPartyChannel.value.id);
  return friendChannels.value.some(channel => channel.id === activeChannel.value);
});
const exploreChatChannelName = computed(() => {
  if (floatingSocialOpen.value === 'chat') return '世界频道';
  if (floatingSocialOpen.value === 'party') return '招募频道';
  if (floatingSocialOpen.value === 'team') return currentPartyChannel.value?.name || '队伍频道';
  if (floatingSocialOpen.value === 'friend') return friendChannels.value.find(channel => channel.id === activeChannel.value)?.name || '好友私信';
  return '系统通知';
});
const exploreChatStatusText = computed(() => {
  if (floatingSocialOpen.value === 'team' && !currentPartyChannel.value) return '加入或创建队伍后，就能和队友在这里聊天。';
  if (floatingSocialOpen.value === 'friend' && !friendChannels.value.length) return '还没有可私信的好友，结识伙伴后再来聊聊吧。';
  if (floatingSocialOpen.value === 'system') return '冒险旅途中的通知与消息，会收录在这里。';
  return exploreChatCanSend.value ? '' : '频道暂时不可用，请稍后重试。';
});

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
  '--chat-height': floatingSocialHeight.value > 0 ? `${floatingSocialHeight.value}px` : 'var(--explore-window-height)'
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
  if (panelName === 'system') return;
  const channelId = panelName === 'chat' ? 'world'
    : panelName === 'party' ? recruitmentChannel.value?.id
    : panelName === 'team' ? currentPartyChannel.value?.id
    : friendChannels.value.find(channel => channel.id === activeChannel.value)?.id
      ?? friendChannels.value.find(channel => channel.id === lastFriendChatChannel.value)?.id
      ?? friendChannels.value[0]?.id;
  if (activeChannel.value !== (channelId ?? '')) selectChannel(channelId ?? '');
};
const openFloatingSocial = (panelName: FloatingSocialPanel) => {
  floatingSocialOpen.value = panelName;
  teamPopupOpen.value = false;
  if (panelName === 'party') floatingDockExpanded.value = true;
  if (panelName === 'party' || panelName === 'team') void refreshPartyData();
  if (panelName === 'system') { void loadNotifications(); return; }
  focusFloatingChannel(panelName);
  void loadSocial().then(() => {
    if (floatingSocialOpen.value === panelName) focusFloatingChannel(panelName);
  });
};
const selectExploreChatTab = (selected: ExploreChatTab) => {
  const panels: Record<ExploreChatTab, FloatingSocialPanel> = { world: 'chat', recruitment: 'party', team: 'team', friend: 'friend', system: 'system' };
  openFloatingSocial(panels[selected]);
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

const title = computed(() => ({ character: '角色', inventory: '背包', explore: '探索', social: '社交', world: '世界' }[tab.value]));
const characterSections: { id: CharacterSection; label: string; icon: TabArtKey }[] = [
  { id: 'profile', label: '角色', icon: 'profile' },
  { id: 'equipment', label: '装备', icon: 'equipment' },
  { id: 'skills', label: '技能', icon: 'skills' },
  { id: 'evolution', label: '进化', icon: 'evolution' },
  { id: 'advancedProfession', label: '职业', icon: 'advanced-profession' }
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
const socialOwnPortrait = computed(() => characterData.value.portrait);
const socialPortraitFor = (person: api.SocialIdentity) => person.portrait;
const socialIdentityText = (person: api.SocialIdentity) => [person.gender, person.level === undefined ? undefined : `Lv.${person.level}`, person.profession].filter(Boolean).join(' · ');
const socialMessagePortrait = (message: api.ChatMessage) => message.senderPortrait ?? (message.own ? socialOwnPortrait.value : undefined);
const socialAffinityProgress = (person: { affinity: number; affinityProgress?: { min: number; nextMin: number | null; toNext: number } }) => {
  const progress = person.affinityProgress;
  if (!progress || progress.nextMin === null || progress.nextMin <= progress.min) return undefined;
  return { percent: Math.max(0, Math.min(100, (person.affinity - progress.min) / (progress.nextMin - progress.min) * 100)), ...progress };
};
const socialDateText = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const equipmentSlotDefinitions = [
  { id: 'weapon', label: '武器', icon: '⚔' },
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
const equipmentRarityClass = (item?: CharacterEquipmentEntry) => `equipment-rarity-${item ? normalizeItemRarity(item.rarity) : 'empty'}`;
const equipmentLeftSlots = ['shoulder', 'upper', 'waist', 'lower', 'feet'].map(id => equipmentSlotDefinitions.find(slot => slot.id === id)!);
const equipmentRightSlots = ['weapon', 'offhand', 'necklace', 'bracelet', 'ring'].map(id => equipmentSlotDefinitions.find(slot => slot.id === id)!);
const selectedEquipment = ref<CharacterEquipmentEntry | null>(null);
const selectedEquipmentDetails = ref<api.EquippedEquipmentDetails | null>(null);
const equipmentDetailsLoading = ref(false);
const equipmentDetailsError = ref('');
let equipmentDetailsVersion = 0;
let equipmentDetailsRequest: AbortController | null = null;
const selectedEquipmentCategory = computed(() => {
  const item = selectedEquipment.value;
  if (!item) return '';
  const category = item.itemCategory || '装备';
  const slot = equipmentSlotDefinitions.find(slot => slot.id === item.slot)?.label;
  return slot && slot !== category ? `${category} · ${slot}` : category;
});
watch([() => panel.value?.account?.uid, () => panel.value?.account?.gameUserId], () => { selectedEquipment.value = null; }, { flush: 'sync' });
watch(() => characterData.value.equipment, equipment => {
  const selected = selectedEquipment.value;
  if (selected) selectedEquipment.value = equipment.find(item => item.slot === selected.slot && item.id === selected.id && item.code === selected.code) ?? null;
});
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
const profileViewportGroups = computed(() => [
  { id: 'base', label: '六维', entries: baseAttributeDefinitions.map(stat => ({ key: stat.key, label: stat.label, value: formatAttributeValue(baseAttributeValue(stat.key)), help: attributeHelpText(stat.key) })) },
  { id: 'attributes', label: '属性', entries: [
    ...combatStatDefinitions.map(stat => ({ key: stat.key, label: stat.label, value: combatStatValue(stat.key), help: attributeHelpText(stat.key) })),
    ...extraAttributeEntries.value.map(item => ({ key: item.key, label: `额外 · ${item.label}`, value: `${item.value > 0 ? '+' : ''}${item.value}${item.unit}`, help: attributeHelpText(item.key) }))
  ] },
  { id: 'mastery', label: '元素精通', help: attributeHelpText('elementMastery'), entries: elementMasteryEntries.value.map(([element, value]) => ({ key: `mastery-${element}`, label: element, value, help: attributeHelpText('elementMastery') })) },
  { id: 'resistance', label: '抗性', help: attributeHelpText('elementResistance'), entries: elementResistanceEntries.value.map(([element, value]) => ({ key: `resistance-${element}`, label: element, value, help: attributeHelpText('elementResistance') })) }
]);
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
  if (committedMapMotion.pending.value) return {
    title: '正在沿路线前往',
    detail: `${Math.floor((committedMapMotion.frame.value?.progress ?? 0) * committedMapMotion.distance.value)} / ${committedMapMotion.distance.value} 格`,
    stopLabel: '停止前往'
  };
  if (mapMovePending.value) return {
    title: mapRoute.cancelling.value ? '正在停止移动' : mapRoute.animating.value ? '正在沿路线前往' : '正在确认路线',
    detail: mapRoute.total.value ? `${mapRoute.completed.value} / ${mapRoute.total.value} 格` : '按当前可感知、可移动范围规划',
    stopLabel: '停止前往',
    stopDisabled: mapRoute.cancelling.value
  };
  const mining = panel.value?.mining;
  const environmentJob = localExplorationMap.value?.environmentJob;
  if (environmentJob) return {
    title: `正在清理：${environmentJob.objectName}`,
    detail: '清理完成后通路将打开，掉落物品放入背包。',
    countdown: formatMiningDuration(environmentRemaining.value),
    stopLabel: '停止清理',
    stopDisabled: busy.value
  };
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
const mapActionArtwork = computed(() => {
  const mining = panel.value?.mining;
  return mining && ['植被', '矿脉', '资源'].includes(mining.kind) ? mapTargetArt({ type: mining.kind, name: mining.name }).src : '';
});
const mapPoints = computed<ExploreMapPoint[]>(() => {
  const guildShopCodes = new Set(['guild_counter', 'world_tree_adventurer_guild', 'windbranch_guild', 'dragon_inn_counter']);
  const seenResourceCoordinates = new Set<string>();
  const points = (travelMapSnapshot.value?.nearby?.points ?? committedMapSnapshot.value?.nearby?.points ?? routeVisionStep.value?.stepState?.nearby.points ?? (routeVisionStep.value?.panel ?? panel.value)?.nearby?.points ?? []).filter(point => {
    if (point.type !== '矿脉' && point.type !== '植被' && point.type !== '资源') return true;
    const key = `${point.type}:${point.code ?? point.name}:${point.x}:${point.y}:${point.z ?? mapCurrent.value.z}`;
    if (seenResourceCoordinates.has(key)) return false;
    seenResourceCoordinates.add(key);
    return true;
  });
  return points.map(point => {
  const icon = point.type === '怪物' ? '◆' : point.type === 'NPC' || point.type === '域民' ? '☻' : point.type === '建筑' ? '⌂' : point.type === '资源' || point.type === '矿脉' ? '✦' : '•';
  const z = point.z;
  const observedRegionId = mapRenderSnapshot.value?.origin.regionId;
  const acrossRegion = point.regionId !== undefined && observedRegionId !== undefined ? point.regionId !== observedRegionId
    : Boolean(point.regionCode && mapVisionRegionCode.value && point.regionCode !== mapVisionRegionCode.value);
  const observedOnly = point.observedOnly === true || acrossRegion;
  const atCurrent = !observedOnly && point.x === mapCurrent.value.x && point.y === mapCurrent.value.y && (z === undefined || z === mapCurrent.value.z);
  const actions: ExploreMapPoint['actions'] = [];
  if (point.type === '怪物' && point.code) {
    if (!atCurrent) {
      if (!observedOnly) {
        actions.push(
          { id: 'move', label: '前往', position: { x: point.x, y: point.y, z }, tone: 'primary' },
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
      if (!observedOnly && distance <= mapMoveRange.value) actions.push({ id: 'move', label: '前往', position: { x: point.x, y: point.y, z }, tone: 'primary' });
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
    templateCode: point.templateCode,
    portrait: point.portrait,
    ...(typeof point.level === 'number' && Number.isFinite(point.level) ? { level: point.level } : {}),
    name: point.name,
    type: point.type,
    icon,
    x: point.x,
    y: point.y,
    z,
    regionId: point.regionId,
    regionCode: point.regionCode,
    interaction: point.interaction,
    distance: point.distance,
    discovered: !observedOnly,
    interactable: actions.length > 0,
    description: observedOnly ? acrossRegion ? '目标位于相邻地图，目前只能观察；进入对应地图后才能互动。' : '目标位于额外感知范围内，目前只能观察。' : `位于 ${point.x}, ${point.y}，距离 ${point.distance} 格。${point.type === '建筑' && point.code && guildShopCodes.has(point.code) && point.code !== 'guild_counter' ? '首次使用公会商店，请先点“进入”登记到访。' : ''}`,
    ...(actions.length ? { actions } : {})
  };
  });
});
const localMapMatchesCurrent = computed(() => localExplorationMap.value && ['x', 'y', 'z'].every(key => localExplorationMap.value!.origin[key as 'x' | 'y' | 'z'] === (mapCurrent.value[key as 'x' | 'y' | 'z'] ?? 0)));
// An ongoing committed walk may keep its previously observed scenery. Actions
// remain locked during that replay; an idle mismatched map never enables input.
const localMapVisibleSnapshot = computed(() => localMapMatchesCurrent.value || Boolean(mapMovePending.value
  && localExplorationMap.value && localExplorationMap.value.origin.z === mapCurrent.value.z));
const mapRenderSnapshot = computed(() => travelMapSnapshot.value ?? committedMapSnapshot.value ?? routeVisionMap.value ?? (localMapVisibleSnapshot.value ? localExplorationMap.value : undefined));
const mapVisionCurrent = computed<MapPosition>(() => travelMapSnapshot.value
  ? { ...travelMapSnapshot.value.origin, name: travelMapSnapshot.value.travelView?.position.regionName ?? mapCurrent.value.name }
  : routeVisionStep.value?.localMap
  ? { ...routeVisionStep.value.localMap.origin, name: routeVisionStep.value.stepState?.region ?? routeVisionStep.value.panel?.summary?.region ?? mapCurrent.value.name }
  : mapCurrent.value);
const mapVisionRegionCode = computed(() => mapRenderSnapshot.value?.cells?.find(cell => cell.x === mapVisionCurrent.value.x && cell.y === mapVisionCurrent.value.y && cell.z === mapVisionCurrent.value.z)?.regionCode ?? regionMap.value.currentRegionCode);
const mapCells = computed(() => mapRenderSnapshot.value?.cells);
const mapEnvironment = computed(() => mapRenderSnapshot.value?.environment ?? []);
const mapSurfaceScene = computed(() => mapRenderSnapshot.value?.surfaceScene);
const mapGroundWindow = computed(() => mapRenderSnapshot.value?.groundWindow);
const requestStoppedMapTarget = async (result: MovementStopResult | undefined, request: ReturnType<typeof currentAuthRequest>, navigationVersion: number) => {
  if (!result || !isTargetMovementStop(result)) return;
  await nextTick();
  const canOpen = () => isCurrentAuthRequest(request) && navigationVersion === mapNavigationVersion && tab.value === 'explore'
    && !(busy.value || mapMovePending.value || mapActionLock.value || panel.value?.inBattle || panel.value?.pendingStory
    || storyGuide.value || negotiation.value || interactionOpen.value || pendingInteractions.value.length
    || catalogOpen.value || manualOpen.value || handbookOpen.value || bankOpen.value || bookshopOpen.value
    || homePurchaseMode.value || guildShopTargetId.value || autoBattleOpen.value);
  if (!canOpen()) return;
  // A timed arrival may have left the old origin's ground window behind. Read
  // only the actual current window before enabling its existing target sheet.
  if (!localMapMatchesCurrent.value || mapVisionRegionCode.value !== regionMap.value.currentRegionCode) {
    await loadLocalExplorationMap();
    await nextTick();
    if (!canOpen() || !localMapMatchesCurrent.value || mapVisionRegionCode.value !== regionMap.value.currentRegionCode) return;
  }
  const playerKey = panel.value?.account?.uid ?? panel.value?.account?.gameUserId;
  const regionCode = regionMap.value.currentRegionCode;
  if (!playerKey || !regionCode) return;
  const current = { ...mapCurrent.value, regionId: localExplorationMap.value?.origin.regionId, regionCode };
  const pointIds = stoppedMovementPointIds(result, current, mapPoints.value);
  if (pointIds.length) mapTargetPopupRequest.value = { id: ++mapTargetPopupId, pointIds, playerKey, regionCode, position: { ...mapCurrent.value } };
};
const mapMoveRange = computed(() => Math.max(0, Number(mapRenderSnapshot.value?.range ?? panel.value?.nearby?.range ?? 0)));
const mapSightRange = computed(() => Math.max(0, Number(mapRenderSnapshot.value?.range ?? panel.value?.nearby?.range ?? 0)));
const regionMap = computed(() => {
  const source = panel.value?.regionMap;
  const map = panel.value?.mapData;
  const current = map?.current;
  const members = source?.members ?? (map?.partyMembers ?? []).map(member => ({ id: String(member.id), name: member.name, x: member.x, y: member.y, z: member.z, regionCode: member.regionCode, regionName: member.regionName, isCurrent: member.isSelf, portrait: member.portrait }));
  const landmarks = [...(source?.landmarks ?? (map?.landmarks ?? []).map(landmark => ({ id: landmark.code, code: landmark.code, name: landmark.name, x: landmark.x, y: landmark.y, z: landmark.z, regionCode: landmark.regionCode, regionName: landmark.regionName, type: landmark.type })))];
  const regions = [...(source?.regions ?? (map?.maps ?? []).map(item => ({ code: item.code, name: item.name, danger: item.danger, isCurrent: item.isCurrent, bounds: item.bounds, current: item.isCurrent && current ? { x: current.x, y: current.y, z: current.z } : undefined })))];
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
  const keyword = inventoryKeyword.value.trim().toLocaleLowerCase();
  return [...stacked, ...instances].filter(item => !keyword || item.name.toLocaleLowerCase().includes(keyword) || item.code?.toLocaleLowerCase().includes(keyword));
});
const inventoryItemKey = (item: InventoryDisplayItem) => `${item.instance ? 'instance' : 'stack'}:${item.id ?? item.name}`;
const inventoryRarity = (item: InventoryDisplayItem) => normalizeItemRarity(item.rarity);
const inventoryViewport = ref<HTMLElement | null>(null);
const inventoryColumns = () => Math.max(1, Math.min(10, Math.floor(((inventoryViewport.value?.clientWidth ?? 320) + 6) / 78)));
const inventoryRowHeight = () => ((inventoryViewport.value?.clientWidth ?? 320) - (inventoryColumns() - 1) * 6) / inventoryColumns() + 26;
const inventoryPaging = useViewportPagination(() => inventoryItems.value, {
  container: inventoryViewport, rowHeight: inventoryRowHeight, gap: 6, columns: inventoryColumns
});
watch([inventoryCategory, inventoryEquipmentGroup, inventorySubcategory, inventoryKeyword], inventoryPaging.reset);
const inventoryPreviewItem = computed(() => inventoryItems.value.find(item => inventoryItemKey(item) === inventoryPreviewKey.value) ?? inventoryItems.value[0] ?? null);
watch(() => panel.value?.account?.uid, () => { inventoryPreviewKey.value = ''; });
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
    portrait: member.id === source.characterId ? portraitBaseAsset(characterData.value.portrait) : undefined,
    id: String(member.id), name: member.name, role: member.companion ? '伙伴' : '冒险者', hp: { current: Number(member.hp), max: Number(member.hpMax) }, mp: { current: Number(member.mp ?? 0), max: Number(member.mpMax ?? 0) }, defeated: Boolean(member.defeated), active: member.id === source.characterId && !member.pending && !member.defeated, status: member.statusText ? [member.statusText] : []
  }));
  const enemies = (source.targets ?? []).map(target => ({
    portrait: mapTargetArt({ type: source.mode === 'pvp' || source.mode === 'spar' ? '玩家' : '怪物', name: target.name }).src,
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
    actions.push({ id: `skill:${skill.slot}`, label: `${'①②③④'[skill.slot - 1] ?? skill.slot} ${skill.name}`, category: 'skill', icon: '✧', skillCode: skill.code, targeting, allowedTargets: { [targeting === 'ally' ? 'ally' : 'enemy']: asIds(targetIds) }, cost: skill.requiresSpecialInput ? undefined : `基础 ${skill.baseManaCost} MP${(skill.targetCount ?? 0) > 1 ? ' · 其余目标自动选取' : ''}`, cooldown: skill.cooldownRemaining, description: skill.requiresSpecialInput ? '需要专用选择，暂不可在此施放' : undefined, disabled: skill.cooldownRemaining > 0 || Boolean(skill.requiresSpecialInput) || (targeting !== 'none' && targetIds?.length === 0) });
  }
  for (const skill of source.advancedSkills ?? []) {
    const targeting = skill.targeting ?? 'enemy';
    const targetIds = skill.targetIds ?? (targeting === 'ally' ? source.selectableAllyIds : source.selectableEnemyIds);
    actions.push({ id: `advanced:${skill.id}`, label: skill.name, category: 'skill', icon: '✦', skillCode: skill.code, targeting, allowedTargets: { [targeting === 'ally' ? 'ally' : 'enemy']: asIds(targetIds) }, cost: skill.requiresSpecialInput ? undefined : `基础 ${skill.baseManaCost ?? 0} MP${(skill.targetCount ?? 0) > 1 ? ' · 其余目标自动选取' : ''}`, cooldown: skill.cooldownRemaining, description: skill.requiresSpecialInput ? '需要专用选择，暂不可在此施放' : undefined, disabled: (skill.cooldownRemaining ?? 0) > 0 || Boolean(skill.requiresSpecialInput) || (targeting !== 'none' && targetIds?.length === 0) });
  }
  if (source.mode !== 'spar') {
    for (const item of source.quickItems ?? []) actions.push({ id: `item:${item.slot}`, label: `${'①②③④'[item.slot - 1] ?? item.slot} ${item.name}`, category: 'item', icon: '✚', targeting: item.targeting, allowedTargets: { [item.targeting === 'ally' ? 'ally' : 'enemy']: asIds(item.targetIds) }, description: `持有 ${item.quantity}`, disabled: !item.usable || (item.targeting !== 'none' && item.targetIds?.length === 0) });
    for (const device of source.deviceSlots ?? []) for (const skill of device.skills) {
      const needsCharge = device.currentEnergy < skill.energyCost;
      const targeting = needsCharge || ['self', 'all_allies', 'all_enemies'].includes(skill.targetScope) ? 'none' : skill.targetScope === 'any' ? 'any' : skill.targetScope === 'ally' ? 'ally' : 'enemy';
      actions.push({ id: `device:${device.slot}:${skill.code}`, label: `${device.deviceName}·${skill.name}`, category: 'special', icon: '✺', skillCode: skill.code, targeting, allowedTargets: { ally: asIds(skill.allyTargetIds), enemy: asIds(skill.enemyTargetIds) }, description: needsCharge ? `能量 ${device.currentEnergy}/${device.maxEnergy}，本回合充能` : `消耗 ${skill.energyCost} 能量`, disabled: !skill.ready || (targeting !== 'none' && !skill.allyTargetIds?.length && !skill.enemyTargetIds?.length) });
    }
  }
  if (source.canLeafAnchor) actions.push({ id: 'anchor', label: '重新锚定', category: 'special', icon: '✥', targeting: 'none', description: '本场仅可使用一次' });
  const waiting = ownMember?.pending || source.canAct === false;
  return { revision: `${source.sessionId ?? ''}:${source.turn ?? 0}:${Boolean(source.bonusPhase)}`, title: source.mode === 'pvp' ? '玩家对战' : source.mode === 'spar' ? '切磋' : '野外遭遇战', round: Number(source.turn ?? 1), phase: waiting ? 'waiting' : 'player', turnLabel: ownMember?.pending ? '已提交行动，等待队友' : waiting ? '等待战斗推进' : '轮到你行动', statusText: '选择下方行动；需要指定目标时，再点击场上高亮的立绘。', allies, enemies, actions, log: battleLog.value };
});
watch(() => panel.value?.battle?.sessionId, (next, previous) => { if (next !== previous) battleLog.value = []; });

const setError = (value: unknown) => {
  error.value = api.userFacingErrorMessage(value);
  if (!api.token()) {
    loggedIn.value = false;
    panel.value = null;
  }
};
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
  // Match the inbox service: gameplay feedback belongs in its action panel.
  for (const item of [...current, ...incoming]) {
    if (['system', 'party', 'friend', 'mail', 'world'].includes(item.category)) byId.set(item.id, item);
  }
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
    if (isCurrentAuthRequest(request) && (notificationOpen.value || floatingSocialOpen.value === 'system')) notificationError.value = api.userFacingErrorMessage(e);
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
    if (isCurrentAuthRequest(request) && (notificationOpen.value || floatingSocialOpen.value === 'system')) notificationError.value = api.userFacingErrorMessage(e);
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
const desktopExploreVisible = () => tab.value === 'explore' && window.matchMedia('(min-width: 1180px)').matches;
watch([tab, () => panel.value?.account?.uid], ([selectedTab, uid]) => {
  if (uid && selectedTab === 'explore' && desktopExploreVisible() && panel.value?.account?.hasCharacter !== false && !partyLoading.value) void refreshPartyData();
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
    if (floatingSocialOpen.value && floatingSocialOpen.value !== 'system') focusFloatingChannel(floatingSocialOpen.value);
    else if (!channels.value.some(item => item.id === activeChannel.value)) selectChannel(channels.value[0]?.id ?? 'world');
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
  const channelVersion = chatChannelVersion;
  if (!channelId) return;
  if (!request.token) return;
  try {
    const shouldReset = options.reset === true || loadedMessagesChannelId !== channelId;
    const result = await api.messages(channelId, undefined, CHAT_PAGE_SIZE);
    if (!isCurrentAuthRequest(request) || activeChannel.value !== channelId || chatChannelVersion !== channelVersion) return;
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
  catch (e) { if (isCurrentAuthRequest(request) && activeChannel.value === channelId && chatChannelVersion === channelVersion) setError(e); }
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
  const channelVersion = chatChannelVersion;
  const beforeId = chatOldestMessageId ?? messages.value[0]?.id ?? null;
  if (!request.token || !channelId || !beforeId || chatLoadingEarlier.value || !chatHasEarlier.value) return;
  const list = chatMessageListRef.value;
  const previousHeight = list?.scrollHeight ?? 0;
  const previousTop = list?.scrollTop ?? 0;
  chatLoadingEarlier.value = true;
  try {
    const result = await api.messages(channelId, beforeId, CHAT_PAGE_SIZE);
    if (!isCurrentAuthRequest(request) || activeChannel.value !== channelId || chatChannelVersion !== channelVersion) return;
    messages.value = mergeChatMessages(result.messages, messages.value);
    chatOldestMessageId = messages.value[0]?.id ?? chatOldestMessageId;
    chatHasEarlier.value = result.hasMore ?? result.messages.length >= CHAT_PAGE_SIZE;
    await nextTick();
    const nextList = chatMessageListRef.value;
    if (nextList) nextList.scrollTop = nextList.scrollHeight - previousHeight + previousTop;
  } catch (e) {
    if (isCurrentAuthRequest(request) && activeChannel.value === channelId && chatChannelVersion === channelVersion) setError(e);
  } finally {
    if (isCurrentAuthRequest(request) && chatChannelVersion === channelVersion) chatLoadingEarlier.value = false;
  }
};
const jumpToLatestMessages = async () => {
  await loadMessages({ forceLatest: true });
};
const selectChannel = (channelId: string) => {
  chatChannelVersion += 1;
  activeChannel.value = channelId;
  loadedMessagesChannelId = null;
  messages.value = [];
  chatOldestMessageId = null;
  chatNewestMessageId = null;
  chatHasEarlier.value = false;
  chatLoadingEarlier.value = false;
  chatHasNewMessages.value = false;
  chatAtLatest.value = true;
  void loadMessages({ reset: true });
  if (channelId && realtime.value?.readyState === WebSocket.OPEN) realtime.value.send(JSON.stringify({ type: 'subscribe', channelId }));
};
watch(activeChannel, (channelId, previousId) => {
  if (previousId) chatDrafts.set(previousId, messageDraft.value);
  messageDraft.value = chatDrafts.get(channelId) ?? '';
  if (channelId.startsWith('friend:')) lastFriendChatChannel.value = channelId;
}, { flush: 'sync' });
watch(() => panel.value?.account?.uid, () => {
  chatDrafts.clear();
  messageDraft.value = '';
  lastFriendChatChannel.value = '';
});
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
const loadLocalExplorationMap = async (signal?: AbortSignal): Promise<api.ExploreLocalMap | undefined> => {
  const request = currentAuthRequest();
  if (!request.token || tab.value !== 'explore' || !panel.value?.summary) return;
  const version = ++localMapRequestVersion;
  try {
    const result = await api.exploreLocalMap(signal);
    if (isCurrentAuthRequest(request) && version === localMapRequestVersion && result.origin.x === mapCurrent.value.x && result.origin.y === mapCurrent.value.y && result.origin.z === mapCurrent.value.z) {
      localExplorationMap.value = result;
      return result;
    }
  } catch (value) { if (!signal?.aborted && isCurrentAuthRequest(request) && version === localMapRequestVersion) { localExplorationMap.value = undefined; setError(value); } }
};
const preparePlayerExperience = async () => {
  const request = currentAuthRequest();
  if (!request.token) return;
  gameLoadController?.abort();
  cancelBackgroundLoading();
  const controller = new AbortController();
  gameLoadController = controller;
  const version = ++gameLoadVersion;
  const current = () => version === gameLoadVersion && !controller.signal.aborted && isCurrentAuthRequest(request);
  gameReady.value = false;
  gameLoadError.value = '';
  gameLoadNeedsReload.value = false;
  gameLoadProgress.value = { fraction: 0, completed: 0, total: 0, loadedBytes: 0, totalBytes: 0 };
  gameLoadStartedAt = performance.now();
  gameLoadElapsed.value = 0;
  error.value = '';
  try {
    // Settle cancelled public downloads before starting the four foreground
    // workers. Verified files remain in the versioned resource cache.
    await stopAuthPreloading();
    if (!current()) return;
    gameLoadStatus.value = '正在读取角色资料…';
    if (!panel.value) await loadPanel();
    if (!current()) return;
    const snapshot = panel.value;
    if (!snapshot) throw new Error(error.value || '角色资料读取失败，请检查网络后重试。');
    if (snapshot.account?.hasCharacter !== false && !snapshot.summary) throw new Error('角色资料不完整，请稍后重试。');
    let localMap: api.ExploreLocalMap | undefined;
    if (snapshot.account?.hasCharacter !== false && snapshot.summary && !snapshot.inBattle) {
      gameLoadStatus.value = '正在读取当前探索地图…';
      localMap = await loadLocalExplorationMap(controller.signal);
      if (!current()) return;
      if (!localMap) throw new Error(error.value || '探索地图读取失败，请检查网络后重试。');
    }
    const plan = createPlayerAssetPlan(snapshot, localMap);
    gameLoadStatus.value = snapshot.account?.hasCharacter === false ? '正在准备冒险序章…'
      : snapshot.inBattle ? '正在准备当前战斗画面…' : '正在准备当前探索画面…';
    const openingScreen = snapshot.account?.hasCharacter !== false
      ? (snapshot.inBattle ? import('./components/TurnBattlePanel.vue') : import('./components/WorldMapPanel.vue')).catch(reason => {
        gameLoadNeedsReload.value = true;
        throw reason;
      }) : Promise.resolve();
    await Promise.all([
      preparePlayerAssets(plan.opening, progress => { if (current()) gameLoadProgress.value = progress; }, controller.signal),
      openingScreen
    ]);
    if (!current()) return;
    gameLoadStatus.value = '资源已就绪，正在进入游戏…';
    gameReady.value = true;
    const backgroundPaths = musicEnabled.value
      ? [...plan.background, `/assets/audio/bgm/${bgmScene.value}.mp3`] : plan.background;
    if (backgroundPaths.length) {
      const backgroundController = new AbortController();
      backgroundLoadController = backgroundController;
      // Let the first gameplay frame paint before downloading the player's
      // other tabs. Failure here never blocks the current screen.
      backgroundLoadTimer = window.setTimeout(() => {
        backgroundLoadTimer = undefined;
        if (!current() || !gameReady.value) return;
        let next = 0;
        const worker = async () => {
          while (next < backgroundPaths.length && !backgroundController.signal.aborted) {
            const path = backgroundPaths[next++];
            // An optional image can fail without preventing the remaining
            // owned resources from being cached for later tabs.
            try { await preparePlayerAssets([path], () => {}, backgroundController.signal); }
            catch { /* The destination tab retains its normal on-demand image fallback. */ }
          }
        };
        void Promise.all([worker(), worker()])
          .finally(() => { if (backgroundLoadController === backgroundController) backgroundLoadController = null; });
      }, 1200);
    }
  } catch (value) {
    if (current()) gameLoadError.value = gameLoadNeedsReload.value
      ? '游戏界面下载中断，请重新加载页面。'
      : api.userFacingErrorMessage(value);
  } finally {
    if (version === gameLoadVersion) gameLoadController = null;
  }
};
const retryPlayerExperience = () => {
  if (gameLoadNeedsReload.value) window.location.reload();
  else void preparePlayerExperience();
};
const performEnvironmentAction = async (operation: 'clear' | 'cancel' | 'settle', object?: EnvironmentObjectView) => {
  const request = currentAuthRequest();
  if (!request.token || busy.value || criticalPending.value) return;
  const job = localExplorationMap.value?.environmentJob;
  if (operation === 'clear' && (!object || !localMapMatchesCurrent.value || job
    || !mapEnvironment.value.some(item => item.id === object.id && item.canClear))) return;
  if (operation !== 'clear' && !job) return;
  busy.value = true; error.value = ''; notice.value = '';
  panelRequestVersion += 1; localMapRequestVersion += 1;
  try {
    const result = operation === 'clear' ? await api.clearEnvironment(object!.id)
      : operation === 'cancel' ? await api.cancelEnvironment() : await api.settleEnvironment(job!.objectId);
    if (!isCurrentAuthRequest(request)) return;
    if (result.panel) panel.value = result.panel;
    if (localExplorationMap.value) localExplorationMap.value = { ...localExplorationMap.value, environmentJob: result.job ?? null };
    notice.value = result.text || result.message || (operation === 'cancel' ? '已停止清理。' : '环境状态已更新。');
    // Panel includes the inventory; server settlement owns all rewards.
    if (!result.panel) await loadPanel();
  } catch (value) { if (isCurrentAuthRequest(request)) setError(value); }
  finally {
    if (isCurrentAuthRequest(request)) { await loadLocalExplorationMap(); if (isCurrentAuthRequest(request)) busy.value = false; }
  }
};
const runClearEnvironment = (object: EnvironmentObjectView) => { void performEnvironmentAction('clear', object); };
const settleDueEnvironment = async () => {
  const request = currentAuthRequest(), job = localExplorationMap.value?.environmentJob;
  if (busy.value || !job || !request.token || (environmentSettlement?.generation === request.generation
    && environmentSettlement.token === request.token && environmentSettlement.jobId === job.id)) return;
  const settlement = { ...request, jobId: job.id };
  environmentSettlement = settlement;
  try { await performEnvironmentAction('settle'); }
  finally { if (environmentSettlement === settlement) environmentSettlement = null; }
};
watch(() => [tab.value, loggedIn.value, gameReady.value, mapCurrent.value.x, mapCurrent.value.y, mapCurrent.value.z, panel.value?.nearby?.range, panel.value?.nearby?.actionRange], () => { if (gameReady.value && !mapRoute.replaying.value) void loadLocalExplorationMap(); }, { flush: 'post' });
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
const prepareExplorationMovement = async (result: { movementVisual?: api.ExploreCommittedMovement; panel?: Panel; travel?: { visual?: api.ExploreTravelVisual } }, request: ReturnType<typeof currentAuthRequest>, previousTravelId = travelVisual.value?.id, navigationVersion = mapNavigationVersion) => {
  const startsTravel = (result.travel?.visual ?? result.panel?.summary?.travel?.visual)?.id;
  if (!result.movementVisual && (!startsTravel || startsTravel === previousTravelId)) return false;
  // A committed command is replayed once; it must never send local step writes.
  panelRequestVersion += 1;
  const showMovement = navigationVersion === mapNavigationVersion;
  if (showMovement) {
    catalogOpen.value = false;
    manualOpen.value = false;
    interactionOpen.value = false;
    handbookOpen.value = false;
    regionMapSidebarRef.value?.closeSidebar();
    leaveStory();
    pendingInteractions.value = [];
    tab.value = 'explore';
  }
  if (result.movementVisual) {
    try {
      if (showMovement) {
        const before = localExplorationMap.value, movement = result.movementVisual;
        const controller = new AbortController(); committedVisionRequest?.abort(); committedVisionRequest = controller;
        const animation = committedMapMotion.run(movement, mapAuthoritativeMovementSpeed.value);
        // The command has already committed its target. Read that authorized
        // window while replaying, rather than waiting for the animation to end.
        void api.exploreLocalMap(controller.signal).then(snapshot => {
          if (committedVisionRequest !== controller || !isCurrentAuthRequest(request) || navigationVersion !== mapNavigationVersion || !committedMapMotion.pending.value) return;
          const merged = committedReplayVision(before, snapshot, movement, performance.now());
          if (merged) committedMapSnapshot.value = { ok: true, ...merged, nearby: result.panel?.nearby?.points ? { points: result.panel.nearby.points, range: snapshot.range, actionRange: snapshot.actionRange } : undefined };
        }).catch(() => {});
        try { await animation; }
        finally { if (committedVisionRequest === controller) { controller.abort(); committedVisionRequest = undefined; committedMapSnapshot.value = undefined; } }
      }
    }
    catch (value) { if (isCurrentAuthRequest(request)) setError(value); }
    if (!isCurrentAuthRequest(request)) return true;
    if (!result.panel && panel.value?.summary) {
      const target = result.movementVisual.target;
      panel.value = { ...panel.value, summary: { ...panel.value.summary, position: target, region: target.regionName, travel: undefined }, mapData: panel.value.mapData ? { ...panel.value.mapData, current: { ...target, name: target.regionName }, maps: panel.value.mapData.maps.map(map => ({ ...map, isCurrent: map.code === target.regionCode })) } : undefined, regionMap: panel.value.regionMap ? { ...panel.value.regionMap, currentRegionCode: target.regionCode } : undefined };
    }
  }
  if (result.panel && isCurrentAuthRequest(request)) panel.value = result.panel;
  return true;
};
const presentCommandResult = (result: CommandActionResult, surface: CommandSurface) => {
  const nextMessages = commandMessages(result);
  if (result.presentation === 'story') { showStoryResult(result); return; }
  if (result.presentation === 'page') {
    leaveStory();
    manualOpen.value = false;
    interactionOpen.value = false;
    catalogOpen.value = false;
    handbookOpen.value = false;
    if (result.destination === 'evolution') {
      tab.value = 'character';
      characterSection.value = 'evolution';
    } else if (result.destination === 'advancedProfession') {
      tab.value = 'character';
      characterSection.value = 'advancedProfession';
    } else if (result.destination) tab.value = result.destination;
    return;
  }
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
    if (result.presentation === 'interaction' && panel.value?.account?.hasCharacter && !panel.value?.pendingStory) {
      leaveStory();
      interactionMessages.value = nextMessages as ManualMessage[];
      interactionOpen.value = true;
    } else showStoryResult(result);
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
  const previousTravelId = travelVisual.value?.id;
  const navigationVersion = mapNavigationVersion;
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
    let moved = await prepareExplorationMovement(result, request, previousTravelId, navigationVersion);
    if (!isCurrentAuthRequest(request)) return;
    await loadPanel();
    if (!isCurrentAuthRequest(request)) return;
    if (!moved) moved = await prepareExplorationMovement({ panel: panel.value ?? undefined }, request, previousTravelId, navigationVersion);
    if (!isCurrentAuthRequest(request)) return;
    if (moved && (result.presentation !== 'story' || tab.value !== 'explore')) notice.value = result.text ?? '已前往目标地点。';
    else presentCommandResult(result, surface);
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
    await loadPanel();
    if (!isCurrentAuthRequest(request) || version !== storyRequestVersion) return;
    presentCommandResult(result, 'story');
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
    else if (panel.value?.account?.hasCharacter) leaveStory();
    else await loadRegistrationGuide();
  } finally { if (isCurrentAuthRequest(request)) busy.value = false; }
};
const submitAuth = async () => {
  if (busy.value) return;
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
    cancelGamePreparation();
    loggedIn.value = true;
    authGeneration += 1;
    registrationLoginId.value = mode === 'register' ? result.loginId : '';
    notice.value = mode === 'login' ? '欢迎回来，正在打开冒险地图。' : '账号已创建，请保存登录号后开始冒险。';
    password.value = '';
    passwordConfirmation.value = '';
    await loadPanel();
    if (mode === 'register' || panel.value?.account?.hasCharacter === false) await loadRegistrationGuide();
    await preparePlayerExperience();
    await loadSocial();
    await loadNotifications();
    await loadGameMailUnread();
    await connectRealtime();
  } catch (e) { setError(e); } finally { busy.value = false; }
};
const runCommand = async (command: string, options: { silent?: boolean; surface?: CommandSurface; title?: string } = {}) => {
  const request = currentAuthRequest();
  const previousTravelId = travelVisual.value?.id;
  const navigationVersion = mapNavigationVersion;
  const departure = { ...mapCurrent.value };
  const departureRegionCode = regionMap.value.currentRegionCode;
  let stopped: MovementStopResult | undefined;
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
    let moved = await prepareExplorationMovement(result, request, previousTravelId, navigationVersion);
    if (!isCurrentAuthRequest(request)) return;
    await loadPanel();
    if (!isCurrentAuthRequest(request)) return;
    if (!moved) moved = await prepareExplorationMovement({ panel: panel.value ?? undefined }, request, previousTravelId, navigationVersion);
    if (!isCurrentAuthRequest(request)) return;
    if (!options.silent) {
      const nextMessages = commandMessages(result);
      const hasButtons = nextMessages.some(message => message.buttons?.length);
      if (moved && (result.presentation !== 'story' || tab.value !== 'explore')) notice.value = result.text ?? '已前往目标地点。';
      else if (surface || result.presentation === 'story' || result.presentation === 'page') presentCommandResult(result, surface ?? 'interaction');
      else if (hasButtons || nextMessages.length > 1) {
        interactionTitle.value = '互动';
        interactionError.value = '';
        presentCommandResult(result, 'interaction');
      } else notice.value = result.text ?? '操作完成。';
    }
  } catch (e) {
    if (!isCurrentAuthRequest(request)) return;
    if (isCurrentEncounterBlock(e)) {
      stopped = { message: api.userFacingErrorMessage(e), position: departure, regionCode: departureRegionCode };
      await loadPanel();
      if (!isCurrentAuthRequest(request)) return;
    }
    if (surface === 'story') storyError.value = api.userFacingErrorMessage(e);
    else if (surface === 'interaction') interactionError.value = api.userFacingErrorMessage(e);
    else setError(e);
  } finally {
    if (isCurrentAuthRequest(request)) {
      busy.value = false;
      await requestStoppedMapTarget(stopped, request, navigationVersion);
    }
  }
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
  manualMessages.value = [];
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
  tab.value = 'explore';
  await nextTick();
  regionMapSidebarRef.value?.openSidebar(mentor.regionCode);
};
const handleAdvancedTrialStarted = (result: AdvancedTrialStarted) => {
  if (!loggedIn.value || characterSection.value !== 'advancedProfession' || !result.panel?.inBattle) return;
  panel.value = result.panel;
  negotiation.value = null;
  pendingInteractions.value = [];
  tab.value = 'explore';
  notice.value = '导师试炼已开始，请在战斗面板选择行动。';
};
const catalogResultSessions = new WeakMap<CommandActionResult, ReturnType<typeof currentAuthRequest>>();
const presentedCatalogMovements = new WeakSet<CommandActionResult>();
const refreshedCatalogPanels = new WeakSet<CommandActionResult>();
const catalogResultIsCurrent = (result: CommandActionResult) => {
  const request = catalogResultSessions.get(result);
  return !request || isCurrentAuthRequest(request);
};
const executeCatalogAction: typeof api.commandAction = async payload => {
  const request = currentAuthRequest();
  const previousTravelId = travelVisual.value?.id;
  const navigationVersion = mapNavigationVersion;
  if (!request.token || busy.value) throw new Error('请等待当前操作完成。');
  busy.value = true;
  const ignoredResult: CommandActionResult = {};
  catalogResultSessions.set(ignoredResult, request);
  try {
    const result = await api.commandAction(payload);
    catalogResultSessions.set(result, request);
    if (!isCurrentAuthRequest(request)) return ignoredResult;
    let moved = await prepareExplorationMovement(result, request, previousTravelId, navigationVersion);
    if (!isCurrentAuthRequest(request)) return ignoredResult;
    const regions = Array.isArray(result.refresh) ? result.refresh : result.refresh?.regions ?? catalog.value.find(item => item.id === payload.commandId)?.refresh ?? [];
    if (moved || payload.mode !== 'preview' && regions.some(region => ['summary', 'map', 'battle', 'inventory', 'equipment', 'skills'].includes(region))) {
      await loadPanel();
      if (!isCurrentAuthRequest(request)) return ignoredResult;
      refreshedCatalogPanels.add(result);
      if (!moved) moved = await prepareExplorationMovement({ panel: panel.value ?? undefined }, request, previousTravelId, navigationVersion);
      if (!isCurrentAuthRequest(request)) return ignoredResult;
    }
    if (moved) {
      if (result.presentation === 'story' && tab.value === 'explore') presentCommandResult(result, 'interaction');
      else notice.value = result.text ?? '已前往目标地点。';
      presentedCatalogMovements.add(result);
    }
    return result;
  } catch (value) {
    if (!isCurrentAuthRequest(request)) return ignoredResult;
    throw value;
  } finally { if (isCurrentAuthRequest(request)) busy.value = false; }
};
const handleCatalogRefresh = async (regions: string[], result: CommandActionResult) => {
  if (!catalogResultIsCurrent(result) || presentedCatalogMovements.has(result)) return;
  if (!refreshedCatalogPanels.has(result) && (regions.length === 0 || regions.some(region => ['summary', 'map', 'battle', 'inventory', 'equipment', 'skills'].includes(region)))) await loadPanel();
  if (regions.some(region => ['party', 'mail', 'social'].includes(region))) await loadSocial();
};
const handleCatalogResult = (result: CommandActionResult) => {
  if (!catalogResultIsCurrent(result) || presentedCatalogMovements.has(result)) return;
  if (result.text) notice.value = result.text;
  if (result.panel && typeof result.panel === 'object') panel.value = result.panel;
};
const runMapMove = async (position: MapPosition) => {
  if (busy.value || criticalPending.value || mapActionLock.value) return;
  const request = currentAuthRequest();
  const navigationVersion = mapNavigationVersion;
  if (!request.token) return;
  busy.value = true;
  panelRequestVersion += 1;
  mapRouteRefreshNeeded = false;
  mapRouteStoppedResult = undefined;
  mapTargetPopupRequest.value = undefined;
  error.value = '';
  notice.value = '';
  try {
    await mapRoute.run(position);
  } finally {
    if (isCurrentAuthRequest(request)) {
      if (mapRouteRefreshNeeded) await loadPanel();
      if (isCurrentAuthRequest(request)) {
        void loadLocalExplorationMap(); busy.value = false;
        const stopped = mapRouteStoppedResult; mapRouteStoppedResult = undefined;
        await requestStoppedMapTarget(stopped, request, navigationVersion);
      }
    }
  }
};
const runAnimatedMapMove = runMapMove;
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
const runAnimatedMapAction = (payload: { point: ExploreMapPoint; action: MapPointAction }) => {
  if (payload.action.id === 'move' && payload.action.position) {
    interactionBuildingCode.value = payload.point.type === '建筑' ? payload.point.code ?? null : null;
    void runAnimatedMapMove(payload.action.position);
    return;
  }
  runMapAction(payload);
};
const openAutoBattle = async () => {
  if (autoBattleBusy.value) return;
  const auth = currentAuthRequest();
  autoBattleOpen.value = true;
  error.value = '';
  autoBattleLoadError.value = '';
  autoBattleSettings.value = null;
  autoBattleBusy.value = true;
  try {
    // 先读取主设置，技能与药剂列表失败时仍然保留可用的设置面板。
    const config = await api.autoBattleConfig(autoBattleMode.value);
    if (!isCurrentAuthRequest(auth)) return;
    autoBattleSettings.value = config;
    autoBattleHpThreshold.value = config.settings.hpThreshold;
    autoBattleMpThreshold.value = config.settings.mpThreshold;
    const [skills, potions] = await Promise.allSettled([api.autoBattleSkills(), api.autoBattlePotions()]);
    if (!isCurrentAuthRequest(auth)) return;
    if (skills.status === 'fulfilled') autoBattleSkillChoices.value = skills.value.choices;
    else setError(skills.reason);
    if (potions.status === 'fulfilled') autoBattlePotionChoices.value = potions.value.items;
    else setError(potions.reason);
  } catch (e) {
    if (isCurrentAuthRequest(auth)) {
      autoBattleLoadError.value = api.userFacingErrorMessage(e);
      setError(e);
    }
  } finally { if (isCurrentAuthRequest(auth)) autoBattleBusy.value = false; }
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
const autoBattleSlotSkill = (sequence: number) => {
  const skillId = autoBattleSettings.value?.actions.find(action => action.sequence === sequence)?.skillId;
  return skillId ? panel.value?.skills?.skills?.find(skill => skill.id === skillId) : undefined;
};
const cancelMining = () => {
  if (!panel.value?.mining || busy.value) return;
  void runCommand('/取消开采');
};
const applyTravelFallback = (position: api.ExploreRoutePosition | undefined, travel?: NonNullable<Panel['summary']>['travel']) => {
  const current = panel.value;
  if (!current?.summary) return;
  const target = current.summary.travel?.visual?.target;
  const arrived = target && position && target.x === position.x && target.y === position.y && target.z === position.z && target.regionId === position.regionId;
  const name = arrived ? target.regionName : current.mapData?.current?.name ?? current.summary.region ?? '未知区域';
  panel.value = { ...current, summary: { ...current.summary, travel, ...(position ? { position, region: name } : {}) }, mapData: position && current.mapData ? { ...current.mapData, current: { name, ...position }, maps: arrived ? current.mapData.maps.map(map => ({ ...map, isCurrent: map.code === target.regionCode })) : current.mapData.maps } : current.mapData, regionMap: arrived && current.regionMap ? { ...current.regionMap, currentRegionCode: target.regionCode } : current.regionMap };
};
const stopMapAction = async () => {
  if (committedMapMotion.pending.value) { committedMapMotion.cancel(); return; }
  if (mapMovePending.value) { mapRoute.cancel(); return; }
  if (busy.value) return;
  if (localExplorationMap.value?.environmentJob) { await performEnvironmentAction('cancel'); return; }
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
    else { applyTravelFallback(result.position); await loadPanel(); }
    if (!isCurrentAuthRequest(request)) return;
    notice.value = result.text || '本次前往已停止。';
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally { if (isCurrentAuthRequest(request)) busy.value = false; }
};
const settleDueMapTravel = async () => {
  const request = currentAuthRequest();
  const navigationVersion = mapNavigationVersion;
  if (!request.token || !panel.value?.summary?.travel || travelAutoSettling || busy.value) return;
  travelAutoSettling = true;
  let stopped: MovementStopResult | undefined;
  try {
    const result = await api.settleExploreTravel();
    if (!isCurrentAuthRequest(request)) return;
    if (result.panel) panel.value = result.panel;
    else {
      const travel = result.kind === 'pending' ? result.travel ? { destination: result.travel.destination ?? panel.value?.summary?.travel?.destination ?? '目的地', remaining: result.remaining, activityType: result.travel.activityType ?? 'move', visual: result.travel.visual } : panel.value?.summary?.travel : undefined;
      applyTravelFallback(result.position, travel);
      await loadPanel();
    }
    if (!isCurrentAuthRequest(request)) return;
    if (!panel.value?.summary?.travel && result.text) notice.value = result.text;
    if (!panel.value?.summary?.travel) stopped = result;
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally {
    if (isCurrentAuthRequest(request)) {
      travelAutoSettling = false;
      await requestStoppedMapTarget(stopped, request, navigationVersion);
    }
  }
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
  const draft = messageDraft.value;
  const content = draft.trim();
  const channelId = activeChannel.value;
  const request = currentAuthRequest();
  if (!content || !channelId || !request.token || busy.value || criticalPending.value || !channels.value.some(channel => channel.id === channelId) || (floatingSocialOpen.value && !exploreChatCanSend.value)) return;
  busy.value = true;
  try {
    await api.sendMessage(channelId, content);
    if (!isCurrentAuthRequest(request)) return;
    if (activeChannel.value === channelId) {
      if (messageDraft.value === draft) messageDraft.value = '';
      await loadMessages({ forceLatest: true });
    } else if (chatDrafts.get(channelId) === draft) chatDrafts.delete(channelId);
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally { if (isCurrentAuthRequest(request)) busy.value = false; }
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
const playerCards = usePlayerCard({
  session: currentAuthRequest,
  isCurrentSession: isCurrentAuthRequest,
  socialChanged: loadSocial,
  partyChanged: async () => { await Promise.all([refreshPartyData(), loadPanel()]); },
  whisper: async (targetGameId, isCurrent) => {
    const request = currentAuthRequest();
    await loadSocial();
    if (!isCurrentAuthRequest(request) || !isCurrent()) return;
    const channel = channels.value.find(item => item.type === 'friend' && item.gameId === targetGameId);
    if (!channel) throw new Error('私信频道暂不可用，请刷新好友关系后重试。');
    lastFriendChatChannel.value = channel.id;
    openFloatingSocial('friend');
    selectChannel(channel.id);
  }
});
const playerCardBusy = computed(() => playerCards.busy.value || busy.value || criticalPending.value || partyBusy.value);
const chatMessagesForView = computed(() => messages.value.map(message => message.own && settingsUploadedAvatar.value
  ? { ...message, senderAvatarUrl: settingsUploadedAvatar.value } : message));
watch(floatingSocialOpen, value => {
  if (!value) playerCards.closeAll();
  else if (loggedIn.value && panel.value?.account?.hasCharacter !== false) void playerCards.refreshInvitations(true);
});
watch([loggedIn, () => panel.value?.account?.uid], ([signedIn, owner], previous) => {
  if (!signedIn || (previous?.[1] && owner !== previous[1])) playerCards.reset();
});
onBeforeUnmount(playerCards.reset);
const openSettings = () => {
  if (criticalPending.value && !showStoryGuide.value) return;
  settingsIdentityChange.value = null;
  settingsIdentityBusy.value = false;
  settingsPage.value = 'overview';
  settingsExpanded.value = null;
  settingsRedeemFeedback.value = '';
  settingsProfileFeedback.value = '';
  settingsNickname.value = String(panel.value?.summary?.name ?? panel.value?.account?.displayName ?? displayName.value ?? '');
  const gender = panel.value?.summary?.gender;
  settingsGender.value = selectedSettingsGender(gender);
  settingsOpen.value = true;
};
const closeSettings = () => {
  if (settingsAvatarBusy.value || settingsRedeemBusy.value || settingsIdentityBusy.value) return;
  settingsIdentityChange.value = null;
  setCriticalPending('identityChange', false);
  settingsOpen.value = false;
};
const toggleSettingsSection = (section: 'game' | 'account') => {
  settingsExpanded.value = settingsExpanded.value === section ? null : section;
};
const clearSettingsAvatar = () => {
  settingsAvatarVersion += 1;
  settingsAvatarController?.abort();
  settingsAvatarController = undefined;
  if (settingsAvatarSource.value) URL.revokeObjectURL(settingsAvatarSource.value);
  settingsAvatarSource.value = '';
  settingsAvatarError.value = '';
  settingsAvatarBusy.value = false;
  setCriticalPending('avatarUpload', false);
};
const selectSettingsAvatar = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || settingsAvatarBusy.value || criticalPending.value) return;
  clearSettingsAvatar();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    settingsAvatarError.value = '请选择 JPG、PNG 或 WebP 图片。';
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    settingsAvatarError.value = '图片不能超过 8 MB，请选择较小的图片。';
    return;
  }
  settingsAvatarSource.value = URL.createObjectURL(file);
};
const uploadSettingsAvatar = async (imageData: string) => {
  if (settingsAvatarBusy.value || criticalPending.value) return;
  const request = currentAuthRequest();
  const version = ++settingsAvatarVersion;
  settingsAvatarController = new AbortController();
  settingsAvatarBusy.value = true;
  settingsAvatarError.value = '';
  setCriticalPending('avatarUpload', true);
  try {
    const result = await api.uploadAvatar(imageData, settingsAvatarController.signal);
    if (version !== settingsAvatarVersion || !isCurrentAuthRequest(request)) return;
    if (panel.value?.account) panel.value = { ...panel.value, account: { ...panel.value.account, avatarUrl: result.avatarUrl } };
    notice.value = '头像已上传。';
    clearSettingsAvatar();
  } catch (reason) {
    if (version === settingsAvatarVersion && isCurrentAuthRequest(request)) settingsAvatarError.value = api.userFacingErrorMessage(reason);
  } finally {
    if (version === settingsAvatarVersion) {
      settingsAvatarBusy.value = false;
      settingsAvatarController = undefined;
      setCriticalPending('avatarUpload', false);
    }
  }
};
const redeemSettingsCode = async () => {
  if (settingsRedeemBusy.value || criticalPending.value || busy.value) return;
  const code = settingsRedeemCode.value.trim();
  settingsRedeemFeedback.value = '';
  settingsRedeemFailed.value = false;
  if (!code) { settingsRedeemFeedback.value = '请输入兑换码。'; settingsRedeemFailed.value = true; return; }
  const request = currentAuthRequest();
  settingsRedeemBusy.value = true;
  setCriticalPending('redeemCode', true);
  try {
    const result = await api.redeemCode(code);
    if (!isCurrentAuthRequest(request)) return;
    settingsRedeemCode.value = '';
    settingsRedeemFeedback.value = result.message;
    await loadGameMailUnread();
    if (notificationOpen.value) void loadGameMails();
  } catch (reason) {
    if (isCurrentAuthRequest(request)) { settingsRedeemFeedback.value = api.userFacingErrorMessage(reason); settingsRedeemFailed.value = true; }
  } finally {
    settingsRedeemBusy.value = false;
    setCriticalPending('redeemCode', false);
  }
};
watch(() => panel.value?.account?.uid, () => {
  clearSettingsAvatar();
  settingsRedeemCode.value = '';
  settingsRedeemFeedback.value = '';
  settingsExpanded.value = null;
});
onBeforeUnmount(clearSettingsAvatar);
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
    playerCards.reset();
    settingsCurrentPassword.value = '';
    settingsNewPassword.value = '';
    settingsPasswordConfirmation.value = '';
    notice.value = changing ? '密码已修改。' : '密码已设置。';
    await loadPanel();
    await connectRealtime();
  } catch (e) { setError(e); } finally { busy.value = false; }
};
const normalizedSettingsName = (name: string) => name.trim().replace(/\s+/g, ' ');
const requestSettingsIdentityChange = async (kind: 'rename' | 'gender', value: string) => {
  const request = currentAuthRequest();
  if (!request.token || busy.value || criticalPending.value || settingsIdentityBusy.value) return;
  settingsProfileFeedback.value = '';
  const current = kind === 'rename' ? normalizedSettingsName(panel.value?.summary?.name ?? '') : panel.value?.summary?.gender;
  if (value === current) {
    if (kind === 'rename') settingsProfileFeedback.value = '昵称未发生变化，无需修改。';
    return;
  }
  busy.value = true;
  settingsIdentityBusy.value = true;
  setCriticalPending('identityChange', true);
  try {
    const status = await api.identityChanges();
    if (!isCurrentAuthRequest(request) || !settingsOpen.value) return;
    settingsGender.value = selectedSettingsGender(status.gender);
    if (value === (kind === 'rename' ? normalizedSettingsName(status.name) : status.gender)) {
      settingsProfileFeedback.value = kind === 'rename' ? '昵称未发生变化，无需修改。' : '性别未发生变化，无需修改。';
      return;
    }
    settingsIdentityChange.value = { kind, value, status, error: '' };
  } catch (e) {
    if (isCurrentAuthRequest(request)) setError(e);
  } finally {
    if (isCurrentAuthRequest(request)) {
      busy.value = false;
      settingsIdentityBusy.value = false;
      if (!settingsIdentityChange.value) setCriticalPending('identityChange', false);
    }
  }
};
const saveSettingsNickname = async () => {
  const name = normalizedSettingsName(settingsNickname.value);
  if (Array.from(name).length < 2 || Array.from(name).length > 24) {
    setError('昵称需要为 2～24 个字符。');
    return;
  }
  settingsNickname.value = name;
  await requestSettingsIdentityChange('rename', name);
};
const saveSettingsGender = async (gender: '男' | '女') => {
  await requestSettingsIdentityChange('gender', gender);
};
const cancelSettingsIdentityChange = () => {
  if (settingsIdentityBusy.value) return;
  settingsIdentityChange.value = null;
  setCriticalPending('identityChange', false);
};
const confirmSettingsIdentityChange = async () => {
  const change = settingsIdentityChange.value;
  const request = currentAuthRequest();
  if (!change || !request.token || busy.value || settingsIdentityBusy.value || !settingsIdentityAvailable.value) return;
  busy.value = true;
  settingsIdentityBusy.value = true;
  change.error = '';
  try {
    const status = await api.identityChanges();
    if (!isCurrentAuthRequest(request)) return;
    const current = change.kind === 'rename' ? normalizedSettingsName(status.name) : status.gender;
    if (current === change.value) {
      settingsGender.value = selectedSettingsGender(status.gender);
      settingsProfileFeedback.value = change.kind === 'rename' ? '昵称未发生变化，无需修改。' : '性别未发生变化，无需修改。';
      settingsIdentityChange.value = null;
      return;
    }
    const quoted = change.kind === 'rename' ? change.status.rename : change.status.genderChange;
    const cost = change.kind === 'rename' ? status.rename : status.genderChange;
    change.status = status;
    if (cost.freeRemaining !== quoted.freeRemaining || cost.code !== quoted.code || cost.requiredQuantity !== quoted.requiredQuantity) {
      change.error = '免费次数或所需道具已更新，请核对后重新确认。';
      return;
    }
    if (!cost.freeRemaining && cost.cardQuantity < cost.requiredQuantity) {
      change.error = `${cost.itemName}不足，暂时无法修改。`;
      return;
    }
    const result = await api.command(change.kind === 'rename' ? `/角色改名 ${change.value}` : `/改性 ${change.value}`);
    if (!isCurrentAuthRequest(request)) return;
    const updated = await api.panel();
    if (!isCurrentAuthRequest(request)) return;
    panel.value = updated;
    settingsNickname.value = updated.summary?.name ?? status.name;
    settingsGender.value = selectedSettingsGender(updated.summary?.gender);
    const actual = change.kind === 'rename' ? normalizedSettingsName(updated.summary?.name ?? '') : updated.summary?.gender;
    if (actual !== change.value) {
      change.error = result.text ?? '修改未完成，请检查当前次数或道具后再试。';
      return;
    }
    settingsIdentityChange.value = null;
    settingsProfileFeedback.value = result.text ?? '修改完成。';
  } catch (e) {
    if (isCurrentAuthRequest(request)) change.error = api.userFacingErrorMessage(e);
  } finally {
    if (isCurrentAuthRequest(request)) {
      busy.value = false;
      settingsIdentityBusy.value = false;
      if (!settingsIdentityChange.value) setCriticalPending('identityChange', false);
    }
  }
};
const logout = () => {
  if (criticalPending.value) return;
  cancelGamePreparation();
  const hadToken = Boolean(api.token());
  authGeneration += 1;
  busy.value = false;
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
  inventoryKeyword.value = '';
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
  autoBattleLoadError.value = '';
  autoBattleBusy.value = false;
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
  selectedEquipment.value = null;
  messageDraft.value = '';
  error.value = '';
  notice.value = '';
  tab.value = 'explore';
};
const handleAuthInvalidated = () => {
  cancelGamePreparation();
  authGeneration += 1;
  busy.value = false;
  realtime.value?.close();
  realtime.value = null;
  loggedIn.value = false;
  panel.value = null;
  inventoryKeyword.value = '';
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
  autoBattleLoadError.value = '';
  autoBattleBusy.value = false;
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
  selectedEquipment.value = null;
  messageDraft.value = '';
  error.value = '登录已失效，请重新登录。';
};
const usePanelButton = (command: string) => void runCommand(command);
const togglePasswordVisibility = () => { showPassword.value = !showPassword.value; };
const selectCharacterSection = (section: CharacterSection) => {
  if (criticalPending.value) return;
  characterSection.value = section;
  if (section === 'equipment') void runCommand('/装备', { silent: true });
};
const resetEquipmentDetails = () => {
  equipmentDetailsVersion += 1;
  equipmentDetailsRequest?.abort();
  equipmentDetailsRequest = null;
  selectedEquipmentDetails.value = null;
  equipmentDetailsLoading.value = false;
  equipmentDetailsError.value = '';
};
const loadSelectedEquipmentDetails = async () => {
  resetEquipmentDetails();
  const item = selectedEquipment.value;
  if (!item || tab.value !== 'character' || characterSection.value !== 'equipment') return;
  const auth = currentAuthRequest();
  if (!auth.token) return;
  const version = equipmentDetailsVersion;
  const account = `${panel.value?.account?.uid ?? ''}:${panel.value?.account?.gameUserId ?? ''}`;
  const controller = new AbortController();
  equipmentDetailsRequest = controller;
  const matches = (entry?: CharacterEquipmentEntry | null) => entry?.slot === item.slot && entry.id === item.id && entry.code === item.code;
  const isCurrent = () => version === equipmentDetailsVersion && !controller.signal.aborted && isCurrentAuthRequest(auth)
    && account === `${panel.value?.account?.uid ?? ''}:${panel.value?.account?.gameUserId ?? ''}`
    && tab.value === 'character' && characterSection.value === 'equipment'
    && matches(selectedEquipment.value) && matches(equipmentForSlot(item.slot));
  equipmentDetailsLoading.value = true;
  try {
    const result = await api.equippedEquipmentDetail(item.slot, controller.signal);
    if (!isCurrent()) return;
    if (result.slot !== item.slot) throw new Error('当前穿戴装备已变化，请重新选择。');
    if (!result.detail && result.id === null && result.code === null) {
      selectedEquipment.value = null;
      return;
    }
    if (result.id !== item.id || result.code !== item.code || !result.detail) throw new Error('当前穿戴装备已变化，请重新选择。');
    selectedEquipmentDetails.value = result.detail;
  } catch (cause) {
    if (isCurrent()) equipmentDetailsError.value = api.userFacingErrorMessage(cause);
  } finally {
    if (isCurrent()) {
      equipmentDetailsLoading.value = false;
      equipmentDetailsRequest = null;
    }
  }
};
watch(selectedEquipment, item => {
  if (item) void loadSelectedEquipmentDetails();
  else resetEquipmentDetails();
}, { flush: 'sync' });
watch([tab, characterSection], ([activeTab, section]) => {
  if (activeTab !== 'character' || section !== 'equipment') {
    selectedEquipment.value = null;
    resetEquipmentDetails();
  }
}, { flush: 'sync' });
onBeforeUnmount(resetEquipmentDetails);
const inspectCharacterEquipment = (item: CharacterEquipmentEntry) => {
  if (selectedEquipment.value === item) void loadSelectedEquipmentDetails();
  else selectedEquipment.value = item;
};
const closeCharacterEquipment = () => { selectedEquipment.value = null; };
const unequipSelectedEquipment = async () => {
  const item = selectedEquipment.value;
  if (!item || busy.value) return;
  closeCharacterEquipment();
  await runCommand(`/卸下装备 ${item.slot}`);
};
const replaceSelectedEquipment = () => {
  if (busy.value) return;
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
  if (!inventoryUsePreview.value || busy.value || !item || item.instance || item.itemType !== 'consumable' || !item.id || item.quantity < 1) return;
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
  const navigationVersion = mapNavigationVersion;
  const departure = { ...mapCurrent.value };
  const departureRegionCode = regionMap.value.currentRegionCode;
  if (!auth.token) return;
  busy.value = true;
  travelPlanningTarget.value = request.targetName;
  error.value = '';
  notice.value = `正在规划前往${request.targetName}的路线…`;
  mapTargetPopupRequest.value = undefined;
  let stopped: MovementStopResult | undefined;
  try {
    const result = await api.exploreTravel({ x: request.x, y: request.y, z });
    if (!isCurrentAuthRequest(auth)) return;
    await prepareExplorationMovement(result, auth, travelVisual.value?.id, navigationVersion);
    if (!isCurrentAuthRequest(auth)) return;
    if (result.panel) panel.value = result.panel;
    else {
      if (panel.value?.summary && result.travel) panel.value = { ...panel.value, summary: { ...panel.value.summary, travel: { destination: result.travel.destination ?? request.targetName, remaining: result.travel.remaining, activityType: result.travel.activityType ?? 'move', visual: result.travel.visual } } };
      await loadPanel();
    }
    if (!isCurrentAuthRequest(auth)) return;
    notice.value = result.text || `已安排前往${request.targetName}。`;
    stopped = result;
  } catch (e) {
    if (isCurrentAuthRequest(auth)) {
      setError(e);
      if (isCurrentEncounterBlock(e)) {
        stopped = { message: api.userFacingErrorMessage(e), position: departure, regionCode: departureRegionCode };
        await loadPanel();
      }
    }
  }
  finally {
    if (isCurrentAuthRequest(auth)) {
      travelPlanningTarget.value = ''; busy.value = false;
      await requestStoppedMapTarget(stopped, auth, navigationVersion);
    }
  }
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
watch(() => localExplorationMap.value?.environmentJob, job => {
  environmentRemaining.value = Math.max(0, Number(job?.remainingSeconds) || 0);
  if (!job) nextEnvironmentSettleAt = 0;
}, { deep: true });

onMounted(async () => {
  gameLoadElapsedTimer = window.setInterval(() => {
    if (loggedIn.value && !gameReady.value) gameLoadElapsed.value = Math.floor((performance.now() - gameLoadStartedAt) / 1000);
  }, 1000);
  if (!loggedIn.value) startAuthPreloading();
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
    await preparePlayerExperience();
    await loadSocial();
    await loadNotifications();
    await loadGameMailUnread();
    await connectRealtime();
  }
  window.addEventListener('resize', constrainFloatingDock);
  let notificationPollCount = 0;
  refreshTimer = window.setInterval(() => {
    if (!gameReady.value) return;
    if (!mapMovePending.value) void loadPanel();
    if (tab.value === 'explore' && !mapMovePending.value && !busy.value) void loadLocalExplorationMap();
    if (tab.value === 'social' || floatingSocialOpen.value || desktopExploreVisible()) { void loadMessages(); void loadSocial(); }
    if (floatingSocialOpen.value) void playerCards.refreshInvitations(true);
    notificationPollCount += 1;
    if (notificationPollCount % 2 === 0) {
      if (desktopExploreVisible() && !partyLoading.value && !partyBusy.value) void refreshPartyData();
      void loadNotificationUnread();
      void loadGameMailUnread();
      if (notificationOpen.value || floatingSocialOpen.value === 'system') void syncNotificationChanges();
    }
  }, 8000);
  actionCountdownTimer = window.setInterval(() => {
    if (!gameReady.value) return;
    if (localExplorationMap.value?.environmentJob) {
      if (environmentRemaining.value > 0) environmentRemaining.value = Math.max(0, environmentRemaining.value - 1);
      else if (Date.now() >= nextEnvironmentSettleAt) {
        nextEnvironmentSettleAt = Date.now() + 4000;
        void settleDueEnvironment();
      }
    }
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
  appDisposed = true;
  void stopAuthPreloading();
  if (gameLoadElapsedTimer !== undefined) window.clearInterval(gameLoadElapsedTimer);
  clearMapMoveAnimation();
  cancelGamePreparation();
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
  <div ref="appShell" class="app-shell" data-visual="light-anime" data-viewport-layout :data-page="loggedIn ? gameReady ? tab : 'loading' : loginMode" :data-explore-canvas="exploreCanvasActive || undefined" :data-character-scene="characterScene" :data-scene-framed="sceneFramed || undefined" :style="{ ...appViewportStyle, ...sceneFramingStyle, ...explorationViewportStyle, '--anime-city': `url(${ANIME_SCENES.city})`, '--anime-forest': `url(${ANIME_SCENES.forest})`, '--anime-auth': `url(${ANIME_SCENES.auth})`, '--anime-main-scene': `url(${ANIME_MAIN_SCENES[tab]})`, '--explore-terrain': `url(${terrainForRegion(regionMap.currentRegionCode, mapCurrent.name)})` }">
    <div v-if="!loggedIn" class="auth-screen">
      <img class="auth-hero" :src="ANIME_AUTH_ART[loginMode]" width="1920" height="1080" :alt="loginMode === 'login' ? '梨子喵伸手邀请旅人，球兔背着背包准备冒险' : '梨子喵递来冒险地图，球兔在冒险柜台旁等候'" fetchpriority="high" />
      <section class="auth-stage" :class="`auth-stage--${loginMode}`" aria-label="幻想次元旅人入口">
        <h1 class="auth-original-logo"><img :src="ANIME_LOGO" width="1942" height="809" alt="幻想次元" /></h1>
        <div class="auth-card-column">
          <div class="auth-tabs" role="tablist" aria-label="旅人账号入口">
            <button id="auth-tab-login" type="button" role="tab" :aria-selected="loginMode === 'login'" aria-controls="auth-panel" :class="{ active: loginMode === 'login' }" :disabled="busy" @click="loginMode = 'login'; showPassword = false; showPasswordConfirmation = false"><AuthTabFrame :active="loginMode === 'login'" /><TabArtIcon name="paw" class="auth-glyph" :size="26" /><span>登录</span></button>
            <button id="auth-tab-register" type="button" role="tab" :aria-selected="loginMode === 'register'" aria-controls="auth-panel" :class="{ active: loginMode === 'register' }" :disabled="busy" @click="loginMode = 'register'; showPassword = false; showPasswordConfirmation = false"><AuthTabFrame :active="loginMode === 'register'" /><TabArtIcon name="paw" class="auth-glyph" :size="26" /><span>注册</span></button>
          </div>
          <div id="auth-panel" class="auth-card" role="tabpanel" :aria-labelledby="`auth-tab-${loginMode}`">
            <form class="auth-form" :aria-busy="busy" @submit.prevent="submitAuth">
              <div class="auth-field-group">
                <label :class="{ 'sr-only': loginMode === 'register' }" :for="loginMode === 'login' ? 'auth-login-id' : 'auth-display-name'">{{ loginMode === 'login' ? '登录号 / Game ID' : '旅人昵称' }}</label>
                <div class="auth-input-row">
                  <AuthGlyph name="user" />
                  <input v-if="loginMode === 'register'" id="auth-display-name" v-model="displayName" maxlength="32" autocomplete="nickname" aria-label="旅人昵称" placeholder="输入昵称" />
                  <input v-else id="auth-login-id" v-model="gameId" inputmode="text" autocomplete="username" aria-label="登录号或 Game ID" placeholder="请输入登录号 / Game ID" />
                </div>
              </div>
              <div class="auth-field-group">
                <label for="auth-password" :class="{ 'sr-only': loginMode === 'register' }">密码（8～64 位）</label>
                <div class="auth-input-row password-field">
                  <AuthGlyph name="lock" />
                  <input id="auth-password" v-model="password" :type="showPassword ? 'text' : 'password'" :autocomplete="loginMode === 'login' ? 'current-password' : 'new-password'" aria-label="密码" placeholder="密码（8～64 位）" />
                  <button type="button" class="password-toggle" :aria-label="showPassword ? '隐藏密码' : '显示密码'" :aria-pressed="showPassword" @click="togglePasswordVisibility"><AuthGlyph v-if="loginMode === 'login'" name="eye" /><span>{{ showPassword ? '隐藏' : '显示' }}</span></button>
                </div>
              </div>
              <div v-if="loginMode === 'register'" class="auth-field-group">
                <label for="auth-confirm-password" class="sr-only">确认密码</label>
                <div class="auth-input-row password-field">
                  <AuthGlyph name="lock" />
                  <input id="auth-confirm-password" v-model="passwordConfirmation" :type="showPasswordConfirmation ? 'text' : 'password'" autocomplete="new-password" aria-label="确认密码" placeholder="再次输入密码" />
                  <button type="button" class="password-toggle" :aria-label="showPasswordConfirmation ? '隐藏确认密码' : '显示确认密码'" :aria-pressed="showPasswordConfirmation" @click="showPasswordConfirmation = !showPasswordConfirmation"><span>{{ showPasswordConfirmation ? '隐藏' : '显示' }}</span></button>
                </div>
              </div>
              <button type="submit" class="auth-submit" :disabled="busy"><span>{{ busy ? '连接中…' : loginMode === 'login' ? '登录' : '注册' }}</span></button>
            </form>
            <p v-if="error" class="error-text auth-error" role="alert">{{ error }}</p>
            <p v-if="loginMode === 'register'" class="auth-welcome"><span>开启属于你的异世界冒险吧！</span></p>
          </div>
        </div>
      </section>
    </div>

    <section v-else-if="!gameReady" class="player-load-screen ff-boot-screen" :class="{ 'has-load-error': gameLoadError }" :aria-busy="!gameLoadError" aria-live="polite" aria-label="正在进入幻想次元">
      <img class="ff-boot-hero" src="/assets/light-anime/auth-v4/loading-scene-wide-v1.webp" width="1672" height="940" alt="更大的世界就去冒险吧！梨子喵与球兔前往百纳镇" />
      <div class="ff-boot-inner">
        <img class="ff-boot-logo" :src="ANIME_LOGO" width="1942" height="809" alt="幻想次元" />
        <div class="ff-boot-track-wrap">
          <div class="ff-boot-status-row">
            <p v-if="!gameLoadError" class="ff-boot-status">{{ gameLoadStatus }}</p>
            <p v-else class="ff-boot-status player-load-error" role="alert">{{ gameLoadError }}</p>
            <span class="ff-boot-count">{{ gameLoadProgress.total ? `${gameLoadProgress.completed} / ${gameLoadProgress.total} 项` : '准备中' }}</span>
            <span class="ff-boot-elapsed" aria-hidden="true">已用 {{ gameLoadElapsed }} 秒</span>
          </div>
          <div class="ff-boot-progress-row">
            <svg class="ff-boot-paw" viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="10" cy="14" rx="5" ry="7" fill="currentColor" transform="rotate(-24 10 14)" /><ellipse cx="21" cy="9" rx="5" ry="7" fill="currentColor" transform="rotate(-7 21 9)" /><ellipse cx="33" cy="10" rx="5" ry="7" fill="currentColor" transform="rotate(10 33 10)" /><ellipse cx="42" cy="19" rx="4.5" ry="6.5" fill="currentColor" transform="rotate(26 42 19)" /><path d="M13 31c3-3 4-10 11-10s8 7 12 11c7 10-1 14-8 10-4-2-5-2-9 0-9 4-14-4-6-11Z" fill="currentColor" /></svg>
            <div class="player-load-track ff-boot-track" role="progressbar" :aria-valuenow="Math.floor(gameLoadProgress.fraction * 100)" aria-valuemin="0" aria-valuemax="100" :aria-label="gameLoadStatus"><div class="ff-boot-fill" :style="{ width: `${(gameLoadProgress.fraction * 100).toFixed(1)}%` }" /></div>
            <span class="ff-boot-percent" aria-hidden="true">{{ Math.floor(gameLoadProgress.fraction * 100) }}%</span>
          </div>
        </div>
        <div class="player-load-actions"><button v-if="gameLoadError" type="button" class="primary-button" @click="retryPlayerExperience">{{ gameLoadNeedsReload ? '重新加载页面' : '重试加载' }}</button><button type="button" class="soft-button" @click="logout">退出登录</button></div>
      </div>
    </section>
    <template v-else>
      <header class="topbar" :class="{ 'story-topbar': showStoryGuide }">
        <div class="page-brand"><div class="anime-wordmark original-game-logo"><img :src="ANIME_LOGO" width="1942" height="809" alt="幻想次元" /></div></div>
        <div class="page-context" role="heading" aria-level="1"><strong>{{ title }}</strong></div>
        <div class="top-actions"><span class="connection-dot">在线</span><button v-if="catalogOpen" class="ghost-button catalog-toggle" :disabled="showStoryGuide || Boolean(registrationLoginId)" @click="openCommandCatalog">{{ catalogOpen ? '返回页面' : '全部操作' }}</button><button type="button" class="inbox-button" :disabled="showStoryGuide || Boolean(registrationLoginId)" :aria-label="mailUnreadCount > 0 ? '打开消息信箱（有未读邮件）' : '打开消息信箱'" title="消息信箱" :aria-expanded="notificationOpen" @click="openNotificationInbox"><img src="/assets/light-anime/header-mail-v1.webp" width="128" height="128" alt="" aria-hidden="true" /><i v-if="mailUnreadCount > 0" class="inbox-unread-dot" aria-hidden="true"></i></button><button type="button" class="settings-button" aria-label="打开设置" title="设置" :aria-expanded="settingsOpen" @click="openSettings"><img src="/assets/light-anime/header-settings-v1.webp" width="128" height="128" alt="" aria-hidden="true" /></button></div>
      </header>

      <nav v-if="!catalogOpen && !showStoryGuide && !registrationLoginId && tab === 'character'" class="main-section-tabs character-tabs" role="tablist" aria-label="角色页面子选项" :inert="showStoryGuide || Boolean(registrationLoginId)">
        <button v-for="item in characterSections" :key="item.id" type="button" role="tab" :aria-selected="characterSection === item.id" :class="{ active: characterSection === item.id }" :disabled="criticalPending" @click="selectCharacterSection(item.id)"><span class="character-tab-icon"><TabArtIcon :name="item.icon" :size="30" /></span><span>{{ item.label }}</span></button>
      </nav>
      <nav v-if="!catalogOpen && !showStoryGuide && !registrationLoginId && tab === 'inventory'" class="main-section-tabs inventory-tabs" role="tablist" aria-label="背包分类" :inert="showStoryGuide || Boolean(registrationLoginId)">
        <button v-for="category in inventoryCategories" :key="category" type="button" :class="{ active: inventoryCategory === category }" role="tab" :aria-selected="inventoryCategory === category" :title="category" :aria-label="category" @click="selectInventoryCategory(category)"><TabArtIcon class="inventory-category-icon" :name="category === '全部' ? 'all-items' : category === '装备' ? 'equipment' : category === '道具' ? 'consumables' : 'materials'" :size="30" /><span class="inventory-category-label">{{ category }}</span></button>
      </nav>
      <nav v-if="!catalogOpen && !showStoryGuide && !registrationLoginId && tab === 'social'" class="main-section-tabs social-section-tabs" role="tablist" aria-label="社交功能" :inert="showStoryGuide || Boolean(registrationLoginId)">
        <button type="button" role="tab" :aria-selected="socialSection === 'friends'" :class="{ active: socialSection === 'friends' }" :disabled="criticalPending" @click="selectSocialSection('friends')"><TabArtIcon name="friends" :size="30" /><span>好友</span></button>
        <button type="button" role="tab" :aria-selected="socialSection === 'oath'" :class="{ active: socialSection === 'oath' }" :disabled="criticalPending" @click="selectSocialSection('oath')"><TabArtIcon name="oath" :size="30" /><span>星誓</span></button>
        <button type="button" role="tab" :aria-selected="socialSection === 'party'" :class="{ active: socialSection === 'party' }" :disabled="criticalPending" @click="selectSocialSection('party')"><TabArtIcon name="party" :size="30" /><span>队伍</span></button>
      </nav>
      <nav v-if="!catalogOpen && !showStoryGuide && !registrationLoginId && tab === 'world'" class="main-section-tabs world-section-tabs" role="tablist" aria-label="世界功能" :inert="showStoryGuide || Boolean(registrationLoginId)">
        <button type="button" role="tab" :aria-selected="worldSection === 'overview'" :class="{ active: worldSection === 'overview' }" :disabled="criticalPending" @click="openWorldSection('overview')"><TabArtIcon name="overview" :size="30" /><span>总览</span></button>
        <button type="button" role="tab" :aria-selected="worldSection === 'market'" :class="{ active: worldSection === 'market' }" :disabled="criticalPending" @click="openWorldSection('market')"><TabArtIcon name="market" :size="30" /><span>万叶联市</span></button>
        <button type="button" role="tab" :aria-selected="worldSection === 'home'" :class="{ active: worldSection === 'home' }" :disabled="criticalPending" @click="openWorldSection('home')"><TabArtIcon name="home" :size="30" /><span>家园</span></button>
      </nav>

      <div v-if="panel?.summary && !showStoryGuide && !registrationLoginId && tab === 'explore' && !catalogOpen && !panel.inBattle && !negotiation" class="anime-status-ribbon" aria-label="角色资源">
        <div class="stat-card"><AnimeIcon name="heart" /><span>生命</span><strong>{{ panel.summary.hp.current }} / {{ panel.summary.hp.max }}</strong><i><b :style="{ width: `${hpPercent}%` }" /></i></div>
        <div class="stat-card"><AnimeIcon name="mana" /><span>魔力</span><strong>{{ panel.summary.mp.current }} / {{ panel.summary.mp.max }}</strong><i class="mana"><b :style="{ width: `${mpPercent}%` }" /></i></div>
        <div class="stat-card"><AnimeIcon name="stamina" /><span>体力</span><strong>{{ panel.summary.stamina.current }} / {{ panel.summary.stamina.max }}</strong><i class="stamina"><b :style="{ width: `${Math.min(100, Math.max(0, panel.summary.stamina.current / Math.max(1, panel.summary.stamina.max) * 100))}%` }" /></i></div>
      </div>

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
          <CommandCatalog ref="commandCatalogRef" :commands="catalog" :busy="busy" :execute="executeCatalogAction" @refresh="(regions, result) => void handleCatalogRefresh(regions, result)" @executed="handleCatalogResult" @error="setError" @interaction-action="action => runIssuedAction(action, 'catalog')" />
        </section>

        <section v-else-if="tab === 'explore'" class="explore-page anime-exploration-refinement">
          <TurnBattlePanel v-if="battleState" :battle="battleState" :disabled="busy" @action="runBattleAction" @open-auto-battle="openAutoBattle" />
          <NegotiationPanel v-else-if="negotiation" :player-portrait="portraitBaseAsset(characterData.portrait)" :negotiation="negotiation" :disabled="busy" @action="runNegotiationAction" />
          <template v-else>
          <div class="explore-frame card-surface">
            <WorldMapPanel class="explore-map" :render-scene="settingsRenderExploration" :player-portrait="portraitBaseAsset(characterData.portrait)" :player-identity="characterData.portrait" :player-key="panel?.account?.uid ?? panel?.account?.gameUserId" @heading-change="heading => mapRestingHeading = heading" :region-code="mapVisionRegionCode" :moving="mapAvatarMoving" :movement-target="mapMovementTarget" :display-position="mapDisplayPosition" :travel-visual-center="mapTravelVisualCenter" :movement-heading="mapMovementHeading" :movement-speed="mapMovementSpeed" :actual-movement-speed="mapActualMovementSpeed" :mapped-settlement="mapRenderSnapshot?.mappedSettlement" :cells="mapCells" :environment="mapEnvironment" :surface-scene="mapSurfaceScene" :ground-window="mapGroundWindow" :current="mapVisionCurrent" :bounds="mapBounds" :points="mapPoints" :target-popup-request="mapTargetPopupRequest" @target-popup-consumed="id => { if (mapTargetPopupRequest?.id === id) mapTargetPopupRequest = undefined; }" :move-range="mapMoveRange" :sight-range="mapSightRange" :disabled="busy || Boolean(mapActionLock)" :action-lock="mapActionLock" :action-art="mapActionArtwork" @move="runAnimatedMapMove" @action="runAnimatedMapAction" @stop-action="stopMapAction" @clear-environment="runClearEnvironment" @open-region-map="openRegionMapSidebar" :chat-open="Boolean(floatingSocialOpen)" @open-chat="toggleFloatingSocial('chat')" @open-auto-battle="openAutoBattle" >
              <template #map-footer><AdventureManualDock inline :sections="['tasks', 'footprints', 'codex', 'warrants']" @select="openAdventureManual" /></template>
            </WorldMapPanel>
          </div>
          <RegionMapSidebar ref="regionMapSidebarRef" :regions="regionMap.regions" :members="regionMap.members" :landmarks="regionMap.landmarks" :current-region-code="regionMap.currentRegionCode" :disabled="busy" :loading="busy" @travel="runRegionTravel" />
          <div v-if="pendingInteractions.length" class="interaction-choice-backdrop exploration-nearby-layer" role="presentation" @click.self="pendingInteractions = []">
            <div class="interaction-choice card-surface exploration-window" data-window-theme="map" role="dialog" aria-modal="true" aria-label="附近互动">
              <button type="button" class="dialog-close exploration-window-close" aria-label="关闭互动选择" @click="pendingInteractions = []"><span class="exploration-close-mark" aria-hidden="true" /></button>
              <header class="exploration-dialog-heading exploration-window-heading"><div><h3>这里发现了目标</h3><p>选择要查看的互动对象。</p></div></header>
              <div class="exploration-window-body">
              <div v-if="selectedPendingInteraction" class="nearby-encounter-preview"><span class="encounter-illustration"><img class="encounter-target-art" :src="pendingInteractionArtwork(selectedPendingInteraction)" alt="" /></span><div><small>{{ interactionTypeName(selectedPendingInteraction.type) }}</small><strong>{{ selectedPendingInteraction.name }}</strong></div><SocialGlyph class="encounter-paw" name="paw" :size="46" /></div>
              <div class="interaction-choice-list" role="group" aria-label="选择附近互动对象"><button v-for="target in pendingInteractions" :key="`${target.type}:${target.id}`" type="button" class="soft-button" :class="{ selected: selectedPendingInteraction === target }" :aria-pressed="selectedPendingInteraction === target" :disabled="busy" @click="pendingInteractionSelection = `${target.type}:${target.id}`"><span class="encounter-row-icon"><img class="encounter-target-art" :src="pendingInteractionArtwork(target)" alt="" /></span><span><strong>{{ target.name }}</strong><small>{{ interactionTypeName(target.type) }}<template v-if="target.description"> · {{ target.description }}</template></small></span><AnimeIcon name="arrow" :size="18" /></button></div>
              <section v-if="selectedPendingInteraction" class="nearby-encounter-detail"><h4><SocialGlyph name="leaf" :size="24" />{{ selectedPendingInteraction.name }}</h4><div><img class="encounter-target-art" :src="pendingInteractionArtwork(selectedPendingInteraction)" alt="" /><p>{{ selectedPendingInteraction.description || `查看${selectedPendingInteraction.name}，了解此处可进行的互动。` }}</p></div><button type="button" class="primary-button" :disabled="busy" @click="openSelectedPendingInteraction"><SocialGlyph name="search" :size="22" />查看互动</button></section>
              </div>
            </div>
          </div>
          </template>
        </section>

        <div v-if="autoBattleOpen" class="auto-battle-backdrop exploration-auto-layer" role="presentation" @click.self="closeAutoBattle">
          <section class="auto-battle-dialog card-surface exploration-window" data-window-theme="auto" role="dialog" aria-modal="true" aria-label="自动战斗设置">
            <button type="button" class="dialog-close exploration-window-close" aria-label="关闭自动战斗设置" :disabled="autoBattleBusy" @click="closeAutoBattle"><span class="exploration-close-mark" aria-hidden="true" /></button>
            <header class="auto-battle-dialog-header exploration-window-heading">
            <div class="section-heading auto-battle-heading"><div><p class="exploration-window-kicker">AUTO BATTLE</p><h2><SocialGlyph name="paw" :size="27" />自动</h2></div></div>
            </header>
            <div class="auto-battle-dialog-body">
            <span class="auto-battle-state" :class="{ enabled: autoBattleSettings?.settings.enabled }">{{ autoBattleLoadError ? '读取失败' : !autoBattleSettings ? '读取中' : autoBattleSettings.settings.enabled ? '运行中' : '未开启' }}</span>
            <div v-if="autoBattleSettings" class="auto-battle-content">
              <div class="auto-battle-mode-tabs" role="group" aria-label="自动战斗模式"><button type="button" :class="{ active: autoBattleMode === 'pve' }" :aria-pressed="autoBattleMode === 'pve'" :disabled="autoBattleBusy" @click="switchAutoBattleMode('pve')"><TabArtIcon name="forest" :size="26" />PVE 探索</button><button type="button" :class="{ active: autoBattleMode === 'pvp' }" :aria-pressed="autoBattleMode === 'pvp'" :disabled="autoBattleBusy" @click="switchAutoBattleMode('pvp')"><TabArtIcon name="equipment" :size="26" />PVP 对战</button></div>
              <div class="auto-battle-switches"><div class="auto-battle-toggle-row"><AnimeIcon name="sword" :size="29" /><span><strong>自动战斗</strong><small>按照配置的顺序执行战斗</small></span><button type="button" role="switch" :aria-checked="autoBattleSettings.settings.enabled" aria-label="自动战斗" class="toggle-button" :class="{ active: autoBattleSettings.settings.enabled }" :disabled="autoBattleBusy" @click="saveAutoBattleSetting({ operation: 'enabled', enabled: !autoBattleSettings.settings.enabled })"><i />{{ autoBattleSettings.settings.enabled ? '已开启' : '已关闭' }}</button></div><div class="auto-battle-toggle-row"><ExplorePotionGlyph /><span><strong>自动嗑药</strong><small>根据生命与魔力阈值使用药剂</small></span><button type="button" role="switch" :aria-checked="autoBattleSettings.settings.autoPotionEnabled" aria-label="自动嗑药" class="toggle-button" :class="{ active: autoBattleSettings.settings.autoPotionEnabled }" :disabled="autoBattleBusy" @click="saveAutoBattleSetting({ operation: 'potion', enabled: !autoBattleSettings.settings.autoPotionEnabled })"><i />{{ autoBattleSettings.settings.autoPotionEnabled ? '已开启' : '已关闭' }}</button></div></div>
              <div v-if="autoBattleMode === 'pve'" class="auto-battle-default"><span><SocialGlyph name="paw" :size="22" />遇敌默认操作</span><div class="auto-battle-default-actions"><button type="button" :class="{ active: autoBattleSettings.settings.defaultEncounterAction === 'persuade' }" :aria-pressed="autoBattleSettings.settings.defaultEncounterAction === 'persuade'" :disabled="autoBattleBusy || autoBattleSettings.settings.defaultEncounterAction === 'persuade'" @click="saveAutoBattleSetting({ operation: 'default-action' })"><SocialGlyph name="chat" :size="21" />优先交涉</button><button type="button" :class="{ active: autoBattleSettings.settings.defaultEncounterAction === 'battle' }" :aria-pressed="autoBattleSettings.settings.defaultEncounterAction === 'battle'" :disabled="autoBattleBusy || autoBattleSettings.settings.defaultEncounterAction === 'battle'" @click="saveAutoBattleSetting({ operation: 'default-action' })"><AnimeIcon name="sword" :size="21" />直接战斗</button></div></div>
              <div class="auto-battle-potion-grid"><label><span><AnimeIcon name="heart" :size="24" />生命低于 <b>{{ autoBattleHpThreshold }}%</b></span><input v-model.number="autoBattleHpThreshold" type="range" min="1" max="99" step="1" :disabled="autoBattleBusy" aria-label="生命自动用药阈值" @change="saveAutoBattleThreshold('hp')" /><span class="auto-battle-select-label">使用药剂</span><select :value="autoBattleSettings.settings.hpItemId ?? 0" :disabled="autoBattleBusy" aria-label="生命自动用药" @change="saveAutoBattlePotion('hp', $event)"><option value="0">不使用药剂</option><option v-for="item in autoBattlePotionChoices" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label><span><AnimeIcon name="mana" :size="24" />魔力低于 <b>{{ autoBattleMpThreshold }}%</b></span><input v-model.number="autoBattleMpThreshold" type="range" min="1" max="99" step="1" :disabled="autoBattleBusy" aria-label="魔力自动用药阈值" @change="saveAutoBattleThreshold('mp')" /><span class="auto-battle-select-label">使用药剂</span><select :value="autoBattleSettings.settings.mpItemId ?? 0" :disabled="autoBattleBusy" aria-label="魔力自动用药" @change="saveAutoBattlePotion('mp', $event)"><option value="0">不使用药剂</option><option v-for="item in autoBattlePotionChoices" :key="item.id" :value="item.id">{{ item.name }}</option></select></label></div>
              <div class="auto-battle-actions"><div class="auto-battle-actions-heading"><strong><SocialGlyph name="paw" :size="23" />出招顺序</strong><small>循环执行，未配置时使用普通攻击</small></div><div v-for="sequence in autoBattleActionSlots" :key="sequence" class="auto-battle-action-row"><b>{{ sequence }}</b><SkillIcon v-if="autoBattleSlotSkill(sequence)?.code" :code="autoBattleSlotSkill(sequence)?.code" :size="34" /><SkillIcon v-else-if="autoBattleActionValue(sequence) === '0'" code="basic_slash" :size="34" /><SkillIcon v-else :size="34" /><select :value="autoBattleActionValue(sequence)" :disabled="autoBattleBusy" :aria-label="`第${sequence}步出招`" @change="saveAutoBattleActionSlot(sequence, $event)"><option v-for="skill in autoBattleSkillChoices" :key="`${sequence}:${skill.id ?? 0}`" :value="skill.id ?? 0">{{ skill.name }}</option></select><button v-if="autoBattleSettings.actions.some(item => item.sequence === sequence)" type="button" class="ghost-button" :disabled="autoBattleBusy" :aria-label="`删除第${sequence}步出招`" @click="deleteAutoBattleActionSlot(sequence)"><SocialGlyph name="close" :size="15" /><span>删除</span></button></div></div>
            </div>
            <div v-else-if="autoBattleLoadError" class="empty-state auto-battle-load-error game-ui-empty-message" role="alert"><GameUiFeedbackArt name="error" /><span>自动战斗设置读取失败：{{ autoBattleLoadError }}<button type="button" class="soft-button" :disabled="autoBattleBusy" @click="openAutoBattle">重新读取</button></span></div>
            <div v-else class="empty-state game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" /><span>正在读取自动战斗设置…</span></div>
            </div>
          </section>
        </div>

        <section v-else-if="tab === 'character'" class="character-page">
          <CharacterInfoPanel v-if="characterSection === 'profile'" :summary="panel?.summary" :game-id="panel?.account?.gameUserId ?? panel?.account?.uid" :portrait="characterData.portrait" :equipment="characterData.equipment" :groups="profileViewportGroups" />

          <div v-else-if="characterSection === 'equipment'" class="character-subpanel character-equipment-panel card-surface">
            <div class="equipment-layout">
              <div class="equipment-column equipment-armor-column" role="list" aria-label="防具部位"><h3 class="sr-only">防具</h3><button v-for="slot in equipmentLeftSlots" :key="slot.id" type="button" class="equipment-slot" :class="{ filled: equipmentForSlot(slot.id), selected: selectedEquipment?.slot === slot.id, [equipmentRarityClass(equipmentForSlot(slot.id))]: true }" :data-equipment-slot="slot.id" :aria-label="equipmentForSlot(slot.id)?.name ?? slot.label" :aria-pressed="selectedEquipment?.slot === slot.id" @click="equipmentForSlot(slot.id) && inspectCharacterEquipment(equipmentForSlot(slot.id)!)"><span class="equipment-slot-icon item-rarity-slot" :data-item-rarity="normalizeItemRarity(equipmentForSlot(slot.id)?.rarity)" v-item-rarity-sparkle="normalizeItemRarity(equipmentForSlot(slot.id)?.rarity)"><InventoryItemIcon v-if="equipmentForSlot(slot.id)" :name="equipmentForSlot(slot.id)?.name" :code="equipmentForSlot(slot.id)?.code" :codex-id="equipmentForSlot(slot.id)?.codexId ?? undefined" item-type="equipment" :item-category="equipmentForSlot(slot.id)?.itemCategory" :instance="true" /><span v-else class="equipment-slot-placeholder"><GearSlotIcon :slot="slot.id" /></span></span><span class="equipment-slot-copy"><strong>{{ slot.label }}</strong><span class="equipment-slot-name">{{ equipmentForSlot(slot.id)?.name ?? '尚未穿戴' }}</span><small v-if="equipmentForSlot(slot.id)?.requiredLevel">Lv.{{ equipmentForSlot(slot.id)?.requiredLevel }}</small></span></button></div>
              <div class="equipment-summary"><CharacterPortrait variant="equipment" class="equipment-portrait" :portrait="characterData.portrait" :equipment="characterData.equipment" alt="当前装备立绘" /><p class="equipment-profession">{{ panel?.summary?.profession ?? '尚未选择职业' }} · Lv.{{ panel?.summary?.level ?? 1 }}</p></div>
              <div class="equipment-column equipment-combat-column" role="list" aria-label="武器、副手与首饰部位"><h3 class="sr-only">武器、副手与首饰</h3><button v-for="slot in equipmentRightSlots" :key="slot.id" type="button" class="equipment-slot" :class="{ filled: equipmentForSlot(slot.id), selected: selectedEquipment?.slot === slot.id, [equipmentRarityClass(equipmentForSlot(slot.id))]: true }" :data-equipment-slot="slot.id" :aria-label="equipmentForSlot(slot.id)?.name ?? slot.label" :aria-pressed="selectedEquipment?.slot === slot.id" @click="equipmentForSlot(slot.id) && inspectCharacterEquipment(equipmentForSlot(slot.id)!)"><span class="equipment-slot-icon item-rarity-slot" :data-item-rarity="normalizeItemRarity(equipmentForSlot(slot.id)?.rarity)" v-item-rarity-sparkle="normalizeItemRarity(equipmentForSlot(slot.id)?.rarity)"><InventoryItemIcon v-if="equipmentForSlot(slot.id)" :name="equipmentForSlot(slot.id)?.name" :code="equipmentForSlot(slot.id)?.code" :codex-id="equipmentForSlot(slot.id)?.codexId ?? undefined" item-type="equipment" :item-category="equipmentForSlot(slot.id)?.itemCategory" :instance="true" /><span v-else class="equipment-slot-placeholder"><GearSlotIcon :slot="slot.id" /></span></span><span class="equipment-slot-copy"><strong>{{ slot.label }}</strong><span class="equipment-slot-name">{{ equipmentForSlot(slot.id)?.name ?? '尚未穿戴' }}</span><small v-if="equipmentForSlot(slot.id)?.requiredLevel">Lv.{{ equipmentForSlot(slot.id)?.requiredLevel }}</small></span></button></div>
            </div>
            <aside v-if="selectedEquipment" class="equipment-preview-card equipment-details-inline" role="region" aria-label="已穿戴装备详情" :data-equipment-id="selectedEquipment.id" :data-equipment-slot="selectedEquipment.slot" :data-rarity="selectedEquipment.rarity">
              <header class="equipment-details-heading" :data-rarity="selectedEquipment.rarity">
                <InventoryItemIcon class="equipment-details-icon item-rarity-slot" :data-item-rarity="normalizeItemRarity(selectedEquipment.rarity)" v-item-rarity-sparkle="normalizeItemRarity(selectedEquipment.rarity)" :name="selectedEquipment.name" :code="selectedEquipment.code" :codex-id="selectedEquipment.codexId ?? undefined" item-type="equipment" :item-category="selectedEquipment.itemCategory" :instance="true" />
                <div class="equipment-preview-copy"><p class="eyebrow">{{ selectedEquipmentCategory }}</p><h2 class="item-detail-name">{{ selectedEquipment.name }}</h2><div class="equipment-details-badges"><span v-if="selectedEquipment.rarity">{{ selectedEquipment.rarity }}</span><span v-if="selectedEquipment.requiredLevel !== undefined">Lv.{{ selectedEquipment.requiredLevel }}</span><span v-if="selectedEquipment.quality !== undefined">品质 {{ selectedEquipment.quality }}%</span><span>已装备</span></div></div>
              </header>
              <div class="equipment-details-scroll" tabindex="0" aria-label="装备详细信息">
                <p v-if="equipmentDetailsLoading" class="equipment-details-loading" role="status">正在读取装备属性…</p>
                <div v-else-if="equipmentDetailsError" class="equipment-details-error" role="alert"><p>{{ equipmentDetailsError }}</p><button type="button" class="soft-button" @click="loadSelectedEquipmentDetails">重新读取</button></div>
                <EquipmentDetailSections v-else-if="selectedEquipmentDetails" :sections="selectedEquipmentDetails.sections" :sets="selectedEquipmentDetails.sets" :appearance-name="selectedEquipment.appearanceName" :armor-type="selectedEquipment.weaponType ?? undefined" />
              </div>
              <div class="equipment-details-actions"><button type="button" class="primary-button" :disabled="busy" @click="replaceSelectedEquipment">更换</button><button type="button" class="soft-button" :disabled="busy" @click="unequipSelectedEquipment">卸下</button><button type="button" class="soft-button" aria-label="关闭装备详情" @click="closeCharacterEquipment">返回</button></div>
            </aside>
          </div>

          <SkillPanel v-else-if="characterSection === 'skills'" class="character-subpanel" @updated="loadPanel" @pending-change="value => setCriticalPending('skill', value)" />

          <EvolutionPanel v-else-if="characterSection === 'evolution'" class="character-subpanel" @updated="loadPanel" @locate="command => runCommand(command, { surface: 'interaction' })" @pending-change="value => setCriticalPending('evolution', value)" />
          <AdvancedProfessionPanel v-else-if="characterSection === 'advancedProfession'" :open="tab === 'character'" inline @close="characterSection = 'profile'" @updated="loadPanel" @locate="locateAdvancedMentor" @trial-started="handleAdvancedTrialStarted" @pending-change="value => setCriticalPending('advancedProfession', value)" />
        </section>

        <section v-else-if="tab === 'inventory'" class="inventory-page">
          <div class="inventory-frame card-surface">
            <label class="inventory-search"><AnimeIcon name="search" :size="20" /><span class="sr-only">搜索背包物品</span><input v-model="inventoryKeyword" type="search" placeholder="搜索物品名称" autocomplete="off" /><span class="inventory-result-count">{{ inventoryItems.length }} 项</span><button v-if="inventoryKeyword" type="button" aria-label="清空物品搜索" @click="inventoryKeyword = ''"><AnimeIcon name="close" :size="18" /></button></label>
            <div class="inventory-paper-panel">
            <div v-if="inventoryCategory !== '全部'" class="inventory-filter-controls">
            <div v-if="inventoryCategory === '装备'" class="inventory-equipment-tabs" role="tablist" aria-label="装备大类"><button v-for="group in inventoryEquipmentGroups" :key="group" type="button" :class="{ active: inventoryEquipmentGroup === group }" role="tab" :aria-selected="inventoryEquipmentGroup === group" :title="group" :aria-label="group" @click="selectInventoryEquipmentGroup(group)"><span class="inventory-category-label">{{ group }}</span></button></div>
            <div :key="`${inventoryCategory}:${inventoryEquipmentGroup}`" class="inventory-subtabs" role="tablist" aria-label="物品分类"><button v-for="subcategory in inventorySubcategories" :key="subcategory" type="button" :class="{ active: inventorySubcategory === subcategory }" role="tab" :aria-selected="inventorySubcategory === subcategory" :title="subcategory" :aria-label="subcategory" @click="selectInventorySubcategory(subcategory)"><span class="inventory-category-label">{{ subcategory }}</span></button></div>
            </div>
            <div ref="inventoryViewport" class="inventory-viewport" :data-page-size="inventoryPaging.pageSize.value" :style="{ '--inventory-columns': inventoryColumns(), '--inventory-row-height': `${inventoryRowHeight()}px` }">
              <div v-if="inventoryItems.length" class="inventory-grid"><button v-for="item in inventoryPaging.visibleItems.value" :key="inventoryItemKey(item)" :data-item-key="inventoryItemKey(item)" :data-rarity="inventoryRarity(item)" class="inventory-slot" :class="{ 'is-previewed': inventoryPreviewItem && inventoryItemKey(inventoryPreviewItem) === inventoryItemKey(item) }" :title="item.name" :aria-label="`${item.name} ×${item.instance ? 1 : item.quantity}`" @focus="inventoryPreviewKey = inventoryItemKey(item)" @click="inventoryPreviewKey = inventoryItemKey(item); inspectInventoryItem(item)"><span class="inventory-slot-box item-rarity-slot" :data-item-rarity="inventoryRarity(item)" v-item-rarity-sparkle="inventoryRarity(item)"><InventoryItemIcon :name="item.name" :code="item.code" :codex-id="item.instance ? item.definitionCodexId : item.codexId" :item-type="item.itemType" :item-category="item.itemCategory" :instance="item.instance" /><small class="inventory-slot-quantity">×{{ item.instance ? 1 : item.quantity }}</small></span><strong class="inventory-slot-name">{{ item.name }}</strong></button></div>
            <div v-else class="empty-state inventory-empty game-ui-empty-message"><GameUiFeedbackArt name="empty" :size="64" /><span>背包中还没有这一类物品。</span></div>
            </div>
            <ViewportPagination :page="inventoryPaging.page.value" :total-pages="inventoryPaging.totalPages.value" :total="inventoryItems.length" editable label="背包翻页" @update:page="inventoryPaging.setPage" />
            </div>
          </div>
          <div v-if="selectedInventoryItem" class="inventory-item-backdrop" role="presentation" @click.self="closeInventoryItem">
            <div class="inventory-item-dialog card-surface" role="dialog" aria-modal="true" :aria-label="selectedInventoryItem.name">
              <button type="button" class="dialog-close" aria-label="关闭物品详情" @click="closeInventoryItem">×</button>
              <header class="inventory-dialog-heading" :data-rarity="inventoryRarity(selectedInventoryItem)">
              <span class="inventory-dialog-slot inventory-slot-box item-rarity-slot" :data-item-rarity="inventoryRarity(selectedInventoryItem)" v-item-rarity-sparkle="inventoryRarity(selectedInventoryItem)" :data-rarity="inventoryRarity(selectedInventoryItem)"><InventoryItemIcon :name="selectedInventoryItem.name" :code="selectedInventoryItem.code" :codex-id="selectedInventoryItem.instance ? selectedInventoryItem.definitionCodexId : selectedInventoryItem.codexId" :item-type="selectedInventoryItem.itemType" :item-category="selectedInventoryItem.itemCategory" :instance="selectedInventoryItem.instance" /></span>
              <div>
              <p class="eyebrow">{{ selectedInventoryItem.itemCategory || (selectedInventoryItem.itemType === 'equipment' ? '装备' : selectedInventoryItem.itemType === 'material' ? '材料' : '道具') }}</p>
              <h3 :class="{ 'item-detail-name': selectedInventoryItem.itemType === 'equipment' || selectedInventoryItem.instance }">{{ selectedInventoryItem.name }}</h3>
              <div class="inventory-dialog-meta"><span v-if="selectedInventoryItem.instance">品质 {{ selectedInventoryItem.quality ?? 0 }}%</span><span v-else>数量 ×{{ selectedInventoryItem.quantity }}</span></div>
              </div>
              </header>
              <div class="inventory-dialog-scroll">
              <p class="inventory-dialog-description">{{ selectedInventoryItem.description || (selectedInventoryItem.instance ? `耐久 ${selectedInventoryItem.durability ?? 0}/${selectedInventoryItem.durabilityMax ?? 0}` : `数量 ×${selectedInventoryItem.quantity}`) }}</p>
              <div v-if="inventoryUsePreview && !selectedInventoryItem.instance" class="inventory-use-preview">
                <h4><AnimeIcon name="check" :size="19" /> 使用预览</h4>
                <div><span>使用数量</span><strong>1 件</strong></div>
                <div><span>持有数量</span><strong>{{ selectedInventoryItem.quantity }} → {{ Math.max(0, selectedInventoryItem.quantity - 1) }}</strong></div>
                <p>当前道具每次使用一件，确认后由服务器结算实际效果。</p>
              </div>
              </div>
              <div class="inventory-dialog-actions">
                <template v-if="!selectedInventoryItem.instance && selectedInventoryItem.itemType === 'consumable' && selectedInventoryItem.id">
                  <button v-if="!inventoryUsePreview" type="button" class="primary-button" :disabled="busy || selectedInventoryItem.quantity < 1" @click="inventoryUsePreview = true">预览使用</button>
                  <button v-else type="button" class="primary-button" :disabled="busy || selectedInventoryItem.quantity < 1" @click="useSelectedInventoryItem">确认使用</button>
                </template>
                <button v-else-if="selectedInventoryItem.instance && selectedInventoryItem.id" type="button" class="primary-button" :disabled="busy" @click="inspectSelectedEquipment">查看装备</button>
                <button type="button" class="soft-button" @click="closeInventoryItem">返回</button>
              </div>
            </div>
          </div>
        </section>

        <section v-if="tab === 'social'" class="social-page anime-social-refinement" :class="'social-view-' + socialSection">
          <article v-if="socialSection === 'friends'" class="social-paper social-friends-paper" aria-label="好友列表与申请">
            <form class="social-add-friend" @submit.prevent="addSocialFriend"><SocialGlyph name="search" :size="29" /><input v-model="socialGameId" inputmode="numeric" maxlength="20" placeholder="输入 Game ID 添加好友" aria-label="好友 Game ID" :disabled="busy || criticalPending" /><button type="submit" class="social-ui-button social-button-teal" :disabled="busy || criticalPending"><SocialGlyph name="add" :size="24" />添加</button></form>
            <nav class="viewport-subtabs" aria-label="好友分类"><button type="button" :class="{active:socialFriendView === 'friends'}" @click="socialFriendView = 'friends'">我的好友 ({{ socialSummary.friends.length }})</button><button type="button" :class="{active:socialFriendView === 'requests'}" @click="socialFriendView = 'requests'">好友申请 ({{ socialSummary.friendRequests.length }})</button></nav>
            <div ref="socialViewport" class="social-viewport">
            <div v-if="socialFriendView === 'friends' && socialSummary.friends.length" class="social-friend-list">
              <article v-for="friend in friendPaging.visibleItems.value" :key="friend.gameId" :data-person-id="friend.gameId" class="social-friend-row social-person-card">
                <SocialAvatar :name="friend.name" :id="friend.gameId" :portrait="socialPortraitFor(friend)" :size="80" shape="square" />
                <div class="social-person-identity"><h3>{{ friend.name }}</h3><p>Game ID <span>{{ friend.gameId }}</span></p><p v-if="socialIdentityText(friend)" class="social-identity-detail">{{ socialIdentityText(friend) }}</p></div>
                <div class="social-person-relation"><strong class="social-stage-badge">{{ friend.stage }}</strong><p class="social-affinity" title="心形表示好感，数值为当前累计好感" :aria-label="'好感 ' + friend.affinity"><span>好感</span><SocialGlyph name="heart" :size="24" /><strong>{{ friend.affinity }}</strong></p><div v-if="socialAffinityProgress(friend)" class="social-affinity-progress"><div role="progressbar" :aria-valuenow="socialAffinityProgress(friend)?.percent" aria-valuemin="0" aria-valuemax="100" :aria-label="friend.stage + '阶段进度'"><i :style="{ width: socialAffinityProgress(friend)?.percent + '%' }"></i></div><small>距下一阶段 {{ socialAffinityProgress(friend)?.toNext }}</small></div></div>
                <div class="social-person-actions"><em class="social-relationship-badge" :class="{ oath: friend.status === 'oath' }">{{ friend.status === 'oath' ? '星誓' : '好友' }}</em><div class="social-row-actions"><button type="button" class="social-ui-button social-button-paper" :disabled="busy || criticalPending" @click="socialAction(`/好友资料 ${friend.gameId}`)"><SocialGlyph name="document" :size="21" />资料</button><button type="button" class="social-ui-button social-button-paper" :disabled="busy || criticalPending" @click="socialAction(`/玩家互动 ${friend.gameId}`)"><SocialGlyph name="chat" :size="21" />互动</button></div></div>
              </article>
            </div><p v-else-if="socialFriendView === 'friends'" class="social-empty">还没有好友，先在世界频道认识新的旅人。</p>
            <section v-else class="social-request-list" aria-label="待处理好友申请">
              <article v-for="request in friendRequestPaging.visibleItems.value" :key="request.id" :data-person-id="request.id" class="social-request-row social-person-card"><SocialAvatar :name="request.name" :id="request.gameId" :portrait="socialPortraitFor(request)" :size="80" shape="square" /><div class="social-request-identity"><h3>{{ request.name }}</h3><p>Game ID {{ request.gameId }}</p><p v-if="socialIdentityText(request)" class="social-identity-detail">{{ socialIdentityText(request) }}</p><time :datetime="request.createdAt">申请于 {{ socialDateText(request.createdAt) }}</time></div><div class="social-row-actions"><button type="button" class="social-ui-button social-button-teal" :disabled="busy || criticalPending" @click="socialAction(`/同意好友 ${request.id}`)"><SocialGlyph name="check" :size="23" />接受</button><button type="button" class="social-ui-button social-button-red" :disabled="busy || criticalPending" @click="socialAction(`/拒绝好友 ${request.id}`)"><SocialGlyph name="close" :size="23" />拒绝</button></div></article><p v-if="!socialSummary.friendRequests.length" class="social-empty">暂无待处理好友申请。</p>
            </section>
            </div>
            <ViewportPagination v-if="socialFriendView === 'friends'" :page="friendPaging.page.value" :total-pages="friendPaging.totalPages.value" :total="socialSummary.friends.length" label="好友翻页" @update:page="friendPaging.setPage" />
            <ViewportPagination v-else :page="friendRequestPaging.page.value" :total-pages="friendRequestPaging.totalPages.value" :total="socialSummary.friendRequests.length" label="好友申请翻页" @update:page="friendRequestPaging.setPage" />
          </article>
          <div v-else-if="socialSection === 'oath'" class="social-oath-screen">
            <nav class="viewport-subtabs" aria-label="星誓分类"><button type="button" :class="{active:socialOathView === 'partner'}" @click="socialOathView = 'partner'">我的伙伴</button><button type="button" :class="{active:socialOathView === 'requests'}" @click="socialOathView = 'requests'">星誓申请 ({{ socialSummary.oathRequests.length }})</button><button type="button" :class="{active:socialOathView === 'release'}" @click="socialOathView = 'release'">解除申请 ({{ socialSummary.oathReleaseRequests.length }})</button></nav>
            <div ref="socialViewport" class="social-viewport">
            <figure v-if="socialOathView === 'partner'" class="social-oath-banner"><img src="/assets/light-anime/social-v1/oath-banner.webp" alt="星誓之约的花园插画" /><figcaption>有你在身边，<br />平凡的旅途<br />也会闪闪发光。</figcaption></figure>
            <section v-if="socialOathView === 'partner'" class="social-paper social-oath-partner" aria-label="我的星誓伙伴"><h2 class="social-oath-heading"><SocialGlyph name="flower" :size="28" />我的星誓伙伴</h2>
              <article v-if="socialSummary.oath" class="social-oath-partner-card social-person-card">
                <SocialAvatar :name="socialSummary.oath.name" :id="socialSummary.oath.gameId" :portrait="socialPortraitFor(socialSummary.oath)" :size="100" shape="square" />
                <div class="social-oath-identity"><h3>{{ socialSummary.oath.name }}</h3><p>Game ID {{ socialSummary.oath.gameId }}</p><p v-if="socialIdentityText(socialSummary.oath)" class="social-identity-detail">{{ socialIdentityText(socialSummary.oath) }}</p></div>
                <div class="social-oath-metrics"><p class="social-affinity" title="心形表示好感，数值为当前累计好感"><SocialGlyph name="heart" :size="29" /><span>好感</span><strong>{{ socialSummary.oath.affinity }}</strong></p><div v-if="socialAffinityProgress(socialSummary.oath)" class="social-affinity-progress"><div role="progressbar" :aria-valuenow="socialAffinityProgress(socialSummary.oath)?.percent" aria-valuemin="0" aria-valuemax="100" :aria-label="socialSummary.oath.stage + '阶段进度'"><i :style="{ width: socialAffinityProgress(socialSummary.oath)?.percent + '%' }"></i></div><small>距下一阶段 {{ socialAffinityProgress(socialSummary.oath)?.toNext }}</small></div><p><span>关系阶段</span><strong><SocialGlyph name="star" :size="21" />{{ socialSummary.oath.stage }}</strong></p><p><span>状态</span><strong class="social-oath-state">{{ socialSummary.oath.status === 'active' ? '星誓关系进行中' : socialSummary.oath.status === 'ceremony_pending' ? '等待星誓仪式' : socialSummary.oath.status }}</strong></p></div>
                <div class="social-oath-keepsake"><SocialGlyph name="star" :size="48" /><button v-if="socialSummary.oath.status === 'ceremony_pending'" type="button" class="social-ui-button social-button-teal" :disabled="busy || criticalPending" @click="socialAction('/星誓仪式')">仪式</button><button v-if="socialSummary.oath.status === 'active'" type="button" class="social-ui-button social-button-teal" :disabled="busy || criticalPending" @click="socialAction('/星誓纪念')">纪念</button></div>
              </article>
              <p v-else class="social-empty">尚未建立星誓关系。与好友提升好感后，可以在教堂发起星誓。</p>
            </section>
            <section v-if="socialOathView === 'requests'" class="social-paper social-oath-requests" aria-label="收到星誓申请"><article v-for="request in oathRequestPaging.visibleItems.value" :key="request.id" :data-person-id="request.id" class="social-request-row social-person-card"><SocialAvatar :name="request.name" :id="request.gameId" :portrait="socialPortraitFor(request)" :size="88" shape="square" /><div class="social-request-identity"><h3>{{ request.name }}</h3><p>Game ID {{ request.gameId }}</p><p v-if="socialIdentityText(request)" class="social-identity-detail">{{ socialIdentityText(request) }}</p><p class="social-affinity"><SocialGlyph name="heart" :size="20" /><span>好感 {{ request.affinity }} · {{ request.stage }}</span></p><time :datetime="request.expiresAt">有效至 {{ socialDateText(request.expiresAt) }}</time></div><div class="social-row-actions"><button type="button" class="social-ui-button social-button-teal" :disabled="busy || criticalPending" @click="socialAction(`/接受星誓 ${request.id}`)"><SocialGlyph name="check" :size="24" />接受</button><button type="button" class="social-ui-button social-button-red" :disabled="busy || criticalPending" @click="socialAction(`/拒绝星誓 ${request.id}`)"><SocialGlyph name="close" :size="24" />拒绝</button></div></article><p v-if="!socialSummary.oathRequests.length" class="social-empty">暂无星誓申请。</p></section>
            <section v-if="socialOathView === 'release'" class="social-paper social-oath-release" aria-label="收到解除星誓申请"><article v-for="request in oathReleasePaging.visibleItems.value" :key="request.id" :data-person-id="request.id" class="social-request-row social-person-card"><SocialAvatar :name="request.name" :id="request.gameId" :portrait="socialPortraitFor(request)" :size="88" shape="square" /><div class="social-request-identity"><h3>{{ request.name }}</h3><p>Game ID {{ request.gameId }}</p><p v-if="socialIdentityText(request)" class="social-identity-detail">{{ socialIdentityText(request) }}</p><time :datetime="request.expiresAt">有效至 {{ socialDateText(request.expiresAt) }}</time></div><div class="social-row-actions"><button type="button" class="social-ui-button social-button-teal" :disabled="busy || criticalPending" @click="socialAction(`/同意解除星誓 ${request.id}`)"><SocialGlyph name="check" :size="24" />同意</button><button type="button" class="social-ui-button social-button-red" :disabled="busy || criticalPending" @click="socialAction(`/拒绝解除星誓 ${request.id}`)"><SocialGlyph name="close" :size="24" />拒绝</button></div></article><p v-if="!socialSummary.oathReleaseRequests.length" class="social-empty">暂无解除星誓申请。</p></section>
          </div>
            <ViewportPagination v-if="socialOathView === 'requests'" :page="oathRequestPaging.page.value" :total-pages="oathRequestPaging.totalPages.value" :total="socialSummary.oathRequests.length" label="星誓申请翻页" @update:page="oathRequestPaging.setPage" />
            <ViewportPagination v-if="socialOathView === 'release'" :page="oathReleasePaging.page.value" :total-pages="oathReleasePaging.totalPages.value" :total="socialSummary.oathReleaseRequests.length" label="解除星誓申请翻页" @update:page="oathReleasePaging.setPage" />
          </div>
          <article v-else class="card-surface social-summary-card social-party-card">
            <PartyPopup :party="currentParty" :recruitments="recruitments" :applications="applications" :busy="partyBusy" :loading="partyLoading" :loading-more="partyLoadingMore" :has-more="partyHasMore" :error="partyError" @create="createWebParty" @search="searchParties" @load-more="loadMoreParties" @apply="applyPartyById" @publish="publishPartyRecruitment" @leave="leaveWebParty" @rename="renameWebParty" @refresh="refreshPartyData" @accept="id => respondApplicationById(id, true)" @reject="id => respondApplicationById(id, false)" />
          </article>
        </section>

        <section v-else-if="tab === 'world'" class="world-page card-surface" aria-label="世界">
          <div v-if="worldSection === 'overview'" class="world-entry-grid">
            <button type="button" class="world-entry world-entry-painted" :disabled="criticalPending" @click="openWorldSection('market')">
              <img class="world-entry-art" src="/assets/light-anime/game-ui-v2/world-market.webp" width="2171" height="724" alt="" aria-hidden="true" />
              <span class="world-entry-copy"><strong>万叶联市</strong><small>交易与寄售</small></span>
            </button>
            <button type="button" class="world-entry world-entry-painted" :disabled="criticalPending" @click="openWorldSection('home')">
              <img class="world-entry-art" src="/assets/light-anime/game-ui-v2/world-home.webp" width="2170" height="725" alt="" aria-hidden="true" />
              <span class="world-entry-copy"><strong>家园</strong><small>小屋与家具</small></span>
            </button>
          </div>
          <div v-else class="world-selected-layout">
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
          <aside class="settings-drawer card-surface" role="dialog" aria-modal="true" aria-labelledby="settings-title" :inert="Boolean(settingsIdentityChange)">
            <header class="settings-header"><div><h2 id="settings-title">{{ settingsPage === 'password' ? (panel?.account?.passwordLoginEnabled === false ? '设置密码' : '修改密码') : '设置' }}</h2></div><button type="button" class="dialog-close" aria-label="关闭设置" @click="closeSettings">×</button></header>
            <div class="settings-content settings-arranged" :class="{ 'has-expanded-settings': settingsExpanded !== null }">
              <template v-if="settingsPage === 'overview'">
              <section class="settings-section settings-avatar-section" aria-label="头像">
                <span class="settings-avatar-preview"><img class="settings-avatar-image" :class="{ uploaded: settingsUploadedAvatar }" :src="settingsUploadedAvatar || portraitBaseAsset(characterData.portrait)" alt="当前头像" /></span>
                <div class="settings-avatar-actions"><h3>头像</h3><button type="button" class="soft-button" :disabled="busy || criticalPending || showStoryGuide || Boolean(registrationLoginId)" @click="settingsAvatarInput?.click()">上传头像</button><small>选择图片后裁剪</small></div>
                <input ref="settingsAvatarInput" class="settings-avatar-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="头像图片" tabindex="-1" @change="selectSettingsAvatar" />
                <p v-if="settingsAvatarError && !settingsAvatarSource" class="settings-inline-feedback error-text" role="alert">{{ settingsAvatarError }}</p>
              </section>
              <section class="settings-section settings-profile-section" aria-label="资料"><div class="settings-section-heading"><h3>资料</h3></div><form class="settings-form" @submit.prevent="saveSettingsNickname"><label><span class="sr-only">昵称</span><input v-model="settingsNickname" maxlength="24" autocomplete="nickname" placeholder="输入角色昵称" /></label><button type="submit" class="primary-button" :disabled="busy || criticalPending">改名</button></form><div class="settings-gender"><span>性别</span><div><button type="button" :class="{ active: settingsGender === '男' }" :aria-pressed="settingsGender === '男'" :disabled="busy || criticalPending || settingsGender === '男'" @click="saveSettingsGender('男')">男</button><button type="button" :class="{ active: settingsGender === '女' }" :aria-pressed="settingsGender === '女'" :disabled="busy || criticalPending || settingsGender === '女'" @click="saveSettingsGender('女')">女</button></div></div><p v-if="settingsProfileFeedback" class="settings-inline-feedback" role="status">{{ settingsProfileFeedback }}</p></section>
              <section class="settings-section settings-accordion">
                <button type="button" class="settings-accordion-toggle" :class="{ active: settingsExpanded === 'game' }" :aria-expanded="settingsExpanded === 'game'" aria-controls="settings-game-options" @click="toggleSettingsSection('game')"><span>游戏设置</span><span class="settings-chevron" aria-hidden="true">{{ settingsExpanded === 'game' ? '△' : '▽' }}</span></button>
                <div v-if="settingsExpanded === 'game'" id="settings-game-options" class="settings-accordion-content settings-game-options">
                  <div class="settings-section-heading"><span>探索场景渲染</span><button type="button" role="switch" class="settings-switch" :class="{ active: settingsRenderExploration }" :aria-checked="settingsRenderExploration" aria-label="探索场景渲染" @click="settingsRenderExploration = !settingsRenderExploration"><span class="settings-switch-track" aria-hidden="true"><span class="settings-switch-text">{{ settingsRenderExploration ? '开' : '关' }}</span><span class="settings-switch-knob" /></span></button></div>
                  <div class="settings-section-heading"><span>背景音乐</span><button type="button" role="switch" class="settings-switch" :class="{ active: musicEnabled }" :aria-checked="musicEnabled" aria-label="背景音乐" @click="toggleMusic"><span class="settings-switch-track" aria-hidden="true"><span class="settings-switch-text">{{ musicEnabled ? '开' : '关' }}</span><span class="settings-switch-knob" /></span></button></div>
                  <label class="settings-range"><span>音量 {{ musicVolume }}%</span><input v-model.number="musicVolume" type="range" min="0" max="100" step="1" :disabled="!musicEnabled" aria-label="背景音乐音量" /></label>
                  <button type="button" class="soft-button settings-catalog-entry" :disabled="criticalPending || showStoryGuide || Boolean(registrationLoginId)" @click="closeSettings(); openCommandCatalog()">冒险操作目录</button>
                </div>
              </section>
              <section class="settings-section settings-accordion settings-account">
                <button type="button" class="settings-accordion-toggle" :class="{ active: settingsExpanded === 'account' }" :aria-expanded="settingsExpanded === 'account'" aria-controls="settings-account-options" @click="toggleSettingsSection('account')"><span>账号设置</span><span class="settings-chevron" aria-hidden="true">{{ settingsExpanded === 'account' ? '△' : '▽' }}</span></button>
                <div v-if="settingsExpanded === 'account'" id="settings-account-options" class="settings-accordion-content settings-account-options">
                <div v-if="panel?.account?.loginId" class="account-id-row"><span>永久登录号</span><strong>{{ panel.account.loginId }}</strong><button type="button" class="soft-button" @click="copyAccountId(panel.account.loginId)">复制</button></div>
                <div v-if="panel?.account?.gameUserId" class="account-id-row"><span>Game ID</span><strong>{{ panel.account.gameUserId }}</strong><button type="button" class="soft-button" @click="copyAccountId(panel.account.gameUserId)">复制</button></div>
                <button v-if="panel?.account" type="button" class="soft-button settings-password-entry" :disabled="busy || criticalPending" @click="settingsPage = 'password'">{{ panel.account.passwordLoginEnabled === false ? '设置密码' : '修改密码' }} <span aria-hidden="true">›</span></button>
                </div>
              </section>
              <section class="settings-section settings-redeem" aria-label="兑换码"><h3>兑换码</h3><form class="settings-form" @submit.prevent="redeemSettingsCode"><label><span class="sr-only">兑换码</span><input v-model="settingsRedeemCode" maxlength="64" autocomplete="off" autocapitalize="characters" placeholder="输入兑换码" /></label><button type="submit" class="primary-button" :disabled="busy || criticalPending">{{ settingsRedeemBusy ? '兑换中' : '兑换' }}</button></form><p v-if="settingsRedeemFeedback" class="settings-inline-feedback" :class="{ 'error-text': settingsRedeemFailed }" :role="settingsRedeemFailed ? 'alert' : 'status'">{{ settingsRedeemFeedback }}</p></section>
              <button type="button" class="danger-button wide settings-logout" :disabled="busy || criticalPending" @click="logout">退出账号</button>
              </template>
              <section v-else class="settings-section settings-password-page">
                <button type="button" class="soft-button settings-password-back" @click="settingsPage = 'overview'">‹ 返回设置</button>
                <form v-if="panel?.account" class="settings-password-form" @submit.prevent="saveSettingsPassword">
                  <div v-if="panel.account.passwordLoginEnabled !== false" class="password-field"><input v-model="settingsCurrentPassword" :type="showSettingsCurrentPassword ? 'text' : 'password'" autocomplete="current-password" aria-label="当前密码" placeholder="当前密码" /><button type="button" class="password-toggle" :aria-label="showSettingsCurrentPassword ? '隐藏当前密码' : '显示当前密码'" @click="showSettingsCurrentPassword = !showSettingsCurrentPassword">{{ showSettingsCurrentPassword ? '隐藏' : '显示' }}</button></div>
                  <div class="password-field"><input v-model="settingsNewPassword" :type="showSettingsNewPassword ? 'text' : 'password'" autocomplete="new-password" aria-label="新密码" placeholder="新密码（8～64 位）" /><button type="button" class="password-toggle" :aria-label="showSettingsNewPassword ? '隐藏新密码' : '显示新密码'" @click="showSettingsNewPassword = !showSettingsNewPassword">{{ showSettingsNewPassword ? '隐藏' : '显示' }}</button></div>
                  <div class="password-field"><input v-model="settingsPasswordConfirmation" :type="showSettingsPasswordConfirmation ? 'text' : 'password'" autocomplete="new-password" aria-label="确认新密码" placeholder="再次输入新密码" /><button type="button" class="password-toggle" :aria-label="showSettingsPasswordConfirmation ? '隐藏确认密码' : '显示确认密码'" @click="showSettingsPasswordConfirmation = !showSettingsPasswordConfirmation">{{ showSettingsPasswordConfirmation ? '隐藏' : '显示' }}</button></div>
                  <button type="submit" class="primary-button wide" :disabled="busy">{{ panel.account.passwordLoginEnabled === false ? '设置密码' : '保存新密码' }}</button>
                </form>
              </section>
            </div>
          </aside>
        </div>
      </Transition>

      <div v-if="settingsOpen && settingsIdentityChange && settingsIdentityCost" class="settings-identity-cover" @click.self="cancelSettingsIdentityChange">
        <section class="settings-identity-dialog" role="alertdialog" aria-modal="true" aria-labelledby="settings-identity-title" aria-describedby="settings-identity-cost">
          <h3 id="settings-identity-title">{{ settingsIdentityChange.kind === 'rename' ? '确认改名' : '确认修改性别' }}</h3>
          <dl class="settings-identity-values"><div><dt>当前{{ settingsIdentityChange.kind === 'rename' ? '昵称' : '性别' }}</dt><dd>{{ settingsIdentityChange.kind === 'rename' ? settingsIdentityChange.status.name : settingsIdentityChange.status.gender }}</dd></div><div><dt>修改为</dt><dd>{{ settingsIdentityChange.value }}</dd></div></dl>
          <div id="settings-identity-cost" class="settings-identity-cost">
            <p>剩余免费次数：{{ settingsIdentityCost.freeRemaining }} 次</p>
            <p v-if="settingsIdentityCost.freeRemaining > 0">本次使用免费次数，不消耗{{ settingsIdentityCost.itemName }}。</p>
            <template v-else><p>需要：{{ settingsIdentityCost.itemName }} × {{ settingsIdentityCost.requiredQuantity }}</p><p>当前持有：{{ settingsIdentityCost.cardQuantity }} 张</p><p v-if="!settingsIdentityAvailable" class="error-text">{{ settingsIdentityCost.itemName }}不足，暂时无法修改。</p></template>
          </div>
          <p v-if="settingsIdentityChange.error" class="settings-identity-error" role="alert">{{ settingsIdentityChange.error }}</p>
          <div class="settings-identity-actions"><button type="button" aria-label="关闭修改确认" :disabled="settingsIdentityBusy" @click="cancelSettingsIdentityChange">取消</button><button type="button" class="settings-identity-confirm" :disabled="settingsIdentityBusy || !settingsIdentityAvailable" @click="confirmSettingsIdentityChange">{{ settingsIdentityBusy ? '修改中…' : '确认修改' }}</button></div>
        </section>
      </div>

      <AvatarCropDialog v-if="settingsAvatarSource" :source="settingsAvatarSource" :busy="settingsAvatarBusy" :error="settingsAvatarError" @cancel="clearSettingsAvatar" @confirm="uploadSettingsAvatar" />

      <div class="floating-social-layer" :inert="showStoryGuide || Boolean(registrationLoginId)" aria-label="社交快捷入口">
        <div v-show="tab === 'explore'" ref="floatingDockRef" class="floating-social-dock" :class="{ expanded: floatingDockExpanded, 'dock-side-left': floatingDockSide === 'left' }" :style="floatingDockStyle" @pointerdown="startFloatingDockDrag">
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

        <ExploreChatPanel :open="Boolean(floatingSocialOpen)" :tab="exploreChatTab" :messages="chatMessagesForView" :friend-channels="friendChannels" :active-channel-id="activeChannel" :channel-name="exploreChatChannelName" v-model:draft="messageDraft" :busy="busy || criticalPending" :can-send="exploreChatCanSend" :status-text="exploreChatStatusText" :has-earlier="chatHasEarlier" :loading-earlier="chatLoadingEarlier" :has-new="chatHasNewMessages" :system-items="notificationItems" :system-loading="notificationLoading || notificationLoadingMore" :system-has-more="notificationHasMore" :system-error="notificationError" :party-busy="partyBusy" :panel-style="floatingSocialPanelStyle" :message-portrait="socialMessagePortrait" :friend-portrait="socialPortraitFor" :recruitment-status="chatRecruitmentStatus" :can-apply="canApplyChatRecruitment" :invitation-count="playerCards.invitations.value.length" @inspect-player="playerCards.inspect" @open-invitations="playerCards.showInvitations" @close="closeFloatingSocial" @select-tab="selectExploreChatTab" @select-friend="selectChannel" @send="sendChat" @earlier="loadEarlierMessages" @latest="jumpToLatestMessages" @scroll="handleChatScroll" @manage-party="toggleTeamPopup" @apply="applyChatRecruitment" @refresh-system="loadNotifications" @more-system="loadOlderNotifications" @panel-element="element => floatingSocialPanelRef = element" @list-element="element => chatMessageListRef = element" @drag-start="event => startModalDrag('social', event)" @resize-start="startSocialResize" />
        <PlayerCardDialog :open="playerCards.open.value" :profile="playerCards.profile.value" :loading="playerCards.loading.value" :busy="playerCardBusy" :error="playerCards.error.value" :notice="playerCards.notice.value" @close="playerCards.closeProfile" @retry="playerCards.reloadProfile" @add-friend="playerCards.addFriend" @invite-party="playerCards.inviteParty" @whisper="playerCards.whisper" @open-invitations="playerCards.showInvitations" />
        <PartyInvitationsDialog :open="playerCards.invitationsOpen.value" :items="playerCards.invitations.value" :loading="playerCards.invitationsLoading.value" :busy="playerCardBusy" :error="playerCards.invitationsError.value" :notice="playerCards.invitationsNotice.value" @close="playerCards.closeInvitations" @retry="playerCards.refreshInvitations()" @respond="playerCards.respondInvitation" @inspect-player="playerCards.inspect" />

        <section v-if="teamPopupOpen" ref="teamPanelRef" :style="teamPanelStyle" class="floating-social-panel team-info-panel card-surface" role="dialog" aria-modal="false" aria-label="队伍信息">
          <div class="floating-social-panel-heading" @pointerdown="startModalDrag('team', $event)">
            <div><p class="eyebrow">PARTY</p><h3>队伍信息</h3></div>
            <button type="button" class="dialog-close floating-social-close" aria-label="关闭队伍信息" @click.stop="teamPopupOpen = false"><AnimeIcon name="close" :size="19" /></button>
          </div>
          <PartyPopup :party="currentParty" :recruitments="recruitments" :applications="applications" :busy="partyBusy" :loading="partyLoading" :loading-more="partyLoadingMore" :has-more="partyHasMore" :error="partyError" @create="createWebParty" @search="searchParties" @load-more="loadMoreParties" @apply="applyPartyById" @publish="publishPartyRecruitment" @leave="leaveWebParty" @rename="renameWebParty" @refresh="refreshPartyData" @accept="id => respondApplicationById(id, true)" @reject="id => respondApplicationById(id, false)" />
        </section>
      </div>

      <div v-if="notice || error" :key="feedbackToastKey" class="feedback-toast" :class="{ error: Boolean(error) }" :role="error ? 'alert' : 'status'">
        <GameUiFeedbackArt :name="error ? 'error' : 'message'" :size="36" />
        <span class="feedback-toast-copy">{{ error || notice }}</span>
      </div>

      <NotificationInbox :open="notificationOpen && !showStoryGuide" :items="notificationItems" :unread-count="notificationUnreadCount" :loading="notificationLoading" :loading-more="notificationLoadingMore" :has-more="notificationHasMore" :error="notificationError" :marking-read-id="notificationMarkingReadId" :mail-items="mailItems" :mail-unread-count="mailUnreadCount" :mail-filter="mailFilter" :mail-loading="mailLoading" :mail-loading-more="mailLoadingMore" :mail-has-more="mailHasMore" :mail-error="mailError" :mail-detail="mailDetail" :mail-detail-loading="mailDetailLoading" :mail-action-busy="mailActionBusy" @close="notificationOpen = false" @refresh="loadNotifications" @load-more="loadOlderNotifications" @mark-read="markNotificationRead" @open-command="openNotificationCommand" @mail-filter-change="selectGameMailFilter" @mail-refresh="loadGameMails" @mail-load-more="loadOlderGameMails" @open-mail="loadGameMailDetail" @claim-mail="claimGameMail" @delete-mail="deleteGameMail" @claim-all-mail="claimAllGameMails" />

      <StoryDialog :open="showStoryGuide && !registrationLoginId" :messages="storyGuide?.messages ?? []" :busy="busy || storyLoading" :error="storyError" :in-battle="Boolean(panel?.inBattle)" :can-finish="Boolean(panel?.account?.hasCharacter && !panel?.pendingStory)" @action="action => runIssuedAction(action, 'story')" @command="command => runCommand(command, { surface: 'story' })" @refresh="refreshStoryGuide" @finish="leaveStory" />

      <AdventureManualPanel :open="manualOpen && !showStoryGuide" title="任务" :category="manualCategory" :available-categories="['主线', '支线', '委托', '悬赏', '其他']" :messages="manualMessages" :busy="manualBusy || busy" :error="manualError" @close="manualOpen = false" @category="selectManualCategory" @command="runManualCommand" @action="action => runIssuedAction(action, 'manual')" />
      <HandbookContent :open="handbookOpen && !showStoryGuide" :section="handbookSection" @close="handbookOpen = false" @updated="() => loadPanel()" />
      <BankPanel :open="bankOpen && !showStoryGuide" @close="bankOpen = false" @updated="loadPanel" />
      <GuildShopPanel v-if="guildShopTargetId" :open="!showStoryGuide" :target-id="guildShopTargetId" :initial-side="commerceSide" @close="guildShopTargetId = null" @updated="loadPanel" />
      <BookshopPanel :open="bookshopOpen && !showStoryGuide" target-id="bookshop" :initial-side="commerceSide" @close="bookshopOpen = false" @updated="loadPanel" />
      <HomePurchasePanel v-if="homePurchaseMode" :open="true" :mode="homePurchaseMode" @close="homePurchaseMode = null" @updated="() => { loadPanel(); homePanelRef?.refresh(); }" @purchased="result => { notice = `已购得小屋，地块坐标 (${result.plot.x}, ${result.plot.y}, ${result.plot.z})。`; homePanelRef?.refresh(); }" @locate="locateHomePurchaseSite" @pending-change="value => setCriticalPending('homePurchase', value)" />
      <AdventureManualPanel :open="interactionOpen && !showStoryGuide" :title="interactionTitle" caption="地点互动" :appearance="interactionTitle === '战斗结算' ? 'default' : 'location'" :messages="interactionMessages" :busy="busy" :error="interactionError" @close="interactionOpen = false" @command="runInteractionCommand" @action="action => runIssuedAction(action, 'interaction')" />

      <nav class="bottom-nav" :inert="showStoryGuide || Boolean(registrationLoginId)"><button :class="{ active: tab === 'character' }" :disabled="criticalPending" @click="tab = 'character'"><img :src="ANIME_NAV_ART.character" alt="" /><span>角色</span></button><button :class="{ active: tab === 'inventory' }" :disabled="criticalPending" @click="tab = 'inventory'"><img :src="ANIME_NAV_ART.inventory" alt="" /><span>背包</span></button><button class="explore-nav" :class="{ active: tab === 'explore' }" :disabled="criticalPending" @click="tab = 'explore'"><img :src="ANIME_NAV_ART.explore" alt="" /><span>探索</span></button><button :class="{ active: tab === 'social' }" :disabled="criticalPending" @click="tab = 'social'"><img :src="ANIME_NAV_ART.social" alt="" /><span>社交</span></button><button :class="{ active: tab === 'world' }" :disabled="criticalPending" @click="tab = 'world'"><img :src="ANIME_NAV_ART.world" alt="" /><span>世界</span></button></nav>
    </template>
  </div>
</template>
