<script setup lang="ts">
import '../anime-growth-commerce.css';
import '../game-ui-skills.css';
import '../profession-panel-art.css';
import AnimeIcon from './AnimeIcon.vue';
import TabArtIcon from './TabArtIcon.vue';
import ProfessionIcon from './ProfessionIcon.vue';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import { computed, nextTick, ref, watch } from 'vue';
import { panel as loadCurrentPanel, userFacingErrorMessage } from '../api';
import * as advancedApi from '../advanced-profession-api';
import { advancedQuoteRemainingMs, selectAdvancedCandidateCode } from '../advanced-profession-ui';
import { createIdempotencyKey } from '../idempotency-key';
import type {
  AdvancedMentor, AdvancedProfessionCandidate, AdvancedProfessionDetail,
  AdvancedProfessionPreview, AdvancedProfessionStatus, AdvancedQuestAction, AdvancedQuestQuote,
  AdvancedTrialStart, AdvancedTrialStarted
} from '../advanced-profession-api';
import InventoryItemIcon from './InventoryItemIcon.vue';
import { storyImageUrl } from '../story-assets';
import ViewportPagination from './ViewportPagination.vue';
import { useViewportPagination } from '../useViewportPagination';

type Filter = 'all' | 'active' | 'ready';
const props = defineProps<{ open: boolean; inline?: boolean }>();
const emit = defineEmits<{ close: []; updated: []; locate: [mentor: AdvancedMentor];
  'trial-started': [result: AdvancedTrialStarted]; 'pending-change': [pending: boolean] }>();

const closeButton = ref<HTMLButtonElement | null>(null);
const status = ref<AdvancedProfessionStatus | null>(null);
const detail = ref<AdvancedProfessionDetail | null>(null);
const selectedCode = ref('');
const filter = ref<Filter>('all');
const keyword = ref('');
const preview = ref<AdvancedProfessionPreview | null>(null);
const previewReceivedAt = ref(0);
const uncertainConfirmationToken = ref<string | null>(null);
const trialStartRequest = ref<{ code: string; idempotencyKey: string } | null>(null);
const trialStartUncertain = ref(false);
const loading = ref(false);
const detailLoading = ref(false);
const pending = ref(false);
const error = ref('');
const detailError = ref('');
const notice = ref('');
const now = ref(Date.now());
const fetchedAt = ref(Date.now());
const advancedViewportList = ref<HTMLElement | null>(null);
const advancedViewportDetailOpen = ref(false);
const advancedViewportSummaryOpen = ref(false);
let statusVersion = 0;
let detailVersion = 0;

const candidates = computed(() => status.value?.candidates ?? []);
const selectedSummary = computed(() => candidates.value.find(item => item.code === selectedCode.value) ?? null);
const selectedDetail = computed(() => detail.value?.candidate.code === selectedCode.value ? detail.value.candidate : null);
const selected = computed(() => selectedDetail.value ?? selectedSummary.value);
const filtered = computed(() => candidates.value.filter(item => {
  const search = keyword.value.trim().toLocaleLowerCase();
  if (search && !`${item.name} ${item.role} ${item.mentor.name} ${item.mentor.title} ${item.route.name}`.toLocaleLowerCase().includes(search)) return false;
  if (filter.value === 'active') return status.value?.activeQuest?.professionCode === item.code;
  if (filter.value === 'ready') return item.availableActions.length > 0
    || (item.quest?.stage === 3 && item.trial.ready && item.mentor.atSite);
  return true;
}));
const advancedViewportPagination = useViewportPagination(() => filtered.value, {
  container: advancedViewportList, rowHeight: 72, gap: 6
});
watch([keyword, filter], () => advancedViewportPagination.reset());
const quoteExpired = computed(() => {
  void now.value;
  return preview.value ? advancedQuoteRemainingMs(preview.value, performance.now() - previewReceivedAt.value) <= 0 : false;
});
const canRetryConfirmation = computed(() => Boolean(preview.value && uncertainConfirmationToken.value === preview.value.token));
const canRetryTrialStart = computed(() => Boolean(trialStartRequest.value && trialStartUncertain.value));
const cooldownRemaining = computed(() => Math.max(0, (status.value?.retrainRemainingSeconds ?? 0)
  - Math.floor((now.value - fetchedAt.value) / 1000)));

function stageName(stage: number) {
  return ({ 0: '尚未接取', 1: '第一段见闻', 2: '第二段凭证', 3: '导师挑战待开始' } as Record<number, string>)[stage] ?? `阶段 ${stage}`;
}
function actionName(action: AdvancedQuestAction) {
  return ({ accept: '接受试炼', switch_quest: '切换试炼', submit_story: '提交见闻', submit_proof: '提交凭证' } as Record<AdvancedQuestAction, string>)[action];
}
function duration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.ceil(seconds % 3600 / 60);
  return [days ? `${days} 天` : '', hours ? `${hours} 小时` : '', minutes ? `${minutes} 分钟` : ''].filter(Boolean).join(' ') || '不足 1 分钟';
}
function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未记录' : date.toLocaleString('zh-CN');
}
function candidateState(item: AdvancedProfessionCandidate) {
  if (item.completed) return '当前职业';
  if (status.value?.activeQuest?.professionCode === item.code) return stageName(item.quest?.stage ?? 0);
  if (item.availableActions.length) return '可办理';
  return '查看路线';
}
function completedQuestName(code: string | null | undefined) {
  if (!code) return '当前试炼';
  return candidates.value.find(item => item.code === code)?.name
    ?? (status.value?.activeQuest?.professionCode === code ? status.value.activeQuest.professionName : code);
}
function quoteLines(quote: AdvancedQuestQuote) {
  const lines = [`${stageName(quote.stageBefore)} → ${stageName(quote.stageAfter)}`];
  if (quote.action === 'accept' || quote.action === 'switch_quest') {
    if (quote.replacedQuestCode) lines.push(`将中断【${completedQuestName(quote.replacedQuestCode)}】的第 ${quote.replacedQuestStage ?? '?'} 阶段进度：见闻 ${quote.replacedStoryKills ?? 0} 次、凭证 ${quote.replacedProofKills ?? 0} 次。`);
    lines.push('接取试炼不会立即更换当前职业；完成导师挑战后才会决定转职。');
    if (quote.routeMapCodes?.length) lines.push('接取后将核对并补齐路线地图资格。');
  } else if (quote.action === 'submit_story') {
    lines.push(`提交 ${quote.targetText ?? '指定目标'} 见闻 ${quote.storyKills ?? 0}/${quote.requiredKills ?? 0} 次；开启第二段凭证。`);
  } else {
    lines.push(`提交 ${quote.targetText ?? '指定目标'} 战斗凭证 ${quote.proofKills ?? 0}/${quote.requiredKills ?? 0} 次。`);
    lines.push(`消耗【${quote.materialName ?? '路线材料'}】${quote.materialCount ?? 0} 个（当前 ${quote.materialOwnedBefore ?? 0} 个）。`);
    const used = quote.materialBindingUsed;
    if (used) lines.push(`材料扣除：未绑定 ${used.unbound}、交易绑定 ${used.trade}、个人绑定 ${used.personal}。`);
    lines.push('提交后进入导师挑战阶段；需在导师处发起挑战。');
  }
  return lines;
}
function requestClose() { if (!pending.value && !canRetryConfirmation.value && !canRetryTrialStart.value) emit('close'); }
function requestLocate(mentor: AdvancedMentor) {
  if (!pending.value && !canRetryConfirmation.value && !canRetryTrialStart.value) {
    advancedViewportDetailOpen.value = false;
    emit('locate', mentor);
  }
}
function advancedViewportCloseDetail() {
  if (!pending.value && !canRetryConfirmation.value && !canRetryTrialStart.value) advancedViewportDetailOpen.value = false;
}

async function loadDetail(code: string) {
  if (!props.open || !code) return;
  const version = ++detailVersion;
  detailLoading.value = true;
  detailError.value = '';
  detail.value = null;
  try {
    const result = await advancedApi.advancedProfessionDetail(code);
    if (version === detailVersion && props.open && selectedCode.value === code) detail.value = result;
  } catch (cause) {
    if (version === detailVersion && props.open) detailError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}
async function loadStatus() {
  if (!props.open) return;
  const version = ++statusVersion;
  loading.value = true;
  error.value = '';
  try {
    const result = await advancedApi.advancedProfessionStatus();
    if (version !== statusVersion || !props.open) return;
    status.value = result;
    fetchedAt.value = Date.now();
    now.value = Date.now();
    const code = selectAdvancedCandidateCode(result.candidates.map(item => item.code),
      [selectedCode.value, result.activeQuest?.professionCode, result.currentProfession?.code]);
    selectedCode.value = code;
    if (code) void loadDetail(code);
    else { detail.value = null; ++detailVersion; }
  } catch (cause) {
    if (version === statusVersion && props.open) {
      detail.value = null;
      ++detailVersion;
      error.value = userFacingErrorMessage(cause);
    }
  } finally {
    if (version === statusVersion) loading.value = false;
  }
}
function choose(item: AdvancedProfessionCandidate) {
  if (pending.value || canRetryConfirmation.value || canRetryTrialStart.value) return;
  advancedViewportDetailOpen.value = true;
  if (selectedCode.value === item.code) return;
  selectedCode.value = item.code;
  preview.value = null;
  uncertainConfirmationToken.value = null;
  detailError.value = '';
  notice.value = '';
  void loadDetail(item.code);
}
async function previewAction(action: AdvancedQuestAction) {
  const candidate = selectedDetail.value;
  if (pending.value || canRetryConfirmation.value || canRetryTrialStart.value || !candidate?.availableActions.includes(action)) return;
  pending.value = true;
  error.value = '';
  notice.value = '';
  preview.value = null;
  uncertainConfirmationToken.value = null;
  try {
    const result = await advancedApi.previewAdvancedProfessionAction(candidate.code, action);
    if (props.open && selectedCode.value === candidate.code && result.quote.action === action
      && result.quote.professionCode === candidate.code) {
      now.value = Date.now();
      previewReceivedAt.value = performance.now();
      preview.value = result;
    }
  } catch (cause) {
    if (props.open) {
      const message = userFacingErrorMessage(cause);
      await loadStatus();
      error.value = `${message} 已重新读取试炼状态。`;
    }
  } finally { pending.value = false; }
}
async function confirmAction() {
  const quote = preview.value;
  if (!props.open || !quote || pending.value || canRetryTrialStart.value) return;
  if (advancedQuoteRemainingMs(quote, performance.now() - previewReceivedAt.value) <= 0 && !canRetryConfirmation.value) {
    preview.value = null;
    error.value = '报价已过期，请重新预览。';
    return;
  }
  pending.value = true;
  error.value = '';
  notice.value = '';
  let confirmationSent = false;
  try {
    confirmationSent = true;
    const response = await advancedApi.confirmAdvancedProfessionAction(quote.token, quote.idempotencyKey);
    preview.value = null;
    uncertainConfirmationToken.value = null;
    notice.value = `【${response.result.professionName}】${actionName(response.result.action)}已完成。`;
    emit('updated');
    if (props.open) await loadStatus();
  } catch (cause) {
    if (props.open) {
      const message = userFacingErrorMessage(cause);
      const retryable = confirmationSent && /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
      if (!retryable) preview.value = null;
      uncertainConfirmationToken.value = retryable ? quote.token : null;
      await loadStatus();
      if (retryable) emit('updated');
      error.value = retryable ? `${message} 原确认凭据已保留，请核对阶段后重试。`
        : `${message} 已重新读取试炼状态，请再次预览。`;
    }
  } finally { pending.value = false; }
}

function handOffTrialBattle(result: AdvancedTrialStarted) {
  trialStartRequest.value = null;
  trialStartUncertain.value = false;
  emit('trial-started', result);
  emit('close');
}
async function startTrial() {
  const candidate = selectedDetail.value;
  const retained = trialStartRequest.value;
  if (!props.open || pending.value || canRetryConfirmation.value || (!retained
    && (!candidate || candidate.quest?.stage !== 3 || !candidate.trial.ready || !candidate.mentor.atSite))) return;
  const request = retained ?? { code: candidate!.code, idempotencyKey: createIdempotencyKey() };
  trialStartRequest.value = request;
  trialStartUncertain.value = false;
  pending.value = true;
  error.value = '';
  notice.value = '';
  let result: AdvancedTrialStart | null = null;
  try {
    result = await advancedApi.startAdvancedProfessionTrial(request.code, request.idempotencyKey);
    if (!result.sessionId || !Number.isSafeInteger(result.spawnId) || result.spawnId <= 0)
      throw new Error('服务器返回内容异常，请稍后重试。');
    const current = result.panel?.inBattle && result.panel.battle?.sessionId === result.sessionId
      ? result.panel : await loadCurrentPanel();
    if (current.inBattle && current.battle?.sessionId === result.sessionId) {
      handOffTrialBattle({ ...result, panel: current });
      return;
    }
    // 已拿到服务端试炼场次；面板回读成功且不再包含该场次，说明旧 key 只能回放已结束的战斗。
    trialStartRequest.value = null;
    trialStartUncertain.value = false;
    await loadStatus();
    error.value = '本次导师战已结束或战斗状态已变化。已重新读取试炼进度；若仍处于导师挑战阶段，可再次发起。';
  } catch (cause) {
    if (!props.open) return;
    const message = userFacingErrorMessage(cause);
    const uncertain = Boolean(result)
      || /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
    // 未拿到服务端场次编号时，任意进行中的战斗都不能证明是这次导师试炼。
    trialStartUncertain.value = uncertain;
    if (!uncertain) trialStartRequest.value = null;
    await loadStatus();
    error.value = uncertain ? `${message} 尚无法确认本次导师战，原请求凭据已保留，请用原凭据核对。`
      : `${message} 已重新读取试炼状态。`;
  } finally { pending.value = false; }
}

watch(() => props.open, async (open, _previous, onCleanup) => {
  ++statusVersion;
  ++detailVersion;
  const timer = open ? window.setInterval(() => { now.value = Date.now(); }, 1000) : null;
  onCleanup(() => { if (timer !== null) window.clearInterval(timer); });
  if (!open) { loading.value = false; detailLoading.value = false; return; }
  status.value = null;
  detail.value = null;
  selectedCode.value = '';
  filter.value = 'all';
  keyword.value = '';
  advancedViewportPagination.reset();
  advancedViewportDetailOpen.value = false;
  advancedViewportSummaryOpen.value = false;
  preview.value = null;
  uncertainConfirmationToken.value = null;
  if (!trialStartUncertain.value) trialStartRequest.value = null;
  error.value = '';
  detailError.value = '';
  notice.value = '';
  await nextTick();
  closeButton.value?.focus();
  void loadStatus();
}, { immediate: true });
watch(() => pending.value || canRetryConfirmation.value || canRetryTrialStart.value,
  value => emit('pending-change', value), { immediate: true });
</script>

<template>
  <Teleport to="body" :disabled="Boolean(inline)">
    <div v-if="open" :class="inline ? 'advanced-inline-shell' : 'advanced-backdrop'" role="presentation" @click.self="requestClose">
      <section class="advanced-viewport-panel profession-guild-panel" :class="inline ? 'advanced-inline-panel' : 'advanced-dialog'" role="dialog" :aria-modal="inline ? undefined : 'true'" aria-label="职业契约与二转试炼" @keydown.esc.stop.prevent="requestClose">
        <header class="advanced-header">
          <span class="advanced-mark"><TabArtIcon name="advanced-profession" :size="40" /></span>
          <div><small>冒险公会 · 公开导师传承</small><h2>职业契约</h2></div>
          <span class="profession-guild-register" aria-hidden="true">路线登记处</span>
          <button type="button" class="advanced-refresh" :disabled="loading || pending || canRetryConfirmation || canRetryTrialStart" @click="loadStatus">刷新</button>
          <button v-if="!inline" ref="closeButton" type="button" class="advanced-close" aria-label="关闭二转试炼" :disabled="pending || canRetryConfirmation || canRetryTrialStart" @click="requestClose"><AnimeIcon name="close" :size="25" /></button>
        </header>
        <div class="advanced-body advanced-viewport-body">
          <button v-if="notice || error || canRetryConfirmation || canRetryTrialStart" type="button" class="advanced-viewport-message" @click="advancedViewportSummaryOpen = true">{{ error || notice || '操作结果尚待核对，请保留原凭据' }} · 查看完整提示</button>
          <p v-if="loading && !status" class="advanced-empty game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在读取导师与试炼进度…</span></p>
          <button v-else-if="!status" type="button" class="advanced-retry" :disabled="loading || pending" @click="loadStatus">重新读取试炼</button>

          <template v-if="status">
            <button type="button" class="advanced-viewport-summary-button profession-contract-summary" @click="advancedViewportSummaryOpen = true">
              <span class="profession-contract-current"><small>当前职业</small><span class="profession-current-identity"><ProfessionIcon :code="status.currentProfession?.code" :name="status.currentProfession?.name ?? status.character.baseProfession" :size="24" /><strong>{{ status.currentProfession?.name ?? status.character.baseProfession ?? '尚未选择' }}</strong></span></span>
              <span class="profession-contract-quest"><small>公开试炼</small><strong>{{ status.activeQuest?.professionName ?? '尚未接取' }}</strong><span>{{ status.activeQuest ? stageName(status.activeQuest.stage) : '选择一条传承路线' }}</span></span>
              <span class="profession-contract-stages" aria-hidden="true"><i v-for="stage in [1, 2, 3]" :key="stage" :class="{ reached: (status.activeQuest?.stage ?? 0) >= stage }">0{{ stage }}</i></span>
              <AnimeIcon class="profession-summary-arrow" name="arrow" :size="18" />
            </button>
            <Teleport to="body"><div v-if="advancedViewportSummaryOpen" class="advanced-viewport-backdrop profession-guild-modal-root" @click.self="advancedViewportSummaryOpen = false"><section class="advanced-viewport-dialog profession-guild-panel profession-guild-dialog" role="dialog" aria-modal="true" aria-label="当前试炼与规则" @keydown.esc.stop.prevent="advancedViewportSummaryOpen = false"><header><h3><AnimeIcon name="scroll" :size="26" />当前试炼与规则</h3><button type="button" @click="advancedViewportSummaryOpen = false">关闭 <AnimeIcon name="close" :size="17" /></button></header><div class="advanced-viewport-dialog-body">          <p v-if="notice" class="advanced-notice" role="status">{{ notice }}</p>
          <p v-if="error" class="advanced-error" role="alert">{{ error }}</p>
          <p v-if="canRetryConfirmation" class="advanced-error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能离开；网络持续不可用时请保持页面打开，稍后重试。</p>
          <p v-if="canRetryTrialStart" class="advanced-error" role="status">导师试炼的发起结果尚未确定。原请求凭据已保留；核对完成前暂不能离开或发起另一场试炼。</p>
            <div class="advanced-summary">
              <div><small>冒险者</small><strong><ProfessionIcon :name="status.character.baseProfession" :size="22" /> Lv.{{ status.character.level }} · {{ status.character.baseProfession || '尚未选择初始职业' }}</strong></div>
              <div><small>当前二转</small><strong><ProfessionIcon v-if="status.currentProfession" :code="status.currentProfession.code" :name="status.currentProfession.name" :size="22" /> {{ status.currentProfession?.name ?? '尚未二转' }}</strong></div>
              <div><small>进行中的公开试炼</small><strong><ProfessionIcon v-if="status.activeQuest" :code="status.activeQuest.professionCode" :name="status.activeQuest.professionName" :size="22" /> {{ status.activeQuest ? `${status.activeQuest.professionName} · ${stageName(status.activeQuest.stage)}` : '暂无' }}</strong></div>
            </div>
            <p v-if="status.hiddenQuestActive" class="advanced-limit">正在进行地图隐藏二转任务。先回原隐藏导师中断，才能接取这里的公开试炼。</p>
            <p v-if="cooldownRemaining" class="advanced-limit">重新二转冷却中：约 {{ duration(cooldownRemaining) }}。原职业仍有效，冷却结束后刷新可用操作。</p>
            <p v-if="status.currentProfession" class="advanced-hint">上次二转完成于 {{ dateText(status.currentProfession.completedAt) }}；重新二转须经过 24 小时冷却。重新接取试炼不会立即更换职业。</p>
            <p class="advanced-hint">公开导师路线可跨初始职业选择；系谱仅用于介绍传承来源，实际资格以导师和服务端状态为准。</p>

          <div v-if="canRetryConfirmation && preview && (!selected || selected.code !== preview.quote.professionCode)" class="advanced-quote">
            <h4>二转确认结果待核对</h4>
            <p>原确认请求已发出；可用原凭据核对。未完成的过期请求不会执行。</p>
            <button type="button" class="advanced-confirm" :disabled="pending" @click="confirmAction">用原凭据核对结果</button>
          </div>
          <div v-if="canRetryTrialStart && trialStartRequest" class="advanced-quote">
            <h4>导师试炼发起结果待核对</h4>
            <p>当前战斗面板尚未核对成功。请保留页面，用原请求凭据重试或回读。</p>
            <button type="button" class="advanced-confirm" :disabled="pending" @click="startTrial">用原凭据核对并继续</button>
          </div>
</div></section></div></Teleport>
            <div class="advanced-catalog-tools"><AnimeIcon class="guild-search-art" name="search" :size="17" /><input v-model="keyword" type="search" maxlength="80" placeholder="搜索职业、导师或路线" aria-label="搜索二转职业" :disabled="pending || canRetryConfirmation || canRetryTrialStart" />
                <div class="advanced-filters" role="group" aria-label="筛选职业"><button type="button" :class="{ active: filter === 'all' }" :disabled="pending || canRetryConfirmation || canRetryTrialStart" @click="filter = 'all'">全部</button><button type="button" :class="{ active: filter === 'active' }" :disabled="pending || canRetryConfirmation || canRetryTrialStart" @click="filter = 'active'">进行中</button><button type="button" :class="{ active: filter === 'ready' }" :disabled="pending || canRetryConfirmation || canRetryTrialStart" @click="filter = 'ready'">可办理</button></div></div>
            <div class="advanced-layout">
              <aside class="advanced-catalog" aria-label="候选职业与导师">
                <div class="advanced-catalog-head"><h3><AnimeIcon name="map" :size="24" />公会路线板</h3><span>{{ filtered.length }} / {{ candidates.length }} 条路线</span></div>

                <div ref="advancedViewportList" class="advanced-candidates"><button v-for="item in advancedViewportPagination.visibleItems.value" :key="item.code" type="button" class="advanced-candidate" :data-profession-code="item.code" :aria-pressed="selectedCode === item.code" :class="{ selected: selectedCode === item.code, 'is-current-profession': item.completed, 'is-active-trial': status.activeQuest?.professionCode === item.code }" :disabled="pending || canRetryConfirmation || canRetryTrialStart" @click="choose(item)"><span class="advanced-candidate-mark"><ProfessionIcon :code="item.code" :name="item.name" :size="36" /></span><span class="profession-candidate-copy"><strong>{{ item.name }}<small class="profession-candidate-lineage">{{ item.baseProfession }}系</small></strong><small>{{ item.role }}</small><small class="profession-candidate-route">{{ item.mentor.name }} · {{ item.route.name }}</small></span><span class="profession-candidate-tail"><em>{{ candidateState(item) }}</em><AnimeIcon :name="selectedCode === item.code ? 'check' : 'arrow'" :size="19" /></span></button><p v-if="!filtered.length" class="advanced-empty game-ui-empty-message"><GameUiFeedbackArt name="empty" :size="36" /><span>当前筛选没有候选路线。</span></p></div>
                <ViewportPagination :page="advancedViewportPagination.page.value" :total-pages="advancedViewportPagination.totalPages.value" :total="filtered.length" :disabled="pending || canRetryConfirmation || canRetryTrialStart" label="职业路线翻页" @update:page="advancedViewportPagination.setPage" />
              </aside>

              <Teleport to="body"><div v-if="advancedViewportDetailOpen" class="advanced-viewport-backdrop profession-guild-modal-root" @click.self="advancedViewportCloseDetail"><section class="advanced-viewport-dialog profession-guild-panel profession-guild-dialog" role="dialog" aria-modal="true" aria-label="二转职业详情" @keydown.esc.stop.prevent="advancedViewportCloseDetail"><header><h3><ProfessionIcon :code="selected?.code" :name="selected?.name" :size="32" />{{ selected?.name ?? '二转职业详情' }}</h3><button type="button" :disabled="pending || canRetryConfirmation || canRetryTrialStart" @click="advancedViewportCloseDetail">关闭 <AnimeIcon name="close" :size="17" /></button></header><div class="advanced-viewport-dialog-body">              <article class="advanced-detail" aria-label="二转职业详情">
                <template v-if="selected">
                  <div class="advanced-title"><div><small>公开导师传承 · {{ selected.baseProfession }}系谱</small><h3>{{ selected.name }}</h3><p>{{ selected.role }}</p></div><span v-if="selected.completed" class="advanced-current">当前职业</span></div>

                  <div class="advanced-info-grid"><section class="advanced-mentor"><h4>导师</h4><img v-if="storyImageUrl(selected.storyImage)" class="advanced-story-image" :src="storyImageUrl(selected.storyImage)!" :alt="selected.storyImage?.alt || '导师试炼剧情插图'" /><strong>{{ selected.mentor.title }}·{{ selected.mentor.name }}</strong><p>世界树（{{ selected.mentor.x }}, {{ selected.mentor.y }}, {{ selected.mentor.z }}）</p><button type="button" class="advanced-locate" :disabled="pending || canRetryConfirmation || canRetryTrialStart" @click="requestLocate(selected.mentor)">地图定位导师</button><small>{{ selected.mentor.atSite ? '当前就在导师位置' : '提交阶段进度和发起试炼须到达导师位置' }}</small></section><section><h4>历练路线</h4><strong>{{ selected.route.name }}</strong><p>{{ selected.route.regionCode }} · ({{ selected.route.x }}, {{ selected.route.y }})</p><p>凭证材料：{{ selected.route.materialName }}</p></section></div>
                  <section class="advanced-feature"><h4>职业被动 · {{ selected.passive.name }}</h4><p>{{ selected.passive.description }}</p></section>
                  <section class="advanced-feature"><h4>导师试炼 · {{ selected.trial.name }}</h4><p>{{ selected.trial.description }}</p><small v-if="selected.trial.ready">前两段已完成。到达对应导师位置后，可在此发起试炼。</small></section>
                  <section class="advanced-timeline"><h4><AnimeIcon name="scroll" :size="24" />试炼进度</h4><p v-if="!selected.quest" class="advanced-hint">尚未接取这条路线。接取后会开启第一段见闻。</p><template v-else><div class="advanced-step" :class="{ reached: selected.quest.stage >= 1 }"><b>01</b><div><strong>{{ selected.quest.first.title }}</strong><p v-if="selected.quest.first.story">{{ selected.quest.first.story }}</p><p>{{ selected.quest.first.target }}：{{ selected.quest.storyKills }} / {{ selected.quest.first.requiredKills }} 次</p></div></div><div class="advanced-step" :class="{ reached: selected.quest.stage >= 2 }"><b>02</b><div><strong>{{ selected.quest.second.title }}</strong><p v-if="selected.quest.second.story">{{ selected.quest.second.story }}</p><p>{{ selected.quest.second.target }}：{{ selected.quest.proofKills }} / {{ selected.quest.second.requiredKills }} 次</p><p class="advanced-material"><InventoryItemIcon :name="selected.route.materialName" item-category="材料" />{{ selected.route.materialName }}：{{ selected.quest.second.materialOwned }} / {{ selected.quest.second.materialCount }} 个</p></div></div><div class="advanced-step" :class="{ reached: selected.quest.stage >= 3 }"><b>03</b><div><strong>导师挑战</strong><p>{{ selected.quest.stage >= 3 ? '前两段已完成；到导师位置发起挑战。' : '完成见闻和凭证后开放。' }}</p></div></div></template></section>
                  <p v-if="selected.blockedReason" class="advanced-blocked">{{ selected.blockedReason }}</p>
                  <p v-if="detailLoading" class="advanced-hint">正在核对当前可用操作…</p>
                  <p v-if="detailError" class="advanced-error" role="alert">详情读取失败：{{ detailError }} <button type="button" :disabled="pending" @click="loadDetail(selectedCode)">重试</button></p>
                  <div v-if="selectedDetail?.availableActions.length" class="advanced-actions"><button v-for="action in selectedDetail.availableActions" :key="action" type="button" :disabled="pending || canRetryConfirmation || canRetryTrialStart" @click="previewAction(action)">{{ actionName(action) }} · 查看报价</button></div>
                  <div v-else-if="selectedDetail?.quest?.stage === 3 && selectedDetail.trial.ready" class="advanced-actions"><button type="button" :disabled="pending || canRetryConfirmation || canRetryTrialStart || !selectedDetail.mentor.atSite" @click="startTrial">发起导师试炼</button><span v-if="!selectedDetail.mentor.atSite" class="advanced-hint">请先前往导师位置。</span></div>
                  <div v-if="preview && preview.quote.professionCode === selected.code" class="advanced-quote" aria-label="试炼操作确认"><h4>{{ actionName(preview.quote.action) }} · 服务端预览</h4><p v-for="line in quoteLines(preview.quote)" :key="line">{{ line }}</p><small>报价有效至 {{ dateText(preview.expiresAt) }}；确认时会复核角色位置与试炼状态。</small><div><button type="button" :disabled="pending || canRetryConfirmation || canRetryTrialStart" @click="preview = null; uncertainConfirmationToken = null">返回修改</button><button type="button" class="advanced-confirm" :disabled="pending || canRetryTrialStart || (quoteExpired && !canRetryConfirmation)" @click="confirmAction">{{ canRetryConfirmation ? '用原凭据核对结果' : `明确确认${actionName(preview.quote.action)}` }}</button></div><p v-if="quoteExpired" class="advanced-error">{{ canRetryConfirmation ? '报价已过期；原凭据仅能回读已完成结果。' : '报价已过期，请重新预览。' }}</p></div>
                </template>
                <p v-else class="advanced-empty game-ui-empty-message"><GameUiFeedbackArt name="message" :size="36" /><span>选择一位导师查看路线与试炼。</span></p>
              </article>          <p v-if="notice" class="advanced-notice" role="status">{{ notice }}</p>
          <p v-if="error" class="advanced-error" role="alert">{{ error }}</p>
          <p v-if="canRetryConfirmation" class="advanced-error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能离开；网络持续不可用时请保持页面打开，稍后重试。</p>
          <p v-if="canRetryTrialStart" class="advanced-error" role="status">导师试炼的发起结果尚未确定。原请求凭据已保留；核对完成前暂不能离开或发起另一场试炼。</p>
          <div v-if="canRetryConfirmation && preview && (!selected || selected.code !== preview.quote.professionCode)" class="advanced-quote">
            <h4>二转确认结果待核对</h4>
            <p>原确认请求已发出；可用原凭据核对。未完成的过期请求不会执行。</p>
            <button type="button" class="advanced-confirm" :disabled="pending" @click="confirmAction">用原凭据核对结果</button>
          </div>
          <div v-if="canRetryTrialStart && trialStartRequest" class="advanced-quote">
            <h4>导师试炼发起结果待核对</h4>
            <p>当前战斗面板尚未核对成功。请保留页面，用原请求凭据重试或回读。</p>
            <button type="button" class="advanced-confirm" :disabled="pending" @click="startTrial">用原凭据核对并继续</button>
          </div>
</div></section></div></Teleport>
            </div>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.advanced-story-image { display: block; width: auto; max-width: 100%; max-height: 360px; height: auto; object-fit: contain; margin: 10px auto; border-radius: 10px; }
.advanced-backdrop { position: fixed; z-index: 101; inset: 0; display: grid; place-items: center; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); background: #282438ae; backdrop-filter: blur(5px); }
.advanced-dialog { display: flex; flex-direction: column; width: min(960px, 100%); max-height: min(85dvh, 780px); min-height: 0; overflow: hidden; color: #4b4256; background: #fffaf6; border: 1px solid #efe5e8; border-radius: 20px; box-shadow: 0 25px 75px #1c183e63; }
.advanced-inline-shell { width: 100%; min-width: 0; }
.advanced-inline-panel { display: flex; flex-direction: column; width: 100%; min-height: 0; overflow: hidden; color: #4b4256; background: #fffaf6; border: 1px solid #efe5e8; border-radius: 16px; }
.advanced-header { display: flex; align-items: center; gap: 11px; flex: none; padding: 13px 17px; background: linear-gradient(115deg, #f4eafb, #fff4e9 65%, #eef8f5); border-bottom: 1px solid #e9dfe8; }.advanced-mark { display: grid; place-items: center; flex: 0 0 42px; width: 42px; height: 42px; color: #fff; background: linear-gradient(140deg, #8f79b3, #c9a783); border-radius: 12px; font-size: 26px; }.advanced-header > div { flex: 1; min-width: 0; }.advanced-header small { color: #9b89ab; font-size: 9px; letter-spacing: .12em; }.advanced-header h2 { margin: 2px 0 0; color: #584669; font-size: 19px; }.advanced-refresh, .advanced-close { flex: none; border: 1px solid #e3d7e6; border-radius: 8px; background: #fff; color: #805f90; }.advanced-refresh { min-height: 35px; padding: 7px 11px; font-size: 11px; }.advanced-close { width: 35px; height: 35px; font-size: 22px; line-height: 1; }
.advanced-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px 18px max(24px, env(safe-area-inset-bottom)); }.advanced-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }.advanced-summary > div { display: grid; gap: 5px; min-width: 0; padding: 11px 13px; background: #f7f3fa; border: 1px solid #e9e1ee; border-radius: 10px; }.advanced-summary small { color: #9c8fa4; font-size: 10px; }.advanced-summary strong { color: #695779; font-size: 12px; overflow-wrap: anywhere; }.advanced-limit, .advanced-hint, .advanced-blocked, .advanced-notice, .advanced-error { margin: 10px 0; font-size: 12px; line-height: 1.5; }.advanced-limit { padding: 10px 12px; color: #9c6a4e; background: #fff0e2; border-radius: 9px; }.advanced-hint { color: #8a8292; }.advanced-blocked { padding: 10px 12px; color: #927180; background: #f8f2f3; border-radius: 9px; }.advanced-notice { padding: 10px 12px; color: #4f7c5e; background: #eaf7ed; border-radius: 9px; }.advanced-error { padding: 10px 12px; color: #ab5965; background: #fff0ed; border-radius: 9px; }.advanced-error button { padding: 3px 7px; color: #8d5972; background: #fff; border-radius: 6px; }.advanced-empty { padding: 22px 9px; color: #a195a9; text-align: center; font-size: 12px; }.advanced-retry { display: block; margin: 14px auto; padding: 9px 13px; color: #805f93; background: #f2eafa; border-radius: 9px; }
.advanced-layout { display: grid; grid-template-columns: minmax(225px, 285px) minmax(0, 1fr); gap: 13px; align-items: start; margin-top: 14px; }.advanced-catalog, .advanced-detail { min-width: 0; padding: 14px; background: #fff; border: 1px solid #e9e1e9; border-radius: 13px; }.advanced-catalog-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }.advanced-catalog-head h3, .advanced-detail h4 { margin: 0; color: #635271; font-size: 13px; }.advanced-catalog-head span { color: #a497aa; font-size: 10px; }.advanced-catalog input { width: 100%; min-height: 36px; margin: 11px 0; padding: 8px 10px; color: #554961; background: #fff; border: 1px solid #e5dce8; border-radius: 8px; font: inherit; font-size: 12px; }.advanced-filters { display: flex; gap: 5px; margin-bottom: 11px; }.advanced-filters button { flex: 1; min-height: 32px; padding: 5px; color: #8d7e95; background: #f5f0f6; border-radius: 8px; font-size: 11px; }.advanced-filters button.active { color: #71538c; background: #ede2f5; font-weight: 800; }.advanced-candidates { display: grid; gap: 7px; max-height: 53dvh; overflow-y: auto; }.advanced-candidate { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px; color: inherit; text-align: left; background: #fff; border: 1px solid #eee7ec; border-radius: 10px; }.advanced-candidate.selected { border-color: #bda8ce; background: #fbf8fd; }.advanced-candidate-mark { display: grid; place-items: center; flex: 0 0 33px; width: 33px; height: 33px; color: #b897cf; background: #f2eaf8; border-radius: 9px; }.advanced-candidate > span:nth-child(2) { display: grid; gap: 2px; flex: 1; min-width: 0; }.advanced-candidate strong { color: #5d4c6a; font-size: 12px; }.advanced-candidate small { color: #a093a9; font-size: 10px; overflow-wrap: anywhere; }.advanced-candidate em { align-self: start; flex: none; color: #8a6a9b; font-size: 9px; font-style: normal; white-space: nowrap; }
.advanced-title { display: flex; align-items: start; justify-content: space-between; gap: 10px; padding-bottom: 11px; border-bottom: 1px solid #eee6ed; }.advanced-title small { color: #aa95ae; font-size: 10px; }.advanced-title h3 { margin: 4px 0; color: #594465; font-size: 21px; }.advanced-title p { margin: 0; color: #8d7c96; font-size: 12px; }.advanced-current { flex: none; padding: 5px 8px; color: #5b8e73; background: #e9f5eb; border-radius: 999px; font-size: 10px; }.advanced-info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }.advanced-info-grid section { display: grid; gap: 5px; min-width: 0; padding: 11px; background: #f9f6fa; border-radius: 10px; }.advanced-info-grid strong { color: #6d5878; font-size: 12px; }.advanced-info-grid p { margin: 0; color: #877d8e; font-size: 11px; }.advanced-info-grid small { color: #9b8e9e; font-size: 10px; }.advanced-locate { justify-self: start; min-height: 31px; padding: 6px 9px; color: #775993; background: #eee7f6; border-radius: 7px; font-size: 10px; }.advanced-feature, .advanced-timeline { margin-top: 12px; padding: 12px; border: 1px solid #eee7ed; border-radius: 10px; }.advanced-feature p { margin: 7px 0 0; color: #807489; font-size: 11px; line-height: 1.55; }.advanced-feature small { display: block; margin-top: 6px; color: #648575; font-size: 11px; }.advanced-timeline h4 { margin-bottom: 10px; }.advanced-step { display: flex; gap: 9px; padding: 9px 0; border-top: 1px solid #f0eaf0; opacity: .55; }.advanced-step.reached { opacity: 1; }.advanced-step > b { display: grid; place-items: center; flex: 0 0 27px; width: 27px; height: 27px; color: #8b70a3; background: #f1e9f6; border-radius: 8px; font-size: 10px; }.advanced-step > div { min-width: 0; }.advanced-step strong { color: #685674; font-size: 12px; }.advanced-step p { margin: 4px 0 0; color: #8e8494; font-size: 11px; line-height: 1.5; }.advanced-material { display: flex; align-items: center; gap: 5px; }.advanced-material :deep(.inventory-art-wrap) { flex: 0 0 25px; width: 25px; height: 25px; margin: 0; }.advanced-material :deep(.inventory-item-image) { width: 24px; height: 24px; }.advanced-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }.advanced-actions button, .advanced-confirm { min-height: 37px; padding: 8px 12px; color: #fff; background: #8e6ca9; border-radius: 8px; font-size: 11px; font-weight: 800; }
.advanced-quote { margin-top: 13px; padding: 13px; color: #675b70; background: #f5ecfa; border: 1px solid #dfd0e9; border-radius: 10px; }.advanced-quote h4 { margin: 0 0 9px; font-size: 13px; }.advanced-quote p { margin: 6px 0; font-size: 11px; line-height: 1.55; }.advanced-quote small { color: #95869f; font-size: 10px; }.advanced-quote > div { display: flex; justify-content: end; gap: 7px; margin-top: 12px; }.advanced-quote > div button:not(.advanced-confirm) { min-height: 37px; padding: 8px 11px; color: #775e88; background: #fff; border-radius: 8px; font-size: 11px; }
button { border: 0; cursor: pointer; font: inherit; }button:disabled { opacity: .5; cursor: not-allowed; }button:focus-visible, input:focus-visible { outline: 3px solid #9d7bb8; outline-offset: 2px; }
@media (max-width: 700px) { .advanced-body { padding: 12px; }.advanced-layout { grid-template-columns: 1fr; }.advanced-candidates { display: flex; max-height: none; overflow-x: auto; overflow-y: hidden; padding-bottom: 5px; }.advanced-candidate { flex: 0 0 182px; min-height: 73px; }.advanced-info-grid { grid-template-columns: 1fr; } }
@media (max-width: 400px) { .advanced-header { padding: 10px 11px; gap: 7px; }.advanced-mark { flex-basis: 34px; width: 34px; height: 34px; font-size: 21px; }.advanced-header h2 { font-size: 16px; }.advanced-header small { font-size: 8px; }.advanced-summary { grid-template-columns: 1fr; }.advanced-summary > div { padding: 8px 10px; }.advanced-quote > div { flex-wrap: wrap; }.advanced-quote > div button { flex: 1; } }

.advanced-inline-shell { height: 100%; min-height: 0; }
.advanced-viewport-panel { box-sizing: border-box; height: 100%; min-height: 0; }
.advanced-dialog.advanced-viewport-panel { height: min(85dvh,780px); }
.advanced-viewport-panel > .advanced-header { min-height: 32px; gap: 7px; padding: 5px 9px; }.advanced-viewport-panel > .advanced-header h2 { font-size: 16px; }.advanced-viewport-panel > .advanced-header small { display: none; }.advanced-viewport-panel > .advanced-header .advanced-mark { flex-basis: 28px; width: 28px; height: 28px; }.advanced-viewport-panel > .advanced-header .advanced-refresh { min-height: 27px; padding: 3px 9px; }
.advanced-viewport-panel > .advanced-viewport-body { display: flex; flex-direction: column; flex: 1; gap: 6px; min-height: 0; padding: 7px; overflow: hidden; }
.advanced-viewport-body > .advanced-viewport-summary-button { flex: none; min-height: 28px; padding: 3px 8px; overflow: hidden; color: #5e7056; background: #f4e9d1; border: 1px solid #cdb48c; border-radius: 4px; text-align: left; font-size: 11px; white-space: nowrap; text-overflow: ellipsis; }
.advanced-viewport-body > .advanced-layout { display: flex; flex-direction: column; flex: 1; gap: 0; min-height: 0; margin: 0; overflow: hidden; }
.advanced-viewport-body .advanced-catalog { display: flex; flex-direction: column; flex: 1; gap: 6px; width: 100%; min-height: 0; padding: 5px; box-sizing: border-box; }
.advanced-viewport-body .advanced-catalog-head { display: flex; flex: none; min-height: 23px; }.advanced-viewport-body .advanced-catalog-head h3 { display: flex; align-items: center; gap: 4px; font-size: 13px; }
.advanced-viewport-body .advanced-candidates { display: grid; grid-template-columns: minmax(0,1fr); grid-auto-rows: 72px; align-content: start; gap: 6px; flex: 1; min-height: 0; max-height: none; padding: 0; overflow: hidden; }
.advanced-viewport-body .advanced-candidate { box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; height: 72px; min-height: 0; padding: 6px 9px; overflow: hidden; }
.advanced-viewport-body .advanced-candidate > span:nth-child(2) { flex: 1; min-width: 0; }.advanced-viewport-body .advanced-candidate :is(strong,small) { display: block; min-width: 0; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.advanced-viewport-body .advanced-candidate strong { font-size: 13px; }.advanced-viewport-body .advanced-candidate em { max-width: 32%; font-size: 10px; white-space: normal; }.advanced-viewport-body .advanced-candidate-mark { flex: 0 0 30px; width: 30px; height: 30px; margin: 0; }
.advanced-viewport-body > .advanced-catalog-tools { display: flex; flex-wrap: nowrap; flex: none; gap: 5px; margin: 0; padding: 3px; }
.advanced-viewport-body > .advanced-catalog-tools > input { flex: 1 1 50%; width: 50%; min-width: 0; min-height: 30px; padding: 3px 6px; font-size: 11px; }
.advanced-viewport-body > .advanced-catalog-tools .advanced-filters { display: flex; flex-wrap: nowrap; flex: 1 1 50%; gap: 3px; margin: 0; }.advanced-viewport-body > .advanced-catalog-tools .advanced-filters button { flex: 1; min-height: 28px; padding: 2px 3px; font-size: 10px; }
.advanced-viewport-message { flex: none; min-height: 26px; padding: 3px 7px; overflow: hidden; color: #a25e5f; background: #fff0e3; text-align: left; font-size: 11px; white-space: nowrap; text-overflow: ellipsis; }
.advanced-viewport-backdrop { position: fixed; z-index: 123; inset: 0; display: grid; place-items: center; padding: 14px; background: #292b36a8; }
.advanced-viewport-dialog { box-sizing: border-box; display: flex; flex-direction: column; width: min(850px,100%); max-height: calc(100dvh - 28px); padding: 13px; overflow: hidden; color: #574b43; background: #fff6e5; border: 1px solid #c5a67b; border-radius: 10px; }
.advanced-viewport-dialog > header { display: flex; justify-content: space-between; align-items: center; flex: none; gap: 8px; }.advanced-viewport-dialog > header h3 { margin: 0; font-size: 17px; }.advanced-viewport-dialog > header button { flex: none; min-height: 30px; color: #6f604a; background: #f1e1c7; border-radius: 4px; font-size: 12px; }
.advanced-viewport-dialog-body { min-height: 0; overflow: auto; overscroll-behavior: contain; }.advanced-viewport-dialog-body > .advanced-detail { padding: 10px 0; border: 0; background: transparent; }
@media (max-height: 480px) { .advanced-viewport-panel > .advanced-header { min-height: 26px; padding: 3px 7px; }.advanced-viewport-panel > .advanced-header .advanced-mark { display: none; }.advanced-viewport-panel > .advanced-viewport-body { gap: 3px; padding: 3px; }.advanced-viewport-body > .advanced-viewport-summary-button { min-height: 23px; font-size: 10px; }.advanced-viewport-body .advanced-catalog-head { display: none; }.advanced-viewport-body .advanced-catalog { gap: 3px; padding: 3px; }.advanced-viewport-body > .advanced-catalog-tools > input { min-height: 26px; }.advanced-viewport-body > .advanced-catalog-tools .advanced-filters button { min-height: 25px; } }

</style>
