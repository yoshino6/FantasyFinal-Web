<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import * as skillApi from '../skill-api';
import type {
  AvailableSkill, LearnedSkill, SkillActionInput, SkillCandidateAction,
  SkillDetail, SkillPage, SkillPreview, SkillSpecialization
} from '../skill-api';

type Tab = 'learned' | 'available' | 'config';
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
const pending = ref(false);
const preview = ref<SkillPreview | null>(null);
const previewAction = ref<SkillActionInput | null>(null);
const uncertainConfirmToken = ref<string | null>(null);
const notice = ref('');
const now = ref(Date.now());
const closeButton = ref<HTMLButtonElement | null>(null);
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
const skillPoints = computed(() => list.value?.skillPoints ?? skill.value?.skillPoints ?? 0);
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
const categoryNames: Record<string, string> = {
  physical: '物理', magic: '魔法', utility: '辅助', bound: '绑定', passive: '被动'
};
function categoryName(value: string) { return categoryNames[value] ?? value; }
function isLearned(item: LearnedSkill | AvailableSkill): item is LearnedSkill { return 'level' in item; }
function isAvailable(item: LearnedSkill | AvailableSkill): item is AvailableSkill { return 'canLearn' in item; }
function dateText(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN'); }

async function loadList() {
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
  if (pending.value || tab.value === next) return;
  tab.value = next; list.value = null; listError.value = ''; notice.value = '';
  void loadList();
}
function search() {
  if (pending.value || listLoading.value) return;
  keywords.value[tab.value] = drafts.value[tab.value].trim();
  pages.value[tab.value] = 1;
  void loadList();
}
function changePage(next: number) {
  if (pending.value || listLoading.value || !list.value || next < 1 || next > list.value.totalPages || next === page.value) return;
  pages.value[tab.value] = next;
  void loadList();
}
async function showDetail(id: number) {
  if (resolutionPending.value) return;
  const version = ++detailVersion;
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

async function beginPreview(action: SkillCandidateAction) {
  if (resolutionPending.value || !action.enabled) return;
  pending.value = true; detailError.value = ''; notice.value = ''; preview.value = null; previewAction.value = null;
  const input: SkillActionInput = { action: action.action, skillId: action.skillId,
    ...(action.specialization ? { specialization: action.specialization } : {}),
    ...(action.direction ? { direction: action.direction } : {}) };
  try {
    preview.value = await skillApi.previewSkillAction(input);
    previewAction.value = input;
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
  try {
    await skillApi.confirmSkillAction(quote.token, quote.idempotencyKey);
    uncertainConfirmToken.value = null;
    preview.value = null; previewAction.value = null;
    notice.value = '技能操作已完成。';
    emit('updated');
    await Promise.all([loadList(), refreshDetail()]);
  } catch (cause) {
    const message = userFacingErrorMessage(cause);
    const uncertain = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
    uncertainConfirmToken.value = uncertain ? quote.token : null;
    detailError.value = uncertain ? `${message} 请先查看当前技能状态；可用原凭据安全核对结果。` : message;
    if (!uncertain) { preview.value = null; previewAction.value = null; }
    await Promise.all([loadList(), refreshDetail()]);
  } finally { pending.value = false; }
}
</script>

<template>
  <section class="skill-panel" aria-label="角色技能">
    <header class="skill-top"><div><small>SKILL JOURNAL</small><h2>技能</h2></div><span class="points">可用技能点 <strong>{{ skillPoints }}</strong></span></header>
    <nav class="skill-tabs" aria-label="技能分类"><button type="button" :class="{ active: tab === 'learned' }" :disabled="pending" @click="switchTab('learned')">已学</button><button type="button" :class="{ active: tab === 'available' }" :disabled="pending" @click="switchTab('available')">可学</button><button type="button" :class="{ active: tab === 'config' }" :disabled="pending" @click="switchTab('config')">专精与配置</button></nav>
    <p v-if="notice && !detailOpen" class="notice" role="status">{{ notice }}</p><p v-if="listError" class="error" role="alert">{{ listError }} <button type="button" @click="loadList">重试</button></p>
    <template v-if="tab === 'config' && list"><div class="config-summary"><div><h3>战斗快捷</h3><div class="slot-row"><span v-for="slot in 4" :key="slot"><small>{{ slot }}</small>{{ list.quickSlots.find(item => item.slot === slot)?.name ?? '空位' }}</span></div></div><div><h3>被动协同 {{ list.linkedPassives.length }}/{{ list.passiveLinkLimit }}</h3><p>{{ list.linkedPassives.map(item => item.name).join('、') || '尚未链接被动技能。' }}</p></div></div><p class="hint">点选下方技能，在详情中配置快捷、被动链接或升级专精。</p></template>
    <form class="search-row" @submit.prevent="search"><input v-model="drafts[tab]" type="search" maxlength="80" placeholder="搜索技能名称" aria-label="搜索技能" /><button type="submit" :disabled="pending || listLoading">搜索</button></form>
    <div v-if="listLoading" class="empty" role="status">正在整理技能…</div>
    <div v-else-if="list" class="skill-list">
      <button v-for="entry in tab === 'available' ? availableSkills : learnedSkills" :key="entry.id" class="skill-card" type="button" @click="showDetail(entry.id)"><span class="skill-art"><img src="/assets/items/skill-book.png" alt="" loading="lazy" /></span><span class="skill-copy"><strong>{{ entry.name }}</strong><small>{{ categoryName(entry.category) }} · {{ entry.tier }}<template v-if="isLearned(entry)"> · Lv.{{ entry.level }}</template><template v-else> · 学习 {{ entry.learnCost }} SP</template></small><span v-if="isAvailable(entry) && !entry.canLearn" class="blocked">{{ entry.reason ?? '目前无法学习。' }}</span><span v-else-if="isAvailable(entry)" class="available">可学习 · 学后剩余 {{ entry.remainingSkillPoints }} SP</span></span><span v-if="isLearned(entry) && entry.quickSlot" class="skill-badge">快捷 {{ entry.quickSlot }}</span><span v-else-if="isLearned(entry) && entry.passiveLinked" class="skill-badge">已链接</span><span class="arrow">›</span></button>
      <p v-if="!list.items.length" class="empty">{{ tab === 'available' ? '目前没有已发现且待学习的技能。' : '目前没有已学技能。' }}</p>
    </div>
    <nav v-if="list && list.totalPages > 1 && !listLoading" class="pager" aria-label="技能翻页"><button type="button" :disabled="pending || page <= 1" @click="changePage(page - 1)">上一页</button><span>{{ page }} / {{ list.totalPages }}</span><button type="button" :disabled="pending || page >= list.totalPages" @click="changePage(page + 1)">下一页</button></nav>
  </section>

  <Teleport to="body"><div v-if="detailOpen" class="skill-backdrop" role="presentation" @click.self="closeDetail"><section class="skill-dialog" role="dialog" aria-modal="true" aria-label="技能详情" @keydown.esc="closeDetail"><header class="dialog-header"><span class="skill-art"><img src="/assets/items/skill-book.png" alt="" /></span><div><small>SKILL DETAIL</small><h2>{{ skill?.name ?? '技能详情' }}</h2></div><button ref="closeButton" type="button" aria-label="关闭技能详情" :disabled="resolutionPending" @click="closeDetail">×</button></header><div class="dialog-body"><p v-if="notice" class="notice" role="status">{{ notice }}</p><p v-if="detailError" class="error" role="alert">{{ detailError }}</p><p v-if="canRetryConfirmation" class="error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能离开或修改预览；网络持续不可用时请保持页面打开，稍后重试。</p><p v-if="detailLoading" class="empty" role="status">正在读取技能详情…</p>
      <template v-if="skill"><p class="skill-description">{{ skill.description }}</p><div class="stat-grid"><span>状态 <strong>{{ skill.learned ? `已学 Lv.${skill.level}/${skill.maxLevel}` : '尚未学习' }}</strong></span><span>技能点 <strong>{{ skill.skillPoints }} SP</strong></span><span>类别 <strong>{{ categoryName(skill.category) }} · {{ skill.tier }}</strong></span><span>元素/距离 <strong>{{ skill.element }} · {{ skill.rangeType }}</strong></span><span>目标 <strong>{{ skill.targetScope }}</strong></span><span>武器条件 <strong>{{ skill.requiredWeaponType || '无' }}</strong></span><span>当前威力 <strong>{{ skill.actualPower }}</strong></span><span>法力消耗 <strong>{{ skill.actualManaCost }} MP</strong></span><span>冷却 <strong>{{ skill.actualCooldown }} 回合</strong></span><span>吟唱 <strong>{{ skill.actualChant }} 回合</strong></span></div>
        <section v-if="skill.effectDetails.length" class="detail-section"><h3>效果</h3><div class="effect-list"><p v-for="effect in skill.effectDetails" :key="`${effect.code}:${effect.target_scope}`"><strong>{{ effect.name }}</strong><span>数值 {{ effect.value }}<template v-if="effect.duration"> · 持续 {{ effect.duration }} 回合</template> · {{ effect.target_scope === 'enemy' ? '敌方' : effect.target_scope === 'ally' ? '友方' : '自身' }}</span></p></div></section>
        <section v-if="skill.learned && (Object.keys(skill.specializations).length || skill.appraisal)" class="detail-section"><h3>专精进度</h3><div class="specialization-list"><span v-for="(level, key) in skill.specializations" :key="key">{{ specializationName(key as SkillSpecialization, skill.code) }} Lv.{{ level }}<small v-if="skill.specializationUpgradeCosts[key as SkillSpecialization] != null"> · 下级 {{ skill.specializationUpgradeCosts[key as SkillSpecialization] }} SP</small></span><span v-if="skill.appraisal">慧眼 Lv.{{ skill.appraisal.rangeLevel }} · 识珠 Lv.{{ skill.appraisal.informationLevel }}</span></div></section>
        <section class="detail-section"><h3>当前可选操作</h3><div v-if="detail?.actions.length" class="actions"><div v-for="(action, index) in detail.actions" :key="`${action.action}:${action.specialization ?? action.direction ?? index}`" class="action-row" :class="{ unavailable: !action.enabled }"><div><strong>{{ actionLabel(action) }}</strong><small>{{ actionNote(action) }}</small></div><button v-if="action.enabled" type="button" :disabled="resolutionPending" @click="beginPreview(action)">预览</button><span v-else class="disabled-text">暂不可用</span></div></div><p v-else class="hint">此技能目前没有可配置或升级的操作。</p></section>
        <section v-if="preview" class="confirm-box" aria-label="技能操作确认"><h3>{{ actionLabel(previewAction ?? { action: preview.quote.action, skillId: preview.quote.skillId }) }} · 真实预览</h3><p>{{ previewSummary(preview) }}</p><p>技能点：{{ preview.quote.skillPointsBefore }} → {{ preview.quote.skillPointsAfter }}</p><small>报价有效至 {{ dateText(preview.expiresAt) }}。确认时服务端会重新校验技能与技能点。</small><div class="confirm-actions"><button type="button" :disabled="resolutionPending" @click="preview = null; previewAction = null">继续查看</button><button class="primary-button" type="button" :disabled="pending || (quoteExpired && !canRetryConfirmation)" @click="confirm">{{ canRetryConfirmation ? '用原凭据核对结果' : '确认执行' }}</button></div><p v-if="quoteExpired" class="error">{{ canRetryConfirmation ? '预览已过期；原确认凭据仅能回读已完成结果。' : '预览已过期，请重新获取。' }}</p></section>
      </template>
    </div></section></div></Teleport>
</template>

<style scoped>
.skill-panel { min-width: 0; padding: 13px; color: #4b425b; background: #fffaf6; border: 1px solid #eee2e6; border-radius: 15px; }.skill-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }.skill-top small, .dialog-header small { color: #a991b3; font-size: 9px; letter-spacing: .12em; }.skill-top h2 { margin: 2px 0 0; font-size: 17px; }.points { flex: 0 0 auto; padding: 7px 9px; color: #8d719d; background: #f3ebf8; border-radius: 8px; font-size: 11px; }.points strong { color: #604078; font-size: 15px; }.skill-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-bottom: 12px; }.skill-tabs button { min-height: 39px; padding: 5px; color: #87798e; background: #f4eff0; border: 1px solid transparent; border-radius: 9px; font-size: 11px; }.skill-tabs button.active { color: #6c4b91; background: #eee5f6; border-color: #ddcdec; font-weight: 700; }.search-row { display: flex; gap: 6px; margin: 11px 0; }.search-row input { flex: 1; min-width: 0; min-height: 36px; padding: 8px 10px; color: #55485e; background: white; border: 1px solid #e2d6e4; border-radius: 8px; font-size: 12px; }.search-row button, .primary-button { min-height: 36px; padding: 8px 13px; color: white; background: #9374b4; border-radius: 8px; font-size: 12px; font-weight: 700; }.skill-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }.skill-card { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 62px; padding: 9px; color: inherit; text-align: left; background: #fff; border: 1px solid #eee1e8; border-radius: 10px; }.skill-card:hover { background: #fdf9ff; border-color: #d7c3e5; }.skill-art { display: grid; place-items: center; flex: 0 0 39px; width: 39px; height: 39px; background: #f1eafa; border-radius: 10px; }.skill-art img { display: block; width: 35px; height: 35px; object-fit: contain; }.skill-copy { display: grid; gap: 3px; flex: 1; min-width: 0; overflow-wrap: anywhere; }.skill-copy strong { font-size: 12px; }.skill-copy small { color: #9b8ca2; font-size: 10px; }.skill-copy > span { font-size: 10px; line-height: 1.4; }.blocked { color: #ac6671; }.available { color: #64927d; }.skill-badge { flex: 0 0 auto; padding: 4px 5px; color: #8264a0; background: #f2eafa; border-radius: 6px; font-size: 9px; }.arrow { color: #ad99b8; font-size: 21px; }.empty { margin: 0; padding: 25px 9px; color: #a498a9; font-size: 12px; text-align: center; }.pager { display: flex; justify-content: center; align-items: center; gap: 11px; margin-top: 13px; font-size: 11px; }.pager button { min-height: 32px; padding: 6px 10px; color: #805c9a; background: #f0e8f7; border-radius: 8px; }.notice, .error { margin: 8px 0; padding: 9px 10px; border-radius: 8px; font-size: 11px; line-height: 1.5; }.notice { color: #598268; background: #eaf5ed; }.error { color: #aa596c; background: #fff0f0; }.error button { padding: 2px 6px; color: #8c537a; background: #fff; border-radius: 5px; }
.config-summary { display: grid; grid-template-columns: 1.4fr 1fr; gap: 8px; margin-bottom: 9px; }.config-summary > div { min-width: 0; padding: 10px; background: #fff; border: 1px solid #eee2e7; border-radius: 10px; }.config-summary h3 { margin: 0 0 7px; color: #665677; font-size: 11px; }.slot-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }.slot-row span { display: grid; gap: 2px; min-width: 0; padding: 5px; overflow: hidden; color: #73677a; background: #f8f2fa; border-radius: 6px; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.slot-row small { color: #ad91b9; }.config-summary p, .hint { margin: 0; color: #94879a; font-size: 11px; line-height: 1.5; }.hint { margin: 8px 0; }
.skill-backdrop { position: fixed; z-index: 96; inset: 0; display: grid; place-items: center; padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); background: #322b41a6; backdrop-filter: blur(4px); }.skill-dialog { display: flex; flex-direction: column; width: min(680px, 100%); max-height: min(85dvh, 780px); min-height: 0; overflow: hidden; color: #50465c; background: #fffaf7; border: 1px solid #fff; border-radius: 17px; box-shadow: 0 20px 55px #30263c45; }.dialog-header { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; padding: 13px 16px; background: #f9f0f9; border-bottom: 1px solid #eadde8; }.dialog-header > div { flex: 1; min-width: 0; }.dialog-header h2 { margin: 2px 0 0; font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.dialog-header > button { width: 33px; height: 33px; color: #9f7b9f; background: white; border-radius: 8px; font-size: 22px; }.dialog-body { min-height: 0; overflow-y: auto; padding: 15px 17px max(22px, env(safe-area-inset-bottom)); overscroll-behavior: contain; }.skill-description { margin: 0 0 14px; color: #706475; font-size: 12px; line-height: 1.65; white-space: pre-wrap; }.stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }.stat-grid span { display: grid; gap: 3px; padding: 8px 10px; color: #9b8fa1; background: #faf4fa; border-radius: 7px; font-size: 10px; }.stat-grid strong { color: #5c5164; font-size: 11px; overflow-wrap: anywhere; }.detail-section { margin-top: 17px; }.detail-section h3 { margin: 0 0 9px; color: #6d557d; font-size: 13px; }.effect-list { display: grid; gap: 5px; }.effect-list p { display: flex; justify-content: space-between; gap: 9px; margin: 0; padding: 8px 9px; background: #fff; border: 1px solid #f0e6ed; border-radius: 8px; font-size: 11px; }.effect-list span { color: #887b91; text-align: right; }.specialization-list { display: flex; flex-wrap: wrap; gap: 6px; }.specialization-list span { padding: 6px 8px; color: #745f83; background: #f3eaf8; border-radius: 7px; font-size: 11px; }.specialization-list small { color: #a08ba9; }.actions { display: grid; gap: 7px; }.action-row { display: flex; align-items: center; justify-content: space-between; gap: 9px; padding: 9px 10px; background: white; border: 1px solid #eadfe9; border-radius: 8px; }.action-row.unavailable { background: #f8f5f6; }.action-row > div { display: grid; gap: 3px; min-width: 0; }.action-row strong { color: #655274; font-size: 11px; }.action-row small { color: #9b8ca0; font-size: 10px; line-height: 1.4; }.action-row.unavailable small { color: #aa6c76; }.action-row button { min-height: 33px; padding: 7px 10px; color: #fff; background: #9b7cb5; border-radius: 7px; font-size: 11px; }.disabled-text { flex: 0 0 auto; color: #ae9ca9; font-size: 10px; }.confirm-box { margin-top: 16px; padding: 13px; background: #f0eafa; border: 1px solid #ddcdeb; border-radius: 10px; }.confirm-box h3 { margin: 0 0 7px; color: #6e5186; font-size: 13px; }.confirm-box p { margin: 6px 0; color: #61536e; font-size: 12px; line-height: 1.5; }.confirm-box small { color: #90809c; font-size: 10px; }.confirm-actions { display: flex; justify-content: end; gap: 7px; margin-top: 12px; }.confirm-actions button:not(.primary-button) { padding: 8px 10px; color: #7b6490; background: #fff; border-radius: 7px; font-size: 11px; }
button { border: 0; cursor: pointer; font: inherit; }button:disabled { opacity: .5; cursor: not-allowed; }button:focus-visible, input:focus-visible { outline: 3px solid #8f6eb7; outline-offset: 2px; }
@media (max-width: 600px) { .skill-panel { padding: 10px; }.skill-list { grid-template-columns: 1fr; }.skill-backdrop { padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }.skill-dialog { max-height: 85dvh; }.dialog-body { padding: 12px; }.config-summary { grid-template-columns: 1fr; }.skill-tabs button { min-height: 42px; } }
@media (max-width: 350px) { .points { font-size: 9px; }.stat-grid { grid-template-columns: 1fr; }.effect-list p { display: grid; }.effect-list span { text-align: left; } }
</style>
