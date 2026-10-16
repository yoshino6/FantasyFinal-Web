<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import AnimeIcon from './AnimeIcon.vue';
import AchievementIcon from './AchievementIcon.vue';
import CodexContent from './CodexContent.vue';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import { gameAssetUrl } from '../game-assets';
import './anime-adventure.css';
import { userFacingErrorMessage } from '../api';
import { createIdempotencyKey } from '../idempotency-key';
import { normalizeItemRarity } from '../item-rarity';
import '../footprints.css';
import * as handbook from '../handbook-api';
import type {
  AchievementEntry, AchievementPage, AchievementRewards,
  HandbookSection, PursuitRecord, WarrantDetail, WarrantFilter, WarrantPage, WarrantPost,
  WarrantRewardInput, WarrantRewardItem, WarrantRewardPreview
} from '../handbook-api';

const props = defineProps<{ open: boolean; section: HandbookSection }>();
const emit = defineEmits<{ close: []; updated: [section: HandbookSection] }>();

const title = computed(() => ({ footprints: '足迹', codex: '图鉴', warrants: '通缉' })[props.section]);
const titleEnglish = computed(() => ({ footprints: 'FOOTPRINTS', codex: 'CODEX', warrants: 'WARRANTS' })[props.section]);
const loading = ref(false);
const detailLoading = ref(false);
const working = ref(false);
const error = ref('');
const detailError = ref('');
const notice = ref('');
const page = ref(1);
const achievementCategory = ref('全部');
const achievementPage = ref<AchievementPage | null>(null);
const rewards = ref<AchievementRewards | null>(null);
const storageOpen = ref(false);
const rewardsLoading = ref(false);
const rewardsError = ref('');
const storageError = ref('');
const storageNotice = ref('');
const rewardsRefreshRequired = ref(false);
const openingBoxKey = ref('');
const storageButton = ref<HTMLButtonElement | null>(null);
const storageCloseButton = ref<HTMLButtonElement | null>(null);
const handbookCloseButton = ref<HTMLButtonElement | null>(null);
const warrantTab = ref<'board' | 'posts' | 'pursuits'>('board');
const warrantFilter = ref<WarrantFilter>('全部');
const warrantPage = ref<WarrantPage | null>(null);
const postsPage = ref<{ page: number; totalPages: number; entries: WarrantPost[] } | null>(null);
const pursuitsPage = ref<{ page: number; totalPages: number; entries: PursuitRecord[] } | null>(null);
const detail = ref<AchievementEntry | WarrantDetail | null>(null);
const detailType = ref<'achievement' | 'warrant' | null>(null);
const boxQuantity = ref<Record<string, number>>({});
const boxReceipt = ref<{ key: string; quantity: number; token: string } | null>(null);
const rewardKind = ref<'copper' | 'item'>('copper');
const rewardAmount = ref(1);
const rewardItemId = ref<number | null>(null);
const rewardQuantity = ref(1);
const selectedRewardItem = ref<WarrantRewardItem | null>(null);
const rewardItemsPage = ref<{ page: number; totalPages: number; entries: WarrantRewardItem[]; total?: number } | null>(null);
const rewardItemsLoading = ref(false);
const rewardItemsError = ref('');
const rewardPreview = ref<WarrantRewardPreview | null>(null);
const previewInput = ref<WarrantRewardInput | null>(null);
let loadVersion = 0;
let detailVersion = 0;
let rewardItemsVersion = 0;
let rewardsVersion = 0;

const currentPage = computed(() => props.section === 'footprints' ? achievementPage.value
  : warrantTab.value === 'board' ? warrantPage.value : warrantTab.value === 'posts' ? postsPage.value : pursuitsPage.value);
const pageCount = computed(() => currentPage.value?.totalPages ?? 1);
const achievementCategories = computed(() => achievementPage.value?.visibleCategories ?? ['全部']);
const warrantFilters: WarrantFilter[] = ['全部', '已暴露', '近期露面', '无行踪'];

async function load() {
  if (!props.open) return;
  const version = ++loadVersion;
  loading.value = true;
  error.value = '';
  try {
    if (props.section === 'footprints') {
      const list = await handbook.achievements(achievementCategory.value, page.value);
      if (version !== loadVersion) return;
      achievementPage.value = list;
      page.value = list.page;
    } else if (warrantTab.value === 'board') {
      const list = await handbook.warrants(warrantFilter.value, page.value);
      if (version !== loadVersion) return;
      warrantPage.value = list;
      page.value = list.page;
    } else if (warrantTab.value === 'posts') {
      const list = await handbook.warrantPosts(page.value);
      if (version !== loadVersion) return;
      postsPage.value = list;
      page.value = list.page;
    } else {
      const list = await handbook.warrantPursuits(page.value);
      if (version !== loadVersion) return;
      pursuitsPage.value = list;
      page.value = list.page;
    }
  } catch (cause) {
    if (version === loadVersion) error.value = userFacingErrorMessage(cause);
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

function resetDetail() {
  ++detailVersion;
  ++rewardItemsVersion;
  detail.value = null;
  detailType.value = null;
  detailError.value = '';
  detailLoading.value = false;
  rewardPreview.value = null;
  previewInput.value = null;
  selectedRewardItem.value = null;
  rewardItemId.value = null;
  rewardItemsPage.value = null;
  rewardItemsLoading.value = false;
  rewardItemsError.value = '';
}

watch(() => [props.open, props.section] as const, ([open, section], previous) => {
  ++loadVersion;
  storageOpen.value = false;
  if (!open) { resetDetail(); return; }
  if (!previous || previous[1] !== section) {
    page.value = 1;
    achievementCategory.value = '全部';
    warrantTab.value = 'board'; warrantFilter.value = '全部';
    resetDetail();
  }
  notice.value = '';
  if (section !== 'codex') void load();
  void nextTick(() => { if (props.open && !storageOpen.value) handbookCloseButton.value?.focus(); });
}, { immediate: true });

watch([rewardKind, rewardAmount, rewardItemId, rewardQuantity], () => {
  rewardPreview.value = null;
  previewInput.value = null;
});
watch(rewardKind, kind => {
  if (kind === 'item' && detailType.value === 'warrant' && detail.value && !rewardItemsPage.value) void loadRewardItems(1);
});

async function loadRewardItems(nextPage: number) {
  const version = ++rewardItemsVersion;
  rewardItemsLoading.value = true;
  rewardItemsError.value = '';
  try {
    const result = await handbook.warrantRewardItems(nextPage);
    if (version === rewardItemsVersion) rewardItemsPage.value = result;
  } catch (cause) {
    if (version === rewardItemsVersion) rewardItemsError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === rewardItemsVersion) rewardItemsLoading.value = false;
  }
}

function selectRewardItem(item: WarrantRewardItem) {
  selectedRewardItem.value = item;
  rewardItemId.value = item.itemId;
  rewardQuantity.value = Math.min(Math.max(1, rewardQuantity.value), item.available);
}

function changePage(next: number) {
  if (loading.value || next < 1 || next > pageCount.value || next === page.value) return;
  page.value = next;
  void load();
}

function selectAchievementCategory(category: string) {
  if (achievementCategory.value === category) return;
  achievementCategory.value = category; page.value = 1; resetDetail(); void load();
}
function selectWarrantTab(tab: 'board' | 'posts' | 'pursuits') {
  if (warrantTab.value === tab) return;
  warrantTab.value = tab; page.value = 1; resetDetail(); void load();
}
function selectWarrantFilter(filter: WarrantFilter) {
  if (warrantFilter.value === filter) return;
  warrantFilter.value = filter; page.value = 1; resetDetail(); void load();
}

async function showDetail(type: 'achievement' | 'warrant', id: string | number) {
  const version = ++detailVersion;
  detail.value = null;
  detailType.value = type;
  detailLoading.value = true;
  detailError.value = '';
  notice.value = '';
  rewardPreview.value = null;
  previewInput.value = null;
  try {
    const result = type === 'achievement' ? await handbook.achievementDetail(String(id))
      : await handbook.warrantDetail(Number(id));
    if (version === detailVersion) {
      detail.value = result;
      if (type === 'warrant' && rewardKind.value === 'item' &&
        (result as WarrantDetail).actions.some(action => action.id === 'add_reward')) void loadRewardItems(1);
    }
  } catch (cause) {
    if (version === detailVersion) detailError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}

function quantityForBox(key: string, available: number) {
  const value = Number(boxQuantity.value[key] ?? 1);
  return Number.isSafeInteger(available) && available > 0 && Number.isInteger(value) && value >= 1 && value <= Math.min(100, available) ? value : null;
}

async function loadRewards() {
  const version = ++rewardsVersion;
  rewardsLoading.value = true;
  rewardsError.value = '';
  try {
    const stock = await handbook.achievementRewards();
    if (version !== rewardsVersion) return;
    rewards.value = stock;
    for (const action of stock.actions) {
      if (boxQuantity.value[action.boxKey] === undefined) boxQuantity.value[action.boxKey] = 1;
    }
    rewardsRefreshRequired.value = false;
  } catch (cause) {
    if (version === rewardsVersion) {
      rewardsError.value = userFacingErrorMessage(cause);
      rewardsRefreshRequired.value = true;
    }
  } finally {
    if (version === rewardsVersion) rewardsLoading.value = false;
  }
}

async function openStorage() {
  storageOpen.value = true;
  storageError.value = '';
  if (!working.value) void loadRewards();
  await nextTick();
  storageCloseButton.value?.focus();
}

async function closeStorage() {
  storageOpen.value = false;
  await nextTick();
  storageButton.value?.focus();
}

function trapDialogFocus(event: KeyboardEvent) {
  const controls = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'))
    .filter(control => control.getClientRects().length > 0 && !control.closest('[inert]'));
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (!controls.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

async function openBox(key: string, available: number) {
  const quantity = quantityForBox(key, available);
  if (!quantity || working.value || rewardsLoading.value || rewardsRefreshRequired.value) return;
  working.value = true;
  openingBoxKey.value = key;
  storageError.value = '';
  storageNotice.value = '';
  try {
    if (!boxReceipt.value || boxReceipt.value.key !== key || boxReceipt.value.quantity !== quantity) {
      boxReceipt.value = { key, quantity, token: createIdempotencyKey() };
    }
    const result = await handbook.openAchievementBox(key, boxReceipt.value.token, quantity);
    storageNotice.value = `已开启${result.boxName} ×${result.quantity}，获得：${result.items.map(item => `${item.name} ×${item.quantity}`).join('、')}`;
    boxReceipt.value = null;
    boxQuantity.value[key] = 1;
    rewardsRefreshRequired.value = true;
    emit('updated', 'footprints');
    await loadRewards();
  } catch (cause) {
    storageError.value = `${userFacingErrorMessage(cause)} 可使用相同数量重试。`;
  } finally { working.value = false; openingBoxKey.value = ''; }
}

function makeRewardInput(): WarrantRewardInput {
  if (rewardKind.value === 'copper') {
    if (!Number.isSafeInteger(rewardAmount.value) || rewardAmount.value < 1) throw new Error('请输入正整数铜币数量。');
    return { kind: 'copper', amount: rewardAmount.value };
  }
  if (!selectedRewardItem.value || rewardItemId.value !== selectedRewardItem.value.itemId) throw new Error('请先选择可上赏物品。');
  if (!Number.isSafeInteger(rewardQuantity.value) || rewardQuantity.value < 1 ||
    rewardQuantity.value > selectedRewardItem.value.available) throw new Error('上赏数量须在可用数量内。');
  return { kind: 'item', itemId: Number(rewardItemId.value), quantity: rewardQuantity.value };
}

async function previewReward() {
  if (detailType.value !== 'warrant' || !detail.value || working.value) return;
  let input: WarrantRewardInput;
  try { input = makeRewardInput(); } catch (cause) { detailError.value = userFacingErrorMessage(cause); return; }
  const id = (detail.value as WarrantDetail).id;
  working.value = true; detailError.value = ''; rewardPreview.value = null; previewInput.value = null;
  try {
    rewardPreview.value = await handbook.previewWarrantReward(id, input);
    previewInput.value = input;
  } catch (cause) { detailError.value = userFacingErrorMessage(cause); }
  finally { working.value = false; }
}

async function submitReward() {
  if (detailType.value !== 'warrant' || !detail.value || !rewardPreview.value?.canSubmit || !previewInput.value || working.value) return;
  const id = (detail.value as WarrantDetail).id;
  working.value = true; detailError.value = '';
  try {
    await handbook.addWarrantReward(id, previewInput.value);
    rewardPreview.value = null; previewInput.value = null;
    selectedRewardItem.value = null; rewardItemId.value = null; rewardQuantity.value = 1;
    emit('updated', 'warrants');
    await Promise.all([showDetail('warrant', id), load()]);
    notice.value = '赏金已追加，可在「我的上赏」查看记录。';
  } catch (cause) {
    detailError.value = `${userFacingErrorMessage(cause)} 若网络中断，请先查看「我的上赏」再决定是否重试。`;
    rewardPreview.value = null; previewInput.value = null;
  } finally { working.value = false; }
}

function positionText(position: WarrantDetail['position']) {
  return position ? `（${position.x}, ${position.y}, ${position.z}）` : '行踪未明';
}
function traceText(trace: WarrantDetail['trace']) {
  return ({ exposed: '已暴露', recent: '近期露面', unknown: '无行踪' })[trace];
}
function dateText(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '尚未领取';
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="handbook-backdrop" role="presentation" @click.self="emit('close')">
      <section class="handbook-dialog anime-adventure exploration-window" :class="`handbook-${section}`" :data-window-theme="section" role="dialog" :aria-modal="!storageOpen" :aria-hidden="storageOpen || undefined" :inert="storageOpen" :aria-label="`冒险手册${title}`" @keydown.esc="emit('close')" @keydown.tab="trapDialogFocus">
        <button ref="handbookCloseButton" class="icon-button exploration-window-close" type="button" :aria-label="`关闭${title}`" @click="emit('close')"><span class="exploration-close-mark" aria-hidden="true" /></button>
        <header class="handbook-header exploration-window-heading">
          <div class="heading-mark" aria-hidden="true"><AnimeIcon :name="section === 'footprints' ? 'paw' : section === 'codex' ? 'book' : 'sword'" :size="40" /></div>
          <div class="heading-copy"><small class="exploration-window-kicker">{{ titleEnglish }}</small><h2>{{ title }}</h2></div>
        </header>

        <template v-if="section === 'footprints'">
          <nav class="chip-row footprints-categories" aria-label="足迹分类">
            <button v-for="category in achievementCategories" :key="category" type="button" :class="{ selected: achievementCategory === category }" :aria-pressed="achievementCategory === category" :disabled="loading" @click="selectAchievementCategory(category)">{{ category }}</button>
          </nav>
          <div class="footprints-summary"><span>旅途成就</span><span>{{ achievementPage ? `已完成 ${achievementPage.total} 项` : '只记录已经达成的成就' }}</span></div>
          <div class="handbook-body footprints-scroll" role="region" aria-label="足迹内容" tabindex="0" :aria-busy="loading || detailLoading">
            <template v-if="!detailType">
              <div v-if="error" class="footprints-state" role="alert"><p>{{ error }}</p><button type="button" @click="load">重新加载</button></div>
              <p v-else-if="loading" class="footprints-state game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在翻阅足迹…</span></p>
              <div v-else-if="achievementPage?.entries.length" class="footprints-list">
                <button v-for="entry in achievementPage.entries" :key="entry.id" class="footprints-achievement" :data-achievement-id="entry.id" :data-rarity="normalizeItemRarity(entry.rarity)" type="button" @click="showDetail('achievement', entry.id)">
                  <span class="footprints-emblem"><AchievementIcon :entry="entry" /></span>
                  <span class="footprints-entry-copy"><span class="footprints-entry-title"><strong class="achievement-name">{{ entry.name }}</strong><small>{{ entry.rarity }}</small></span><span class="footprints-description">{{ entry.description }}</span><small class="footprints-completed-at">{{ entry.category }}<span aria-hidden="true"> · </span>{{ entry.completedAt }}</small></span>
                  <span class="footprints-completion"><strong>已达成</strong><span>全服 {{ entry.percentage }}</span><small>第 {{ entry.rank }} 位达成</small></span>
                </button>
              </div>
              <div v-else class="footprints-state game-ui-empty-message"><GameUiFeedbackArt name="empty" :size="36" /><span>还没有留下这一类足迹，继续冒险吧。</span></div>
            </template>
            <template v-else>
              <button class="back-button" type="button" @click="resetDetail"><AnimeIcon name="arrow" :size="18" />返回列表</button>
              <p v-if="detailLoading" class="footprints-state game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在查看详情…</span></p>
              <div v-else-if="detailError" class="footprints-state" role="alert"><p>{{ detailError }}</p><button type="button" @click="resetDetail">返回列表重试</button></div>
              <article v-else-if="detail" class="detail-card footprints-detail" :data-rarity="normalizeItemRarity((detail as AchievementEntry).rarity)">
                <div class="footprints-detail-heading"><span class="footprints-emblem"><AchievementIcon :entry="detail as AchievementEntry" /></span><div><p class="eyebrow">{{ (detail as AchievementEntry).category }} · {{ (detail as AchievementEntry).rarity }}</p><h3 class="achievement-name">{{ (detail as AchievementEntry).name }}</h3></div></div>
                <p>{{ (detail as AchievementEntry).description }}</p>
                <div class="detail-grid"><span>达成时间 <strong>{{ (detail as AchievementEntry).completedAt }}</strong></span><span>奖励 <strong>{{ (detail as AchievementEntry).attribute }}</strong></span><span>达成顺序 <strong>第 {{ (detail as AchievementEntry).rank }} 位</strong></span><span>全服完成率 <strong>{{ (detail as AchievementEntry).percentage }}</strong></span></div>
              </article>
            </template>
          </div>
          <footer class="footprints-footer">
            <nav v-if="!detailType && achievementPage && pageCount > 1" class="pager footprints-pager" aria-label="足迹翻页"><button type="button" :disabled="loading || !!error || page <= 1" @click="changePage(page - 1)">上一页</button><span>{{ page }} / {{ pageCount }}</span><button type="button" :disabled="loading || !!error || page >= pageCount" @click="changePage(page + 1)">下一页</button></nav>
            <button ref="storageButton" class="footprints-storage-button" type="button" aria-label="打开储物箱" @click="openStorage"><img :src="gameAssetUrl('/assets/items/chest.png')" alt="" />储物箱</button>
          </footer>
        </template>

        <CodexContent v-else-if="section === 'codex'" @close="emit('close')" />
        <div v-else class="handbook-body" role="region" :aria-label="`${title}内容`" tabindex="0">
          <p v-if="notice" class="notice" role="status">{{ notice }}</p>
          <p v-if="error" class="error" role="alert">{{ error }}</p>

          <template v-if="!detailType">
              <div class="chip-row handbook-primary-tabs" aria-label="通缉记录"><button type="button" :class="{ selected: warrantTab === 'board' }" @click="selectWarrantTab('board')">通缉榜</button><button type="button" :class="{ selected: warrantTab === 'posts' }" @click="selectWarrantTab('posts')">我的上赏</button><button type="button" :class="{ selected: warrantTab === 'pursuits' }" @click="selectWarrantTab('pursuits')">追缉记录</button></div>
              <template v-if="warrantTab === 'board'">
                <p class="intro">{{ warrantPage?.regionName ?? '当前地区' }}的生效通缉令。坐标仅在行踪明确时显示。</p>
                <div class="chip-row subchips" aria-label="行踪筛选"><button v-for="filter in warrantFilters" :key="filter" type="button" :class="{ selected: warrantFilter === filter }" :disabled="loading" @click="selectWarrantFilter(filter)">{{ filter }}</button></div>
                <div v-if="!loading && warrantPage?.entries.length" class="entry-list">
                  <button v-for="entry in warrantPage.entries" :key="entry.id" class="entry-card" type="button" @click="showDetail('warrant', entry.id)">
                    <span class="entry-icon warrant-icon"><AnimeIcon name="party" :size="44" /><b>{{ entry.name.slice(0, 1) }}</b></span><span class="entry-main"><strong>{{ entry.name }}</strong><small>{{ entry.regionName }}</small><span class="warrant-trace" :class="`trace-${entry.trace}`">{{ traceText(entry.trace) }}</span><small>{{ positionText(entry.position) }}</small></span><span class="warrant-reward"><small>悬赏</small><strong><AnimeIcon name="coin" :size="22" />{{ entry.rewardCopper }} 铜币</strong><span>{{ entry.rewardItems }} 件物品</span></span><span class="entry-arrow"><AnimeIcon name="arrow" :size="20" /></span>
                  </button>
                </div>
              </template>
              <div v-else-if="warrantTab === 'posts' && !loading && postsPage?.entries.length" class="entry-list warrant-ledger">
                <div class="ledger-heading"><span>通缉对象</span><span>我的赏金与状态</span></div>
                <article v-for="entry in postsPage.entries" :key="entry.id" class="entry-card static-card"><span class="entry-icon"><AnimeIcon name="party" :size="36" /></span><span class="entry-main"><strong>{{ entry.wantedName }}</strong><small>{{ entry.regionName }}</small><small>发布：{{ dateText(entry.postedAt) }}</small></span><span class="ledger-amount"><strong>{{ entry.itemName ? `${entry.itemName} ×${entry.quantity}` : `${entry.copper} 铜币` }}</strong><em>{{ entry.warrantStatus }}</em><small>{{ entry.claimedAt ? `领取：${dateText(entry.claimedAt)}（${entry.claimedBy ?? '未知'}）` : '尚未领取' }}</small></span></article>
              </div>
              <div v-else-if="warrantTab === 'pursuits' && !loading && pursuitsPage?.entries.length" class="entry-list">
                <article v-for="entry in pursuitsPage.entries" :key="entry.warrantId" class="entry-card static-card pursuit-card"><span class="entry-icon"><AnimeIcon name="sword" :size="44" /></span><span class="entry-main"><strong>{{ entry.wantedName }}</strong><small>{{ entry.regionName }}</small><span v-if="entry.capturedAt">缉获：{{ dateText(entry.capturedAt) }}</span><span v-if="entry.rewardClaimedAt">领取：{{ dateText(entry.rewardClaimedAt) }} · {{ entry.rewardCopper }} 铜币 · {{ entry.rewardItems }} 件物品</span></span><em class="pursuit-stamp">{{ entry.recordType === 'capture' ? '本人缉获' : '领取悬赏' }}</em></article>
              </div>
            <p v-if="loading" class="empty game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在翻阅{{ title }}…</span></p>
            <p v-else-if="!error && !currentPage?.entries.length" class="empty game-ui-empty-message"><GameUiFeedbackArt name="empty" :size="36" /><span>这一页还没有记录。</span></p>
            <nav v-if="!loading && !error && currentPage && pageCount > 1" class="pager" aria-label="翻页"><button type="button" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button><span>{{ page }} / {{ pageCount }}</span><button type="button" :disabled="page >= pageCount" @click="changePage(page + 1)">下一页</button></nav>
          </template>

          <template v-else>
            <button class="back-button" type="button" @click="resetDetail"><AnimeIcon name="arrow" :size="18" />返回列表</button>
            <p v-if="detailLoading" class="empty game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在查看详情…</span></p>
            <p v-if="detailError" class="error" role="alert">{{ detailError }}</p>
            <template v-if="detail && detailType === 'warrant'">
              <article class="detail-card warrant-detail-card"><span class="detail-symbol warrant-person"><AnimeIcon name="party" :size="72" /><strong>{{ (detail as WarrantDetail).name.slice(0, 1) }}</strong></span><p class="eyebrow">{{ (detail as WarrantDetail).regionName }} · {{ traceText((detail as WarrantDetail).trace) }}</p><h3>{{ (detail as WarrantDetail).name }}</h3><div class="detail-grid"><span>危险标记 <strong>{{ (detail as WarrantDetail).stars }} 星 · {{ (detail as WarrantDetail).skulls }} 骷髅</strong></span><span>最后行踪 <strong>{{ positionText((detail as WarrantDetail).position) }}</strong></span><span>铜币悬赏 <strong><AnimeIcon name="coin" :size="20" />{{ (detail as WarrantDetail).rewardCopper }}</strong></span><span>物品悬赏 <strong>{{ (detail as WarrantDetail).rewardItems }} 件</strong></span></div></article>
              <section v-if="(detail as WarrantDetail).actions.some(action => action.id === 'add_reward')" class="reward-card add-reward"><div class="section-heading"><AnimeIcon name="coin" :size="23" /><h3>追加赏金</h3></div><p class="quiet">只有被此人夺走失物的玩家可追加；提交前会核对背包余额。</p>
                <div class="chip-row"><button type="button" :class="{ selected: rewardKind === 'copper' }" @click="rewardKind = 'copper'">铜币</button><button type="button" :class="{ selected: rewardKind === 'item' }" @click="rewardKind = 'item'">物品</button></div>
                <label v-if="rewardKind === 'copper'" class="field">铜币数量<input v-model.number="rewardAmount" type="number" min="1" step="1" inputmode="numeric" /></label>
                <div v-else class="reward-item-picker">
                  <p class="picker-label">选择可上赏的未绑定物品</p>
                  <p v-if="rewardItemsLoading" class="quiet" role="status">正在查看背包…</p>
                  <p v-if="rewardItemsError" class="error" role="alert">{{ rewardItemsError }} <button type="button" @click="loadRewardItems(rewardItemsPage?.page ?? 1)">重试</button></p>
                  <div v-if="rewardItemsPage?.entries.length" class="reward-item-list" role="group" aria-label="可上赏物品">
                    <button v-for="item in rewardItemsPage.entries" :key="item.itemId" type="button" class="reward-item-choice" :class="{ selected: rewardItemId === item.itemId }" :aria-pressed="rewardItemId === item.itemId" :disabled="working" @click="selectRewardItem(item)"><strong>{{ item.name }}</strong><span>可用 {{ item.available }} 件</span></button>
                  </div>
                  <p v-else-if="!rewardItemsLoading && !rewardItemsError" class="quiet">背包中没有可上赏的未绑定物品。</p>
                  <nav v-if="rewardItemsPage && rewardItemsPage.totalPages > 1" class="pager item-pager" aria-label="可上赏物品翻页"><button type="button" :disabled="rewardItemsLoading || rewardItemsPage.page <= 1" @click="loadRewardItems(rewardItemsPage.page - 1)">上一页</button><span>{{ rewardItemsPage.page }} / {{ rewardItemsPage.totalPages }}</span><button type="button" :disabled="rewardItemsLoading || rewardItemsPage.page >= rewardItemsPage.totalPages" @click="loadRewardItems(rewardItemsPage.page + 1)">下一页</button></nav>
                  <label v-if="selectedRewardItem" class="field">{{ selectedRewardItem.name }} · 上赏数量（可用 {{ selectedRewardItem.available }} 件）<input v-model.number="rewardQuantity" type="number" min="1" :max="selectedRewardItem.available" step="1" inputmode="numeric" /></label>
                </div>
                <button class="primary-button" type="button" :disabled="working" @click="previewReward">预览上赏</button>
                <div v-if="rewardPreview" class="preview" role="status"><strong>赏金预览</strong><span>{{ rewardPreview.kind === 'copper' ? `${rewardPreview.amount} 铜币` : `${rewardPreview.itemName ?? '该物品'} ×${rewardPreview.quantity}` }}</span><span>可用：{{ rewardPreview.available }}{{ rewardPreview.kind === 'copper' ? ' 铜币' : ' 件' }}</span><p v-if="rewardPreview.reason">{{ rewardPreview.reason }}</p><div class="reward-preview-actions"><button type="button" class="back-button" @click="rewardPreview = null; previewInput = null">返回修改</button><button v-if="rewardPreview.canSubmit" class="primary-button" type="button" :disabled="working" @click="submitReward">确认追加赏金</button></div></div>
              </section>
            </template>
          </template>
        </div>
      </section>
    </div>
    <div v-if="open && section === 'footprints' && storageOpen" class="handbook-backdrop footprints-storage-backdrop" role="presentation" @click.self="closeStorage">
      <section class="footprints-storage-dialog" role="dialog" aria-modal="true" aria-label="成就储物箱" @keydown.esc.stop.prevent="closeStorage" @keydown.tab="trapDialogFocus">
        <header class="footprints-storage-heading"><img :src="gameAssetUrl('/assets/items/chest.png')" alt="" /><div><small>成就奖励</small><h3>储物箱</h3></div><button ref="storageCloseButton" type="button" class="footprints-storage-close" aria-label="关闭储物箱" @click="closeStorage"><span aria-hidden="true">×</span></button></header>
        <div class="footprints-storage-content" :aria-busy="rewardsLoading || working">
          <p v-if="storageNotice" class="notice" role="status">{{ storageNotice }}</p>
          <p v-if="storageError" class="error" role="alert">{{ storageError }}</p>
          <div v-if="rewardsError" class="footprints-storage-error" role="alert"><p>{{ rewardsRefreshRequired && rewards ? '储物箱数量刷新失败，请刷新后继续开启。' : '储物箱加载失败，请重试。' }}</p><small>{{ rewardsError }}</small><button type="button" :disabled="working || rewardsLoading" @click="loadRewards">重试</button></div>
          <p v-if="rewardsLoading" class="footprints-storage-state" role="status">正在整理储物箱…</p>
          <template v-if="rewards">
            <section class="footprints-storage-boxes" aria-label="成就道具匣"><h4>可开启的道具匣</h4>
              <div v-if="rewards.actions.length" class="footprints-box-list">
                <article v-for="action in rewards.actions" :key="action.boxKey" class="footprints-box" :data-box-key="action.boxKey">
                  <img class="footprints-box-art" :src="gameAssetUrl(action.boxKey === 'collector_box' ? '/assets/items/gift-box.png' : '/assets/items/chest.png')" alt="" />
                  <div class="footprints-box-copy"><strong>{{ action.name }}</strong><small>持有 {{ action.available }} 个</small><span v-if="Number.isSafeInteger(action.available) && action.available > 0">每次最多开启 {{ Math.min(100, action.available) }} 个</span><span v-else>可用数量异常，请刷新</span></div>
                  <div class="footprints-box-controls"><input v-model.number="boxQuantity[action.boxKey]" type="number" inputmode="numeric" min="1" step="1" :max="Math.min(100, action.available)" :disabled="working || rewardsLoading || rewardsRefreshRequired" :aria-invalid="!quantityForBox(action.boxKey, action.available)" :aria-label="`${action.name}开启数量`" /><button type="button" :disabled="working || rewardsLoading || rewardsRefreshRequired || !quantityForBox(action.boxKey, action.available)" @click="openBox(action.boxKey, action.available)">{{ openingBoxKey === action.boxKey ? '开启中…' : '开启' }}</button><small v-if="!quantityForBox(action.boxKey, action.available)" class="footprints-quantity-error">{{ Number.isSafeInteger(action.available) && action.available > 0 ? `请输入 1–${Math.min(100, action.available)} 的整数` : '请刷新可用数量' }}</small></div>
                </article>
              </div>
              <p v-else-if="!rewardsLoading && !rewardsError" class="footprints-storage-state">暂时没有可开启的道具匣，达成成就后再来看看。</p>
            </section>
            <section class="footprints-storage-items" aria-label="成就道具收藏"><h4>道具收藏</h4><p class="footprints-storage-tip">开出的道具已存入背包，使用方式可查看道具说明。</p>
              <div v-if="rewards.items.length" class="footprints-collected-items"><article v-for="item in rewards.items" :key="item.key" :data-rarity="normalizeItemRarity(item.rarity)"><strong class="achievement-name">{{ item.name }} <span>×{{ item.quantity }}</span></strong><p>{{ item.description }}</p></article></div>
              <p v-else class="footprints-storage-state">还没有收藏的成就道具。</p>
            </section>
          </template>
        </div>
        <footer class="footprints-storage-footer"><span>开启后自动存入背包</span><button type="button" :disabled="working || rewardsLoading" @click="loadRewards">刷新</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.handbook-backdrop { position: fixed; z-index: 92; inset: 0; display: grid; place-items: center; padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); background: rgba(49, 43, 65, .49); backdrop-filter: blur(5px); }
.handbook-dialog { display: flex; flex-direction: column; width: min(760px, 100%); height: min(720px, 100%); min-height: 0; overflow: hidden; color: #544b66; background: #fffaf8; border: 1px solid #fff; border-radius: 22px; box-shadow: 0 24px 76px #3c34543d; }
.handbook-header { display: flex; align-items: center; gap: 12px; padding: 17px 20px; background: linear-gradient(105deg, #faf2ff, #fff5f0 70%); border-bottom: 1px solid #eee0e9; }
.heading-mark { display: grid; place-items: center; width: 39px; height: 39px; color: #fff; background: linear-gradient(145deg, #a596d6, #db9fb6); border-radius: 13px; font-size: 22px; box-shadow: 0 4px 12px #ba9ec25c; }
.heading-copy { min-width: 0; flex: 1; }.heading-copy small { display: block; color: #9b8da9; font-size: 10px; letter-spacing: .1em; }.heading-copy h2 { margin: 2px 0 0; font-size: 20px; }
.icon-button { width: 34px; height: 34px; color: #a47592; background: #fff; border: 1px solid #efdde5; border-radius: 10px; font-size: 23px; line-height: 1; }
.handbook-body { flex: 1; min-height: 0; overflow-y: auto; padding: 17px 20px max(24px, env(safe-area-inset-bottom)); overscroll-behavior: contain; }
.intro { margin: 1px 0 16px; color: #8c8094; font-size: 12px; line-height: 1.6; }.chip-row { display: flex; gap: 7px; flex-wrap: wrap; margin: 12px 0; }.chip-row button { min-height: 34px; padding: 6px 12px; color: #83768c; background: #f2edf4; border: 1px solid transparent; border-radius: 10px; font-size: 12px; }.chip-row button.selected { color: #674a92; background: #ece3f8; border-color: #d9c9ec; font-weight: 700; }.subchips { margin-top: 5px; }.subchips button { background: #f7f3f3; }.count { margin: 12px 1px 8px; color: #9c8ba2; font-size: 11px; }
.reward-card, .detail-card { padding: 15px; background: #fff; border: 1px solid #f0e1e7; border-radius: 16px; box-shadow: 0 3px 16px #644a7810; }.reward-card { margin: 0 0 17px; }.section-heading { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; color: #9b70ae; }.section-heading h3 { margin: 0; color: #67536d; font-size: 14px; }.box-list { display: grid; gap: 9px; }.box-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px; background: #fcf9fc; border-radius: 11px; }.box-row strong, .box-row small { display: block; }.box-row strong { font-size: 12px; }.box-row small { margin-top: 3px; color: #9b8a9f; font-size: 11px; }.box-controls { display: flex; gap: 6px; flex: 0 0 auto; }.box-controls input { width: 56px; padding: 6px; text-align: center; }.box-controls button, .search-row button, .primary-button { min-height: 34px; padding: 7px 12px; color: white; background: #9277ba; border-radius: 9px; font-size: 12px; font-weight: 700; }.reward-items { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }.reward-items span { padding: 5px 8px; color: #826484; background: #fbf0f5; border-radius: 8px; font-size: 11px; }
.entry-list { display: grid; gap: 9px; margin-top: 12px; }.entry-card { display: flex; align-items: center; gap: 11px; width: 100%; padding: 13px; color: inherit; text-align: left; background: #fff; border: 1px solid #f1e5e9; border-radius: 13px; box-shadow: 0 2px 9px #6550750c; }.entry-icon { display: grid; place-items: center; flex: 0 0 37px; width: 37px; height: 37px; color: #a984b8; background: #f2eafa; border-radius: 11px; font-size: 19px; }.warrant-icon { color: #b88b84; background: #fff0ec; }.entry-main { display: grid; gap: 3px; flex: 1; min-width: 0; overflow-wrap: anywhere; }.entry-main strong { font-size: 13px; }.entry-main small { color: #a095a6; font-size: 11px; }.entry-main > span { color: #736a7a; font-size: 12px; line-height: 1.5; }.entry-arrow { color: #ad96bb; font-size: 23px; }.static-card { cursor: default; }
.search-row { display: flex; gap: 7px; margin: 12px 0; }.search-row input { flex: 1; min-width: 0; }.search-row input, .box-controls input, .field input { min-height: 35px; color: #594d62; background: white; border: 1px solid #e4d8e6; border-radius: 9px; font: inherit; font-size: 12px; }.search-row input { padding: 7px 10px; }.quiet { margin: 0; color: #9d91a1; font-size: 12px; line-height: 1.6; }.empty { padding: 34px 8px; color: #a496a5; font-size: 13px; text-align: center; }.pager { display: flex; justify-content: center; align-items: center; gap: 14px; margin: 18px 0 2px; font-size: 12px; }.pager button { min-height: 34px; padding: 7px 12px; color: #735d96; background: #eee7f7; border-radius: 9px; }
.back-button { margin-bottom: 13px; padding: 7px 10px; color: #7e67a6; background: #f0eaf7; border-radius: 9px; font-size: 12px; }.detail-card { padding: 20px; }.detail-symbol { display: grid; place-items: center; width: 46px; height: 46px; color: #a17cba; background: #f4ebfa; border-radius: 14px; font-size: 25px; }.eyebrow { margin: 15px 0 3px; color: #ac8bb8; font-size: 11px; }.detail-card h3 { margin: 0 0 12px; color: #5d4e69; font-size: 20px; }.detail-card > p:not(.eyebrow) { color: #736979; font-size: 13px; line-height: 1.7; }.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 16px; }.detail-grid span { display: grid; gap: 4px; padding: 10px; color: #97899d; background: #faf5fa; border-radius: 9px; font-size: 11px; overflow-wrap: anywhere; }.detail-grid strong { color: #604f70; font-size: 12px; }.facts { display: grid; gap: 0; margin: 12px 0 0; }.facts div { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 10px; padding: 10px 0; border-top: 1px solid #f0e9ee; font-size: 12px; }.facts dt { color: #9a8ba0; }.facts dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }.add-reward { margin-top: 14px; }.reward-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }.field { display: grid; gap: 5px; margin: 12px 0; color: #71637b; font-size: 12px; }.field input { width: 100%; padding: 7px 9px; }.preview { display: grid; gap: 5px; margin-top: 12px; padding: 12px; background: #f7f0fc; border-radius: 10px; font-size: 12px; }.preview p { margin: 0; color: #a45f6c; }.preview button { justify-self: start; margin-top: 5px; }
.notice, .error { padding: 11px 12px; border-radius: 10px; font-size: 12px; line-height: 1.5; }.notice { color: #4d7a68; background: #eaf7f0; }.error { color: #aa5265; background: #fff0ee; }
button { cursor: pointer; font: inherit; }button:disabled { opacity: .5; cursor: not-allowed; }button:focus-visible, input:focus-visible { outline: 3px solid #9e7fc4; outline-offset: 2px; }
.picker-label { margin: 12px 0 7px; color: #71637b; font-size: 12px; }
.reward-item-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.reward-item-choice { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; min-height: 52px; padding: 9px 11px; color: #655875; text-align: left; background: #fbf7fd; border: 1px solid #eee4f1; border-radius: 10px; }
.reward-item-choice.selected { color: #684d91; background: #eee6f8; border-color: #ab8ccd; }
.reward-item-choice strong { min-width: 0; overflow-wrap: anywhere; font-size: 12px; }.reward-item-choice span { flex: 0 0 auto; color: #9a8aa4; font-size: 11px; }
.item-pager { margin: 10px 0; }
@media (max-width: 600px) { .handbook-dialog { width: 100%; height: 100%; border-radius: 15px; }.handbook-header { padding: 13px 15px; }.handbook-body { padding: 14px 14px max(22px, env(safe-area-inset-bottom)); }.chip-row { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 3px; scrollbar-width: thin; }.chip-row button { flex: 0 0 auto; }.box-row { align-items: stretch; flex-direction: column; }.box-controls { justify-content: flex-end; }.detail-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 600px) { .reward-item-list { grid-template-columns: 1fr; }.reward-item-choice { min-height: 48px; } }
@media (max-width: 360px) { .detail-grid, .reward-fields { grid-template-columns: 1fr; }.facts div { grid-template-columns: 74px minmax(0, 1fr); } }
@media (max-height: 430px) {
  .handbook-dialog.handbook-codex.exploration-window[data-window-theme] > .exploration-window-heading { flex-basis: 44px; padding-block: 3px; }
  .handbook-backdrop .handbook-dialog.anime-adventure.exploration-window.handbook-codex .heading-copy h2 { font-size: 20px; line-height: 1.2; }
  .handbook-backdrop .handbook-dialog.anime-adventure.exploration-window.handbook-codex .heading-copy small { font-size: 8px; line-height: 1.2; }
}
</style>
