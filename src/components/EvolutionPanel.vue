<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import * as evolutionApi from '../evolution-api';
import type {
  EvolutionAction, EvolutionHistory, EvolutionMutation, EvolutionMutationDetail,
  EvolutionMutationPreview, EvolutionStatus
} from '../evolution-api';
import InventoryItemIcon from './InventoryItemIcon.vue';

type Tab = 'overview' | 'mutations' | 'history';
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const emit = defineEmits<{ updated: []; 'pending-change': [pending: boolean] }>();
const tab = ref<Tab>('overview');
const detailCard = ref<HTMLElement | null>(null);
const status = ref<EvolutionStatus | null>(null);
const selectedMutationId = ref<number | null>(null);
const detail = ref<EvolutionMutationDetail | null>(null);
const preview = ref<EvolutionMutationPreview | null>(null);
const retryConfirmation = ref(false);
const loading = ref(false);
const detailLoading = ref(false);
const pending = ref(false);
const resolutionPending = computed(() => pending.value || retryConfirmation.value);
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
async function selectMutation(mutation: EvolutionMutation) {
  if (resolutionPending.value) return;
  selectedMutationId.value = mutation.id;
  detail.value = null;
  detailError.value = '';
  preview.value = null;
  retryConfirmation.value = false;
  error.value = '';
  if (lab.value?.atSite) void loadDetail(mutation.id);
  await nextTick();
  if (window.matchMedia('(max-width: 750px)').matches) detailCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  <section v-if="active" class="evolution-panel" aria-label="进化档案">
    <header class="evolution-heading"><div><p class="evolution-eyebrow">EVOLUTION ARCHIVE</p><h2>进化档案</h2><p>阶段、资源与变异记录</p></div><button type="button" :disabled="loading || resolutionPending" @click="refresh">{{ loading ? '读取中…' : '刷新' }}</button></header>
    <p v-if="error" class="evolution-error" role="alert">{{ error }}</p>
    <p v-if="retryConfirmation" class="evolution-error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能离开或切换变异；网络持续不可用时请保持页面打开，稍后重试。</p>
    <p v-if="notice" class="evolution-notice" role="status">{{ notice }}</p>
    <p v-if="loading && !status" class="evolution-empty" role="status">正在读取进化档案…</p>

    <template v-if="status">
      <div class="evolution-gate" :class="{ unlocked: status.lab.unlocked, onsite: status.lab.atSite }"><span class="evolution-gate-icon" aria-hidden="true">◇</span><div><strong>{{ status.lab.unlocked ? status.lab.atSite ? '已到达演化研究室' : '演化研究室已开放' : '演化研究室尚未开放' }}</strong><p v-if="status.lab.target">{{ status.lab.target.regionName }} · ({{ status.lab.target.x }}, {{ status.lab.target.y }}, {{ status.lab.target.z }})</p><p v-else>完成对应进化阶段后将显示研究室位置。</p></div><small>{{ status.lab.atSite ? '可查看效果并操作可用变异' : '当前仅查看档案' }}</small></div>

      <template v-if="!status.profileOpened || !status.profile">
        <div class="evolution-locked"><span aria-hidden="true">✧</span><h3>进化档案尚未开启</h3><p>当前暂无阶段、资源与变异记录。</p></div>
      </template>
      <template v-else>
        <nav class="evolution-tabs" aria-label="进化档案栏目"><button type="button" :class="{ active: tab === 'overview' }" :disabled="resolutionPending" @click="tab = 'overview'">阶段与资源</button><button type="button" :class="{ active: tab === 'mutations' }" :disabled="resolutionPending" @click="tab = 'mutations'">变异 {{ status.mutations.length }}</button><button type="button" :class="{ active: tab === 'history' }" :disabled="resolutionPending" @click="tab = 'history'">历程 {{ status.history.length }}</button></nav>

        <template v-if="tab === 'overview'">
          <div class="evolution-stage"><div class="evolution-stage-symbol" aria-hidden="true">✧</div><div><span>当前进化阶段</span><strong>Lv.{{ status.profile.unlockedLevel }}</strong><small>角色 Lv.{{ status.character?.level ?? '—' }} · 已注射 {{ count(status.profile.injectionCount) }} 次</small></div></div>
          <div class="evolution-metrics"><div><span>进化尺度</span><strong>{{ count(status.profile.evolutionScale) }}</strong></div><div><span>适应压力</span><strong>{{ count(status.profile.adaptationPressure) }}</strong></div><div><span>稳定度</span><strong>{{ count(status.profile.stability) }}</strong></div><div><span>共生特征</span><strong class="evolution-metric-text">{{ status.profile.symbiosisTraitCode ? ({ shared_guard: '共护膜', mana_circulation: '并联回路', healing_resonance: '复苏共鸣' } as Record<string, string>)[status.profile.symbiosisTraitCode] ?? status.profile.symbiosisTraitCode : '未选择' }}</strong></div></div>
          <div class="evolution-resources"><section class="evolution-card"><div class="evolution-section-head"><p class="evolution-eyebrow">MATERIALS</p><h3>进化材料</h3></div><div class="evolution-resource-list"><div v-for="material in status.materials" :key="material.code"><InventoryItemIcon :name="materialNames[material.code] ?? material.code" :code="material.code" item-category="材料" /><span>{{ materialNames[material.code] ?? material.code }}</span><strong>×{{ count(material.quantity) }}</strong></div></div><p v-if="!status.materials.length" class="evolution-empty">暂无材料记录。</p></section><section class="evolution-card"><div class="evolution-section-head"><p class="evolution-eyebrow">INJECTIONS</p><h3>针剂库存</h3></div><div class="evolution-resource-list"><div v-for="injection in status.injections" :key="injection.code"><InventoryItemIcon :name="injection.name" :code="`evolution_injection_${injection.code}`" item-category="育成" /><span>{{ injection.name }}</span><strong>×{{ count(injection.quantity) }}</strong></div></div><p v-if="!status.injections.length" class="evolution-empty">暂无针剂记录。</p></section></div>
        </template>

        <template v-else-if="tab === 'mutations'">
          <p class="evolution-hint">{{ status.lab.atSite ? '在研究室可查看效果，并对服务端允许的偏差型变异暂停或恢复。' : '效果详情与操作需站在演化研究室所在格。' }}</p>
          <div class="evolution-mutation-grid"><div class="evolution-mutation-list"><button v-for="mutation in status.mutations" :key="mutation.id" type="button" class="evolution-mutation" :class="{ selected: selectedMutationId === mutation.id }" :disabled="resolutionPending" @click="selectMutation(mutation)"><span class="evolution-mutation-mark" aria-hidden="true">✧</span><span><strong>{{ mutation.name }}</strong><small>{{ mutation.bodyPartName }} · {{ stateName(mutation.state) }} · 阶 {{ mutation.tier }}</small></span><b aria-hidden="true">›</b></button><p v-if="!status.mutations.length" class="evolution-empty">目前没有变异记录。</p></div><aside v-if="selectedSummary" ref="detailCard" class="evolution-detail"><button class="evolution-detail-close" type="button" :disabled="resolutionPending" @click="closeDetail">收起 ×</button><small>{{ selectedSummary.bodyPartName }} · {{ stateName(selectedSummary.state) }}</small><h3>{{ selectedSummary.name }}</h3><p>来源针剂：{{ injectionNames[selectedSummary.sourceInjection] ?? selectedSummary.sourceInjection }}</p><p v-if="!status.lab.atSite" class="evolution-hint">到达演化研究室后可查看效果详情。</p><template v-else><p v-if="detailLoading" class="evolution-hint">正在读取效果…</p><p v-if="detailError" class="evolution-error" role="alert">{{ detailError }}</p><template v-if="selectedDetail"><p class="evolution-description">{{ selectedDetail.description }}</p><div v-if="effectRows(selectedDetail.effect).length" class="evolution-effects"><span v-for="row in effectRows(selectedDetail.effect)" :key="row.name">{{ row.name }} {{ row.value }}</span></div><div v-if="selectedDetail.availableActions.length" class="evolution-actions"><button v-for="action in selectedDetail.availableActions" :key="action" type="button" :disabled="resolutionPending" @click="previewAction(action)">预览{{ actionName(action) }}</button></div><p v-else class="evolution-hint">这份变异当前没有可用操作。</p></template></template>
              <div v-if="preview" class="evolution-quote"><strong>变异状态确认</strong><p>{{ preview.quote.name }}：{{ stateName(preview.quote.stateBefore) }} → {{ stateName(preview.quote.stateAfter) }}</p><p>效果：{{ preview.quote.effectEnabledBefore ? '生效' : '暂停' }} → {{ preview.quote.effectEnabledAfter ? '生效' : '暂停' }}</p><small>报价有效至 {{ dateText(preview.expiresAt) }}；确认时仍会复核状态。</small><button type="button" :disabled="pending || (quoteExpired && !retryConfirmation) || (!status.lab.atSite && !retryConfirmation)" @click="confirmAction">{{ retryConfirmation ? '用原凭据核对确认结果' : `明确确认${preview.quote.paused ? '暂停' : '恢复'}` }}</button><p v-if="quoteExpired" class="evolution-error">{{ retryConfirmation ? '报价已过期；原确认凭据仅能回读已完成结果。' : '报价已过期，请重新预览。' }}</p></div>
            </aside></div>
        </template>

        <template v-else><div class="evolution-history"><article v-for="(record, index) in status.history" :key="`${record.eventType}-${record.createdAt}-${index}`"><span class="evolution-history-dot" aria-hidden="true"></span><div><strong>{{ eventNames[record.eventType] ?? record.eventType }}</strong><p v-if="historyDetail(record)">{{ historyDetail(record) }}</p><small>{{ dateText(record.createdAt) }}</small></div></article><p v-if="!status.history.length" class="evolution-empty">暂无进化历程记录。</p></div></template>
      </template>
    </template>
    <div v-if="retryConfirmation && preview && !selectedSummary" class="evolution-quote">
      <strong>变异确认结果待核对</strong>
      <p>原确认请求已发出；可用原凭据核对。未完成的过期请求不会执行。</p>
      <button type="button" :disabled="pending" @click="confirmAction">用原凭据核对结果</button>
    </div>
  </section>
</template>

<style scoped>
.evolution-panel { max-width: 1200px; margin: 0 auto; padding: 16px clamp(12px, 2.3vw, 27px) 30px; color: #394354; }.evolution-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 17px; }.evolution-heading h2 { margin: 3px 0; color: #3d4a64; font-size: clamp(23px, 3vw, 31px); }.evolution-heading p:last-child { margin: 0; color: #8891a3; font-size: 12px; }.evolution-heading button { flex: none; min-height: 35px; padding: 8px 15px; color: #5d6d94; background: #fff; border: 1px solid #d8deec; border-radius: 999px; font-size: 12px; font-weight: 700; }.evolution-eyebrow { margin: 0; color: #8a94b2; font-size: 10px; font-weight: 800; letter-spacing: .14em; }
.evolution-gate, .evolution-stage, .evolution-card, .evolution-detail, .evolution-locked { border: 1px solid #e0e4ed; border-radius: 16px; background: #fff; box-shadow: 0 5px 20px #50607c0c; }.evolution-gate { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 14px 16px; background: #f8f8fc; }.evolution-gate.unlocked { background: #f3f7fb; }.evolution-gate.onsite { background: #edf8f4; border-color: #cfe7db; }.evolution-gate-icon { display: grid; place-items: center; flex: 0 0 39px; width: 39px; height: 39px; color: #8097b5; background: #e8eef7; border-radius: 11px; font-size: 26px; }.evolution-gate > div { flex: 1; min-width: 0; }.evolution-gate strong { color: #4c5b74; font-size: 13px; }.evolution-gate p { margin: 4px 0 0; color: #8794a3; font-size: 11px; overflow-wrap: anywhere; }.evolution-gate > small { color: #8694a1; font-size: 11px; text-align: right; }
.evolution-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 17px 0; background: #f6f7fb; border: 1px solid #e7eaf1; border-radius: 12px; padding: 4px; }.evolution-tabs button { min-height: 38px; color: #8590a3; background: none; border-radius: 9px; font-size: 12px; }.evolution-tabs button.active { color: #536b97; background: white; box-shadow: 0 2px 9px #5c6d8a19; font-weight: 800; }
.evolution-stage { display: flex; align-items: center; gap: 16px; padding: 19px; background: linear-gradient(112deg, #f6f5fc, #edf5f8); }.evolution-stage-symbol { display: grid; place-items: center; flex: 0 0 57px; width: 57px; height: 57px; color: white; background: linear-gradient(135deg, #9ba5c8, #77a9b7); border-radius: 16px; font-size: 37px; }.evolution-stage > div:last-child { display: grid; gap: 3px; }.evolution-stage span, .evolution-stage small { color: #8993a8; font-size: 11px; }.evolution-stage strong { color: #536487; font-size: 24px; }
.evolution-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; margin: 12px 0 17px; }.evolution-metrics > div { display: grid; gap: 5px; min-width: 0; padding: 13px; background: white; border: 1px solid #e3e7ef; border-radius: 12px; }.evolution-metrics span { color: #929bab; font-size: 11px; }.evolution-metrics strong { color: #556587; font-size: 19px; }.evolution-metrics .evolution-metric-text { font-size: 13px; overflow-wrap: anywhere; }.evolution-resources { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }.evolution-card { min-width: 0; padding: 16px; }.evolution-section-head h3 { margin: 4px 0 13px; color: #52617d; font-size: 16px; }.evolution-resource-list { display: grid; gap: 7px; }.evolution-resource-list > div { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 7px 9px; background: #f9fafc; border-radius: 9px; font-size: 12px; }.evolution-resource-list :deep(.inventory-art-wrap) { flex: 0 0 35px; width: 35px; height: 35px; margin: 0; background: #eff3f9; border-radius: 8px; }.evolution-resource-list :deep(.inventory-item-image) { width: 32px; height: 32px; }.evolution-resource-list span:not(.inventory-art-wrap) { flex: 1; min-width: 0; color: #62708b; }.evolution-resource-list strong { color: #597293; }
.evolution-hint { margin: 11px 0; color: #8896a7; font-size: 12px; line-height: 1.5; }.evolution-mutation-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, 355px); gap: 14px; align-items: start; }.evolution-mutation-grid:not(:has(.evolution-detail)) { display: block; }.evolution-mutation-list { display: grid; gap: 7px; min-width: 0; }.evolution-mutation { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; color: inherit; text-align: left; background: white; border: 1px solid #e3e8f0; border-radius: 11px; }.evolution-mutation:hover, .evolution-mutation.selected { border-color: #a5b5d0; background: #f8fbff; }.evolution-mutation-mark { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; color: #869cc1; background: #eff3fb; border-radius: 9px; font-size: 21px; }.evolution-mutation > span:nth-child(2) { display: grid; gap: 3px; flex: 1; min-width: 0; }.evolution-mutation strong { color: #586883; font-size: 13px; }.evolution-mutation small { color: #929dae; font-size: 11px; }.evolution-mutation b { color: #9cacc6; font-size: 20px; font-weight: 400; }
.evolution-detail { min-width: 0; padding: 16px; }.evolution-detail-close { float: right; color: #7c8da8; background: none; font-size: 11px; }.evolution-detail > small { color: #9aa7b9; font-size: 11px; }.evolution-detail h3 { margin: 5px 0 9px; color: #506180; font-size: 17px; }.evolution-detail > p { color: #8792a2; font-size: 12px; line-height: 1.55; }.evolution-detail .evolution-description { color: #63728b; }.evolution-effects { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0; }.evolution-effects span { padding: 5px 8px; color: #61799b; background: #edf3fa; border-radius: 999px; font-size: 11px; }.evolution-actions { display: flex; gap: 7px; margin-top: 14px; }.evolution-actions button, .evolution-quote button { min-height: 35px; padding: 8px 12px; color: white; background: #7188ae; border-radius: 8px; font-size: 12px; font-weight: 800; }.evolution-quote { display: grid; gap: 7px; margin-top: 16px; padding: 13px; color: #63728a; background: #eef4fa; border: 1px solid #dbe6f1; border-radius: 11px; font-size: 12px; line-height: 1.45; }.evolution-quote strong { color: #526e9a; font-size: 14px; }.evolution-quote p { margin: 0; }.evolution-quote small { color: #8393a6; }.evolution-quote button { width: 100%; }
.evolution-history { display: grid; gap: 0; padding: 6px 18px; background: white; border: 1px solid #e3e8ef; border-radius: 15px; }.evolution-history article { display: flex; gap: 12px; padding: 14px 0; border-bottom: 1px solid #edf0f4; }.evolution-history article:last-of-type { border-bottom: 0; }.evolution-history-dot { width: 9px; height: 9px; flex: none; margin-top: 4px; border-radius: 50%; background: #9caed0; box-shadow: 0 0 0 4px #eef2fa; }.evolution-history strong { color: #60718d; font-size: 13px; }.evolution-history p { margin: 3px 0; color: #76849a; font-size: 12px; }.evolution-history small { color: #a0abba; font-size: 11px; }
.evolution-locked { margin-top: 17px; padding: 35px 18px; text-align: center; }.evolution-locked span { color: #9aa9c6; font-size: 37px; }.evolution-locked h3 { margin: 5px 0; color: #5e6a83; font-size: 17px; }.evolution-locked p { margin: 0; color: #929cac; font-size: 12px; }.evolution-empty { padding: 28px 10px; color: #98a3b2; text-align: center; font-size: 12px; }.evolution-error, .evolution-notice { margin: 0 0 12px; padding: 10px 12px; border-radius: 9px; font-size: 12px; line-height: 1.5; }.evolution-error { color: #ad6068; background: #fff0ed; }.evolution-notice { color: #547b67; background: #eaf7ed; }
button { border: 0; cursor: pointer; font: inherit; }button:disabled { opacity: .5; cursor: not-allowed; }button:focus-visible { outline: 3px solid #7594bf; outline-offset: 2px; }
@media (max-width: 750px) { .evolution-panel { padding: 12px 10px 25px; }.evolution-gate { padding: 11px; }.evolution-gate > small { display: none; }.evolution-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }.evolution-resources { grid-template-columns: minmax(0, 1fr); }.evolution-mutation-grid { display: flex; flex-direction: column; }.evolution-mutation-list, .evolution-detail { width: 100%; }.evolution-detail { order: -1; }.evolution-card { padding: 13px; } }
@media (max-width: 380px) { .evolution-tabs button { font-size: 11px; }.evolution-gate-icon { flex-basis: 32px; width: 32px; height: 32px; }.evolution-stage { gap: 10px; padding: 14px; }.evolution-stage-symbol { flex-basis: 46px; width: 46px; height: 46px; font-size: 29px; } }
</style>
