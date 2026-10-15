<script setup lang="ts">
import '../anime-growth-commerce.css';
import '../game-ui-evolution.css';
import '../evolution-panel-art.css';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import { computed, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import * as evolutionApi from '../evolution-api';
import type {
  EvolutionAction, EvolutionHistory, EvolutionMutation, EvolutionMutationDetail,
  EvolutionMutationPreview, EvolutionStatus
} from '../evolution-api';
import EvolutionProgressionControls from './EvolutionProgressionControls.vue';
import EvolutionBodyChart from './EvolutionBodyChart.vue';
import ViewportPagination from './ViewportPagination.vue';
import { useViewportPagination } from '../useViewportPagination';

type Tab = 'overview' | 'resources' | 'mutations' | 'history';
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const emit = defineEmits<{ updated: []; 'pending-change': [pending: boolean]; locate: [command: string] }>();
const tab = ref<Tab>('overview');
const evolutionViewportList = ref<HTMLElement | null>(null);
const evolutionViewportProgressionOpen = ref(false);
const evolutionViewportInfo = ref<{ label: string; value: string } | null>(null);
const evolutionViewportMessagesOpen = ref(false);
const status = ref<EvolutionStatus | null>(null);
const selectedMutationId = ref<number | null>(null);
const detail = ref<EvolutionMutationDetail | null>(null);
const preview = ref<EvolutionMutationPreview | null>(null);
const retryConfirmation = ref(false);
const loading = ref(false);
const detailLoading = ref(false);
const pending = ref(false);
const progressionPending = ref(false);
const resolutionPending = computed(() => pending.value || retryConfirmation.value || progressionPending.value);
watch(resolutionPending, value => emit('pending-change', value), { immediate: true });
const error = ref('');
const detailError = ref('');
const notice = ref('');
const now = ref(Date.now());
let statusVersion = 0;
let detailVersion = 0;

const lab = computed(() => status.value?.lab ?? null);
const selectedSummary = computed(() => status.value?.mutations.find(item => item.id === selectedMutationId.value) ?? null);
const selectedDetail = computed(() => detail.value?.mutation.id === selectedMutationId.value ? detail.value.mutation : null);
const quoteExpired = computed(() => preview.value ? now.value >= new Date(preview.value.expiresAt).getTime() : false);
const materialNames: Record<string, string> = {
  evolution_active_sample: '活性样本', evolution_stable_medium: '稳定介质', evolution_catalyst: '演化催化剂'
};
const injectionNames: Record<string, string> = {
  conservative: '保守针剂', aggressive: '激进针剂', harmonic: '调和针剂', perception: '感知针剂',
  symbiosis: '共生针剂', metamorphosis: '蜕变针剂', shaping: '定型针剂'
};
const stateNames: Record<string, string> = { stable: '稳定', deviation: '偏差', rare: '稀有', paused: '已暂停', archived: '已封存' };
const eventNames: Record<string, string> = {
  'evolution.injected': '完成进化注射',
  'evolution.mutation_paused': '暂停变异',
  'evolution.mutation_resumed': '恢复变异',
  'evolution.mutation_stabilized': '稳定变异',
  'evolution.mutation_archived': '封存变异',
  'evolution.observation_accepted': '接取观察',
  'evolution.observation_completed': '完成观察',
  'evolution.observation_claimed': '领取观察报酬'
};
const effectNames: Record<string, string> = {
  hpPct: '生命', mpPct: '魔力', physicalAttackPct: '物攻', magicAttackPct: '魔攻',
  physicalDefensePct: '物防', magicDefensePct: '魔防', accuracyPct: '命中', evasionPct: '闪避',
  critRatePct: '暴击率', critDamagePct: '暴击伤害', critResistPct: '暴击抗性',
  critDamageReductionPct: '暴伤减免', tenacityPct: '韧性', tenacityPiercePct: '韧性穿透',
  speedPct: '速度', damageReductionPct: '伤害减免', hpRegenPct: '生命恢复',
  mpRegenPct: '魔力恢复', healingBonusPct: '治疗加成', healingReceivedPct: '受疗加成'
};

function count(value: number) { return Number(value).toLocaleString('zh-CN'); }
function stateName(value: string) { return stateNames[value] ?? value; }
function actionName(action: EvolutionAction) { return action === 'pause' ? '暂停' : '恢复'; }
function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未记录' : date.toLocaleString('zh-CN');
}
function effectRows(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, amount]) => typeof amount === 'number' && Number.isFinite(amount))
    .map(([key, amount]) => ({ name: effectNames[key] ?? key,
      value: `${Number(amount) > 0 ? '+' : ''}${amount}${key.endsWith('Pct') ? '%' : ''}` }));
}
function historyDetail(record: EvolutionHistory) {
  const value = record.payload;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const payload = value as Record<string, unknown>;
  if (typeof payload.mutationId === 'number') {
    const mutation = status.value?.mutations.find(item => item.id === payload.mutationId);
    return mutation?.name ?? `变异记录 #${payload.mutationId}`;
  }
  if (record.eventType === 'evolution.injected') {
    const name = injectionNames[String(payload.code ?? '')] ?? String(payload.code ?? '进化针剂');
    const level = typeof payload.level === 'number' ? ` · Lv.${payload.level}` : '';
    return `${name}${level}`;
  }
  return typeof payload.type === 'string' ? payload.type : '';
}

type EvolutionViewportEntry = { key: string; label: string; value: string; code?: string; category?: string;
  mutation?: EvolutionMutation; record?: EvolutionHistory };
const evolutionViewportEntries = computed<EvolutionViewportEntry[]>(() => {
  const value = status.value;
  if (!value) return [];
  if (tab.value === 'mutations') return value.mutations.map(mutation => ({ key: `mutation-${mutation.id}`,
    label: mutation.name, value: `${mutation.bodyPartName} · ${stateName(mutation.state)} · 阶 ${mutation.tier}`, mutation }));
  if (tab.value === 'history') return value.history.map((record, index) => ({ key: `history-${index}`,
    label: eventNames[record.eventType] ?? record.eventType,
    value: [historyDetail(record), dateText(record.createdAt)].filter(Boolean).join(' · '), record }));
  if (tab.value === 'resources') return [
    ...value.materials.map(material => ({ key: `material-${material.code}`, label: materialNames[material.code] ?? material.code,
      value: `进化材料 · ×${count(material.quantity)}`, code: material.code, category: '材料' })),
    ...value.injections.map(injection => ({ key: `injection-${injection.code}`, label: injection.name,
      value: `针剂库存 · ×${count(injection.quantity)}`, code: `evolution_injection_${injection.code}`, category: '育成' }))
  ];
  const profile = value.profile;
  if (!profile) return [];
  return [
    { key: 'level', label: '当前进化阶段', value: `Lv.${profile.unlockedLevel}` },
    { key: 'character-level', label: '角色等级', value: `Lv.${value.character?.level ?? '—'}` },
    { key: 'injections', label: '已注射', value: `${count(profile.injectionCount)} 次` },
    { key: 'scale', label: '进化尺度', value: count(profile.evolutionScale) },
    { key: 'pressure', label: '适应压力', value: count(profile.adaptationPressure) },
    { key: 'stability', label: '稳定度', value: count(profile.stability) },
    { key: 'symbiosis', label: '共生特征', value: profile.symbiosisTraitCode
      ? ({ shared_guard: '共护膜', mana_circulation: '并联回路', healing_resonance: '复苏共鸣' } as Record<string, string>)[profile.symbiosisTraitCode] ?? profile.symbiosisTraitCode : '未选择' }
  ];
});
const evolutionViewportPagination = useViewportPagination(() => evolutionViewportEntries.value, {
  container: evolutionViewportList, rowHeight: 64, columns: () => tab.value === 'overview' ? 2 : 1, gap: 6
});
watch(tab, () => evolutionViewportPagination.reset());
function evolutionViewportSelect(entry: EvolutionViewportEntry) {
  if (entry.mutation) { void selectMutation(entry.mutation); return; }
  evolutionViewportInfo.value = { label: entry.label, value: entry.value };
}
function evolutionViewportLabInfo() {
  const value = lab.value;
  if (!value) return;
  evolutionViewportInfo.value = { label: value.unlocked ? value.atSite ? '已到达演化研究室' : '演化研究室已开放' : '演化研究室尚未开放',
    value: [value.target ? `${value.target.regionName} · (${value.target.x}, ${value.target.y}, ${value.target.z})`
      : '完成对应进化阶段后将显示研究室位置。', value.atSite ? '可查看效果并操作可用变异。' : '当前仅查看档案。'].join('\n') };
}

async function loadStatus() {
  if (!props.active) return false;
  const version = ++statusVersion;
  loading.value = true;
  try {
    const result = await evolutionApi.evolutionStatus();
    if (version !== statusVersion || !props.active) return false;
    status.value = result;
    if (selectedMutationId.value && !result.mutations.some(item => item.id === selectedMutationId.value)) {
      selectedMutationId.value = null;
      detail.value = null;
      if (!retryConfirmation.value) preview.value = null;
      ++detailVersion;
    }
    if (!result.lab.atSite) {
      detail.value = null;
      ++detailVersion;
    }
    return true;
  } catch (cause) {
    if (version === statusVersion) error.value = userFacingErrorMessage(cause);
    return false;
  } finally {
    if (version === statusVersion) loading.value = false;
  }
}

async function loadDetail(id: number) {
  if (!props.active || !lab.value?.atSite) return;
  const version = ++detailVersion;
  detailLoading.value = true;
  detailError.value = '';
  detail.value = null;
  try {
    const result = await evolutionApi.evolutionMutation(id);
    if (version === detailVersion && props.active && lab.value?.atSite && selectedMutationId.value === id) detail.value = result;
  } catch (cause) {
    if (version === detailVersion) detailError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}

async function refresh() {
  if (resolutionPending.value || loading.value) return;
  error.value = '';
  const loaded = await loadStatus();
  if (loaded && selectedMutationId.value && lab.value?.atSite) void loadDetail(selectedMutationId.value);
}
function selectMutation(mutation: EvolutionMutation) {
  if (resolutionPending.value) return;
  selectedMutationId.value = mutation.id;
  detail.value = null;
  detailError.value = '';
  preview.value = null;
  retryConfirmation.value = false;
  error.value = '';
  if (lab.value?.atSite) void loadDetail(mutation.id);
}
function closeDetail() {
  if (resolutionPending.value) return;
  selectedMutationId.value = null;
  detail.value = null;
  detailError.value = '';
  preview.value = null;
  retryConfirmation.value = false;
  ++detailVersion;
}

async function previewAction(action: EvolutionAction) {
  const mutation = selectedDetail.value;
  if (resolutionPending.value || !lab.value?.atSite || !mutation || !mutation.availableActions.includes(action)) return;
  pending.value = true;
  error.value = '';
  notice.value = '';
  preview.value = null;
  retryConfirmation.value = false;
  try {
    const result = await evolutionApi.previewEvolutionMutation(mutation.id, action);
    if (props.active && selectedMutationId.value === mutation.id) { now.value = Date.now(); preview.value = result; }
  } catch (cause) {
    if (props.active) {
      const message = userFacingErrorMessage(cause);
      await loadStatus();
      if (lab.value?.atSite) void loadDetail(mutation.id);
      error.value = message;
    }
  } finally { pending.value = false; }
}

async function confirmAction() {
  const quote = preview.value;
  if (!quote || pending.value || !props.active || (!lab.value?.atSite && !retryConfirmation.value)) return;
  if (Date.now() >= new Date(quote.expiresAt).getTime() && !retryConfirmation.value) {
    preview.value = null;
    retryConfirmation.value = false;
    error.value = '变异操作报价已过期，请重新预览。';
    return;
  }
  pending.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await evolutionApi.confirmEvolutionMutation(quote.token, quote.idempotencyKey);
    preview.value = null;
    retryConfirmation.value = false;
    notice.value = `${response.result.name}已${response.result.paused ? '暂停' : '恢复'}。`;
    emit('updated');
    if (props.active) {
      await loadStatus();
      if (lab.value?.atSite && selectedMutationId.value) void loadDetail(selectedMutationId.value);
    }
  } catch (cause) {
    if (props.active) {
      const message = userFacingErrorMessage(cause);
      const retryable = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
      if (!retryable) preview.value = null;
      retryConfirmation.value = retryable;
      await loadStatus();
      if (lab.value?.atSite && selectedMutationId.value) void loadDetail(selectedMutationId.value);
      if (retryable) emit('updated');
      error.value = retryable ? `${message} 原确认凭据已保留，可核对变异状态后重试。`
        : `${message} 已重新读取变异状态，请再次预览。`;
    }
  } finally { pending.value = false; }
}

watch(() => props.active, (active, _previous, onCleanup) => {
  ++statusVersion;
  ++detailVersion;
  if (!active) { loading.value = false; closeDetail(); return; }
  now.value = Date.now();
  const timer = window.setInterval(() => { now.value = Date.now(); }, 1000);
  onCleanup(() => window.clearInterval(timer));
  void refresh();
}, { immediate: true });

defineExpose({ refresh });
</script>

<template>
  <section v-if="active" class="evolution-panel evolution-viewport-panel evolution-journal evolution-research-panel anime-growth-commerce" :data-evolution-tab="tab" aria-label="进化档案">
    <header class="evolution-heading">
      <div class="evolution-research-title"><i class="evolution-research-emblem" data-emblem="journal" aria-hidden="true" /><div><h2>生命演化研究台</h2><p class="evolution-research-caption"><span>进化档案</span><span v-if="status?.character">角色 Lv.{{ status.character.level }}</span><span v-if="status?.profile">进化 Lv.{{ status.profile.unlockedLevel }}</span></p></div></div>
      <button type="button" :disabled="loading || resolutionPending" @click="refresh">{{ loading ? '读取中…' : '刷新' }}</button>
    </header>
    <button v-if="error || retryConfirmation || notice" type="button" class="evolution-viewport-message" :class="{ error: error || retryConfirmation }" @click="evolutionViewportMessagesOpen = true">{{ error || (retryConfirmation ? '确认结果待核对，请保留原凭据' : notice) }} · 查看完整提示</button>
    <p v-if="loading && !status" class="evolution-empty game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在读取进化档案…</span></p>
    <template v-if="status">
      <div class="evolution-viewport-gate" :class="{ 'is-onsite': status.lab.atSite }"><button type="button" @click="evolutionViewportLabInfo">{{ status.lab.unlocked ? status.lab.atSite ? '已到达演化研究室' : '演化研究室已开放' : '演化研究室尚未开放' }} ⓘ</button><button v-if="status.lab.target && !status.lab.atSite" type="button" :disabled="resolutionPending" @click="emit('locate', `/前往 ${status.lab.target.x} ${status.lab.target.y} ${status.lab.target.z}`)">前往研究室</button></div>
      <div v-if="!status.profileOpened || !status.profile" class="evolution-locked"><h3>进化档案尚未开启</h3><p class="game-ui-empty-message"><GameUiFeedbackArt name="message" :size="36" /><span>当前暂无阶段、资源与变异记录。</span></p></div>
      <template v-else>
        <nav class="evolution-tabs" aria-label="进化档案栏目"><button type="button" :class="{ active: tab === 'overview' }" :aria-pressed="tab === 'overview'" :disabled="resolutionPending" @click="tab = 'overview'"><i class="evolution-research-emblem" data-emblem="level" aria-hidden="true" /><span>阶段</span></button><button type="button" :class="{ active: tab === 'resources' }" :aria-pressed="tab === 'resources'" :disabled="resolutionPending" @click="tab = 'resources'"><i class="evolution-research-emblem" data-emblem="injections" aria-hidden="true" /><span>资源</span></button><button type="button" :class="{ active: tab === 'mutations' }" :aria-pressed="tab === 'mutations'" :disabled="resolutionPending" @click="tab = 'mutations'"><i class="evolution-research-emblem" data-emblem="symbiosis" aria-hidden="true" /><span>变异</span><small class="evolution-research-tab-count">{{ status.mutations.length }}</small></button><button type="button" :class="{ active: tab === 'history' }" :aria-pressed="tab === 'history'" :disabled="resolutionPending" @click="tab = 'history'"><i class="evolution-research-emblem" data-emblem="journal" aria-hidden="true" /><span>历程</span><small class="evolution-research-tab-count">{{ status.history.length }}</small></button></nav>
        <div class="evolution-viewport-toolbar"><span>{{ tab === 'overview' ? `当前进化 Lv.${status.profile.unlockedLevel}` : tab === 'resources' ? '进化材料与针剂库存' : tab === 'mutations' ? status.lab.atSite ? '选择变异查看效果与操作' : '效果与操作需到达研究室' : '选择记录查看完整历程' }}</span><button v-if="tab === 'overview'" type="button" @click="evolutionViewportProgressionOpen = true">进化操作</button></div>
        <div ref="evolutionViewportList" class="evolution-viewport-list evolution-stage" :class="{ 'is-metrics': tab === 'overview' }">
          <button v-for="entry in evolutionViewportPagination.visibleItems.value" :key="entry.key" type="button" class="evolution-viewport-entry" :class="{ 'evolution-mutation': entry.mutation }" :data-evolution-entry="entry.key" :disabled="Boolean(entry.mutation && resolutionPending)" @click="evolutionViewportSelect(entry)">
            <i class="evolution-research-emblem" :data-emblem="entry.code ? entry.category === '育成' ? 'injections' : 'scale' : entry.record ? 'journal' : entry.mutation ? 'symbiosis' : entry.key" aria-hidden="true" />
            <span class="evolution-entry-copy"><strong>{{ entry.label }}</strong><small>{{ entry.value }}</small><span v-if="entry.key === 'pressure' || entry.key === 'stability'" class="evolution-research-gauge" :data-gauge="entry.key"><meter min="0" :max="entry.key === 'pressure' ? 8 : 100" :value="Number(entry.value)" :aria-label="entry.label" /></span></span><b v-if="tab !== 'overview'" aria-hidden="true">›</b>
          </button>
          <p v-if="!evolutionViewportEntries.length" class="evolution-empty game-ui-empty-message"><GameUiFeedbackArt name="empty" :size="36" /><span>{{ tab === 'mutations' ? '目前没有变异记录。' : tab === 'history' ? '暂无进化历程记录。' : '暂无资源记录。' }}</span></p>
        </div>
        <ViewportPagination :page="evolutionViewportPagination.page.value" :total-pages="evolutionViewportPagination.totalPages.value" :total="evolutionViewportEntries.length" :disabled="resolutionPending" label="进化档案翻页" @update:page="evolutionViewportPagination.setPage" />
        <Teleport to="body">
          <div v-if="selectedSummary" class="evolution-viewport-backdrop evolution-journal-overlay evolution-research-overlay anime-growth-commerce" @click.self="closeDetail"><aside v-if="selectedSummary" class="evolution-detail evolution-viewport-detail" role="dialog" aria-modal="true" aria-label="变异详情" @keydown.esc.stop.prevent="closeDetail"><button class="evolution-detail-close" type="button" :disabled="resolutionPending" @click="closeDetail">收起 ×</button><EvolutionBodyChart class="evolution-viewport-body-chart" :selected-part="selectedSummary.bodyPartName" /><small>{{ selectedSummary.bodyPartName }} · {{ stateName(selectedSummary.state) }}</small><h3>{{ selectedSummary.name }}</h3><p v-if="error" class="evolution-error" role="alert">{{ error }}</p><p v-if="notice" class="evolution-notice" role="status">{{ notice }}</p><p>来源针剂：{{ injectionNames[selectedSummary.sourceInjection] ?? selectedSummary.sourceInjection }}</p><p v-if="!status.lab.atSite" class="evolution-hint">到达演化研究室后可查看效果详情。</p><template v-else><p v-if="detailLoading" class="evolution-hint">正在读取效果…</p><p v-if="detailError" class="evolution-error" role="alert">{{ detailError }}</p><template v-if="selectedDetail"><p class="evolution-description">{{ selectedDetail.description }}</p><div v-if="effectRows(selectedDetail.effect).length" class="evolution-effects"><span v-for="row in effectRows(selectedDetail.effect)" :key="row.name">{{ row.name }} {{ row.value }}</span></div><div v-if="selectedDetail.availableActions.length" class="evolution-actions"><button v-for="action in selectedDetail.availableActions" :key="action" type="button" :disabled="resolutionPending" @click="previewAction(action)">预览{{ actionName(action) }}</button></div><p v-else class="evolution-hint">这份变异当前没有可用操作。</p></template></template>
              <div v-if="preview" class="evolution-quote"><strong>变异状态确认</strong><p>{{ preview.quote.name }}：{{ stateName(preview.quote.stateBefore) }} → {{ stateName(preview.quote.stateAfter) }}</p><p>效果：{{ preview.quote.effectEnabledBefore ? '生效' : '暂停' }} → {{ preview.quote.effectEnabledAfter ? '生效' : '暂停' }}</p><small>报价有效至 {{ dateText(preview.expiresAt) }}；确认时仍会复核状态。</small><button type="button" :disabled="pending || (quoteExpired && !retryConfirmation) || (!status.lab.atSite && !retryConfirmation)" @click="confirmAction">{{ retryConfirmation ? '用原凭据核对确认结果' : `明确确认${preview.quote.paused ? '暂停' : '恢复'}` }}</button><p v-if="quoteExpired" class="evolution-error">{{ retryConfirmation ? '报价已过期；原确认凭据仅能回读已完成结果。' : '报价已过期，请重新预览。' }}</p></div>
            </aside></div>
          <div v-show="evolutionViewportProgressionOpen" class="evolution-viewport-backdrop evolution-journal-overlay evolution-research-overlay anime-growth-commerce" @click.self="!resolutionPending && (evolutionViewportProgressionOpen = false)">
            <section class="evolution-viewport-dialog" role="dialog" aria-modal="true" aria-label="进化操作" @keydown.esc.stop.prevent="!resolutionPending && (evolutionViewportProgressionOpen = false)"><header><h3>进化操作</h3><button type="button" :disabled="resolutionPending" @click="evolutionViewportProgressionOpen = false">关闭 ×</button></header><div class="evolution-viewport-dialog-body"><EvolutionProgressionControls :status="status" :disabled="pending || retryConfirmation" @pending-change="value => progressionPending = value" @updated="() => { void loadStatus(); emit('updated'); }" /></div></section>
          </div>
        </Teleport>
      </template>
    </template>
    <Teleport to="body">
      <div v-if="evolutionViewportInfo" class="evolution-viewport-backdrop evolution-journal-overlay evolution-research-overlay anime-growth-commerce" @click.self="evolutionViewportInfo = null"><section class="evolution-viewport-dialog" role="dialog" aria-modal="true" :aria-label="evolutionViewportInfo.label" @keydown.esc.stop.prevent="evolutionViewportInfo = null"><header><h3>{{ evolutionViewportInfo.label }}</h3><button type="button" @click="evolutionViewportInfo = null">关闭 ×</button></header><div class="evolution-viewport-dialog-body"><p class="evolution-viewport-full-text">{{ evolutionViewportInfo.value }}</p></div></section></div>
      <div v-if="evolutionViewportMessagesOpen" class="evolution-viewport-backdrop evolution-journal-overlay evolution-research-overlay anime-growth-commerce" @click.self="evolutionViewportMessagesOpen = false"><section class="evolution-viewport-dialog" role="dialog" aria-modal="true" aria-label="进化操作提示" @keydown.esc.stop.prevent="evolutionViewportMessagesOpen = false"><header><h3>操作提示</h3><button type="button" @click="evolutionViewportMessagesOpen = false">关闭 ×</button></header><div class="evolution-viewport-dialog-body"><p v-if="error" class="evolution-error" role="alert">{{ error }}</p><p v-if="retryConfirmation" class="evolution-error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能离开或切换变异；网络持续不可用时请保持页面打开，稍后重试。</p><p v-if="notice" class="evolution-notice" role="status">{{ notice }}</p><div v-if="retryConfirmation && preview" class="evolution-quote"><strong>变异确认结果待核对</strong><p>原确认请求已发出；可用原凭据核对。未完成的过期请求不会执行。</p><button type="button" :disabled="pending" @click="confirmAction">用原凭据核对结果</button></div></div></section></div>
    </Teleport>
  </section>
</template>

<style scoped>
.evolution-panel { max-width: 1200px; margin: 0 auto; padding: 16px clamp(12px, 2.3vw, 27px) 30px; color: #394354; }.evolution-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 17px; }.evolution-heading h2 { margin: 3px 0; color: #3d4a64; font-size: clamp(23px, 3vw, 31px); }.evolution-heading p:last-child { margin: 0; color: #8891a3; font-size: 12px; }.evolution-heading button { flex: none; min-height: 35px; padding: 8px 15px; color: #5d6d94; background: #fff; border: 1px solid #d8deec; border-radius: 999px; font-size: 12px; font-weight: 700; }.evolution-eyebrow { margin: 0; color: #8a94b2; font-size: 10px; font-weight: 800; letter-spacing: .14em; }
.evolution-gate, .evolution-stage, .evolution-card, .evolution-detail, .evolution-locked { border: 1px solid #e0e4ed; border-radius: 16px; background: #fff; box-shadow: 0 5px 20px #50607c0c; }.evolution-gate { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 14px 16px; background: #f8f8fc; }.evolution-gate.unlocked { background: #f3f7fb; }.evolution-gate.onsite { background: #edf8f4; border-color: #cfe7db; }.evolution-gate-icon { display: grid; place-items: center; flex: 0 0 39px; width: 39px; height: 39px; color: #8097b5; background: #e8eef7; border-radius: 11px; font-size: 26px; }.evolution-gate > div { flex: 1; min-width: 0; }.evolution-gate strong { color: #4c5b74; font-size: 13px; }.evolution-gate p { margin: 4px 0 0; color: #8794a3; font-size: 11px; overflow-wrap: anywhere; }.evolution-gate > small { color: #8694a1; font-size: 11px; text-align: right; }
.evolution-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 17px 0; background: #f6f7fb; border: 1px solid #e7eaf1; border-radius: 12px; padding: 4px; }.evolution-tabs button { min-height: 38px; color: #8590a3; background: none; border-radius: 9px; font-size: 12px; }.evolution-tabs button.active { color: #536b97; background: white; box-shadow: 0 2px 9px #5c6d8a19; font-weight: 800; }
.evolution-stage { display: flex; align-items: center; gap: 16px; padding: 19px; background: linear-gradient(112deg, #f6f5fc, #edf5f8); }.evolution-stage-symbol { display: grid; place-items: center; flex: 0 0 57px; width: 57px; height: 57px; color: white; background: linear-gradient(135deg, #9ba5c8, #77a9b7); border-radius: 16px; font-size: 37px; }.evolution-stage > div:last-child { display: grid; gap: 3px; }.evolution-stage span, .evolution-stage small { color: #8993a8; font-size: 11px; }.evolution-stage strong { color: #536487; font-size: 24px; }
.evolution-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; margin: 12px 0 17px; }.evolution-metrics > div { display: grid; gap: 5px; min-width: 0; padding: 13px; background: white; border: 1px solid #e3e7ef; border-radius: 12px; }.evolution-metrics span { color: #929bab; font-size: 11px; }.evolution-metrics strong { color: #556587; font-size: 19px; }.evolution-metrics .evolution-metric-text { font-size: 13px; overflow-wrap: anywhere; }.evolution-resources { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }.evolution-card { min-width: 0; padding: 16px; }.evolution-section-head h3 { margin: 4px 0 13px; color: #52617d; font-size: 16px; }.evolution-resource-list { display: grid; gap: 7px; }.evolution-resource-list > div { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 7px 9px; background: #f9fafc; border-radius: 9px; font-size: 12px; }.evolution-resource-list :deep(.inventory-art-wrap) { flex: 0 0 35px; width: 35px; height: 35px; margin: 0; background: #eff3f9; border-radius: 8px; }.evolution-resource-list :deep(.inventory-item-image) { width: 32px; height: 32px; }.evolution-resource-list span:not(.inventory-art-wrap) { flex: 1; min-width: 0; color: #62708b; }.evolution-resource-list strong { color: #597293; }
.evolution-hint { margin: 11px 0; color: #8896a7; font-size: 12px; line-height: 1.5; }.evolution-mutation-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, 355px); gap: 14px; align-items: start; }.evolution-mutation-grid:not(:has(.evolution-detail)) { display: block; }.evolution-mutation-list { display: grid; gap: 7px; min-width: 0; }.evolution-mutation { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; color: inherit; text-align: left; background: white; border: 1px solid #e3e8f0; border-radius: 11px; }.evolution-mutation.selected { border-color: #a5b5d0; background: #f8fbff; }.evolution-mutation-mark { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; color: #869cc1; background: #eff3fb; border-radius: 9px; font-size: 21px; }.evolution-mutation > span:nth-child(2) { display: grid; gap: 3px; flex: 1; min-width: 0; }.evolution-mutation strong { color: #586883; font-size: 13px; }.evolution-mutation small { color: #929dae; font-size: 11px; }.evolution-mutation b { color: #9cacc6; font-size: 20px; font-weight: 400; }
.evolution-detail { min-width: 0; padding: 16px; }.evolution-detail-close { float: right; color: #7c8da8; background: none; font-size: 11px; }.evolution-detail > small { color: #9aa7b9; font-size: 11px; }.evolution-detail h3 { margin: 5px 0 9px; color: #506180; font-size: 17px; }.evolution-detail > p { color: #8792a2; font-size: 12px; line-height: 1.55; }.evolution-detail .evolution-description { color: #63728b; }.evolution-effects { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0; }.evolution-effects span { padding: 5px 8px; color: #61799b; background: #edf3fa; border-radius: 999px; font-size: 11px; }.evolution-actions { display: flex; gap: 7px; margin-top: 14px; }.evolution-actions button, .evolution-quote button { min-height: 35px; padding: 8px 12px; color: white; background: #7188ae; border-radius: 8px; font-size: 12px; font-weight: 800; }.evolution-quote { display: grid; gap: 7px; margin-top: 16px; padding: 13px; color: #63728a; background: #eef4fa; border: 1px solid #dbe6f1; border-radius: 11px; font-size: 12px; line-height: 1.45; }.evolution-quote strong { color: #526e9a; font-size: 14px; }.evolution-quote p { margin: 0; }.evolution-quote small { color: #8393a6; }.evolution-quote button { width: 100%; }
.evolution-history { display: grid; gap: 0; padding: 6px 18px; background: white; border: 1px solid #e3e8ef; border-radius: 15px; }.evolution-history article { display: flex; gap: 12px; padding: 14px 0; border-bottom: 1px solid #edf0f4; }.evolution-history article:last-of-type { border-bottom: 0; }.evolution-history-dot { width: 9px; height: 9px; flex: none; margin-top: 4px; border-radius: 50%; background: #9caed0; box-shadow: 0 0 0 4px #eef2fa; }.evolution-history strong { color: #60718d; font-size: 13px; }.evolution-history p { margin: 3px 0; color: #76849a; font-size: 12px; }.evolution-history small { color: #a0abba; font-size: 11px; }
.evolution-locked { margin-top: 17px; padding: 35px 18px; text-align: center; }.evolution-locked span { color: #9aa9c6; font-size: 37px; }.evolution-locked h3 { margin: 5px 0; color: #5e6a83; font-size: 17px; }.evolution-locked p { margin: 0; color: #929cac; font-size: 12px; }.evolution-empty { padding: 28px 10px; color: #98a3b2; text-align: center; font-size: 12px; }.evolution-error, .evolution-notice { margin: 0 0 12px; padding: 10px 12px; border-radius: 9px; font-size: 12px; line-height: 1.5; }.evolution-error { color: #ad6068; background: #fff0ed; }.evolution-notice { color: #547b67; background: #eaf7ed; }
button { border: 0; cursor: pointer; font: inherit; }button:disabled { opacity: .5; cursor: not-allowed; }button:focus-visible { outline: 3px solid #7594bf; outline-offset: 2px; }
@media (max-width: 750px) { .evolution-panel { padding: 12px 10px 25px; }.evolution-gate { padding: 11px; }.evolution-gate > small { display: none; }.evolution-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }.evolution-resources { grid-template-columns: minmax(0, 1fr); }.evolution-mutation-grid { display: flex; flex-direction: column; }.evolution-mutation-list, .evolution-detail { width: 100%; }.evolution-detail { order: -1; }.evolution-card { padding: 13px; } }
@media (max-width: 380px) { .evolution-tabs button { font-size: 11px; }.evolution-gate-icon { flex-basis: 32px; width: 32px; height: 32px; }.evolution-stage { gap: 10px; padding: 14px; }.evolution-stage-symbol { flex-basis: 46px; width: 46px; height: 46px; font-size: 29px; } }

.evolution-viewport-panel { box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; width: 100%; height: 100%; min-height: 0; max-width: none; padding: 7px; overflow: hidden; }
.evolution-viewport-panel > .evolution-heading { flex: none; min-height: 27px; gap: 8px; margin: 0; }
.evolution-viewport-panel > .evolution-heading h2 { display: flex; align-items: center; gap: 5px; margin: 0; font-size: 17px; }
.evolution-viewport-panel > .evolution-heading button { min-height: 27px; padding: 3px 10px; }
.evolution-viewport-gate, .evolution-viewport-toolbar { display: flex; align-items: center; justify-content: space-between; flex: none; gap: 5px; min-width: 0; min-height: 26px; font-size: 11px; }
.evolution-viewport-gate button, .evolution-viewport-toolbar button { min-height: 26px; padding: 4px 7px; color: #326d6e; background: #f7ecd4; border: 1px solid #ccb58d; border-radius: 4px; font-size: 11px; }
.evolution-viewport-panel > .evolution-tabs { flex: none; grid-template-columns: repeat(4,minmax(0,1fr)); margin: 0; padding: 2px; }
.evolution-viewport-panel > .evolution-tabs button { min-height: 29px; padding: 2px; }
.evolution-viewport-list { display: grid; grid-template-columns: minmax(0,1fr); grid-auto-rows: 64px; align-content: start; gap: 6px; flex: 1; min-height: 0; overflow: hidden; }
.evolution-viewport-list.is-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); }
.evolution-viewport-list > .evolution-viewport-entry { box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; height: 64px; min-height: 0; margin: 0; padding: 6px 9px; overflow: hidden; text-align: left; color: #524b41; background: #fff6e3; border: 1px solid #ccb58d; border-radius: 5px; }
.evolution-viewport-entry > span { display: grid; gap: 3px; flex: 1; min-width: 0; }
.evolution-viewport-entry strong, .evolution-viewport-entry small { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evolution-viewport-entry strong { font-size: 13px; }.evolution-viewport-entry small { color: #88755e; font-size: 11px; }.evolution-viewport-entry b { font-weight: 400; }
.evolution-viewport-entry :deep(.inventory-art-wrap) { flex: 0 0 36px; width: 36px; height: 36px; margin: 0; }
.evolution-viewport-entry meter { width: 100%; height: 7px; }
.evolution-viewport-message { display: block; flex: none; min-height: 26px; padding: 4px 7px; overflow: hidden; color: #3d715c; background: #eaf5e7; text-align: left; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.evolution-viewport-message.error { color: #a3595c; background: #fff0e4; }
.evolution-viewport-backdrop { position: fixed; z-index: 122; inset: 0; display: grid; place-items: center; padding: 14px; background: #292b36a8; }
.evolution-viewport-dialog, .evolution-viewport-backdrop > .evolution-viewport-detail { box-sizing: border-box; width: min(780px,100%); max-height: calc(100dvh - 28px); margin: 0; padding: 14px; overflow: auto; overscroll-behavior: contain; background: #fff6e5; border: 1px solid #c5a67b; border-radius: 10px; color: #554b40; }
.evolution-viewport-dialog { display: flex; flex-direction: column; overflow: hidden; }
.evolution-viewport-dialog > header { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex: none; }
.evolution-viewport-dialog h3 { margin: 0; font-size: 17px; }.evolution-viewport-dialog > header button { flex: none; min-height: 30px; color: #6f604a; background: #f1e1c7; border-radius: 4px; font-size: 12px; }
.evolution-viewport-dialog-body { min-height: 0; overflow: auto; overscroll-behavior: contain; }.evolution-viewport-full-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.7; }
.evolution-viewport-body-chart { float: left; width: 120px; max-height: 160px; margin: 0 12px 8px 0; overflow: hidden; }
.evolution-viewport-panel > .evolution-locked { margin: 0; padding: 12px; }
@media (max-height: 480px) { .evolution-viewport-panel { gap: 3px; padding: 4px; }.evolution-viewport-panel > .evolution-heading { min-height: 23px; }.evolution-viewport-panel > .evolution-heading h2 { font-size: 14px; }.evolution-viewport-gate, .evolution-viewport-toolbar { min-height: 22px; }.evolution-viewport-gate button, .evolution-viewport-toolbar button { min-height: 22px; padding: 2px 5px; font-size: 10px; }.evolution-viewport-panel > .evolution-tabs button { min-height: 24px; } }

</style>
