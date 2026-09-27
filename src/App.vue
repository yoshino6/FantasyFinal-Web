<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as api from './api';
import type { AutoBattleConfig, AutoBattleSkillChoice, ChatChannel, ChatMessage, Panel, Recruitment, PartyApplication, SocialSummary, CommandActionResult, CommandCatalogItem, PanelInventoryStack, PanelInventoryInstance, PanelEquippedItem } from './api';
import CommandCatalog from './components/CommandCatalog.vue';
import WorldMapPanel, { type ExploreMapPoint, type MapBounds, type MapPointAction, type MapPosition } from './components/WorldMapPanel.vue';
import RegionMapSidebar, { type RegionTravelRequest } from './components/RegionMapSidebar.vue';
import TurnBattlePanel, { type BattleAction, type BattleState } from './components/TurnBattlePanel.vue';
import NegotiationPanel from './components/NegotiationPanel.vue';
import InventoryItemIcon from './components/InventoryItemIcon.vue';
import CharacterPortrait from './components/CharacterPortrait.vue';

type Tab = 'character' | 'inventory' | 'explore' | 'social';
type CharacterSection = 'profile' | 'equipment' | 'skills' | 'evolution';
type StoryGuide = { text: string; buttons: { label: string; command: string }[] };
const tab = ref<Tab>('explore');
const characterSection = ref<CharacterSection>('profile');
const panel = ref<Panel | null>(null);
const negotiation = ref<api.NegotiationPanel | null>(null);
const storyGuide = ref<StoryGuide | null>(null);
const busy = ref(false);
const notice = ref('');
const error = ref('');
const loginMode = ref<'login' | 'register'>('login');
const gameId = ref('');
const password = ref('');
const showPassword = ref(false);
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
const recruitmentDraft = ref('寻找同区域冒险者，一起探索。');
const applications = ref<PartyApplication[]>([]);
const managedRecruitmentId = ref<number | null>(null);
const catalog = ref<CommandCatalogItem[]>([]);
const catalogOpen = ref(false);
const catalogLoaded = ref(false);
type RegionMapSidebarHandle = { openSidebar: () => void; closeSidebar: () => void };
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
let miningCountdownTimer: number | undefined;
let feedbackToastTimer: number | undefined;
let authGeneration = 0;
const CHAT_PAGE_SIZE = 20;
let loadedMessagesChannelId: string | null = null;
let chatOldestMessageId: number | null = null;
let chatNewestMessageId: number | null = null;
const miningRemaining = ref(0);
let miningAutoSettling = false;
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
const floatingSocialPanelOffset = ref({ x: 0, y: 0 });
const teamPanelOffset = ref({ x: 0, y: 0 });
const floatingSocialHeight = ref(560);
let floatingDragState: { pointerId: number; startX: number; startY: number; originX: number; originY: number; originLeft: number; originTop: number; width: number; height: number; moved: boolean; captured: boolean } | null = null;
let modalDragState: { kind: 'social' | 'team'; pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean; captured: boolean } | null = null;
let socialResizeState: { pointerId: number; startY: number; originHeight: number; originOffsetY: number; minHeight: number; maxHeight: number; captured: boolean } | null = null;
let suppressFloatingClick = false;
let suppressFloatingClickTimer: number | undefined;

const currentPartyChannel = computed(() => channels.value.find(item => item.type === 'party'));
const currentPartyMembers = computed(() => panel.value?.mapData?.partyMembers ?? []);
const isInParty = computed(() => Boolean(currentPartyChannel.value));
const friendChannels = computed(() => channels.value.filter(item => item.type === 'friend'));

const floatingDockStyle = computed(() => ({
  '--float-x': `${floatingDockOffset.value.x}px`,
  '--float-y': `${floatingDockOffset.value.y}px`
} as Record<string, string>));

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
  const minLeft = 8;
  const minTop = 8;
  const maxLeft = Math.max(minLeft, window.innerWidth - state.width - 8);
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
  const channelType = panelName === 'party' ? 'party' : 'friend';
  const channel = channels.value.find(item => item.type === channelType);
  if (channel) selectChannel(channel.id);
  else messages.value = [];
};
const openFloatingSocial = (panelName: FloatingSocialPanel) => {
  floatingSocialOpen.value = panelName;
  if (panelName === 'party') floatingDockExpanded.value = true;
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
  if (!isInParty.value) {
    notice.value = '你不在队伍中';
    return;
  }
  if (teamPopupOpen.value) {
    teamPopupOpen.value = false;
    return;
  }
  floatingSocialOpen.value = null;
  teamPopupOpen.value = true;
  void loadSocial();
  void loadPanel();
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
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - rect.width - 8));
  const top = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - rect.height - 8));
  if (left !== rect.left || top !== rect.top) floatingDockOffset.value = { x: left - baseLeft, y: top - baseTop };
};
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
const title = computed(() => ({ character: '角色档案', inventory: '我的背包', explore: '探索世界', social: '社交' }[tab.value]));
const pageEyebrow = computed(() => ({ character: 'ADVENTURER', inventory: 'INVENTORY', explore: 'EXPLORATION', social: 'SOCIAL' }[tab.value]));
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
const showStoryGuide = computed(() => Boolean(storyGuide.value && panel.value?.account?.hasCharacter === false));
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
const mapPoints = computed<ExploreMapPoint[]>(() => {
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
      // 先抵达怪物所在格。到达后由同一张地图重新显示“攻击 / 交涉 / 前往”。
      actions.push(
        { id: 'approach', label: '前往', command: `/前往目标 ${point.code}`, tone: 'primary' },
        // 目标仍在感知范围内时可以直接攻击；服务端会先把角色推进到目标格，
        // 再建立战斗，网页不再要求玩家先点一次“前往”。
        { id: 'attack', label: '攻击', tone: 'danger' },
      );
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
    if (!atCurrent) actions.push({ id: 'move', label: '前往', position: { x: point.x, y: point.y, z }, tone: 'primary' });
    if (point.type === '资源' || point.type === '矿脉' || point.type === '植被') {
      // Nearby resource `code` is the item code (for display); the mine command
      // requires the concrete resource spawn id carried by interaction.id.
      const resourceId = Number(point.interaction?.id ?? point.code);
      if (Number.isSafeInteger(resourceId) && resourceId > 0 && atCurrent) {
        actions.push({ id: 'gather', label: '采集', resourceId, tone: 'primary' });
      }
    } else if (point.type === '地下入口' && point.code) {
      if (atCurrent) actions.push({ id: 'enter', label: '进入迷宫', command: `/下迷宫 ${point.code}`, tone: 'primary' });
    } else if (point.interaction) {
      if (atCurrent) actions.push({ id: 'interact', label: point.type === '建筑' ? '查看入口' : '互动', command: `/坐标互动 ${point.interaction.type} ${point.interaction.id}`, tone: 'primary' });
      if (atCurrent && point.type === '建筑' && point.code) actions.push({ id: 'enter', label: '进入', command: `/建筑进入 ${point.code}`, tone: 'soft' });
    }
  }
  return {
    id: `${point.type}:${point.code ?? point.name}:${point.x}:${point.y}:${point.z ?? mapCurrent.value.z}`,
    name: point.name,
    type: point.type,
    icon,
    x: point.x,
    y: point.y,
    z,
    distance: point.distance,
    discovered: point.observedOnly !== true,
    interactable: actions.length > 0,
    description: point.observedOnly ? '这个目标还在感知边缘，暂时只能观察。' : `位于 ${point.x}, ${point.y}，距离 ${point.distance} 格。`,
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
  const landmarks = source?.landmarks ?? (map?.landmarks ?? []).map(landmark => ({ id: landmark.code, name: landmark.name, x: landmark.x, y: landmark.y, z: landmark.z, regionCode: landmark.regionCode, regionName: landmark.regionName, type: landmark.type }));
  const regions = source?.regions ?? (map?.maps ?? []).map(item => ({ code: item.code, name: item.name, danger: item.danger, isCurrent: item.isCurrent, current: item.isCurrent && current ? { x: current.x, y: current.y, z: current.z } : undefined }));
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
  const allies = (source.members ?? []).map(member => ({
    id: String(member.id), name: member.name, role: member.companion ? '伙伴' : '冒险者', hp: { current: Number(member.hp), max: Number(member.hpMax) }, mp: { current: Number(member.mp ?? 0), max: Number(member.mpMax ?? 0) }, defeated: Boolean(member.defeated), active: !member.pending && !member.defeated, status: member.statusText ? [member.statusText] : []
  }));
  const enemies = (source.targets ?? []).map(target => ({
    id: String(target.id), name: target.name, level: target.level ?? undefined, role: '敌对目标', hp: { current: Number.isFinite(Number(target.hp)) ? Number(target.hp) : 1, max: Number.isFinite(Number(target.hpMax)) ? Number(target.hpMax) : 1 }, mp: { current: Number.isFinite(Number(target.mp)) ? Number(target.mp) : 0, max: Number.isFinite(Number(target.mpMax)) ? Number(target.mpMax) : 0 }, defeated: Boolean(target.defeated), active: Number(source.selectedTargetId ?? 0) === Number(target.id), status: target.statusText ? [target.statusText] : []
  }));
  const actions: BattleAction[] = [
    { id: 'attack', label: '普通攻击', icon: '⚔', targeting: 'enemy', description: '对选定目标造成普通攻击伤害' },
    { id: 'defend', label: '防御', icon: '◇', targeting: 'none', description: '进入防御状态' },
    { id: 'escape', label: '撤离', icon: '↗', targeting: 'none', description: '尝试离开战斗' }
  ];
  for (const slot of source.readySkillSlots ?? source.skillSlots ?? []) actions.push({ id: `skill:${slot}`, label: `技能 ${slot}`, icon: '✧', targeting: 'enemy', description: '使用快捷技能' });
  for (const item of source.itemSlots ?? []) actions.push({ id: `item:${item}`, label: `道具 ${item}`, icon: '✚', targeting: 'enemy', description: '使用战斗道具' });
  return { title: source.mode === 'pvp' ? '玩家对战' : '野外遭遇战', round: Number(source.turn ?? 1), phase: source.canAct === false ? 'enemy' : 'player', turnLabel: source.canAct === false ? '等待敌方行动' : '轮到你行动', statusText: '选中技能后，再点击目标。', allies, enemies, actions };
});

const setError = (value: unknown) => {
  error.value = value instanceof Error ? value.message : String(value);
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
  try {
    const nextPanel = await api.panel();
    if (isCurrentAuthRequest(request)) panel.value = nextPanel;
  }
  catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
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
    const list = await api.recruitments();
    if (!isCurrentAuthRequest(request)) return;
    recruitments.value = list.recruitments;
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
const loadRegistrationGuide = async () => {
  const request = currentAuthRequest();
  if (!request.token) return;
  try {
    const result = await api.command('/注册');
    if (!isCurrentAuthRequest(request)) return;
    storyGuide.value = { text: result.text ?? '欢迎来到猫拉瑞亚。', buttons: result.buttons ?? [] };
    await loadPanel();
  } catch (e) {
    if (isCurrentAuthRequest(request)) setError(e);
  }
};
const submitAuth = async () => {
  busy.value = true; error.value = '';
  try {
    const result = loginMode.value === 'login'
      ? await api.login(gameId.value, password.value)
      : await api.register(displayName.value);
    api.saveToken(result.accessToken);
    loggedIn.value = true;
    authGeneration += 1;
    notice.value = loginMode.value === 'login' ? '欢迎回来，正在打开冒险地图。' : '账号已创建，接下来可在 QQ 端完成角色登记。';
    if (loginMode.value === 'register') await loadRegistrationGuide();
    else await loadPanel();
    await loadSocial();
    await connectRealtime();
  } catch (e) { setError(e); } finally { busy.value = false; }
};
const runCommand = async (command: string, options: { silent?: boolean } = {}) => {
  const request = currentAuthRequest();
  if (!request.token) return;
  busy.value = true; error.value = '';
  try {
    const result = await api.command(command);
    if (!isCurrentAuthRequest(request)) return;
    if (!options.silent) {
      storyGuide.value = result.text ? { text: result.text, buttons: result.buttons ?? [] } : storyGuide.value;
      notice.value = result.text ?? '操作完成。';
    }
    await loadPanel();
  } catch (e) { if (isCurrentAuthRequest(request)) setError(e); }
  finally { busy.value = false; }
};
const openCommandCatalog = async () => {
  catalogOpen.value = !catalogOpen.value;
  if (catalogOpen.value) await loadCatalog();
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
    notice.value = result.text || `已移动到 ${position.x}, ${position.y}。`;
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
  if (action.commands?.length) {
    void runCommands(action.commands);
    return;
  }
  if (action.command) void runCommand(action.command);
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
const runCommands = async (commands: string[]) => {
  for (const command of commands) {
    if (!api.token()) break;
    await runCommand(command);
    if (error.value || !api.token()) break;
  }
};
const runBattleAction = async (payload: { action: BattleAction; targetId?: string }) => {
  // 战斗已经由 H5 的 /battle/start 建立；选中敌方时只能切换本回合目标，
  // 不能再次调用 QQ 的“目标”入口（该入口会尝试创建新战斗并可能启动自动战斗）。
  if (payload.targetId) await runCommand(`/切换目标 ${payload.targetId}`);
  const id = payload.action.id;
  const command = id === 'attack' ? '/战斗 攻击' : id === 'defend' ? '/战斗 防御' : id === 'escape' ? '/战斗 逃跑' : id.startsWith('skill:') ? `/战斗 ${id.slice(6)}` : id.startsWith('item:') ? `/战斗 道具 ${id.slice(5)}` : '/战斗';
  await runCommand(command);
};
const sendChat = async () => {
  const content = messageDraft.value.trim();
  if (!content || !activeChannel.value) return;
  busy.value = true;
  try { await api.sendMessage(activeChannel.value, content); messageDraft.value = ''; await loadMessages({ forceLatest: true }); } catch (e) { setError(e); } finally { busy.value = false; }
};
const createPartyRecruitment = async () => {
  busy.value = true;
  try { await api.createRecruitment(recruitmentDraft.value.trim()); notice.value = '队伍招募已发布。'; await loadSocial(); } catch (e) { setError(e); } finally { busy.value = false; }
};
const applyParty = async (item: Recruitment) => {
  busy.value = true;
  try { await api.applyRecruitment(item.id); notice.value = '已提交入队申请，请等待队长处理。'; await loadSocial(); } catch (e) { setError(e); } finally { busy.value = false; }
};
const viewApplications = async (item: Recruitment) => {
  busy.value = true;
  try { managedRecruitmentId.value = item.id; applications.value = (await api.partyApplications(item.id)).applications; } catch (e) { setError(e); } finally { busy.value = false; }
};
const respondApplication = async (application: PartyApplication, accept: boolean) => {
  busy.value = true;
  try { if (accept) await api.acceptApplication(application.id); else await api.rejectApplication(application.id); notice.value = accept ? `已同意 ${application.name} 加入队伍。` : `已拒绝 ${application.name} 的申请。`; if (managedRecruitmentId.value) applications.value = (await api.partyApplications(managedRecruitmentId.value)).applications; await loadSocial(); } catch (e) { setError(e); } finally { busy.value = false; }
};
const socialAction = async (command: string) => {
  await runCommand(command);
  if (!error.value) await loadSocial();
};
const addSocialFriend = async () => {
  const gameId = Number(socialGameId.value.trim());
  if (!Number.isSafeInteger(gameId) || gameId <= 0) { setError('请输入有效的 Game ID。'); return; }
  socialGameId.value = '';
  await socialAction(`/加好友 ${gameId}`);
};
const logout = () => {
  const hadToken = Boolean(api.token());
  authGeneration += 1;
  realtime.value?.close();
  realtime.value = null;
  if (hadToken) void api.logout().catch(() => undefined);
  api.clearToken();
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
  managedRecruitmentId.value = null;
  catalog.value = [];
  catalogLoaded.value = false;
  catalogOpen.value = false;
  autoBattleOpen.value = false;
  autoBattleSettings.value = null;
  floatingSocialOpen.value = null;
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
  catalog.value = [];
  catalogLoaded.value = false;
  catalogOpen.value = false;
  autoBattleOpen.value = false;
  autoBattleSettings.value = null;
  floatingSocialOpen.value = null;
  floatingDockExpanded.value = false;
  pendingInteractions.value = [];
  selectedInventoryItem.value = null;
  error.value = '登录已失效，请重新登录。';
};
const usePanelButton = (command: string) => void runCommand(command);
const togglePasswordVisibility = () => { showPassword.value = !showPassword.value; };
const selectCharacterSection = (section: CharacterSection) => {
  characterSection.value = section;
  if (section === 'equipment') void runCommand('/装备', { silent: true });
  if (section === 'skills') void runCommand('/技能', { silent: true });
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
const inspectCharacterSkill = (skill: CharacterSkillEntry) => {
  if (skill.id) void runCommand(`/技能详情 ${skill.id}`);
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
  const z = request.z ?? mapCurrent.value.z ?? 0;
  const auth = currentAuthRequest();
  if (!auth.token) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await api.exploreTravel({ x: request.x, y: request.y, z });
    if (!isCurrentAuthRequest(auth)) return;
    if (result.panel) panel.value = result.panel;
    else await loadPanel();
    notice.value = result.text || `已安排前往${request.targetName}。`;
  } catch (e) { if (isCurrentAuthRequest(auth)) setError(e); }
  finally { busy.value = false; }
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

onMounted(async () => {
  window.addEventListener('fantasy-final-auth-invalidated', handleAuthInvalidated);
  if (loggedIn.value && api.token()) {
    authGeneration += 1;
    await loadPanel();
    if (panel.value?.account?.hasCharacter === false) await loadRegistrationGuide();
    await loadSocial();
    await connectRealtime();
  }
  window.addEventListener('resize', constrainFloatingDock);
  refreshTimer = window.setInterval(() => { void loadPanel(); if (tab.value === 'social' || floatingSocialOpen.value) { void loadMessages(); void loadSocial(); } }, 8000);
  miningCountdownTimer = window.setInterval(() => {
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
  if (refreshTimer) window.clearInterval(refreshTimer);
  if (miningCountdownTimer) window.clearInterval(miningCountdownTimer);
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
      <img class="auth-art" src="/assets/hero/pear-adventure-hero-v2.png" alt="梨子喵在森林里追逐一只狡黠的白色球兔" />
      <div class="auth-card-column">
        <h1 class="world-title" aria-label="幻想次元"><img src="/assets/hero/fantasy-dimension-title.png" alt="幻想次元" /></h1>
        <div class="auth-card card-surface">
        <div class="auth-tabs"><button :class="{ active: loginMode === 'login' }" @click="loginMode = 'login'; showPassword = false">登录</button><button :class="{ active: loginMode === 'register' }" @click="loginMode = 'register'; showPassword = false">注册</button></div>
        <form @submit.prevent="submitAuth">
          <label v-if="loginMode === 'register'" class="sr-only">旅人昵称</label><input v-if="loginMode === 'register'" v-model="displayName" maxlength="32" aria-label="旅人昵称" placeholder="输入昵称" />
          <label v-else class="sr-only">Game ID</label><input v-if="loginMode === 'login'" v-model="gameId" inputmode="numeric" aria-label="Game ID" placeholder="Game ID" />
          <label v-if="loginMode === 'login'" class="sr-only">密码</label><div v-if="loginMode === 'login'" class="password-field"><input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" aria-label="密码" placeholder="密码" /><button type="button" class="password-toggle" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="togglePasswordVisibility">{{ showPassword ? '隐藏' : '显示' }}</button></div>
          <button class="primary-button wide" :disabled="busy">{{ busy ? '连接中…' : loginMode === 'login' ? '登录' : '注册' }}</button>
        </form>
        <p v-if="error" class="error-text">{{ error }}</p>
        </div>
      </div>
    </div>

    <template v-else>
      <header class="topbar">
        <div class="page-brand"><img src="/assets/hero/fantasy-dimension-title.png" alt="幻想次元" /><div class="page-context"><span>{{ pageEyebrow }}</span><strong>{{ title }}</strong></div></div>
        <div class="top-actions"><span class="connection-dot">在线</span><button v-if="tab === 'social' || catalogOpen" class="ghost-button" @click="openCommandCatalog">{{ catalogOpen ? '返回页面' : '全部操作' }}</button><button class="ghost-button" @click="logout">退出</button></div>
      </header>

      <div v-if="panel?.mining && tab === 'explore' && !catalogOpen" class="mining-lock-backdrop" role="presentation">
        <div class="mining-lock-dialog card-surface" role="dialog" aria-modal="true" aria-label="正在开采">
          <div class="mining-lock-icon">⛏</div>
          <p class="eyebrow">MINING IN PROGRESS</p>
          <h2>正在开采：{{ panel.mining.name }}</h2>
          <p class="muted">{{ panel.mining.kind }} · 同坐标资源采尽后会自动继续</p>
          <div class="mining-lock-stats">
            <div><span>本轮耗时</span><strong>{{ formatMiningDuration(panel.mining.seconds) }}</strong></div>
            <div><span>本轮剩余</span><strong>{{ formatMiningDuration(miningRemaining) }}</strong></div>
            <div><span>同坐标剩余次数</span><strong>{{ panel.mining.remainingVeins }}</strong></div>
            <div><span>预计基础产出</span><strong>{{ panel.mining.estimatedQuantity === null ? '按资源与天赋结算' : `×${panel.mining.estimatedQuantity}` }}</strong></div>
          </div>
          <button type="button" class="danger-button wide" :disabled="busy" @click="cancelMining">停止开采</button>
        </div>
      </div>

      <main class="page-content">
        <section v-if="catalogOpen" class="catalog-page">
          <div class="card-surface catalog-intro"><div><p class="eyebrow">ALL COMMANDS</p><h1>冒险操作目录</h1><p class="muted">所有已开放的本体指令都从这里进入。网页会自动生成参数控件，涉及消耗或变更的操作先预览再确认。</p></div><button class="soft-button" @click="openCommandCatalog">返回当前页面</button></div>
          <CommandCatalog :commands="catalog" :busy="busy" @refresh="regions => void handleCatalogRefresh(regions)" @executed="handleCatalogResult" @error="setError" />
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
            <WorldMapPanel class="explore-map" :current="mapCurrent" :bounds="mapBounds" :points="mapPoints" :move-range="mapMoveRange" :sight-range="mapSightRange" :disabled="busy || Boolean(panel?.mining)" @move="runMapMove" @action="runMapAction" @open-region-map="openRegionMapSidebar" @open-auto-battle="openAutoBattle" />
            <div v-if="showStoryGuide" class="compact-story">
              <p class="story-guide-text">{{ storyGuide?.text }}</p>
              <div class="action-grid"><button v-for="item in (storyGuide?.buttons ?? [])" :key="item.command" class="soft-button" :disabled="busy" @click="runCommand(item.command)">{{ item.label }}</button></div>
            </div>
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
            <button v-for="item in characterSections" :key="item.id" type="button" role="tab" :aria-selected="characterSection === item.id" :class="{ active: characterSection === item.id }" @click="selectCharacterSection(item.id)">
              <span class="character-tab-icon">{{ item.icon }}</span><span>{{ item.label }}</span>
            </button>
          </div>

          <div v-if="characterSection === 'profile'" class="character-panel-grid">
            <div class="profile-card character-profile-card card-surface">
              <CharacterPortrait class="character-profile-portrait" :portrait="characterData.portrait" :equipment="characterData.equipment" alt="当前角色立绘" />
              <div class="character-profile-info"><p class="eyebrow">ADVENTURER</p><h1>{{ panel?.summary?.name ?? '待登记旅人' }}</h1><p class="muted">{{ panel?.summary?.profession ?? '尚未选择职业' }} · Lv.{{ panel?.summary?.level ?? 1 }}</p><div class="character-identity"><div><span>Game ID</span><strong>{{ panel?.account?.uid ?? '未生成' }}</strong></div><div><span>性别</span><strong>{{ panel?.summary?.gender ?? '未设定' }}</strong></div><div><span>经验</span><strong>{{ panel?.summary?.experience ?? 0 }} / {{ panel?.summary?.experienceRequired ?? '—' }}</strong></div><div><span>天赋</span><strong>{{ panel?.summary?.giftName ?? '无' }}</strong></div><div><span>所在区域</span><strong>{{ panel?.summary?.region ?? '未进入地图' }}</strong></div><div><span>当前坐标</span><strong>{{ panel?.summary?.position ? `(${panel.summary.position.x}, ${panel.summary.position.y}, ${panel.summary.position.z})` : '—' }}</strong></div><div class="character-identity-buffs"><span>增益效果</span><strong>{{ panel?.summary?.activeBuffs?.length ? panel.summary.activeBuffs.join('、') : '暂无' }}</strong></div></div><div class="character-resource-list"><div><span>生命</span><strong>{{ panel?.summary?.hp.current ?? 0 }} / {{ panel?.summary?.hp.max ?? 0 }}</strong><i><b :style="{ width: `${hpPercent}%` }" /></i></div><div><span>魔力</span><strong>{{ panel?.summary?.mp.current ?? 0 }} / {{ panel?.summary?.mp.max ?? 0 }}</strong><i class="mana"><b :style="{ width: `${mpPercent}%` }" /></i></div><div><span>体力</span><strong>{{ panel?.summary?.stamina.current ?? 0 }} / {{ panel?.summary?.stamina.max ?? 0 }}</strong><i class="stamina"><b :style="{ width: `${Math.min(100, Math.max(0, (panel?.summary?.stamina.current ?? 0) / Math.max(1, panel?.summary?.stamina.max ?? 1) * 100))}%` }" /></i></div></div></div>
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

          <div v-else-if="characterSection === 'skills'" class="character-subpanel card-surface">
            <div class="subpanel-intro"><div><p class="eyebrow">SKILLS</p><h2>技能面板</h2></div><span class="skill-points">技能点 {{ characterData.skillPoints }}</span></div>
            <div v-if="characterData.skills.length" class="character-skill-grid"><button v-for="skill in characterData.skills" :key="skill.id ?? skill.name" type="button" class="character-skill-card" @click="inspectCharacterSkill(skill)"><span class="skill-icon">✦</span><span><strong>{{ skill.name }}</strong><small>Lv.{{ skill.level ?? 1 }} · {{ skill.category === 'passive' ? '被动' : '主动' }}</small></span><em v-if="skill.quickSlot ?? skill.quick_slot">快捷 {{ skill.quickSlot ?? skill.quick_slot }}</em></button></div>
            <div v-else class="empty-state character-empty">还没有学会技能，完成探索与剧情后会逐步解锁。</div>
            <div class="skill-footer"><span>被动协同槽位 {{ characterData.passiveLinkLimit || '—' }}</span><button type="button" class="soft-button" @click="selectCharacterSection('profile')">返回角色</button></div>
          </div>

          <div v-else class="character-subpanel card-surface evolution-panel">
            <div class="subpanel-intro"><div><p class="eyebrow">EVOLUTION</p><h2>进化路线</h2></div><span class="muted">角色成长记录</span></div>
            <div class="evolution-core"><div class="evolution-orb">◇</div><div><strong>{{ characterData.evolution.title ?? '初始形态' }}</strong><p class="muted">{{ characterData.evolution.unlocked ? '进化研究室已开放，可继续探索变化方向。' : '完成开化剧情后开放进化功能。' }}</p></div></div>
            <div class="evolution-progress"><div><span>当前阶段</span><strong>Lv.{{ characterData.evolution.level ?? panel?.summary?.level ?? 1 }}</strong></div><div class="progress-track"><i :style="{ width: `${Math.min(100, Math.max(0, Number(characterData.evolution.progress ?? 0)))}%` }" /></div><small>{{ characterData.evolution.nextRequirement ?? (characterData.evolution.unlocked ? '继续积累进化证据' : '尚未满足开放条件') }}</small></div>
          </div>
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
          <div class="social-overview-grid">
            <article class="card-surface social-summary-card">
              <div class="section-heading"><div><p class="eyebrow">FRIENDS</p><h3>好友</h3></div><span class="social-count">{{ socialSummary.friends.length }}</span></div>
              <form class="social-add-friend" @submit.prevent="addSocialFriend"><input v-model="socialGameId" inputmode="numeric" placeholder="输入 Game ID 添加好友" /><button class="soft-button" :disabled="busy">添加</button></form>
              <div v-if="socialSummary.friends.length" class="social-friend-list"><div v-for="friend in socialSummary.friends.slice(0, 6)" :key="friend.gameId" class="social-friend-row"><span class="avatar-dot">{{ friend.name.slice(0, 1) }}</span><div><strong>{{ friend.name }}</strong><small>Game ID {{ friend.gameId }} · {{ friend.stage }} · 好感 {{ friend.affinity }}</small></div><em :class="{ oath: friend.status === 'oath' }">{{ friend.status === 'oath' ? '星誓' : '好友' }}</em><div class="social-row-actions"><button type="button" class="ghost-button" :disabled="busy" @click="socialAction(`/好友资料 ${friend.gameId}`)">资料</button><button type="button" class="ghost-button" :disabled="busy" @click="socialAction(`/玩家互动 ${friend.gameId}`)">互动</button></div></div></div>
              <div v-else class="social-empty">还没有好友，先在世界频道认识新的旅人。</div>
              <div v-if="socialSummary.friendRequests.length" class="social-request-list"><strong class="social-pending">待处理好友申请 {{ socialSummary.friendRequests.length }} 条</strong><div v-for="request in socialSummary.friendRequests.slice(0, 3)" :key="request.id" class="social-request-row"><span>{{ request.name }} · {{ request.gameId }}</span><span class="social-row-actions"><button type="button" class="soft-button" :disabled="busy" @click="socialAction(`/同意好友 ${request.id}`)">接受</button><button type="button" class="ghost-button" :disabled="busy" @click="socialAction(`/拒绝好友 ${request.id}`)">拒绝</button></span></div></div>
            </article>
            <article class="card-surface social-summary-card oath-card">
              <div class="section-heading"><div><p class="eyebrow">STAR OATH</p><h3>星誓</h3></div><span class="social-count">{{ socialSummary.oath ? '1' : '0' }}</span></div>
              <div v-if="socialSummary.oath" class="oath-status"><img class="oath-emblem" src="/assets/social/social-emblem.png" alt="星誓" /><div><strong>{{ socialSummary.oath.name }}</strong><p>{{ socialSummary.oath.stage }} · 好感 {{ socialSummary.oath.affinity }}</p><small>{{ socialSummary.oath.status === 'active' ? '星誓关系进行中' : '等待仪式推进' }}</small></div><div class="social-row-actions"><button v-if="socialSummary.oath.status === 'ceremony_pending'" type="button" class="soft-button" :disabled="busy" @click="socialAction('/星誓仪式')">仪式</button><button v-if="socialSummary.oath.status === 'active'" type="button" class="ghost-button" :disabled="busy" @click="socialAction('/星誓纪念')">纪念</button></div></div>
              <div v-else class="social-empty">尚未建立星誓关系。与好友提升好感后，可以在教堂发起星誓。</div>
              <div v-if="socialSummary.oathRequests.length" class="social-request-list"><strong class="social-pending">收到星誓申请 {{ socialSummary.oathRequests.length }} 条</strong><div v-for="request in socialSummary.oathRequests.slice(0, 3)" :key="request.id" class="social-request-row"><span>{{ request.name }} · 好感 {{ request.affinity }}</span><span class="social-row-actions"><button type="button" class="soft-button" :disabled="busy" @click="socialAction(`/接受星誓 ${request.id}`)">接受</button><button type="button" class="ghost-button" :disabled="busy" @click="socialAction(`/拒绝星誓 ${request.id}`)">拒绝</button></span></div></div>
              <div v-if="socialSummary.oathReleaseRequests.length" class="social-request-list"><strong class="social-pending">收到解除星誓申请 {{ socialSummary.oathReleaseRequests.length }} 条</strong><div v-for="request in socialSummary.oathReleaseRequests.slice(0, 3)" :key="request.id" class="social-request-row"><span>{{ request.name }} · {{ request.gameId }}</span><span class="social-row-actions"><button type="button" class="soft-button" :disabled="busy" @click="socialAction(`/同意解除星誓 ${request.id}`)">同意</button><button type="button" class="ghost-button" :disabled="busy" @click="socialAction(`/拒绝解除星誓 ${request.id}`)">拒绝</button></span></div></div>
            </article>
          </div>
        </section>
      </main>

      <div class="floating-social-layer" aria-label="社交快捷入口">
        <div ref="floatingDockRef" class="floating-social-dock" :class="{ expanded: floatingDockExpanded }" :style="floatingDockStyle" @pointerdown="startFloatingDockDrag">
          <button type="button" class="floating-social-button floating-chat-button" :class="{ active: floatingSocialOpen === 'chat' }" aria-label="打开世界频道" @click="toggleFloatingSocial('chat')">
            <span class="floating-social-icon">💬</span><span>世界</span>
          </button>
          <button type="button" class="floating-social-toggle" :aria-expanded="floatingDockExpanded" aria-label="展开或收起更多社交入口" @click.stop="toggleFloatingDock">
            <span aria-hidden="true">⌄</span>
          </button>
          <Transition name="floating-party">
            <button v-if="floatingDockExpanded" type="button" class="floating-social-button floating-party-button floating-party-reveal" :class="{ active: teamPopupOpen, disabled: !isInParty }" :aria-disabled="!isInParty" aria-label="打开队伍信息" @click="toggleTeamPopup">
              <span class="floating-social-icon">⚑</span><span>队伍</span>
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
            <div v-if="!currentPartyChannel" class="empty-state">你不在队伍中，暂时没有可用的组队频道。</div>
            <template v-else>
              <button v-if="chatHasEarlier || chatLoadingEarlier" type="button" class="chat-history-button" :disabled="chatLoadingEarlier" @click="loadEarlierMessages">{{ chatLoadingEarlier ? '读取中…' : '查看更早消息' }}</button>
              <div ref="chatMessageListRef" class="message-list" @scroll="handleChatScroll"><div v-if="!messages.length" class="empty-state">队伍频道还没有消息。</div><div v-for="message in messages" :key="message.id" class="message-row" :class="{ own: message.own }"><span class="avatar-dot">{{ message.senderName.slice(0, 1) }}</span><div><strong>{{ message.senderName }}</strong><p>{{ message.content }}</p><small>{{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</small></div></div></div>
              <button v-if="chatHasNewMessages" type="button" class="chat-latest-button" @click="jumpToLatestMessages">有新消息，跳到最新 ↓</button>
              <form class="chat-input" @submit.prevent="sendChat"><input v-model="messageDraft" maxlength="200" :placeholder="`发送到 ${currentPartyChannel.name}`" /><button class="primary-button" :disabled="busy">发送</button></form>
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
          <div v-if="currentPartyChannel" class="team-info-content">
            <div class="team-info-title"><strong>{{ currentPartyChannel.name }}</strong><span>{{ currentPartyMembers.length }} 人</span></div>
            <div v-if="currentPartyMembers.length" class="team-member-list"><div v-for="member in currentPartyMembers" :key="member.id" class="team-member-row"><span class="avatar-dot">{{ member.name.slice(0, 1) }}</span><div><strong>{{ member.name }}<em v-if="member.isLeader">队长</em></strong><small>Game ID {{ member.gameId }} · {{ member.regionName }} · ({{ member.x }}, {{ member.y }}, {{ member.z }})</small></div></div></div>
            <div v-else class="empty-state">正在读取队伍成员…</div>
          </div>
          <div v-else class="empty-state">你不在队伍中</div>
        </section>
      </div>

      <div v-if="notice || error" :key="feedbackToastKey" class="feedback-toast" role="status">
        {{ error || notice }}
      </div>

      <nav class="bottom-nav"><button :class="{ active: tab === 'character' }" @click="tab = 'character'"><img src="/assets/ui/nav-character.png" alt="" /><span>角色</span></button><button :class="{ active: tab === 'inventory' }" @click="tab = 'inventory'"><img src="/assets/ui/nav-inventory.png" alt="" /><span>背包</span></button><button class="explore-nav" :class="{ active: tab === 'explore' }" @click="tab = 'explore'"><img src="/assets/ui/nav-explore.png" alt="" /><span>探索</span></button><button :class="{ active: tab === 'social' }" @click="tab = 'social'"><img src="/assets/ui/nav-social.png" alt="" /><span>社交</span></button></nav>
    </template>
  </div>
</template>
