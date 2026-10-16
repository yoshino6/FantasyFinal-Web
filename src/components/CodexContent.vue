<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AnimeIcon from './AnimeIcon.vue';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import InventoryItemIcon from './InventoryItemIcon.vue';
import SkillIcon from './SkillIcon.vue';
import { gameAssetUrl } from '../game-assets';
import { normalizeItemRarity } from '../item-rarity';
import { userFacingErrorMessage } from '../api';
import * as handbook from '../handbook-api';
import type { CodexDetail, CodexEntry, CodexKind, CodexPage } from '../handbook-api';
import { usePagedText } from '../usePagedText';

type Filter = 'kind' | 'category' | 'rarity';
type Option = { label: string; value: string };
const emit = defineEmits<{ close: [] }>();
const kind = ref<CodexKind>('装备');
const category = ref('全部');
const rarity = ref('全部');
const keyword = ref('');
const keywordDraft = ref('');
const page = ref(1);
const pageSize = ref(1);
const data = ref<CodexPage | null>(null);
const loading = ref(true);
const error = ref('');
const picker = ref<Filter | null>(null);
const pickerPage = ref(1);
const controls = ref<HTMLElement | null>(null);
const frame = ref<HTMLElement | null>(null);
const selectedEntry = ref<CodexEntry | null>(null);
const detail = ref<CodexDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const detailText = ref<HTMLElement | null>(null);
let listVersion = 0;
let detailVersion = 0;
let observer: ResizeObserver | undefined;
let mounted = false;
let focusAfterLoad: { filter: Filter } | { row: number } | null = null;
const kinds: CodexKind[] = ['装备', '道具', '材料', '怪物', '技能'];
const categories = computed<Option[]>(() => data.value?.kind === kind.value ? data.value.categories : [{ label: '全部', value: '全部' }]);
const rarities = computed(() => data.value?.kind === kind.value ? data.value.rarities : ['全部']);
const hasRarities = computed(() => rarities.value.length > 1);
const filters = computed(() => [
  { key: 'kind' as const, name: '主分类', value: kind.value, label: kind.value, options: kinds.map(value => ({ label: value, value })), disabled: false },
  { key: 'category' as const, name: '子分类', value: category.value, label: category.value === '全部' ? '全部分类' : categories.value.find(item => item.value === category.value)?.label ?? category.value, options: categories.value, disabled: categories.value.length < 2 },
  { key: 'rarity' as const, name: '稀有度', value: rarity.value, label: !hasRarities.value ? '不分稀有度' : rarity.value === '全部' ? '全部稀有度' : rarity.value, options: rarities.value.map(value => ({ label: value, value })), disabled: !hasRarities.value }
]);
const activeFilter = computed(() => filters.value.find(item => item.key === picker.value));
const pickerPages = computed(() => Math.max(1, Math.ceil((activeFilter.value?.options.length ?? 0) / 9)));
const visibleOptions = computed(() => activeFilter.value?.options.slice((pickerPage.value - 1) * 9, pickerPage.value * 9) ?? []);
const totalPages = computed(() => data.value?.totalPages ?? 1);
const detailParagraphs = computed(() => {
  if (!detail.value) return [];
  const values = detail.value.detail;
  const labels: Record<string, string> = {
    name: '名称', category: '分类', rarity: '稀有度', type: '类型', requiredLevel: '需求等级', description: '描述', obtainSource: '获取途径',
    weight: '重量', level: '等级', inRange: '可鉴定范围', informationLevel: '鉴定等级', skills: '技能', weaknesses: '弱点', resistances: '抗性',
    skillKind: '技能类型', element: '元素', rangeType: '距离', targetScope: '目标范围', power: '威力', manaCost: '法力消耗',
    cooldownTurns: '冷却回合', chantTurns: '吟唱回合', effects: '效果'
  };
  return Object.entries(labels).filter(([key]) => values[key] !== undefined && values[key] !== null && values[key] !== '')
    .map(([key, label]) => `${label}：${Array.isArray(values[key]) ? (values[key] as unknown[]).join('、') || '暂无记录' : typeof values[key] === 'boolean' ? values[key] ? '是' : '否' : String(values[key])}`);
});
const detailPaging = usePagedText(() => detailParagraphs.value, detailText);

async function load() {
  const version = ++listVersion;
  loading.value = true;
  error.value = '';
  try {
    const result = await handbook.codex(kind.value, category.value, page.value, keyword.value, rarity.value, pageSize.value);
    if (version !== listVersion) return;
    data.value = result;
    page.value = result.page;
    category.value = result.category;
    rarity.value = result.rarity;
  } catch (reason) {
    if (version === listVersion) error.value = userFacingErrorMessage(reason);
  } finally {
    if (version === listVersion) {
      loading.value = false;
      const target = focusAfterLoad;
      focusAfterLoad = null;
      if (target) void nextTick(() => {
        if (version !== listVersion) return;
        if ('filter' in target) focusTrigger(target.filter);
        else focusRow(target.row);
      });
    }
  }
}

function updateCapacity(reload: boolean) {
  if (!frame.value || selectedEntry.value) return;
  const style = getComputedStyle(frame.value);
  const height = frame.value.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const row = parseFloat(style.getPropertyValue('--codex-row-height')) || 64;
  const gap = parseFloat(style.getPropertyValue('--codex-row-gap')) || 6;
  const capacity = Math.max(1, Math.min(20, Math.floor((height + gap) / (row + gap))));
  if (capacity === pageSize.value) return;
  pageSize.value = capacity;
  page.value = 1;
  if (reload && mounted) void load();
}

function focusTrigger(filter: Filter) {
  void nextTick(() => controls.value?.querySelector<HTMLButtonElement>(`[data-filter-trigger="${filter}"]`)?.focus());
}
function focusRow(id: number) {
  const row = frame.value?.querySelector<HTMLButtonElement>(`[data-codex-id="${id}"]`) ?? frame.value?.querySelector<HTMLButtonElement>('.codex-row');
  if (row) row.focus();
  else frame.value?.closest('.codex-window')?.querySelector<HTMLInputElement>('.codex-search input')?.focus();
}
function closePicker() {
  const current = picker.value;
  picker.value = null;
  if (current) focusTrigger(current);
}
function openPicker(filter: Filter) {
  if (loading.value) return;
  if (picker.value === filter) { closePicker(); return; }
  const selection = filters.value.find(item => item.key === filter);
  if (!selection || selection.disabled) return;
  picker.value = filter;
  const index = selection.options.findIndex(item => item.value === selection.value);
  pickerPage.value = Math.floor(Math.max(0, index) / 9) + 1;
  void nextTick(() => {
    const selected = controls.value?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]');
    (selected ?? controls.value?.querySelector<HTMLButtonElement>('[role="option"]'))?.focus();
  });
}
function changePickerPage(next: number) {
  if (next < 1 || next > pickerPages.value || next === pickerPage.value) return;
  pickerPage.value = next;
  void nextTick(() => controls.value?.querySelector<HTMLButtonElement>('[role="option"]')?.focus());
}
function chooseOption(value: string) {
  const current = picker.value;
  if (!current || loading.value) return;
  closePicker();
  if (current === 'kind') {
    if (kind.value === value) return;
    kind.value = value as CodexKind;
    category.value = '全部'; rarity.value = '全部'; keyword.value = ''; keywordDraft.value = ''; data.value = null;
  } else if (current === 'category') {
    if (category.value === value) return;
    category.value = value;
  } else {
    if (rarity.value === value) return;
    rarity.value = value;
  }
  page.value = 1;
  focusAfterLoad = { filter: current };
  void load();
}
function pickerKeydown(event: KeyboardEvent) {
  if (!activeFilter.value || !(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'option') return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const options = activeFilter.value.options;
  const index = options.findIndex(option => option.value === (event.target as HTMLElement).dataset.value);
  const step = event.key === 'ArrowUp' ? -3 : event.key === 'ArrowDown' ? 3 : event.key === 'ArrowLeft' ? -1 : 1;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + step));
  pickerPage.value = Math.floor(next / 9) + 1;
  void nextTick(() => controls.value?.querySelector<HTMLButtonElement>(`[role="option"][data-value="${CSS.escape(options[next]!.value)}"]`)?.focus());
}
function search() {
  if (loading.value) return;
  picker.value = null;
  keyword.value = keywordDraft.value.trim(); page.value = 1; void load();
}
function changePage(next: number) {
  if (loading.value || error.value || next < 1 || next > totalPages.value || next === page.value) return;
  picker.value = null; page.value = next; void load();
}
async function showDetail(entry: CodexEntry) {
  const version = ++detailVersion;
  selectedEntry.value = entry; detail.value = null; detailError.value = ''; detailLoading.value = true;
  void nextTick(() => { if (version === detailVersion) frame.value?.querySelector<HTMLButtonElement>('.codex-back')?.focus(); });
  try {
    const result = await handbook.codexDetail(kind.value, entry.detailId);
    if (version === detailVersion) detail.value = result;
  } catch (reason) {
    if (version === detailVersion) detailError.value = userFacingErrorMessage(reason);
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}
function backToList() {
  const id = selectedEntry.value?.id;
  ++detailVersion; selectedEntry.value = null; detail.value = null; detailError.value = ''; detailLoading.value = false;
  void nextTick(() => {
    updateCapacity(true);
    if (id === undefined) return;
    if (loading.value) focusAfterLoad = { row: id };
    else focusRow(id);
  });
}
function escape() {
  if (picker.value) closePicker();
  else emit('close');
}
function onPointerDown(event: PointerEvent) {
  if (picker.value && event.target instanceof Node && !controls.value?.contains(event.target)) picker.value = null;
}
onMounted(() => {
  mounted = true; updateCapacity(false);
  observer = new ResizeObserver(() => updateCapacity(true));
  if (frame.value) observer.observe(frame.value);
  document.addEventListener('pointerdown', onPointerDown);
  void load();
});
onBeforeUnmount(() => { mounted = false; ++listVersion; ++detailVersion; observer?.disconnect(); document.removeEventListener('pointerdown', onPointerDown); });
</script>

<template>
  <div class="codex-window" @keydown.esc.stop.prevent="escape">
    <template v-if="!selectedEntry">
      <div ref="controls" class="codex-window-controls" aria-label="图鉴筛选">
        <button v-for="filter in filters" :key="filter.key" type="button" class="codex-filter-trigger" :data-filter-trigger="filter.key" :aria-label="`图鉴${filter.name}`" :aria-describedby="`codex-value-${filter.key}`" aria-haspopup="listbox" :aria-expanded="picker === filter.key" :aria-controls="picker === filter.key ? `codex-picker-${filter.key}` : undefined" :disabled="loading || filter.disabled" @click="openPicker(filter.key)"><span class="codex-filter-caption">{{ filter.name }}</span><span :id="`codex-value-${filter.key}`" class="codex-filter-value">{{ filter.label }}</span><span class="codex-chevron" aria-hidden="true">⌄</span></button>
        <div v-if="picker && activeFilter" class="codex-filter-popup" :data-codex-filter="picker" @keydown="pickerKeydown">
          <div :id="`codex-picker-${picker}`" role="listbox" :aria-label="`选择${activeFilter.name}`" class="codex-filter-options"><button v-for="option in visibleOptions" :key="option.value" type="button" role="option" :data-value="option.value" :aria-selected="option.value === activeFilter.value" @click="chooseOption(option.value)">{{ option.label }}</button></div>
          <nav v-if="pickerPages > 1" class="codex-picker-pages" aria-label="图鉴筛选翻页"><button type="button" :disabled="pickerPage <= 1" @click="changePickerPage(pickerPage - 1)">上一组</button><span>{{ pickerPage }} / {{ pickerPages }}</span><button type="button" :disabled="pickerPage >= pickerPages" @click="changePickerPage(pickerPage + 1)">下一组</button></nav>
        </div>
      </div>
      <form class="codex-search" @submit.prevent="search"><input v-model="keywordDraft" type="search" aria-label="搜索图鉴" placeholder="在当前分类内搜索" maxlength="80" :disabled="loading" /><button type="submit" :disabled="loading">搜索</button></form>
    </template>
    <div ref="frame" class="codex-content-frame" :aria-busy="loading || detailLoading" role="region" aria-label="图鉴内容">
      <template v-if="!selectedEntry">
        <div v-if="loading" class="codex-state" role="status"><GameUiFeedbackArt name="loading" :size="28" /><span>正在翻阅图鉴…</span></div>
        <div v-else-if="error" class="codex-state" role="alert"><span>{{ error }}</span><button type="button" @click="load">重新加载</button></div>
        <div v-else-if="data?.entries.length" class="codex-list">
          <button v-for="entry in data.entries" :key="entry.id" type="button" class="codex-row" :data-codex-id="entry.id" :data-detail-id="entry.detailId" :data-rarity="entry.rarity ? normalizeItemRarity(entry.rarity) : undefined" @click="showDetail(entry)">
            <span class="codex-emblem"><SkillIcon v-if="kind === '技能'" :code="entry.code" :name="entry.name" :size="42" /><img v-else-if="kind === '怪物' && entry.name.includes('球兔')" :src="gameAssetUrl('/assets/loading/ball-rabbit.png')" alt="" /><AnimeIcon v-else-if="kind === '怪物'" name="paw" :size="40" /><InventoryItemIcon v-else :name="entry.name" :codex-id="entry.detailId" :item-type="kind === '装备' ? 'equipment' : kind === '道具' ? 'consumable' : 'material'" :item-category="entry.category" /></span>
            <span class="codex-row-copy"><strong :title="entry.name">{{ entry.name }}</strong><small>{{ kind }} · {{ entry.category }}</small></span>
            <span class="codex-row-status"><strong>{{ entry.rarity || '已发现' }}</strong><small>查看详情 ›</small></span>
          </button>
        </div>
        <div v-else class="codex-state"><GameUiFeedbackArt name="empty" :size="28" /><span>{{ keyword ? '当前筛选内没有匹配的条目。' : '当前筛选内还没有已发现条目。' }}</span></div>
      </template>
      <template v-else>
        <header class="codex-detail-heading"><button type="button" class="codex-back" @click="backToList">‹ 返回列表</button><div><h3 :title="selectedEntry.name">{{ selectedEntry.name }}</h3><small>{{ kind }} · {{ selectedEntry.category }}{{ selectedEntry.rarity ? ` · ${selectedEntry.rarity}` : '' }}</small></div></header>
        <div v-if="detailLoading" class="codex-state" role="status"><GameUiFeedbackArt name="loading" :size="28" /><span>正在查看详情…</span></div>
        <div v-else-if="detailError" class="codex-state" role="alert"><span>{{ detailError }}</span><button type="button" @click="showDetail(selectedEntry)">重试</button></div>
        <div v-else ref="detailText" class="codex-detail-text"><p v-for="(line, index) in detailPaging.visibleLines.value" :key="index">{{ line }}</p></div>
      </template>
    </div>
    <nav v-if="!selectedEntry" class="codex-footer" aria-label="图鉴翻页"><button type="button" :disabled="loading || !!error || page <= 1" @click="changePage(page - 1)">上一页</button><span>{{ page }} / {{ totalPages }}<small v-if="data && !loading">共 {{ data.total }} 项</small></span><button type="button" :disabled="loading || !!error || page >= totalPages" @click="changePage(page + 1)">下一页</button></nav>
    <nav v-else class="codex-footer" aria-label="图鉴详情翻页"><button type="button" :disabled="detailLoading || !!detailError || detailPaging.page.value <= 1" @click="detailPaging.changePage(detailPaging.page.value - 1)">上一页</button><span>{{ detailPaging.page.value }} / {{ detailPaging.totalPages.value }}</span><button type="button" :disabled="detailLoading || !!detailError || detailPaging.page.value >= detailPaging.totalPages.value" @click="detailPaging.changePage(detailPaging.page.value + 1)">下一页</button></nav>
  </div>
</template>

<style scoped>
.codex-window { display: flex; flex: 1 1 0; flex-direction: column; gap: 6px; min-width: 0; min-height: 0; padding-top: 7px; color: #594e60; }
.codex-window-controls { position: relative; z-index: 4; display: grid; flex: none; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.codex-window .codex-filter-trigger { position: relative; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; min-width: 0; min-height: 42px; padding: 4px 22px 4px 9px; border: 1px solid #c8b4d2; border-radius: 7px; color: #6b527e; background: #fffcf8; text-align: left; }
.codex-filter-caption { color: #9a839f; font-size: 9px; line-height: 1.3; }
.codex-filter-value { display: block; max-width: 100%; overflow: hidden; font-size: 12px; font-weight: 700; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.codex-chevron { position: absolute; right: 7px; top: 12px; color: #9980aa; font-size: 16px; }
.codex-filter-trigger[aria-expanded='true'] { border-color: #9678ae; background: #f4edf8; }
.codex-window .codex-filter-trigger:disabled { cursor: default; opacity: .7; }
.codex-filter-popup { position: absolute; top: calc(100% + 4px); left: 0; right: 0; padding: 7px; border: 1px solid #b79bc8; border-radius: 9px; background: #fffcf6; box-shadow: 0 8px 22px #52366533; }
.codex-filter-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
.codex-window .codex-filter-options button { min-width: 0; min-height: 30px; padding: 4px; border: 1px solid #e4d7e8; border-radius: 5px; background: #fbf6fc; color: #796183; font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.codex-window .codex-filter-options button[aria-selected='true'] { border-color: #9a7eb0; color: #67487f; background: #eee3f4; font-weight: 700; }
.codex-picker-pages { display: flex; align-items: center; justify-content: space-between; gap: 5px; margin-top: 6px; padding-top: 5px; border-top: 1px solid #e4d7e8; font-size: 11px; }
.codex-picker-pages button { padding: 4px 7px; color: #7d6489; background: #f4edf8; border-radius: 4px; font-size: 11px; }
.codex-search { display: flex; align-items: center; flex: none; gap: 5px; margin: 0; }
.codex-window .codex-search input { flex: 1; width: 100%; min-width: 0; height: 32px; margin: 0; padding: 5px 9px; border: 1px solid #d5c5db; border-radius: 7px; color: #6c5879; background: #fffdf7; box-shadow: none; font-size: 12px; line-height: 20px; }
.codex-window .codex-search button { flex: none; min-height: 32px; padding: 5px 13px; border: 1px solid #b29ac2; border-radius: 7px; color: #715283; background: #efe5f5; font-size: 12px; }
.codex-content-frame { --codex-row-height: 64px; --codex-row-gap: 6px; display: flex; flex: 1 1 0; flex-direction: column; min-width: 0; min-height: 0; padding: 6px; border: 1px solid #dacde0; border-radius: 9px; background: #fffdf8; overflow: hidden; }
.codex-list { display: grid; grid-auto-rows: var(--codex-row-height); gap: var(--codex-row-gap); min-width: 0; }
.codex-window .codex-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) 76px; align-items: center; gap: 9px; width: 100%; min-width: 0; height: var(--codex-row-height); padding: 7px; border: 1px solid #e1d6d9; border-radius: 7px; color: #5e5461; background: linear-gradient(100deg, #fffdf7, #f6f0f8); text-align: left; }
.codex-row:hover { border-color: #af94bd; }
.codex-emblem { display: grid; place-items: center; width: 46px; height: 46px; min-width: 0; padding: 3px; border: 1px solid #c6afcf; border-radius: 7px; background: #f8f0e7; overflow: hidden; }
.codex-emblem > * { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
.codex-row-copy { display: grid; gap: 3px; min-width: 0; }
.codex-row-copy > strong { overflow: hidden; color: var(--codex-rarity-color, #62556a); font-size: 14px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.codex-row-copy > small { color: #938296; font-size: 10px; line-height: 1.4; }
.codex-row-status { display: grid; justify-items: end; gap: 4px; min-width: 0; padding-left: 7px; border-left: 1px solid #e1d4de; }
.codex-row-status > strong { color: var(--codex-rarity-color, #8d739a); font-size: 11px; font-weight: 500; }
.codex-row-status > small { color: #a08ca9; font-size: 10px; white-space: nowrap; }
.codex-row[data-rarity='common'] { --codex-rarity-color: #646864; }.codex-row[data-rarity='excellent'] { --codex-rarity-color: #347c43; }.codex-row[data-rarity='fine'] { --codex-rarity-color: #2d72b2; }.codex-row[data-rarity='rare'] { --codex-rarity-color: #7648a4; }.codex-row[data-rarity='legendary'] { --codex-rarity-color: #af5b17; }.codex-row[data-rarity='epic'] { --codex-rarity-color: #967010; }.codex-row[data-rarity='artifact'] { --codex-rarity-color: #9a539d; }
.codex-state { display: flex; flex: 1; min-height: 0; flex-direction: column; justify-content: center; align-items: center; gap: 8px; padding: 8px; color: #9a879f; font-size: 12px; line-height: 1.5; text-align: center; overflow-wrap: anywhere; }
.codex-state button { min-height: 30px; padding: 5px 10px; border: 1px solid #c7b4d4; border-radius: 6px; color: #7f6090; background: #f1e9f6; font-size: 12px; }
.codex-footer { display: flex; flex: none; justify-content: space-between; align-items: center; gap: 7px; padding-top: 5px; border-top: 1px solid #dacde0; }
.codex-footer button { min-height: 30px; padding: 4px 11px; border: 1px solid #cdbbd7; border-radius: 6px; color: #7b6388; background: #fffcf5; font-size: 11px; }
.codex-footer > span { display: flex; align-items: center; gap: 8px; color: #8a7297; font-size: 11px; }
.codex-footer small { color: #ad9ab4; font-size: 10px; }
.codex-detail-heading { display: flex; align-items: center; flex: none; gap: 9px; padding: 2px 2px 7px; border-bottom: 1px solid #e5dce8; }
.codex-detail-heading > div { min-width: 0; }
.codex-detail-heading h3 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; margin: 0; overflow: hidden; color: #745781; font-size: 15px; line-height: 1.4; }
.codex-detail-heading small { color: #a48dac; font-size: 10px; line-height: 1.4; }
.codex-window .codex-back { flex: none; min-height: 30px; padding: 4px 6px; border: 1px solid #d9c9df; border-radius: 5px; background: #faf4fc; color: #93729e; font-size: 11px; }
.codex-detail-text { flex: 1 1 0; min-width: 0; min-height: 0; margin-top: 6px; color: #675a6e; font-size: 12px; line-height: 20px; }
.codex-detail-text > p { height: 20px; min-height: 20px; margin: 0; padding: 0; white-space: pre; font: inherit; }
.codex-window :is(button, input):focus-visible { outline: 2px solid #9b78b1; outline-offset: -3px; }
@media (max-width: 600px) {
  .codex-window { gap: 5px; }.codex-window-controls { gap: 4px; }
  .codex-window .codex-filter-trigger { min-height: 39px; padding-left: 5px; padding-right: 15px; }.codex-filter-value { font-size: 11px; }.codex-chevron { right: 3px; }
  .codex-content-frame { --codex-row-height: 56px; padding: 4px; }
  .codex-window .codex-row { grid-template-columns: 38px minmax(0, 1fr) 57px; gap: 6px; padding: 5px; }.codex-emblem { width: 38px; height: 38px; padding: 2px; }.codex-row-copy > strong { font-size: 12px; }.codex-row-status { padding-left: 5px; }.codex-row-status > small { font-size: 9px; }
  .codex-footer { gap: 5px; }.codex-footer button { padding-inline: 8px; }.codex-footer > span { gap: 5px; }
}
@media (max-height: 600px) { .codex-content-frame { --codex-row-height: 50px; --codex-row-gap: 4px; }.codex-window .codex-row { padding-block: 4px; }.codex-emblem { width: 36px; height: 36px; }.codex-window { padding-top: 5px; } }
@media (max-height: 430px) { .codex-window { gap: 4px; padding-top: 4px; }.codex-window .codex-filter-trigger { min-height: 36px; padding-block: 2px; } }
</style>
