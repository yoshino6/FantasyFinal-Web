<script setup lang="ts">
import '../anime-growth-commerce.css';
import { computed, onUnmounted, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import { confirmEvolutionProgression, previewEvolutionProgression,
  type EvolutionBodyPart, type EvolutionInjection, type EvolutionProgressionAction,
  type EvolutionProgressionPreview, type EvolutionStatus } from '../evolution-api';

const props = defineProps<{ status: EvolutionStatus; disabled: boolean }>();
const emit = defineEmits<{ updated: []; 'pending-change': [pending: boolean] }>();
const selected = ref<EvolutionInjection>('conservative');
const part = ref<EvolutionBodyPart | ''>('');
const symbiosisTrait = ref('shared_guard');
const preview = ref<EvolutionProgressionPreview | null>(null);
const pending = ref(false);
const retry = ref(false);
const error = ref('');
const notice = ref('');
const now = ref(Date.now());
let mounted = true;
const timer = window.setInterval(() => { now.value = Date.now(); }, 1000);
onUnmounted(() => { mounted = false; window.clearInterval(timer); emit('pending-change', false); });
watch([pending, retry], ([working, uncertain]) => emit('pending-change', working || uncertain), { immediate: true });
const options = computed(() => props.status.availableInjections ?? []);
const chosen = computed(() => options.value.find(option => option.code === selected.value));
const locked = computed(() => props.disabled || pending.value || retry.value);
const atSite = computed(() => props.status.lab.atSite);
const expired = computed(() => preview.value && now.value >= new Date(preview.value.expiresAt).getTime());
const ready = computed(() => props.status.character && props.status.profile
  && props.status.character.level === props.status.profile.unlockedLevel
  && props.status.character.experience >= props.status.character.experienceRequired);
const names: Record<string, string> = {
  evolution_active_sample: '活性样本', evolution_stable_medium: '稳定介质', evolution_catalyst: '演化催化剂',
  evolution_injection_conservative: '保守针剂', evolution_injection_aggressive: '激进针剂',
  evolution_injection_harmonic: '调和针剂', evolution_injection_perception: '感知针剂',
  evolution_injection_symbiosis: '共生针剂', evolution_injection_metamorphosis: '蜕变针剂', evolution_injection_shaping: '定型针剂'
};
const partNames: Record<EvolutionBodyPart, string> = { eye: '眼部', nerve: '神经', skin: '表皮', chest: '胸腔', bone: '骨骼', organ: '脏器' };
const bonusNames: Record<string, string> = { hpPct: '生命', mpPct: '魔力', physicalAttackPct: '物攻', magicAttackPct: '魔攻',
  physicalDefensePct: '物防', magicDefensePct: '魔防', accuracyPct: '命中', evasionPct: '闪避', speedPct: '速度', healingBonusPct: '治疗加成', healingReceivedPct: '受治疗加成', critRatePct: '暴击', tenacityPct: '韧性' };
watch(options, choices => {
  if (!choices.some(option => option.code === selected.value)) selected.value = choices[0]?.code ?? 'conservative';
}, { immediate: true });
watch(selected, () => { part.value = ''; if (!retry.value) preview.value = null; });
watch(atSite, onsite => { if (!onsite && !retry.value) preview.value = null; });

async function prepare(action: EvolutionProgressionAction) {
  if (locked.value || !atSite.value) return;
  pending.value = true;
  preview.value = null;
  error.value = '';
  notice.value = '';
  try {
    const result = await previewEvolutionProgression(action);
    if (mounted) { now.value = Date.now(); preview.value = result; }
  } catch (cause) { if (mounted) error.value = userFacingErrorMessage(cause); }
  finally { pending.value = false; }
}
function prepareInjection() {
  void prepare({ kind: 'inject', code: selected.value,
    ...(part.value ? { part: part.value } : {}),
    ...(selected.value === 'symbiosis' ? { symbiosisTrait: symbiosisTrait.value } : {}) });
}
async function confirm() {
  const quote = preview.value;
  if (!quote || pending.value || props.disabled || (!atSite.value && !retry.value)) return;
  if (expired.value && !retry.value) { error.value = '预览已过期，请重新预览。'; preview.value = null; return; }
  pending.value = true;
  error.value = '';
  try {
    const response = await confirmEvolutionProgression(quote.token, quote.idempotencyKey);
    if (!mounted) return;
    preview.value = null;
    retry.value = false;
    notice.value = response.result.kind === 'inject' ? `注射完成，已升至 Lv.${response.result.toLevel}。`
      : response.result.kind === 'accept_observation' ? '已接取观察委托，请按目标完成实际操作。'
        : response.result.kind === 'claim_observation' ? '观察报酬已放入背包。' : '定型特征已保存。';
    emit('updated');
  } catch (cause) {
    if (!mounted) return;
    const message = userFacingErrorMessage(cause);
    retry.value = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
    if (!retry.value) { preview.value = null; emit('updated'); }
    error.value = retry.value ? `${message} 原确认凭据已保留，请重试核对结果。` : message;
  } finally { pending.value = false; }
}
</script>

<template>
  <section class="growth-controls evolution-research-controls anime-growth-commerce" aria-label="生长结与观察委托">
    <p v-if="error" class="growth-error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="!atSite">到达演化研究室后，可以领取观察委托、注射针剂和选择定型特征。</p>
    <section v-if="options.length" class="growth-breakthrough">
      <h3><i class="evolution-research-emblem" data-emblem="injections" aria-hidden="true" />解除生长结</h3>
      <div class="growth-experience"><p>当前经验：{{ status.character?.experience ?? 0 }} / {{ status.character?.experienceRequired ?? 0 }}。{{ ready ? '经验已满，可以预览注射。' : '先历练至当前等级经验满值。' }}</p><progress :value="status.character?.experience ?? 0" :max="Math.max(1, status.character?.experienceRequired ?? 1)" aria-label="当前等级经验" /></div>
      <div class="growth-fields">
        <label>针剂<select v-model="selected" :disabled="locked"><option v-for="option in options" :key="option.code" :value="option.code">{{ option.name }}</option></select></label>
        <label v-if="chosen?.parts.length">观察部位<select v-model="part" :disabled="locked"><option value="">按针剂方向随机观察</option><option v-for="value in chosen.parts" :key="value" :value="value">{{ partNames[value] }}</option></select></label>
        <label v-if="selected === 'symbiosis' && !status.profile?.symbiosisTraitCode">共生微被动<select v-model="symbiosisTrait" :disabled="locked"><option v-for="choice in status.symbiosisChoices" :key="choice.code" :value="choice.code">{{ choice.name }}（同行：{{ choice.partyText }}；独行：{{ choice.soloText }}）</option></select></label>
      </div>
      <p v-if="status.profile?.injectionCount === 0">第一次为免费引导针剂；后续沿用材料消耗或优先使用已有针剂。</p>
      <button type="button" :disabled="locked || !atSite || !ready" @click="prepareInjection">预览注射</button>
    </section>
    <section v-if="status.shaping">
      <h3><i class="evolution-research-emblem" data-emblem="symbiosis" aria-hidden="true" />自我定义</h3>
      <p>选择 {{ status.shaping.required }} 项定型特征，当前 {{ status.shaping.selectedIds.length }} / {{ status.shaping.required }}。</p>
      <p v-if="!status.shaping.traits.length">暂无稳定观测，可直接预览定型注射。</p>
      <div class="growth-fields growth-traits"><button v-for="trait in status.shaping.traits" :key="trait.id" type="button" :class="{ selected: status.shaping.selectedIds.includes(trait.id) }" :aria-pressed="status.shaping.selectedIds.includes(trait.id)" :disabled="locked || !atSite" @click="prepare({ kind: 'select_trait', mutationId: trait.id })"><i class="evolution-research-emblem" data-emblem="symbiosis" aria-hidden="true" /><span>{{ trait.bodyPartName }}·{{ trait.name }}</span></button></div>
    </section>
    <section v-if="status.observations">
      <h3><i class="evolution-research-emblem" data-emblem="journal" aria-hidden="true" />观察委托</h3>
      <p>今天已提交 {{ status.observations.claimed }} / 2 项。</p>
      <template v-if="status.observations.active">
        <article class="growth-active-observation"><i class="evolution-research-emblem" data-emblem="journal" aria-hidden="true" /><div><strong>{{ status.observations.active.definition.name }}</strong><p>{{ status.observations.active.objective_text }}（{{ status.observations.active.progress }} / {{ status.observations.active.target_count }}）</p><progress :value="status.observations.active.progress" :max="Math.max(1, status.observations.active.target_count)" aria-label="观察委托进度" /><p>报酬：{{ status.observations.active.rewards }}</p></div><button v-if="status.observations.active.status === 'completed'" type="button" :disabled="locked || !atSite" @click="prepare({ kind: 'claim_observation' })">预览提交观察</button></article>
      </template>
      <article v-for="observation in status.observations.available" :key="observation.type" class="growth-observation">
        <strong>{{ observation.name }}</strong><p>{{ observation.objective }} · 报酬：{{ observation.rewards }}</p>
        <button type="button" :disabled="locked || !atSite" @click="prepare({ kind: 'accept_observation', type: observation.type })">预览接取</button>
      </article>
    </section>
    <section v-if="preview" class="growth-quote" :data-kind="preview.quote.kind" aria-label="进化操作确认">
      <h3><i class="evolution-research-emblem" data-emblem="journal" aria-hidden="true" />{{ preview.quote.name }}</h3>
      <template v-if="preview.quote.kind === 'inject'">
        <p>Lv.{{ preview.quote.fromLevel }} → Lv.{{ preview.quote.toLevel }}，获得 1 技能点。</p>
        <p v-if="preview.quote.part">观察部位：{{ partNames[preview.quote.part] }}。</p>
        <p v-if="preview.quote.symbiosisTrait">共生微被动：{{ status.symbiosisChoices?.find(choice => choice.code === preview?.quote.symbiosisTrait)?.name }}。</p>
        <p>消耗：{{ Object.entries(preview.quote.costs ?? {}).map(([code, quantity]) => `${names[code] ?? code} ×${quantity}`).join('、') || '免费引导针剂' }}</p>
        <p>固定收益：{{ Object.entries(preview.quote.fixedBonus ?? {}).map(([code, quantity]) => `${bonusNames[code] ?? code} ${quantity > 0 ? '+' : ''}${quantity}%`).join('、') || '按现有进化规则结算' }}</p>
        <p>产生变异的概率：{{ Math.round((preview.quote.mutationChance ?? 0) * 100) }}%；产生变异时，稳定或稀有观测概率：{{ Math.round((preview.quote.stableChance ?? 0) * 100) }}%。</p>
        <p>适应压力：{{ preview.quote.pressureBefore }} → {{ preview.quote.pressureAfter }}；稳定度：{{ preview.quote.stabilityBefore }} → {{ preview.quote.stabilityAfter }}。</p>
        <p v-if="preview.quote.finalTraits?.length">定型：{{ preview.quote.finalTraits.map(trait => trait.name).join('、') }}</p>
      </template>
      <p v-else-if="preview.quote.kind === 'select_trait'">保存后将选中 {{ preview.quote.selectedIds?.length }} / {{ preview.quote.required }} 项特征。</p>
      <p v-else>{{ preview.quote.objective }} · 报酬：{{ preview.quote.rewards ?? Object.entries(preview.quote.items ?? {}).map(([code, quantity]) => `${names[code] ?? code} ×${quantity}`).join('、') }}</p>
      <p v-if="expired && !retry">预览已过期，请取消后重新预览。</p>
      <div class="growth-fields"><button type="button" :disabled="pending || disabled || (Boolean(expired) && !retry)" @click="confirm">{{ pending ? '正在确认…' : retry ? '重试核对结果' : '确认操作' }}</button><button type="button" :disabled="locked" @click="preview = null">取消</button></div>
    </section>
  </section>
</template>

<style scoped>
.growth-controls { margin: 16px 0; padding: 16px; border: 1px solid #e0e4ed; border-radius: 16px; background: #fff; color: #52617d; font-size: 13px; line-height: 1.6; }
.growth-controls h3 { margin: 12px 0 8px; font-size: 16px; }.growth-controls p { margin: 8px 0; }
.growth-fields { display: flex; flex-wrap: wrap; gap: 10px; }.growth-fields label { display: grid; gap: 5px; min-width: 0; max-width: 100%; }
.growth-controls select { max-width: 100%; padding: 8px; border: 1px solid #d8deec; border-radius: 8px; background: #fff; }
.growth-controls button { padding: 8px 12px; border-radius: 8px; color: #fff; background: #7188ae; }.growth-controls button:disabled { opacity: .5; }
.growth-observation { padding: 12px 0; border-top: 1px solid #e0e4ed; }.growth-quote { margin-top: 16px; padding: 12px; background: #eef4fa; border-radius: 10px; }.growth-error { color: #bd5364; }
</style>
