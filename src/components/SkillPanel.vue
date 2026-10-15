<script setup lang="ts">
import '../anime-growth-commerce.css';
import '../game-ui-skills.css';
import AnimeIcon from './AnimeIcon.vue';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import SkillIcon from './SkillIcon.vue';
import ViewportPagination from './ViewportPagination.vue';
import { useViewportPagination } from '../useViewportPagination';
import { computed, nextTick, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import { specializationDisplayRows } from '../skill-specialization-view';
import * as skillApi from '../skill-api';
import type {
  AvailableSkill, LearnedSkill, SkillActionInput, SkillCandidateAction, SkillCombatEffect,
  SkillDetail, SkillPage, SkillPreview, SkillSpecialization, SkillSpecializationDetail
} from '../skill-api';

type Tab = 'learned' | 'available' | 'config';
type ConfigurationKind = 'shortcut' | 'passive_link';
type SpecializationRow = Omit<SkillSpecializationDetail, 'maxLevel'> & { maxLevel: number | null };
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const emit = defineEmits<{ updated: []; 'pending-change': [pending: boolean] }>();
const tab = ref<Tab>('learned');
const pages = ref<Record<Tab, number>>({ learned: 1, available: 1, config: 1 });
const keywords = ref<Record<Tab, string>>({ learned: '', available: '', config: '' });
const drafts = ref<Record<Tab, string>>({ learned: '', available: '', config: '' });
const list = ref<SkillPage<LearnedSkill | AvailableSkill> | null>(null);
const listLoading = ref(false);
const listError = ref('');
const detail = ref<SkillDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const detailOpen = ref(false);
const configurationKind = ref<ConfigurationKind | null>(null);
const pending = ref(false);
const preview = ref<SkillPreview | null>(null);
const previewAction = ref<SkillActionInput | null>(null);
const uncertainConfirmToken = ref<string | null>(null);
const automaticUpgrade = ref(false);
const upgradingSpecializationKey = ref<string | null>(null);
const notice = ref('');
const now = ref(Date.now());
const closeButton = ref<HTMLButtonElement | null>(null);
const confirmationBox = ref<HTMLElement | null>(null);
const inlineDetail = ref<SkillDetail | null>(null);
const inlineLoading = ref(false);
const inlineError = ref('');
const selectedInlineId = ref<number | null>(null);
const skillViewportList = ref<HTMLElement | null>(null);
const skillViewportConfigurationOpen = ref(false);
// The existing endpoint has a fixed ten-item server page. Local pages must
// traverse every subpage before crossing that server boundary.
const skillViewportServerChunk = 10;
const skillViewportPagination = useViewportPagination(() => list.value?.items ?? [], { container: skillViewportList, rowHeight: 64, gap: 6 });
const skillViewportPagesPerServer = computed(() => Math.max(1, Math.ceil(skillViewportServerChunk / skillViewportPagination.pageSize.value)));
const skillViewportPage = computed(() => (page.value - 1) * skillViewportPagesPerServer.value + skillViewportPagination.page.value);
const skillViewportTotalPages = computed(() => {
  const total = list.value?.total ?? 0, serverPages = list.value?.totalPages ?? 1;
  const lastCount = Math.max(0, total - (serverPages - 1) * skillViewportServerChunk);
  return (serverPages - 1) * skillViewportPagesPerServer.value + Math.max(1, Math.ceil(lastCount / skillViewportPagination.pageSize.value));
});
let inlineVersion = 0;
let listVersion = 0;
let detailVersion = 0;

const page = computed(() => pages.value[tab.value]);
const quoteExpired = computed(() => preview.value ? now.value >= new Date(preview.value.expiresAt).getTime() : false);
const canRetryConfirmation = computed(() => Boolean(preview.value && uncertainConfirmToken.value === preview.value.token));
const resolutionPending = computed(() => pending.value || canRetryConfirmation.value);
watch(resolutionPending, value => emit('pending-change', value), { immediate: true });
const learnedSkills = computed(() => (list.value?.items ?? []).filter(isLearned));
const availableSkills = computed(() => (list.value?.items ?? []).filter(isAvailable));
const skill = computed(() => detail.value?.skill ?? null);
const skillSummary = computed(() => {
  const value = skill.value;
  if (!value) return '';
  if (value.summary?.trim()) return value.summary.trim();
  if (value.category === 'passive' || value.category === 'bound') return '提供持续生效的战斗或冒险能力。';
  if (value.category === 'utility') return `面向${targetName(value.targetScope)}使用的辅助技能。`;
  return `面向${targetName(value.targetScope)}使用的${categoryName(value.category)}技能。`;
});
const combatEffectRows = computed<SkillCombatEffect[]>(() => {
  const value = skill.value;
  if (!value) return [];
  if (value.combatEffects !== undefined) return value.combatEffects;
  return value.effectDetails.map(effect => ({
    text: `${triggerName(effect.trigger_timing)}对${targetName(effect.target_scope)}施加[${effect.name}]${effect.duration > 0 ? `，持续${effect.duration}回合` : '，即时生效'}。`
  }));
});
const configurationTitle = computed(() => configurationKind.value === 'shortcut' ? '设置战斗快捷' : '链接被动');
const configurationPicking = computed(() => Boolean(configurationKind.value && !detail.value && !detailLoading.value));
const configurationSkills = computed(() => learnedSkills.value.filter(entry => configurationKind.value === 'passive_link'
  ? entry.category === 'passive' : !['passive', 'bound'].includes(entry.category)));
const configurationDetail = computed(() => tab.value === 'config' || Boolean(configurationKind.value));
const detailActions = computed(() => (detail.value?.actions ?? []).filter(action => configurationKind.value
  ? action.action === configurationKind.value
  : !configurationDetail.value || action.action === 'shortcut' || action.action === 'passive_link'));
const headerConfigurationActions = computed(() => detailActions.value.filter(action => action.action === 'shortcut' || action.action === 'passive_link'));
const skillGrowthActions = computed(() => detailActions.value.filter(action => action.action === 'learn' || action.action === 'upgrade'));
const skillPoints = computed(() => list.value?.skillPoints ?? skill.value?.skillPoints ?? 0);
const selectedSkill = computed(() => inlineDetail.value?.skill ?? null);
const selectedLearnAction = computed(() => inlineDetail.value?.actions.find(action => action.action === 'learn'));
const inlineSpecializations = computed(() => inlineDetail.value?.actions.filter(action => action.action === 'specialization') ?? []);
const configuredSlots = computed(() => Array.from({ length: 4 }, (_, index) => ({ slot: index + 1, skill: list.value?.quickSlots.find(item => item.slot === index + 1) })));
const specializationNames: Record<SkillSpecialization, string> = {
  overcharge: '过充', instant: '瞬息', efficient: '节能', potent: '强效'
};
const masteryCodes = new Set(['longsword_mastery', 'shield_mastery', 'staff_mastery', 'spellbook_mastery',
  'orb_mastery', 'dagger_mastery', 'fistblade_mastery', 'bow_crossbow_mastery', 'gun_mastery']);
function specializationName(direction: SkillSpecialization, code = skill.value?.code) {
  if (code && masteryCodes.has(code)) {
    if (direction === 'overcharge') return '娴熟';
    if (direction === 'instant') return '随心';
  }
  return specializationNames[direction];
}
const specializationRows = computed<SpecializationRow[]>(() => {
  const value = skill.value;
  return value ? specializationDisplayRows(value, detail.value?.actions ?? []) : [];
});
function specializationAction(row: SpecializationRow) {
  return detailActions.value.find(action => action.action === row.action
    && action.specialization === row.specialization && action.direction === row.direction);
}
function specializationReason(row: SpecializationRow) {
  const action = specializationAction(row);
  if (action) return action.enabled ? '' : action.reason ?? '目前不可提升。';
  if (configurationDetail.value) return '请从已学技能页面提升专精。';
  return row.maxLevel !== null && row.level >= row.maxLevel ? '已达等级上限。' : '当前没有可用的提升操作。';
}
async function upgradeSpecialization(row: SpecializationRow) {
  const action = specializationAction(row);
  if (!action?.enabled || resolutionPending.value) return;
  upgradingSpecializationKey.value = row.key;
  try { await beginPreview(action, true); }
  finally { upgradingSpecializationKey.value = null; }
}
const categoryNames: Record<string, string> = {
  physical: '物理', magic: '魔法', utility: '辅助', bound: '绑定', passive: '被动'
};
function categoryName(value: string) { return categoryNames[value] ?? value; }
function targetName(value: string) { return ({ enemy: '敌方', ally: '友方', self: '自身', all_enemies: '全体敌方', all_allies: '全体友方' } as Record<string, string>)[value] ?? value; }
function rangeName(value: string) { return ({ single: '单体', aoe: '范围', melee: '近战', ranged: '远程', all: '全体' } as Record<string, string>)[value] ?? value; }
function triggerName(value: string) { return ({ on_hit: '命中时', on_cast: '施放时' } as Record<string, string>)[value] ?? value; }
function isLearned(item: LearnedSkill | AvailableSkill): item is LearnedSkill { return 'level' in item; }
function isAvailable(item: LearnedSkill | AvailableSkill): item is AvailableSkill { return 'canLearn' in item; }
function dateText(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN'); }

async function loadList(viewportPage?: number | Event) {
  if (!props.active) return;
  const version = ++listVersion;
  listLoading.value = true;
  listError.value = '';
  try {
    const view = tab.value === 'available' ? 'available' : 'learned';
    const result = await skillApi.skills<LearnedSkill | AvailableSkill>(view, pages.value[tab.value], keywords.value[tab.value]);
    if (version !== listVersion) return;
    list.value = result;
    pages.value[tab.value] = result.page;
    if (typeof viewportPage === 'number') skillViewportPagination.setPage(viewportPage);
    if (tab.value !== 'learned') {
      const selected = result.items.find(item => item.id === selectedInlineId.value) ?? result.items[0];
      if (selected) await selectInline(selected.id);
      else { selectedInlineId.value = null; inlineDetail.value = null; }
    }
  } catch (cause) {
    if (version === listVersion) listError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === listVersion) listLoading.value = false;
  }
}

async function refreshDetail() {
  if (!detailOpen.value || !detail.value) return;
  const id = detail.value.skill.id;
  const version = ++detailVersion;
  try {
    const result = await skillApi.skillDetail(id);
    if (version === detailVersion) detail.value = result;
  } catch (cause) {
    if (version === detailVersion) detailError.value = userFacingErrorMessage(cause);
  }
}

watch(() => props.active, active => {
  ++listVersion;
  if (active) void loadList();
  else closeDetail();
}, { immediate: true });

watch(detailOpen, (open, _previous, onCleanup) => {
  if (!open) return;
  now.value = Date.now();
  const timer = window.setInterval(() => { now.value = Date.now(); }, 1000);
  onCleanup(() => window.clearInterval(timer));
  void nextTick(() => closeButton.value?.focus());
});

function switchTab(next: Tab) {
  if (resolutionPending.value || tab.value === next) return;
  tab.value = next; list.value = null; listError.value = ''; notice.value = '';
  skillViewportPagination.reset();
  ++inlineVersion; inlineDetail.value = null; inlineError.value = ''; selectedInlineId.value = null;
  void loadList();
}
async function selectInline(id: number) {
  if (resolutionPending.value) return;
  const version = ++inlineVersion;
  selectedInlineId.value = id; inlineDetail.value = null; inlineError.value = ''; inlineLoading.value = true;
  try {
    const result = await skillApi.skillDetail(id);
    if (version === inlineVersion && props.active) inlineDetail.value = result;
  } catch (cause) {
    if (version === inlineVersion) inlineError.value = userFacingErrorMessage(cause);
  } finally { if (version === inlineVersion) inlineLoading.value = false; }
}
async function previewInline(action?: SkillCandidateAction) {
  if (!action || !inlineDetail.value || resolutionPending.value || !action.enabled) return;
  ++detailVersion;
  configurationKind.value = null;
  detail.value = inlineDetail.value; detailOpen.value = true; detailLoading.value = false; detailError.value = '';
  preview.value = null; previewAction.value = null; notice.value = '';
  await beginPreview(action);
}
function search() {
  if (resolutionPending.value || listLoading.value) return;
  keywords.value[tab.value] = drafts.value[tab.value].trim();
  pages.value[tab.value] = 1;
  skillViewportPagination.reset();
  void loadList();
}
function changePage(next: number) {
  if (resolutionPending.value || listLoading.value || !list.value || next < 1 || next > list.value.totalPages || next === page.value) return;
  pages.value[tab.value] = next;
  void loadList(1);
}
function skillViewportChangePage(next: number) {
  if (resolutionPending.value || listLoading.value || !list.value || next < 1 || next > skillViewportTotalPages.value) return;
  const serverPage = Math.floor((next - 1) / skillViewportPagesPerServer.value) + 1;
  const localPage = (next - 1) % skillViewportPagesPerServer.value + 1;
  if (serverPage === page.value) skillViewportPagination.setPage(localPage);
  else { pages.value[tab.value] = serverPage; void loadList(localPage); }
}
function openConfiguration(kind: ConfigurationKind) {
  if (resolutionPending.value) return;
  ++detailVersion;
  skillViewportConfigurationOpen.value = false;
  configurationKind.value = kind;
  detailOpen.value = true; detail.value = null; detailLoading.value = false; detailError.value = '';
  preview.value = null; previewAction.value = null; notice.value = '';
}
async function showDetail(id: number, configuration: ConfigurationKind | null = null) {
  if (resolutionPending.value) return;
  skillViewportConfigurationOpen.value = false;
  const version = ++detailVersion;
  configurationKind.value = configuration;
  detailOpen.value = true; detail.value = null; detailError.value = ''; detailLoading.value = true;
  preview.value = null; previewAction.value = null; notice.value = '';
  try {
    const result = await skillApi.skillDetail(id);
    if (version === detailVersion) detail.value = result;
  } catch (cause) {
    if (version === detailVersion) detailError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}
function closeDetail() {
  if (resolutionPending.value && props.active) return;
  ++detailVersion;
  configurationKind.value = null;
  detailOpen.value = false; detail.value = null; detailError.value = '';
  preview.value = null; previewAction.value = null;
}

function actionLabel(action: SkillCandidateAction | SkillActionInput, actionDetail = detail.value) {
  if (action.action === 'learn') return '学习技能';
  if (action.action === 'upgrade') return '升级技能';
  if (action.action === 'passive_link') return actionDetail?.skill.passiveLinked ? '解除被动链接' : '链接被动';
  if (action.action === 'shortcut') return actionDetail?.skill.quickSlot ? `移除快捷 ${actionDetail.skill.quickSlot}` : '设置战斗快捷';
  if (action.action === 'appraisal') return `升级鉴识·${action.direction === 'range' ? '慧眼' : '识珠'}`;
  const name = specializationName(action.specialization ?? 'potent', actionDetail?.skill.code);
  return `升级专精·${name}`;
}
function actionNote(action: SkillCandidateAction) {
  if (!action.enabled) return action.reason ?? '目前不可操作。';
  const quote = action.quote;
  if (!quote) return '点击后获取当前预览。';
  const parts = [] as string[];
  if (quote.result.cost !== undefined) parts.push(`消耗 ${quote.result.cost} SP`);
  if (action.action === 'upgrade' && quote.result.level !== undefined) parts.push(`升级至 Lv.${quote.result.level}`);
  if (action.action === 'specialization' && quote.result.level !== undefined) parts.push(`方向升至 Lv.${quote.result.level}`);
  if (action.action === 'appraisal') parts.push(`慧眼 Lv.${quote.result.rangeLevel} · 识珠 Lv.${quote.result.informationLevel}`);
  if (action.action === 'shortcut') parts.push(quote.result.slot == null ? '从快捷栏移除' : `配置到快捷 ${quote.result.slot}`);
  if (action.action === 'passive_link') parts.push(quote.result.linked ? '建立协同链接' : '解除协同链接');
  return parts.join(' · ') || '点击后获取当前预览。';
}
function previewSummary(value: SkillPreview) {
  const result = value.quote.result;
  const parts = [] as string[];
  if (value.quote.action === 'learn') parts.push(`学会「${result.name ?? skill.value?.name ?? '此技能'}」`);
  if (value.quote.action === 'upgrade') parts.push(`技能升至 Lv.${result.level}`);
  if (value.quote.action === 'specialization') parts.push(`${specializationName(result.specialization ?? 'potent')}升至 Lv.${result.level}`);
  if (value.quote.action === 'appraisal') parts.push(`慧眼 Lv.${result.rangeLevel} · 识珠 Lv.${result.informationLevel}`);
  if (value.quote.action === 'passive_link') parts.push(result.linked ? '建立被动协同链接' : '解除被动协同链接');
  if (value.quote.action === 'shortcut') parts.push(result.slot == null ? '从快捷栏移除' : `配置到快捷 ${result.slot}`);
  if (result.cost !== undefined) parts.push(`消耗 ${result.cost} SP`);
  return parts.join(' · ');
}

async function beginPreview(action: SkillCandidateAction, executeImmediately = false) {
  if (resolutionPending.value || !action.enabled) return;
  pending.value = true; detailError.value = ''; notice.value = ''; preview.value = null; previewAction.value = null;
  automaticUpgrade.value = executeImmediately;
  const input: SkillActionInput = { action: action.action, skillId: action.skillId,
    ...(action.specialization ? { specialization: action.specialization } : {}),
    ...(action.direction ? { direction: action.direction } : {}) };
  try {
    preview.value = await skillApi.previewSkillAction(input);
    previewAction.value = input;
    if (executeImmediately) {
      await executeConfirmation(preview.value);
      return;
    }
    await nextTick();
    confirmationBox.value?.scrollIntoView({ block: 'nearest' });
  } catch (cause) {
    detailError.value = userFacingErrorMessage(cause);
    await Promise.all([loadList(), refreshDetail()]);
  } finally { pending.value = false; }
}

async function confirm() {
  const quote = preview.value;
  if (!quote || pending.value) return;
  if (Date.now() >= new Date(quote.expiresAt).getTime() && !canRetryConfirmation.value) { detailError.value = '技能预览已过期，请重新获取。'; preview.value = null; return; }
  pending.value = true; detailError.value = '';
  try { await executeConfirmation(quote); }
  finally { pending.value = false; }
}

// Direct specialization upgrades still obtain the server quote and consume its
// original token/key once. Keep the busy lock through confirmation and refresh.
async function executeConfirmation(quote: SkillPreview) {
  if (Date.now() >= new Date(quote.expiresAt).getTime() && uncertainConfirmToken.value !== quote.token) {
    detailError.value = '技能预览已过期，请重试升级。';
    preview.value = null; previewAction.value = null;
    return;
  }
  try {
    await skillApi.confirmSkillAction(quote.token, quote.idempotencyKey);
    uncertainConfirmToken.value = null;
    preview.value = null; previewAction.value = null;
    notice.value = automaticUpgrade.value ? '专精升级已完成。' : '技能操作已完成。';
    emit('updated');
    await Promise.all([loadList(), refreshDetail()]);
  } catch (cause) {
    const message = userFacingErrorMessage(cause);
    const uncertain = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
    uncertainConfirmToken.value = uncertain ? quote.token : null;
    detailError.value = uncertain ? `${message} 请先查看当前技能状态；可用原凭据安全核对结果。` : message;
    if (!uncertain) { preview.value = null; previewAction.value = null; }
    await Promise.all([loadList(), refreshDetail()]);
  }
}
</script>

<template>
  <section class="skill-panel skill-journal anime-growth-commerce skill-book-panel" :class="'journal-' + tab" :data-skill-server-page="page" :data-skill-viewport-page="skillViewportPagination.page.value" :data-skill-page-size="skillViewportPagination.pageSize.value" aria-label="角色技能">
    <nav class="skill-tabs" aria-label="技能分类"><button type="button" :class="{ active: tab === 'learned' }" :aria-pressed="tab === 'learned'" :disabled="resolutionPending" @click="switchTab('learned')">已学</button><button type="button" :class="{ active: tab === 'available' }" :aria-pressed="tab === 'available'" :disabled="resolutionPending" @click="switchTab('available')">待学</button><button type="button" :class="{ active: tab === 'config' }" :aria-pressed="tab === 'config'" :disabled="resolutionPending" @click="switchTab('config')">配置</button></nav>
    <div class="journal-workspace">
      <header class="skill-top"><h2><AnimeIcon name="book" :size="24" />{{ tab === 'config' ? '技能配置' : '技能手册' }}</h2><span class="points"><AnimeIcon name="mana" :size="24" />技能点 <strong>{{ skillPoints }} <small>SP</small></strong></span></header>
      <p v-if="notice && !detailOpen" class="notice" role="status">{{ notice }}</p><p v-if="listError" class="error" role="alert">{{ listError }} <button type="button" @click="loadList">重试</button></p>
      <template v-if="tab === 'config' && list">
        <div class="skill-viewport-config-actions"><button type="button" :disabled="resolutionPending" @click="skillViewportConfigurationOpen = true">当前配置</button><button type="button" :disabled="resolutionPending || listLoading" @click="openConfiguration('shortcut')">战斗快捷</button><button type="button" :disabled="resolutionPending || listLoading" @click="openConfiguration('passive_link')">被动协同 {{ list.linkedPassives.length }}/{{ list.passiveLinkLimit }}</button></div>
        <Teleport to="body"><div v-if="skillViewportConfigurationOpen" class="skill-backdrop" role="presentation" @click.self="!resolutionPending && (skillViewportConfigurationOpen = false)"><section class="skill-dialog skill-journal anime-growth-commerce skill-book-dialog" role="dialog" aria-modal="true" aria-label="当前技能配置" @keydown.esc="!resolutionPending && (skillViewportConfigurationOpen = false)"><header class="dialog-header"><h2>当前技能配置</h2><button class="skill-dialog-close" type="button" aria-label="关闭当前技能配置" :disabled="resolutionPending" @click="skillViewportConfigurationOpen = false"><img src="/assets/light-anime/skill-stationery-v1/handwritten-close-red.png" alt="" aria-hidden="true" /></button></header><div class="dialog-body">
        <section class="config-summary">
          <div class="shortcut-surface"><div class="configuration-heading"><h3><AnimeIcon name="sword" :size="25" />战斗快捷 <small>在战斗中快速使用已配置的技能</small></h3><button class="primary-button configuration-entry" type="button" :disabled="resolutionPending || listLoading" @click="openConfiguration('shortcut')">设置战斗快捷</button></div><div class="slot-row"><button v-for="entry in configuredSlots" :key="entry.slot" type="button" :disabled="resolutionPending" :aria-label="entry.skill ? entry.skill.name + '快捷详情' : '配置快捷空位' + entry.slot" @click="entry.skill ? showDetail(entry.skill.skillId, 'shortcut') : openConfiguration('shortcut')"><small class="slot-number">{{ entry.slot }}</small><SkillIcon v-if="entry.skill" :code="entry.skill.code" :name="entry.skill.name" :size="64" /><span v-else class="empty-shortcut" aria-hidden="true"><AnimeIcon name="plus" :size="30" /></span><strong>{{ entry.skill?.name ?? '空位' }}</strong></button></div></div>
          <div class="passive-surface"><div class="configuration-heading"><h3><AnimeIcon name="party" :size="25" />被动协同 <span>{{ list.linkedPassives.length }}/{{ list.passiveLinkLimit }}</span><small>选择与技能相性良好的被动，获得额外效果</small></h3><button class="primary-button configuration-entry" type="button" :disabled="resolutionPending || listLoading" @click="openConfiguration('passive_link')">链接被动</button></div><div class="linked-row"><button v-for="entry in list.linkedPassives" :key="entry.skillId" type="button" :disabled="resolutionPending" @click="showDetail(entry.skillId, 'passive_link')"><SkillIcon :code="entry.code" :name="entry.name" category="passive" :size="48" /><strong>{{ entry.name }}</strong><span>已链接</span></button><p v-if="!list.linkedPassives.length" class="hint">尚未链接被动技能。</p><small class="config-guidance"><AnimeIcon name="paw" :size="25" />点选技能，在详情中配置。</small></div></div>
        </section>
        </div></section></div></Teleport>
      </template>
      <form class="search-row" @submit.prevent="search"><AnimeIcon class="handbook-search-art" name="search" :size="19" /><input v-model="drafts[tab]" type="search" maxlength="80" placeholder="搜索技能名称" aria-label="搜索技能" /><button type="submit" :disabled="resolutionPending || listLoading" aria-label="搜索技能">搜索</button></form>
      <div v-if="listLoading" class="empty game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" /><span>正在整理技能…</span></div>
      <div v-else-if="list" class="skill-content" :class="{ 'config-columns': tab === 'config' }">
        <div ref="skillViewportList" class="skill-list" :class="{ 'learnable-list': tab === 'available', 'config-list': tab === 'config' }">
          <button v-for="entry in skillViewportPagination.visibleItems.value" :key="entry.id" class="skill-card" :class="{ selected: tab !== 'learned' && selectedInlineId === entry.id, unavailable: isAvailable(entry) && !entry.canLearn }" :data-skill-id="entry.id" :data-category="entry.category" type="button" :disabled="resolutionPending" @click="tab === 'available' ? selectInline(entry.id) : showDetail(entry.id)">
            <span class="skill-art"><SkillIcon :code="entry.code" :name="entry.name" :category="entry.category" :size="42" /></span>
            <span class="skill-copy"><strong :title="entry.name">{{ entry.name }}</strong><span class="skill-classification"><small class="category-tag" :data-category="entry.category">{{ categoryName(entry.category) }}</small><small v-if="isLearned(entry)" class="level-tag">Lv.{{ entry.level }}</small><small v-else>{{ entry.tier }}</small></span><span v-if="entry.description && tab === 'learned'" class="row-description">{{ entry.description }}</span></span>
            <span v-if="isAvailable(entry)" class="learning-cost"><strong v-if="entry.canLearn">学习 <b>{{ entry.learnCost }} SP</b></strong><span :class="entry.canLearn ? 'available' : 'blocked'">{{ entry.canLearn ? '可学习' : '暂不可学' }}</span><small>{{ entry.canLearn ? '学后剩余 ' + entry.remainingSkillPoints + ' SP' : entry.reason || '未满足前置条件' }}</small></span>
            <span v-else-if="entry.quickSlot" class="skill-badge">快捷 {{ entry.quickSlot }}</span><span v-else-if="entry.passiveLinked" class="skill-badge linked-badge">已链接</span><span class="arrow" aria-hidden="true"><AnimeIcon name="arrow" :size="18" /></span>
          </button>
          <p v-if="!list.items.length" class="empty game-ui-empty-message"><GameUiFeedbackArt name="empty" /><span>{{ tab === 'available' ? '目前没有已发现且待学习的技能。' : '目前没有已学技能。' }}</span></p>
        </div>
      </div>
    <aside v-if="tab === 'available' && list?.items.length" class="skill-viewport-learning-preview" aria-label="选中技能学习预览">
      <p v-if="inlineLoading" class="empty" role="status">正在读取技能…</p><p v-else-if="inlineError" class="error" role="alert">{{ inlineError }}</p>
      <template v-else-if="selectedSkill"><span><strong>{{ selectedSkill.name }}</strong><small>学习 {{ selectedSkill.learnCost }} SP · 学后 {{ selectedLearnAction?.quote?.skillPointsAfter ?? '—' }} SP</small></span><button type="button" :disabled="resolutionPending" @click="showDetail(selectedSkill.id)">详情</button><button class="primary-button" type="button" :disabled="resolutionPending || !selectedLearnAction?.enabled" @click="previewInline(selectedLearnAction)">预览</button></template>
    </aside>
      <ViewportPagination v-if="list" :page="skillViewportPage" :total-pages="skillViewportTotalPages" :total="list.total" :disabled="resolutionPending || listLoading" label="技能翻页" @update:page="skillViewportChangePage" />
    </div>
  </section>

  <Teleport to="body"><div v-if="detailOpen" class="skill-backdrop" role="presentation" @click.self="closeDetail"><section class="skill-dialog skill-journal anime-growth-commerce skill-book-dialog" role="dialog" aria-modal="true" aria-label="技能详情" @keydown.esc="closeDetail">
    <header class="dialog-header skill-detail-header">
      <span class="skill-art"><SkillIcon v-if="skill" :code="skill.code" :name="skill.name" :category="skill.category" :size="96" /><AnimeIcon v-else :name="configurationKind === 'passive_link' ? 'party' : 'sword'" :size="72" /></span>
      <div class="skill-detail-heading"><small>{{ configurationKind ? '技能配置' : '技能详情' }}</small><h2>{{ skill?.name ?? (configurationKind ? configurationTitle : '技能详情') }}</h2><p v-if="skill">{{ categoryName(skill.category) }} · {{ skill.tier }} · {{ skill.learned ? 'Lv.' + skill.level : '尚未学习' }}</p></div>
      <div v-if="headerConfigurationActions.length" class="skill-header-actions" aria-label="技能配置操作">
        <button v-for="action in headerConfigurationActions" :key="action.action" class="skill-header-action" type="button" :disabled="resolutionPending || !action.enabled" :title="actionNote(action)" @click="beginPreview(action)">{{ actionLabel(action) }}</button>
        <small v-for="action in headerConfigurationActions.filter(entry => !entry.enabled)" :key="action.action + ':reason'" class="skill-header-action-reason">{{ actionNote(action) }}</small>
      </div>
      <button ref="closeButton" class="skill-dialog-close" type="button" aria-label="关闭技能详情" :disabled="resolutionPending" @click="closeDetail"><img src="/assets/light-anime/skill-stationery-v1/handwritten-close-red.png" alt="" aria-hidden="true" /></button>
    </header>
    <div class="dialog-body"><p v-if="notice" class="notice" role="status">{{ notice }}</p><p v-if="detailError" class="error" role="alert">{{ detailError }}</p><p v-if="canRetryConfirmation" class="error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能离开或修改预览；网络持续不可用时请保持页面打开，稍后重试。</p><p v-if="detailLoading" class="empty" role="status">正在读取技能详情…</p>
      <section v-if="configurationPicking" class="configuration-picker" :aria-label="configurationTitle + '选择技能'">
        <p class="hint">{{ configurationKind === 'shortcut' ? '选择已学的主动技能；当前配置和空位由服务端校验。' : '选择已学的被动技能；已链接技能可在预览中解除链接。' }}先预览，确认后执行。</p>
        <form class="search-row" @submit.prevent="search"><AnimeIcon class="handbook-search-art" name="search" :size="19" /><input v-model="drafts[tab]" type="search" maxlength="80" placeholder="搜索已学技能" aria-label="搜索待配置技能" /><button type="submit" :disabled="resolutionPending || listLoading">搜索</button></form>
        <p v-if="listLoading" class="empty" role="status">正在整理技能…</p><p v-else-if="listError" class="error" role="alert">{{ listError }} <button type="button" @click="loadList">重试</button></p>
        <div v-else class="configuration-options"><button v-for="entry in configurationSkills" :key="entry.id" type="button" class="configuration-choice" :disabled="resolutionPending" @click="showDetail(entry.id, configurationKind)"><SkillIcon :code="entry.code" :name="entry.name" :category="entry.category" :size="56" /><span><strong>{{ entry.name }}</strong><small>{{ categoryName(entry.category) }} · Lv.{{ entry.level }}</small></span><small class="choice-state">{{ configurationKind === 'passive_link' ? (entry.passiveLinked ? '已链接' : '未链接') : (entry.quickSlot ? '快捷 ' + entry.quickSlot : '未配置') }}</small><b aria-hidden="true"><AnimeIcon name="arrow" :size="18" /></b></button><p v-if="!configurationSkills.length" class="empty">当前页没有{{ configurationKind === 'passive_link' ? '可链接的被动' : '可配置的主动' }}技能，可搜索名称或翻页查看。</p></div>
        <nav v-if="list" class="pager" aria-label="待配置技能翻页"><span class="skill-total">已学 {{ list.total }} 项</span><button type="button" :disabled="resolutionPending || listLoading || page <= 1" aria-label="上一页待配置技能" @click="changePage(page - 1)"><AnimeIcon class="handbook-arrow-back" name="arrow" :size="19" /></button><span class="page-count">{{ page }} / {{ list.totalPages }}</span><button type="button" :disabled="resolutionPending || listLoading || page >= list.totalPages" aria-label="下一页待配置技能" @click="changePage(page + 1)"><AnimeIcon name="arrow" :size="19" /></button></nav>
      </section>
      <template v-if="skill">
        <div v-if="configurationKind" class="configuration-context"><span>{{ configurationTitle }} · 已选择技能</span><button type="button" :disabled="resolutionPending" @click="openConfiguration(configurationKind)">更换技能</button></div>
        <section class="detail-section skill-summary" aria-label="技能简介"><h3>技能简介</h3><p class="skill-description">{{ skillSummary }}</p></section>
        <section class="detail-section skill-information" aria-label="技能信息">
          <h3>技能信息</h3>
          <div class="stat-grid skill-information-grid">
            <span>距离<strong>{{ rangeName(skill.rangeType) }}</strong></span><span>目标<strong>{{ targetName(skill.targetScope) }}</strong></span><span>武器<strong>{{ skill.requiredWeaponType || '无' }}</strong></span>
            <span>威力<strong>{{ skill.actualPower }}</strong></span><span>消耗<strong>{{ skill.actualManaCost }} MP</strong></span><span>冷却<strong>{{ skill.actualCooldown }} 回合</strong></span><span>吟唱<strong>{{ skill.actualChant === 0 ? '即时生效' : skill.actualChant + ' 回合' }}</strong></span>
          </div>
          <div v-if="skillGrowthActions.length" class="actions skill-growth-actions" aria-label="技能学习与升级">
            <div v-for="action in skillGrowthActions" :key="action.action" class="action-row" :class="{ unavailable: !action.enabled }"><div><strong>{{ actionLabel(action) }}</strong><small>{{ actionNote(action) }}</small></div><button type="button" :disabled="resolutionPending || !action.enabled" @click="beginPreview(action)">{{ actionLabel(action) }}预览</button></div>
          </div>
        </section>
        <section v-if="preview && (!automaticUpgrade || canRetryConfirmation)" ref="confirmationBox" class="confirm-box" aria-label="技能操作确认"><h3>{{ actionLabel(previewAction ?? { action: preview.quote.action, skillId: preview.quote.skillId }) }} · {{ canRetryConfirmation ? '核对结果' : '真实预览' }}</h3><p>{{ previewSummary(preview) }}</p><p class="preview-sp">技能点 <strong>{{ preview.quote.skillPointsBefore }} <span>→</span> {{ preview.quote.skillPointsAfter }} SP</strong></p><small>报价有效至 {{ dateText(preview.expiresAt) }}。确认时服务端会重新校验技能与技能点。</small><div class="confirm-actions"><button type="button" :disabled="resolutionPending" @click="preview = null; previewAction = null">继续查看</button><button class="primary-button" type="button" :disabled="pending || (quoteExpired && !canRetryConfirmation)" @click="confirm">{{ canRetryConfirmation ? '用原凭据核对结果' : '确认执行' }}</button></div><p v-if="quoteExpired" class="error">{{ canRetryConfirmation ? '预览已过期；原确认凭据仅能回读已完成结果。' : '预览已过期，请重新获取。' }}</p></section>
        <section class="detail-section effect-surface" aria-label="技能效果"><h3>技能效果</h3>
          <ol v-if="combatEffectRows.length" class="skill-combat-effects">
            <li v-for="(effect, index) in combatEffectRows" :key="index">
              <p>{{ effect.text }}</p>
              <p v-for="(description, descriptionIndex) in effect.descriptions" :key="descriptionIndex" class="skill-effect-description"><strong>[{{ description.name }}]：</strong>{{ description.text }}</p>
            </li>
          </ol><p v-else class="hint">此技能没有额外的战斗效果。</p>
        </section>
        <section class="detail-section skill-specialization-section" aria-label="技能专精"><h3>技能专精</h3>
          <div v-if="specializationRows.length" class="skill-specialization-list">
            <article v-for="entry in specializationRows" :key="entry.key" class="skill-specialization-row" :data-specialization-key="entry.key">
              <div class="skill-specialization-copy"><div class="skill-specialization-heading"><strong>{{ entry.name }}</strong><span class="skill-specialization-level">Lv.{{ entry.level }}{{ entry.maxLevel === null ? '' : '/' + entry.maxLevel }}</span><span v-if="entry.cost !== null" class="skill-specialization-cost">消耗 {{ entry.cost }} SP</span><span v-else class="skill-specialization-limit">{{ entry.maxLevel !== null && entry.level >= entry.maxLevel ? '已达上限 · 无消耗' : '暂无可用报价' }}</span></div><p class="skill-specialization-current"><b>当前效果</b>{{ entry.currentEffect }}</p><p class="skill-specialization-next"><b>下级效果</b>{{ entry.nextEffect ?? (entry.maxLevel !== null && entry.level >= entry.maxLevel ? '已达上限，无下级效果。' : '暂无下级效果。') }}</p><small v-if="specializationReason(entry)" class="skill-specialization-reason">{{ specializationReason(entry) }}</small></div>
              <button class="skill-specialization-upgrade" type="button" :aria-label="'提升专精·' + entry.name" :aria-busy="upgradingSpecializationKey === entry.key" :title="specializationReason(entry) || '提升' + entry.name" :disabled="resolutionPending || !specializationAction(entry)?.enabled" @click="upgradeSpecialization(entry)">{{ upgradingSpecializationKey === entry.key ? '…' : '+' }}</button>
            </article>
          </div><p v-else class="hint">此技能暂无可提升的专精方向。</p>
        </section>
      </template>
    </div></section></div></Teleport>
</template>

<style scoped>
.skill-panel.skill-journal.skill-journal { --gc-ink: #17243a; --gc-muted: #8a7765; --gc-paper: #fff6e3; --gc-line: #cbb087; --gc-teal: #168e98; min-width: 0; padding: 0 0 12px; border: 0; border-image: none; background: transparent; border-radius: 0; box-shadow: none; color: var(--gc-ink); font-family: "STKaiti", "KaiTi", "Noto Serif SC", serif; }
.skill-journal button { font: inherit; cursor: pointer; }
.skill-journal button:disabled { cursor: not-allowed; opacity: .5; }
.skill-journal button:focus-visible,.skill-journal input:focus-visible { outline: 3px solid #2ca6b3; outline-offset: 3px; }
.skill-journal .skill-tabs { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 0; margin: 0 10px -2px; padding: 0; align-items: end; position: relative; z-index: 1; }
.skill-journal .skill-tabs > button { min-width: 0; min-height: 49px; padding: 9px 4px 7px; border: 2px solid #c1a37b; border-bottom: 0; border-image: none; border-radius: 13px 14px 0 0; background: linear-gradient(125deg,#fff8e7,#efe0c3); color: #3a302b; box-shadow: inset 0 0 0 3px #fff5dc; font-size: clamp(15px,2.1vw,21px); font-weight: 800; transform: perspective(150px) rotateX(5deg); clip-path: polygon(8% 0,92% 0,100% 100%,0 100%); }
.skill-journal .skill-tabs > button.active { min-height: 55px; padding-top: 10px; border-image: none; background: radial-gradient(ellipse at 70% 30%,#36b7bd50,transparent 60%),linear-gradient(135deg,#168a98,#106975); color: #fff8e6; border-color: #1d7281; box-shadow: inset 0 0 0 2px #acf4ed,inset 0 0 0 4px #247e85; text-shadow: 0 2px #164a56; }
.skill-journal .journal-workspace,.skill-journal .inline-detail { position: relative; padding: 13px 14px 14px; border: 9px solid transparent; border-image: url('/assets/light-anime/skill-paper-frame.svg') 24 fill / 9px / 0 stretch; border-radius: 4px 9px 5px 7px; background: #fff6e3; background-clip: padding-box; box-shadow: 0 4px 0 #805d3926; }
.skill-journal .journal-workspace::after { content: ""; position: absolute; inset: 8px; pointer-events: none; border: 1px solid #d3b99455; border-radius: 6px 12px 8px 11px; }
.skill-journal .skill-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 9px; padding: 2px 2px 8px; min-height: 39px; border: 0; background: transparent; }
.skill-journal .skill-top h2 { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 17px; letter-spacing: .05em; }
.skill-journal .points { display: flex; gap: 7px; align-items: center; padding: 0; background: transparent; border: 0; border-radius: 0; color: #18253b; font-size: 15px; font-weight: 700; white-space: nowrap; }
.skill-journal .points strong { color: #0b8dca; font: 700 23px Georgia,serif; }
.skill-journal .points small { color: #15748f; font-size: 15px; }
.skill-journal .search-row { display: flex; gap: 7px; margin: 0 0 12px; }
.skill-journal .search-row input { flex: 1; min-width: 0; min-height: 40px; padding: 7px 8px 7px 36px; border: 1px solid #a69b8b; border-radius: 8px; font-size: 15px; background-color: #fffdf6; box-shadow: inset 0 1px 2px #b1a69620; }
.skill-journal .search-row > button { min-height: 40px; padding: 6px 10px; font-size: 13px; border: 2px solid #a6b0a4; border-image: none; border-radius: 7px; color: #2a5260; background: #edf0df; box-shadow: inset 0 0 0 1px #fffdf2; }
.skill-journal .skill-list { display: grid; grid-template-columns: minmax(0,1fr); gap: 11px; min-width: 0; }
.skill-journal .skill-card { display: flex; position: relative; align-items: center; gap: 11px; min-width: 0; min-height: 105px; padding: 8px 9px; color: #17243a; text-align: left; border: 7px solid transparent; border-image: url('/assets/light-anime/skill-paper-frame.svg') 24 fill / 7px / 0 stretch; border-radius: 3px 8px 4px 6px; background: #fff7e8; background-clip: padding-box; box-shadow: 0 2px 0 #986d3d22; }

.skill-journal .skill-card.selected { border: 2px solid #4dbcd3; border-image: none; padding: 13px 14px; background: linear-gradient(130deg,#eaf8ff,#f6fcfb); border-radius: 7px; box-shadow: inset 0 0 0 2px #fff,0 0 0 1px #b7dede; }
.skill-journal .skill-art { display: block; flex: 0 0 72px; width: 72px; height: 72px; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.skill-journal [data-category] .skill-art { background: transparent; border: 0; }
.skill-journal .skill-art :deep(.skill-icon) { width: 100%; height: 100%; }
.skill-journal .skill-copy { display: flex; flex-direction: column; justify-content: center; flex: 1; gap: 7px; min-width: 0; overflow-wrap: anywhere; }
.skill-journal .skill-copy strong { color: #17243a; font-size: clamp(17px,2.3vw,23px); font-weight: 800; letter-spacing: .04em; line-height: 1.25; }
.skill-journal .skill-classification { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.skill-journal .skill-classification > small { font-size: 12px; }
.skill-journal .category-tag { display: inline-block; padding: 3px 9px; border: 1px solid #b9956b; border-radius: 12px; color: #fff9e3; background: #ab8466; font-size: 12px; line-height: 1.1; font-weight: 700; }
.skill-journal .category-tag[data-category="magic"] { border-color: #ce8e82; color: #fff7ed; background: #d98279; }
.skill-journal .category-tag[data-category="utility"] { border-color: #69a583; color: #fffbe7; background: #63a680; }
.skill-journal .category-tag[data-category="passive"],.skill-journal .category-tag[data-category="bound"] { border-color: #b29753; color: #fffbed; background: #b79b52; }
.skill-journal .level-tag { padding: 2px 11px; background: #f7eacf; border: 1px solid #dcc49c; border-radius: 12px; color: #17243a; font: 700 14px Georgia,serif; }
.skill-journal .row-description { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: #8b7765; font-size: 12px; line-height: 1.55; }
.skill-journal .skill-badge { position: absolute; top: 9px; right: 21px; padding: 4px 7px; color: #fff; background: linear-gradient(#65b9db,#247aa4); border: 1px solid #428db1; border-radius: 7px; box-shadow: inset 0 0 0 1px #b5e6e8; font-size: 11px; }
.skill-journal .linked-badge { background: linear-gradient(#64bda7,#268b75); border-color: #3c9d86; }
.skill-journal .skill-card:has(> .skill-badge) .skill-copy { padding-top: 5px; }
.skill-journal .arrow { flex: 0 0 auto; align-self: center; color: #88715a; font: 700 28px Georgia,serif; }
.skill-journal .pager { display: flex; justify-content: flex-end; align-items: center; gap: 9px; margin: 13px 0 0; padding: 8px 3px 0; border-top: 1px solid #d5bd9655; }
.skill-journal .pager button { width: 33px; height: 33px; min-height: 33px; padding: 0; border: 1px solid #b9a383; border-radius: 7px; background: linear-gradient(#fffaf0,#eadcc5); box-shadow: inset 0 0 0 1px #fff; color: #8a745c; font: 700 28px Georgia,serif; }
.skill-journal .page-count { padding: 4px 12px; border: 1px solid #d6bea0; border-radius: 12px; background: #eadac1; color: #18263b; font: 15px Georgia,serif; }
.skill-journal .skill-total { flex: 1; color: #293347; font-size: 13px; }
.skill-journal .skill-total strong { font-size: 18px; }
.skill-journal .notice,.skill-journal .error { margin: 8px 0; padding: 9px 10px; border: 1px solid #b9ccaa; border-radius: 6px; background: #eff5df; color: #49644f; font-size: 12px; line-height: 1.55; }
.skill-journal .error { color: #a04a41; border-color: #e6b8a8; background: #fff0e5; }
.skill-journal .empty { margin: 0; padding: 30px 8px; text-align: center; color: #877563; font-size: 13px; }
.skill-journal .hint { margin: 8px 0; color: #8a7765; font-size: 12px; line-height: 1.7; }
.skill-journal.journal-available .skill-top { justify-content: space-between; }
.skill-journal.journal-available .skill-top h2 { font-size: 15px; }
.skill-journal .learnable-list { gap: 0; max-height: 445px; overflow-y: auto; overscroll-behavior: contain; }
.skill-journal .learnable-list .skill-card { min-height: 100px; padding: 10px 8px; border: 0; border-image: none; border-bottom: 1px solid #cfb18e; background: transparent; border-radius: 0; box-shadow: none; gap: 10px; }
.skill-journal .learnable-list .skill-card.selected { border: 2px solid #46b6d0; border-image: none; border-radius: 7px; padding: 8px 6px; background: #eef9fb; box-shadow: inset 0 0 0 1px #fff; }
.skill-journal .learnable-list .skill-art { flex-basis: 61px; width: 61px; height: 61px; }
.skill-journal .learnable-list .skill-copy strong { font-size: 17px; }
.skill-journal .learning-cost { display: grid; gap: 4px; flex: 0 0 39%; min-width: 0; padding-left: 10px; border-left: 1px solid #cbbfa7; }
.skill-journal .learning-cost strong { font-size: 13px; }
.skill-journal .learning-cost b { color: #0783c8; font: 700 17px Georgia,serif; }
.skill-journal .learning-cost .available { color: #39824c; font-size: 13px; font-weight: 700; }
.skill-journal .learning-cost .blocked { color: #88716a; font-size: 12px; }
.skill-journal .learning-cost small { color: #95816d; font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
.skill-journal .learnable-list .unavailable { filter: saturate(.55); }
.skill-journal .learnable-preview { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; margin-top: 10px; padding: 14px; }
.skill-journal .inline-heading { display: flex; align-items: center; gap: 10px; min-width: 0; }
.skill-journal .inline-heading > div { min-width: 0; flex: 1; }
.skill-journal .inline-heading h3 { margin: 0 0 7px; color: #17243a; font-size: 20px; }
.skill-journal .inline-heading :deep(.skill-icon) { max-width: 37%; height: auto; }
.skill-journal .selected-description { color: #6f5c49; font-size: 13px; line-height: 1.7; margin: 12px 0; white-space: pre-wrap; }
.skill-journal h4 { display: flex; gap: 7px; align-items: center; margin: 10px 0 8px; padding: 5px 8px; font-size: 16px; color: #362b24; background: linear-gradient(90deg,#efd5a0aa,#efd5a025); border-radius: 5px; }
.skill-journal .learnable-action { display: flex; flex-direction: column; justify-content: center; gap: 12px; padding-left: 14px; border-left: 1px solid #d2b88d80; }
.skill-journal .learnable-action dl { margin: 0; border: 1px solid #cba57a; padding: 8px 10px; background: #fff3da; border-radius: 7px; }
.skill-journal .learnable-action dl > div + div { border-top: 1px solid #d0b68d; margin-top: 8px; padding-top: 8px; }
.skill-journal .learnable-action dt { font-size: 13px; color: #4e3d2e; }
.skill-journal .learnable-action dd { margin: 4px 0 0; color: #0a83c5; font: 700 21px Georgia,serif; }
.skill-journal .learnable-action dd small { font-size: 13px; }
.skill-journal .learnable-action > small { font-size: 10px; color: #8b745f; line-height: 1.5; text-align: center; }
.skill-journal.skill-journal .primary-button { min-height: 44px; border: 7px solid transparent; border-image: url('/assets/light-anime/skill-button-teal.svg') 18 fill / 7px / 0 stretch; border-radius: 6px; color: #fff9e8; background: #168e98; background-clip: padding-box; font-size: 17px; font-weight: 800; box-shadow: 0 3px 0 #2c615b26; }
.skill-journal .config-summary { display: flex; flex-direction: column; gap: 0; margin: 0 0 14px; }
.skill-journal .config-summary > div { min-width: 0; padding: 8px 0 12px; border: 0; border-image: none; border-radius: 0; background: transparent; box-shadow: none; }
.skill-journal .config-summary > div + div { border-top: 1px solid #d4bd96; padding-top: 13px; }
.skill-journal .config-summary h3 { display: flex; align-items: center; gap: 7px; margin: 0 0 10px; font-size: 18px; color: #17243a; }
.skill-journal .config-summary h3 small { font-size: 11px; font-weight: 400; color: #8b7766; }
.skill-journal .config-summary h3 > span { font: 16px Georgia,serif; }
.skill-journal .configuration-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.skill-journal .configuration-heading h3 { flex: 1; min-width: 0; margin: 0; flex-wrap: wrap; }
.skill-journal.skill-journal .configuration-entry { flex: 0 0 auto; min-height: 40px; padding: 3px 10px; border-width: 5px; border-image-width: 5px; font-size: 15px; white-space: nowrap; }
.skill-journal .configuration-picker > .hint { margin-top: 0; }
.skill-journal .journal-workspace,.skill-journal .inline-detail,.skill-journal .skill-card,.skill-dialog.skill-journal.skill-journal { background-image: url('/assets/light-anime/skill-paper-grain.svg'); background-size: 96px 96px; background-repeat: repeat; }
.skill-journal .configuration-options { display: grid; gap: 8px; }
.skill-journal .configuration-choice { display: flex; align-items: center; gap: 10px; min-width: 0; min-height: 76px; padding: 8px 10px; text-align: left; color: #17243a; border: 1px solid #cbb087; border-radius: 7px; background: linear-gradient(120deg,#fffaed,#f7ecd6); box-shadow: inset 0 0 0 1px #fffdf4; }
.skill-journal .configuration-choice > :deep(.skill-icon) { flex: 0 0 56px; }
.skill-journal .configuration-choice > span { display: grid; flex: 1; min-width: 0; gap: 5px; }
.skill-journal .configuration-choice strong { overflow-wrap: anywhere; font-size: 18px; }
.skill-journal .configuration-choice small { font-size: 12px; color: #8a7159; }
.skill-journal .configuration-choice .choice-state { flex: 0 0 auto; padding: 4px 7px; border: 1px solid #b7ceb7; border-radius: 6px; background: #e9f4e6; color: #46836d; }
.skill-journal .configuration-choice > b { color: #8b7158; font: 25px Georgia,serif; }
.skill-journal .configuration-context { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #d5bd96; color: #8b7358; font-size: 12px; }
.skill-journal .configuration-context > button { flex: 0 0 auto; min-height: 35px; padding: 5px 10px; border: 1px solid #bfa67e; border-radius: 5px; color: #426a68; background: #f7f1dd; }
.skill-journal .slot-row { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 7px; }
.skill-journal .slot-row button { display: flex; flex-direction: column; align-items: center; position: relative; gap: 8px; min-width: 0; padding: 9px 3px 7px; min-height: 111px; border: 1px solid #d0ae7f; border-image: none; border-radius: 6px; color: #17243a; background: linear-gradient(#fff9e8,#f4e6c9); box-shadow: inset 0 0 0 1px #fff8e7; }
.skill-journal .slot-row button:disabled { opacity: 1; filter: none; }
.skill-journal .slot-row strong { font-size: 12px; line-height: 1.3; text-align: center; overflow-wrap: anywhere; }
.skill-journal .slot-number { position: absolute; top: 0; left: 2px; z-index: 1; min-width: 21px; padding: 1px 4px; border: 1px solid #a78e71; border-radius: 4px; color: #fff9e6; background: #8b725a; box-shadow: inset 0 0 0 1px #f3dfbc; font: 700 17px Georgia,serif; }
.skill-journal .empty-shortcut { display: grid; place-items: center; width: 64px; height: 64px; max-width: 100%; border: 2px solid #bcb1a2; border-radius: 9px; color: #f3f0e9; background: linear-gradient(135deg,#c2bcb5,#a39f99); box-shadow: inset 0 0 0 2px #e9e0cd; font: 38px Georgia,serif; }
.skill-journal .linked-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.skill-journal .linked-row > button { display: flex; align-items: center; gap: 9px; flex: 1 1 210px; padding: 5px 8px; min-height: 62px; border: 1px solid #d2b58e; border-radius: 6px; background: #fff5df; }
.skill-journal .linked-row strong { flex: 1; font-size: 14px; }
.skill-journal .linked-row > button > span { font-size: 10px; color: #2d927d; }
.skill-journal .config-guidance { display: flex; align-items: center; gap: 8px; color: #96816b; font-size: 12px; }
.skill-journal .config-columns { display: grid; grid-template-columns: 43% minmax(0,1fr); gap: 9px; }
.skill-journal .config-list { align-content: start; gap: 6px; padding: 7px; border: 1px solid #ccb38d; border-radius: 6px; background: #fff3da; max-height: 580px; overflow-y: auto; }
.skill-journal .list-caption { display: flex; align-items: center; gap: 6px; margin: 1px 0 5px; font-size: 17px; }
.skill-journal .config-list .skill-card { min-height: 66px; gap: 6px; padding: 6px; border: 1px solid #d9c3a0; border-image: none; border-radius: 6px; box-shadow: none; }
.skill-journal .config-list .skill-card.selected { border: 2px solid #d8ae42; padding: 5px; background: #fff1b9; box-shadow: inset 0 0 0 1px #fffbdb,0 0 0 1px #ead16c; }
.skill-journal .config-list .skill-art { flex-basis: 41px; width: 41px; height: 41px; }
.skill-journal .config-list .skill-copy { gap: 4px; }
.skill-journal .config-list .skill-copy strong { font-size: 14px; }
.skill-journal .config-list .skill-classification .category-tag { display: none; }
.skill-journal .config-list .level-tag { padding: 0; border: 0; background: transparent; font-size: 12px; }
.skill-journal .config-list .row-description,.skill-journal .config-list .skill-badge { display: none; }
.skill-journal .config-list .arrow { font-size: 22px; }
.skill-journal .specialization-surface { padding: 9px; border: 1px solid #cfb58b; border-image: none; border-radius: 6px; background: #fff7e6; box-shadow: none; }
.skill-journal .specialization-surface .inline-heading { gap: 7px; flex-wrap: wrap; }
.skill-journal .specialization-surface .inline-heading h3 { font-size: 17px; }
.skill-journal .specialization-surface .inline-heading small { font-size: 12px; color: #705b45; }
.skill-journal .specialization-surface .selected-description { font-size: 12px; line-height: 1.55; }
.skill-journal .specialization-surface h4 { margin: 9px 0; padding: 4px; font-size: 16px; }
.skill-journal .specialization-options { display: grid; gap: 6px; }
.skill-journal .specialization-option { display: flex; align-items: center; gap: 6px; padding: 7px 5px; min-width: 0; border: 1px solid #cbb38b; border-radius: 6px; background: #fff5df; }
.skill-journal .specialization-option > .anime-icon { flex: 0 0 27px; width: 27px; }
.skill-journal .specialization-option > div { display: grid; gap: 4px; flex: 1; min-width: 0; }
.skill-journal .specialization-option strong { font-size: 13px; }
.skill-journal .specialization-option small { font-size: 10px; color: #88705b; line-height: 1.4; }
.skill-journal .specialization-option button { width: 33px; height: 35px; min-height: 35px; padding: 0; flex: 0 0 33px; border: 1px solid #2f818e; border-radius: 5px; color: #f5ffea; background: linear-gradient(#4baab2,#167583); box-shadow: inset 0 0 0 1px #b3e5df; font-size: 24px; }
.skill-journal .inline-primary { margin-top: 12px; width: 100%; font-size: 13px; }
.skill-backdrop { position: fixed; z-index: 96; inset: 0; display: grid; place-items: center; padding: max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left)); background: #292b36a8; backdrop-filter: blur(2px); }
.skill-dialog.skill-journal.skill-journal { display: flex; flex-direction: column; width: min(740px,100%); max-height: 90dvh; min-height: 0; overflow: hidden; color: #17243a; border: 10px solid transparent; border-image: url('/assets/light-anime/skill-paper-frame.svg') 24 fill / 10px / 0 stretch; border-radius: 6px; background: #fff6e4; box-shadow: 0 18px 55px #27223666; font-family: "STKaiti","KaiTi","Noto Serif SC",serif; }
.skill-journal .dialog-header { display: flex; align-items: center; position: relative; gap: 15px; flex: 0 0 auto; padding: 17px 20px 12px; border: 0; background: transparent; }
.skill-journal .dialog-header .skill-art { flex: 0 0 96px; width: 96px; height: 96px; border: 0; background: transparent; box-shadow: none; }
.skill-journal .dialog-header > div { flex: 1; min-width: 0; }
.skill-journal .dialog-header small { font-size: 11px; color: #96816a; letter-spacing: .12em; }
.skill-journal .dialog-header h2 { margin: 4px 0 10px; color: #14223a; font-size: clamp(24px,4vw,33px); overflow-wrap: anywhere; }
.skill-journal .dialog-header p { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; font-size: 13px; }
.skill-journal .detail-mana { display: inline-flex; gap: 4px; align-items: center; }
.skill-journal .dialog-header > .skill-dialog-close { position: absolute; top: 0; right: 0; width: 44px; height: 44px; min-height: 44px; padding: 6px; border: 0; border-image: none; border-radius: 0; background: transparent; box-shadow: none; }
.skill-journal .dialog-body { overflow-y: auto; min-height: 0; padding: 7px 20px max(18px,env(safe-area-inset-bottom)); overscroll-behavior: contain; }
.skill-journal .skill-description { margin: 0 0 14px; color: #705d4a; font-size: 14px; line-height: 1.65; white-space: pre-wrap; }
.skill-journal .detail-section { margin: 14px 0 0; }
.skill-journal .detail-section h3 { display: inline-flex; align-items: center; min-width: 110px; margin: 0 0 8px; padding: 5px 13px; border: 1px solid #bb9b70; border-radius: 5px; background: linear-gradient(#fff1d4,#e9d0a5); color: #30251f; font-size: 17px; letter-spacing: .09em; }
.skill-journal .effect-overview { display: flex; gap: 15px; align-items: center; padding: 9px 10px; border: 1px solid #dbc29d; border-radius: 7px; background: #fff2d8; }
.skill-journal .effect-overview > div { display: grid; flex: 1; gap: 7px; min-width: 0; }
.skill-journal .effect-overview p { display: grid; grid-template-columns: 24px 1fr; gap: 3px 8px; align-items: center; margin: 0; padding: 6px 8px; border: 1px solid #e0ccad; background: #fff9ec; border-radius: 5px; }
.skill-journal .effect-overview p :is(.anime-icon,.skill-effect-icon) { grid-row: span 2; }
.skill-journal .effect-overview strong { font-size: 14px; }
.skill-journal .effect-overview span { font-size: 11px; color: #8a7560; }
.skill-journal .effect-list { display: grid; gap: 5px; margin-top: 7px; }
.skill-journal .effect-list p { display: flex; gap: 8px; align-items: center; justify-content: space-between; margin: 0; padding: 8px 10px; border: 1px solid #d8bf97; border-radius: 5px; background: #fff6e1; font-size: 12px; }
.skill-journal .effect-list span { color: #8a725c; text-align: right; }
.skill-journal .skill-parameters { margin: 12px 0 0; color: #7b654d; font-size: 12px; }
.skill-journal .skill-parameters summary { padding: 7px 0; cursor: pointer; }
.skill-journal .stat-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; }
.skill-journal .stat-grid > span { display: grid; gap: 4px; padding: 8px; border: 1px solid #d3bc97; background: #f7ebd1; border-radius: 5px; color: #92795e; font-size: 11px; }
.skill-journal .stat-grid strong { color: #263149; font-size: 12px; }
.skill-journal .specialization-list { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 6px; }
.skill-journal .specialization-list > span { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px; border: 1px solid #cfb48e; border-radius: 6px; background: #fff5df; font-size: 12px; }
.skill-journal .specialization-list strong { display: grid; gap: 4px; }
.skill-journal .specialization-list small { color: #8c755d; font-size: 10px; }
.skill-journal .actions { display: grid; gap: 6px; }
.skill-journal .action-row { display: flex; align-items: center; gap: 9px; padding: 10px; border: 1px solid #cdb38c; border-radius: 6px; background: #fff8e8; }
.skill-journal .action-row > div { display: grid; gap: 4px; flex: 1; min-width: 0; }
.skill-journal .action-row strong { color: #192740; font-size: 14px; }
.skill-journal .action-row small { color: #8c765f; font-size: 11px; line-height: 1.5; }
.skill-journal .action-row button { flex: 0 0 auto; min-height: 36px; padding: 5px 10px; border: 1px solid #c4a071; border-radius: 6px; background: #ffedc9; color: #48321e; font-size: 13px; }
.skill-journal .action-row button span { margin-left: 5px; color: #8b6845; }
.skill-journal .action-row.unavailable { background: #f1e9da; opacity: .75; }
.skill-journal .disabled-text { font-size: 11px; color: #967c66; }
.skill-journal .confirm-box { margin: 15px 0 0; padding: 12px; border: 2px solid #36bdc5; border-radius: 7px; background: linear-gradient(#d7f6ed,#f6fff5); box-shadow: inset 0 0 0 2px #fffbea,0 0 0 2px #d0f5df; }
.skill-journal .confirm-box h3 { margin: -10px -10px 10px; padding: 8px 10px; color: #16364c; background: #8ce2da55; font-size: 17px; letter-spacing: .03em; }
.skill-journal .confirm-box p { margin: 7px 0; color: #30423d; font-size: 13px; line-height: 1.55; }
.skill-journal .confirm-box small { color: #7a8b76; font-size: 10px; line-height: 1.5; }
.skill-journal .preview-sp strong { font: 700 18px Georgia,serif; color: #198ea1; }
.skill-journal .preview-sp strong span { padding: 0 7px; color: #8a7860; }
.skill-journal .confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.skill-journal .confirm-actions > button { min-height: 43px; padding: 7px 10px; border: 1px solid #bc9d76; border-radius: 6px; background: #fff0d6; font-size: 14px; }
.skill-journal .confirm-actions > .primary-button { color: #fff9e8; background: #168e98; border: 6px solid transparent; border-image: url('/assets/light-anime/skill-button-teal.svg') 18 fill / 6px / 0 stretch; padding: 4px 8px; }
@media (min-width: 760px) {
  .skill-journal .skill-card { min-height: 128px; padding: 15px 17px; gap: 18px; }
  .skill-journal .skill-art { flex-basis: 88px; width: 88px; height: 88px; }
  .skill-journal .row-description { font-size: 15px; }
  .skill-journal .skill-badge { top: 14px; right: 30px; font-size: 14px; padding: 5px 10px; }
  .skill-journal .learnable-list .skill-card { min-height: 122px; }
  .skill-journal .learnable-list .skill-art { flex-basis: 86px; width: 86px; height: 86px; }
  .skill-journal .learning-cost strong { font-size: 16px; }
  .skill-journal .learning-cost b { font-size: 22px; }
  .skill-journal .learning-cost small { font-size: 13px; }
  .skill-journal .config-list .skill-card { min-height: 82px; padding: 8px; }
  .skill-journal .config-list .skill-art { flex-basis: 56px; width: 56px; height: 56px; }
  .skill-journal .config-list .skill-copy strong { font-size: 18px; }
  .skill-journal .specialization-surface { padding: 15px; }
  .skill-journal .specialization-option { min-height: 73px; }
  .skill-journal .specialization-option strong { font-size: 17px; }
  .skill-journal .specialization-option small { font-size: 12px; }
}
@media (max-width: 420px) {
  .skill-journal .journal-workspace { padding: 8px; border-width: 7px; border-image-width: 7px; }
  .skill-journal .skill-card { min-height: 100px; padding: 7px 6px; gap: 8px; border-width: 5px; border-image-width: 5px; }
  .skill-journal .skill-art { flex-basis: 62px; width: 62px; height: 62px; }
  .skill-journal .skill-copy strong { font-size: 17px; }
  .skill-journal .skill-badge { font-size: 9px; padding: 3px 5px; top: 6px; right: 14px; }
  .skill-journal .skill-card:has(> .skill-badge) .skill-copy { padding-top: 10px; }
  .skill-journal .row-description { font-size: 11px; }
  .skill-journal .skill-top h2 { font-size: 15px; }
  .skill-journal .points { font-size: 13px; }
  .skill-journal .points strong { font-size: 20px; }
  .skill-journal .learnable-list .skill-art { flex-basis: 54px; width: 54px; height: 54px; }
  .skill-journal .learnable-list .skill-copy strong { font-size: 15px; }
  .skill-journal .learning-cost { flex-basis: 38%; padding-left: 7px; }
  .skill-journal .learning-cost b { font-size: 15px; }
  .skill-journal .learning-cost small { font-size: 9px; }
  .skill-journal .learnable-preview { padding: 9px; gap: 9px; grid-template-columns: 1.3fr 1fr; }
  .skill-journal .learnable-action { padding-left: 9px; }
  .skill-journal .inline-heading h3 { font-size: 17px; }
  .skill-journal .selected-description { font-size: 12px; line-height: 1.55; }
  .skill-journal .learnable-action dl { padding: 7px; }
  .skill-journal .learnable-action dd { font-size: 18px; }
  .skill-journal .config-summary h3 { font-size: 16px; flex-wrap: wrap; }
  .skill-journal .config-summary h3 small { font-size: 10px; }
  .skill-journal .configuration-heading { gap: 6px; }
  .skill-journal .configuration-heading h3 { gap: 4px; }
  .skill-journal .configuration-heading h3 small { flex-basis: 100%; line-height: 1.5; }
  .skill-journal.skill-journal .configuration-entry { padding: 3px 6px; font-size: 12px; }
  .skill-journal .configuration-choice { gap: 7px; padding: 7px; }
  .skill-journal .configuration-choice strong { font-size: 16px; }
  .skill-journal .configuration-choice > :deep(.skill-icon) { width: 48px; height: 48px; flex-basis: 48px; }
  .skill-journal .configuration-choice .choice-state { padding: 4px; font-size: 10px; }
  .skill-journal .slot-row { gap: 5px; }
  .skill-journal .slot-row :deep(.skill-icon) { width: 52px; height: 52px; }
  .skill-journal .empty-shortcut { width: 52px; height: 52px; }
  .skill-journal .slot-row button { min-height: 100px; }
  .skill-journal .slot-row strong { font-size: 10px; }
  .skill-journal .config-columns { grid-template-columns: 42% minmax(0,1fr); gap: 6px; }
  .skill-journal .config-list { padding: 5px; }
  .skill-journal .config-list .skill-card { padding: 5px 4px; gap: 5px; }
  .skill-journal .config-list .skill-art { flex-basis: 32px; width: 32px; height: 32px; }
  .skill-journal .config-list .skill-copy strong { font-size: 12px; }
  .skill-journal .config-list .arrow { display: none; }
  .skill-journal .specialization-surface { padding: 7px; }
  .skill-journal .specialization-surface .inline-heading h3 { font-size: 15px; }
  .skill-journal .specialization-surface .inline-heading :deep(.skill-icon) { width: 43px; height: 43px; }
  .skill-journal .specialization-option { gap: 4px; padding: 6px 4px; }
  .skill-journal .specialization-option > .anime-icon { width: 22px; flex-basis: 22px; }
  .skill-journal .specialization-option strong { font-size: 12px; }
  .skill-journal .specialization-option button { width: 28px; flex-basis: 28px; font-size: 22px; }
  .skill-journal .specialization-option small { font-size: 9px; }
  .skill-journal .dialog-header { padding: 14px 10px 9px; gap: 10px; }
  .skill-journal .dialog-header .skill-art { flex-basis: 78px; width: 78px; height: 78px; }
  .skill-journal .dialog-header h2 { font-size: 24px; }
  .skill-journal .dialog-header p { font-size: 11px; }
  .skill-journal .dialog-body { padding: 7px 10px 15px; }
  .skill-journal .effect-overview { gap: 7px; padding: 7px; }
  .skill-journal .effect-overview > :deep(.skill-icon) { width: 60px; height: 60px; }
  .skill-journal .effect-overview p { padding: 5px; }
  .skill-journal .effect-overview strong { font-size: 12px; }
  .skill-journal .specialization-list { gap: 4px; }
  .skill-journal .specialization-list > span { padding: 6px 4px; }
  .skill-journal .specialization-list :deep(.anime-icon) { width: 21px; height: 21px; }
  .skill-journal .specialization-list strong { font-size: 11px; }
  .skill-journal .action-row { padding: 8px 6px; gap: 6px; }
  .skill-journal .action-row strong { font-size: 12px; }
  .skill-journal .action-row small { font-size: 10px; }
}
@media (max-width: 350px) {
  .skill-journal .skill-top h2 { display: none; }
  .skill-journal .skill-top { justify-content: flex-end; }
  .skill-journal .skill-tabs { margin-inline: 4px; }
  .skill-journal .skill-tabs > button { font-size: 14px; }
  .skill-journal .learning-cost { flex-basis: 35%; }
  .skill-journal .learning-cost > strong { font-size: 11px; }
  .skill-journal .learning-cost b { display: block; }
  .skill-journal .learnable-preview { grid-template-columns: minmax(0,1fr); }
  .skill-journal .learnable-action { padding-left: 0; border-left: 0; display: grid; grid-template-columns: 1fr 1fr; align-items: center; }
  .skill-journal .learnable-action > small { grid-column: span 2; }
  .skill-journal .skill-card:has(> .skill-badge) .skill-copy strong { font-size: 15px; }
  .skill-journal .stat-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .skill-journal .specialization-list { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .skill-journal .config-columns { grid-template-columns: 39% minmax(0,1fr); }
  .skill-journal .config-list .skill-card { flex-wrap: wrap; gap: 4px; }
  .skill-journal .config-list .skill-copy { flex-basis: 100%; }
}
/* Only the main journal is fixed to the page. Existing detail/confirmation
   dialogs retain their own full-text reading area. */
.skill-panel.skill-journal.skill-journal{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:0;gap:0}
.skill-panel.skill-journal .skill-tabs{flex:none;margin:0 6px -2px}
.skill-panel.skill-journal .skill-tabs>button,.skill-panel.skill-journal .skill-tabs>button.active{min-height:36px;height:36px;padding:4px;font-size:14px}
.skill-panel.skill-journal .journal-workspace{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;padding:7px;border-width:6px;border-image-width:6px;gap:6px}
.skill-panel.skill-journal .skill-top{flex:none;min-height:25px;margin:0;padding:0}.skill-panel.skill-journal .skill-top h2{font-size:16px}.skill-panel.skill-journal .points{font-size:12px}.skill-panel.skill-journal .points strong{font-size:16px}
.skill-panel.skill-journal .search-row{flex:none;margin:0;min-height:32px}.skill-panel.skill-journal .search-row input,.skill-panel.skill-journal .search-row button{min-height:32px;height:32px;padding:4px 8px;font-size:12px}
.skill-panel.skill-journal .skill-content,.skill-panel.skill-journal .skill-content.config-columns{display:flex;flex:1;min-height:0;overflow:hidden;margin:0;gap:0}
.skill-panel.skill-journal .skill-list,.skill-panel.skill-journal .skill-list.config-list{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:64px;align-content:start;flex:1;min-height:0;overflow:hidden;gap:6px;margin:0}
.skill-panel.skill-journal .skill-list .skill-card{display:flex;flex-wrap:nowrap;box-sizing:border-box;height:64px;min-height:64px;max-height:64px;min-width:0;padding:4px 7px;gap:7px;border-width:4px;border-image-width:4px}
.skill-panel.skill-journal .skill-list .skill-art{flex:0 0 42px;width:42px;height:42px}.skill-panel.skill-journal .skill-list .skill-copy{display:grid;flex:1 1 0;min-width:0;flex-basis:0;gap:2px}.skill-panel.skill-journal .skill-list .skill-copy strong,.skill-panel.skill-journal .skill-list .skill-card:has(>.skill-badge) .skill-copy strong{font-size:14px;line-height:1.2;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.skill-panel.skill-journal .skill-list .row-description{display:block;max-height:14px;line-height:14px;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.skill-panel.skill-journal .skill-classification{gap:3px}.skill-panel.skill-journal .category-tag,.skill-panel.skill-journal .level-tag{font-size:10px;padding:0 4px}
.skill-panel.skill-journal .skill-list .learning-cost{flex:0 0 85px;min-width:0;font-size:10px;gap:1px}.skill-panel.skill-journal .skill-list .learning-cost strong{font-size:11px}.skill-panel.skill-journal .skill-list .learning-cost small{display:none}.skill-panel.skill-journal .skill-list .learning-cost b{display:inline}.skill-panel.skill-journal .skill-list .skill-badge{font-size:9px;padding:3px}.skill-panel.skill-journal .skill-list .arrow{font-size:18px}
.skill-viewport-config-actions{display:flex;flex:none;gap:5px}.skill-viewport-config-actions button{flex:1;min-width:0;min-height:30px;padding:4px;border:1px solid #c8b38e;background:#fff1d5;color:#6f563b;font-size:11px}
.skill-viewport-learning-preview{display:flex;align-items:center;flex:none;gap:6px;min-height:46px;max-height:56px;padding:5px 10px;box-sizing:border-box;border:1px solid #c9b08b;background:#fff6e4;color:#5b4933}.skill-viewport-learning-preview>span{min-width:0;flex:1;display:grid;gap:2px}.skill-viewport-learning-preview strong{font-size:13px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.skill-viewport-learning-preview small{font-size:10px}.skill-viewport-learning-preview button{flex:none;min-height:32px;padding:4px 9px;font-size:12px}.skill-viewport-learning-preview>.empty,.skill-viewport-learning-preview>.error{padding:0;margin:0;font-size:11px}
.skill-panel.skill-journal>.journal-workspace>.notice,.skill-panel.skill-journal>.journal-workspace>.error{flex:none;margin:0;padding:4px 7px;font-size:11px;max-height:50px;overflow:auto}
@media(max-height:480px){.skill-panel.skill-journal .skill-tabs>button,.skill-panel.skill-journal .skill-tabs>button.active{height:29px;min-height:29px;font-size:12px}.skill-panel.skill-journal .journal-workspace{gap:4px;padding:4px;border-width:4px;border-image-width:4px}.skill-panel.skill-journal .skill-top{display:none}.skill-viewport-learning-preview{min-height:38px;max-height:42px;padding:3px 6px}.skill-viewport-config-actions button{min-height:27px}.skill-panel.skill-journal .search-row input,.skill-panel.skill-journal .search-row button{min-height:28px;height:28px}}
</style>

<style scoped src="../skill-book.css"></style>
