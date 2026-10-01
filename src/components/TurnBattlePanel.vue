<script setup lang="ts">
import { computed, ref, watch } from 'vue';

export type BattleMember = {
  id: string;
  name: string;
  role?: string;
  level?: number;
  hp: { current: number; max: number };
  mp?: { current: number; max: number };
  unknownHp?: boolean;
  portrait?: string;
  icon?: string;
  status?: string[];
  active?: boolean;
  defeated?: boolean;
};

export type BattleAction = {
  id: string;
  label: string;
  category?: 'normal' | 'skill' | 'item' | 'special';
  description?: string;
  icon?: string;
  cost?: string;
  cooldown?: number;
  targeting?: 'none' | 'ally' | 'enemy' | 'any';
  allowedTargets?: { ally?: string[]; enemy?: string[] };
  disabled?: boolean;
};

export type BattleLogEntry = {
  id?: string | number;
  text: string;
  tone?: 'normal' | 'good' | 'danger' | 'muted';
};

export type BattleState = {
  revision?: string;
  title?: string;
  round?: number;
  phase?: 'player' | 'enemy' | 'waiting' | 'victory' | 'defeat';
  turnLabel?: string;
  statusText?: string;
  allies: BattleMember[];
  enemies: BattleMember[];
  actions: BattleAction[];
  log?: BattleLogEntry[];
};

const props = defineProps<{ battle: BattleState; disabled?: boolean }>();
const emit = defineEmits<{
  (event: 'action', payload: { action: BattleAction; targetId?: string; targetKind?: 'member' | 'target' }): void;
  (event: 'member-selected', payload: { member: BattleMember; side: 'ally' | 'enemy' }): void;
}>();

const pendingAction = ref<BattleAction | null>(null);
const selectedCategory = ref<NonNullable<BattleAction['category']>>('normal');
const actionCategories = [
  { id: 'normal', label: '普通' },
  { id: 'skill', label: '技能' },
  { id: 'item', label: '道具' },
  { id: 'special', label: '特殊' }
] as const;
const actionCategory = (action: BattleAction) => action.category
  ?? (action.id.startsWith('skill:') ? 'skill' : action.id.startsWith('item:') ? 'item' : 'normal');
const availableCategories = computed(() => actionCategories.filter(category =>
  category.id === 'normal' || props.battle.actions.some(action => actionCategory(action) === category.id)));
const visibleActions = computed(() => props.battle.actions.filter(action => actionCategory(action) === selectedCategory.value));
watch(() => props.battle.actions, () => {
  if (!availableCategories.value.some(category => category.id === selectedCategory.value)) selectedCategory.value = 'normal';
  if (pendingAction.value) pendingAction.value = props.battle.actions.find(action => action.id === pendingAction.value?.id && !action.disabled) ?? null;
});
watch(() => [props.battle.revision, props.battle.phase], () => { pendingAction.value = null; });
const canAct = computed(() => !props.disabled && (props.battle.phase === undefined || props.battle.phase === 'player'));
const phaseLabel = computed(() => {
  if (props.battle.turnLabel) return props.battle.turnLabel;
  return ({ player: '轮到你行动', enemy: '敌方行动中', waiting: '等待队伍行动', victory: '战斗胜利', defeat: '战斗失败' }[props.battle.phase ?? 'player'] ?? '准备战斗');
});
const phaseTone = computed(() => props.battle.phase === 'victory' ? 'victory' : props.battle.phase === 'defeat' ? 'defeat' : props.battle.phase === 'enemy' ? 'enemy' : 'player');

const percent = (value: number, max: number) => Math.min(100, Math.max(0, value / Math.max(1, max) * 100));
const memberCanTarget = (member: BattleMember, side: 'ally' | 'enemy') => {
  if (!canAct.value || !pendingAction.value || member.defeated) return false;
  if (pendingAction.value.targeting !== side && pendingAction.value.targeting !== 'any') return false;
  const allowed = pendingAction.value.allowedTargets?.[side];
  return !allowed || allowed.includes(member.id);
};
const selectAction = (action: BattleAction) => {
  if (!canAct.value || action.disabled) return;
  if (action.targeting && action.targeting !== 'none') {
    pendingAction.value = action;
    return;
  }
  emit('action', { action });
};
const selectCategory = (category: NonNullable<BattleAction['category']>) => {
  selectedCategory.value = category;
  pendingAction.value = null;
};
const selectMember = (member: BattleMember, side: 'ally' | 'enemy') => {
  if (!memberCanTarget(member, side)) return;
  emit('member-selected', { member, side });
  const action = pendingAction.value;
  pendingAction.value = null;
  if (action) emit('action', { action, targetId: member.id, targetKind: side === 'ally' ? 'member' : 'target' });
};
const cancelTargeting = () => { pendingAction.value = null; };
</script>

<template>
  <section class="turn-battle-panel card-surface" aria-label="回合制战斗">
    <header class="battle-header">
      <div>
        <p class="eyebrow">TURN BATTLE</p>
        <h3>{{ battle.title || '遭遇战' }}</h3>
      </div>
      <div class="battle-round"><span>ROUND</span><strong>{{ battle.round ?? 1 }}</strong></div>
    </header>

    <div class="battle-status" :class="`phase-${phaseTone}`">
      <span class="battle-status-dot" />
      <strong>{{ phaseLabel }}</strong>
      <small v-if="battle.statusText">{{ battle.statusText }}</small>
      <button v-if="pendingAction" type="button" class="cancel-targeting" @click="cancelTargeting">取消选取</button>
    </div>

    <div class="battle-field">
      <div class="battle-side ally-side">
        <div class="side-heading"><span>我方队伍</span><small>{{ battle.allies.length }} 人</small></div>
        <button v-for="member in battle.allies" :key="member.id" type="button" class="battle-member" :class="{ active: member.active, defeated: member.defeated, targetable: memberCanTarget(member, 'ally') }" :disabled="!memberCanTarget(member, 'ally')" @click="selectMember(member, 'ally')">
          <span class="member-portrait"><img v-if="member.portrait" :src="member.portrait" :alt="member.name" /><span v-else>{{ member.icon || '✦' }}</span></span>
          <span class="member-main"><span class="member-title"><strong>{{ member.name }}</strong><small v-if="member.level">Lv.{{ member.level }}</small></span><small class="member-role">{{ member.role || '冒险者' }}</small><span class="battle-bar hp"><i :style="{ width: `${percent(member.hp.current, member.hp.max)}%` }" /></span><span class="member-numbers">HP {{ member.hp.current }} / {{ member.hp.max }}</span><template v-if="member.mp"><span class="battle-bar mp"><i :style="{ width: `${percent(member.mp.current, member.mp.max)}%` }" /></span><span class="member-numbers">MP {{ member.mp.current }} / {{ member.mp.max }}</span></template><span v-if="member.status?.length" class="member-status-tags"><em v-for="status in member.status" :key="status">{{ status }}</em></span></span>
          <span v-if="member.active" class="active-mark">行动</span>
        </button>
        <div v-if="!battle.allies.length" class="battle-empty">没有可行动队员</div>
      </div>

      <div class="battle-divider" aria-hidden="true"><span>VS</span></div>

      <div class="battle-side enemy-side">
        <div class="side-heading"><span>敌方队伍</span><small>{{ battle.enemies.length }} 个目标</small></div>
        <button v-for="member in battle.enemies" :key="member.id" type="button" class="battle-member" :class="{ active: member.active, defeated: member.defeated, targetable: memberCanTarget(member, 'enemy') }" :disabled="!memberCanTarget(member, 'enemy')" @click="selectMember(member, 'enemy')">
          <span class="member-portrait enemy-portrait"><img v-if="member.portrait" :src="member.portrait" :alt="member.name" /><span v-else>{{ member.icon || '◆' }}</span></span>
          <span class="member-main"><span class="member-title"><strong>{{ member.name }}</strong><small v-if="member.level">Lv.{{ member.level }}</small></span><small class="member-role">{{ member.role || '敌人' }}</small><span class="battle-bar hp enemy-hp"><i :style="{ width: member.unknownHp ? '100%' : `${percent(member.hp.current, member.hp.max)}%` }" /></span><span class="member-numbers">HP {{ member.unknownHp ? '???' : `${member.hp.current} / ${member.hp.max}` }}</span><template v-if="member.mp && !member.unknownHp"><span class="battle-bar mp"><i :style="{ width: `${percent(member.mp.current, member.mp.max)}%` }" /></span><span class="member-numbers">MP {{ member.mp.current }} / {{ member.mp.max }}</span></template><span v-if="member.status?.length" class="member-status-tags"><em v-for="status in member.status" :key="status">{{ status }}</em></span></span>
          <span v-if="member.active" class="active-mark enemy-active">行动</span>
        </button>
        <div v-if="!battle.enemies.length" class="battle-empty">没有敌方目标</div>
      </div>
    </div>

    <div v-if="battle.log?.length" class="battle-log" aria-label="战斗记录">
      <p v-for="(entry, index) in battle.log.slice(-4)" :key="entry.id ?? index" :class="`log-${entry.tone || 'normal'}`">{{ entry.text }}</p>
    </div>

    <footer class="battle-actions">
      <div class="action-heading"><span>{{ pendingAction ? `请选择${pendingAction.targeting === 'ally' ? '队友' : pendingAction.targeting === 'any' ? '单位' : '敌方目标'}` : '行动' }}</span><small>需要指定目标时，点选上方队伍卡片</small></div>
      <div class="battle-action-tabs" role="tablist" aria-label="战斗行动分类"><button v-for="category in availableCategories" :key="category.id" type="button" role="tab" :aria-selected="selectedCategory === category.id" :class="{ active: selectedCategory === category.id }" @click="selectCategory(category.id)">{{ category.label }}</button></div>
      <div class="battle-action-grid">
        <button v-for="action in visibleActions" :key="action.id" type="button" class="battle-action" :class="{ selected: pendingAction?.id === action.id }" :disabled="!canAct || action.disabled" @click="selectAction(action)">
          <span class="battle-action-icon">{{ action.icon || '✦' }}</span>
          <span class="battle-action-copy"><strong>{{ action.label }}</strong><small>{{ action.cooldown ? `冷却 ${action.cooldown} 回合` : action.cost || action.description || (action.targeting === 'none' ? '立即执行' : '选择目标') }}</small></span>
        </button>
        <p v-if="!visibleActions.length" class="battle-action-empty">当前没有可用的{{ actionCategories.find(category => category.id === selectedCategory)?.label }}行动。</p>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.turn-battle-panel { position: relative; padding: 22px; overflow: hidden; }
.battle-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 13px; }
.battle-header h3 { margin: 0; }
.battle-round { display: grid; place-items: center; min-width: 56px; padding: 8px 12px; color: #66596f; background: #faf2eb; border-radius: 13px; }
.battle-round span { color: var(--muted, #827487); font-size: 9px; letter-spacing: .12em; }
.battle-round strong { margin-top: 2px; color: var(--coral, #ed806f); font-size: 20px; line-height: 1; }
.battle-status { display: flex; align-items: center; gap: 7px; min-height: 36px; margin-bottom: 14px; padding: 8px 11px; color: #66596f; background: #faf5f0; border-radius: 12px; font-size: 12px; }
.battle-status small { overflow: hidden; margin-left: 3px; color: var(--muted, #827487); text-overflow: ellipsis; white-space: nowrap; }
.battle-status.phase-player { background: #eef8f0; }
.battle-status.phase-enemy { background: #fff2e6; }
.battle-status.phase-victory { color: #4a866c; background: #e9f7ef; }
.battle-status.phase-defeat { color: #a14c56; background: #ffeded; }
.battle-status-dot { width: 7px; height: 7px; flex: 0 0 auto; background: var(--coral, #ed806f); border-radius: 99px; box-shadow: 0 0 0 3px rgba(237,128,111,.15); }
.phase-enemy .battle-status-dot { background: #efaa61; box-shadow: 0 0 0 3px rgba(239,170,97,.15); }
.phase-victory .battle-status-dot { background: #4ba77b; box-shadow: 0 0 0 3px rgba(75,167,123,.15); }
.phase-defeat .battle-status-dot { background: #c45d66; box-shadow: 0 0 0 3px rgba(196,93,102,.15); }
.cancel-targeting { margin-left: auto; padding: 4px 8px; color: #806c9b; background: rgba(143,125,215,.1); border-radius: 8px; font-size: 10px; }
.battle-field { display: grid; grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr); gap: 10px; align-items: stretch; }
.battle-side { display: grid; align-content: start; gap: 8px; min-width: 0; }
.side-heading { display: flex; align-items: center; justify-content: space-between; padding: 0 3px 3px; color: #66596f; font-size: 12px; }
.side-heading small { color: var(--muted, #827487); font-size: 10px; }
.battle-member { position: relative; display: flex; align-items: center; gap: 9px; min-width: 0; padding: 10px; color: var(--ink, #4d4354); background: #fcf5ef; border: 1px solid transparent; border-radius: 14px; text-align: left; transition: border-color .15s ease, transform .15s ease, opacity .15s ease; }
.battle-member.active { border-color: rgba(237,128,111,.55); box-shadow: 0 5px 12px rgba(237,128,111,.1); }
.battle-member.targetable { border-color: #a995dc; background: #f1edff; cursor: pointer; box-shadow: 0 0 0 2px rgba(169,149,220,.16); }
.battle-member.targetable:hover { transform: translateY(-1px); }
.battle-member:disabled { cursor: default; }
.battle-member.defeated { opacity: .46; filter: grayscale(.6); }
.member-portrait { display: grid; place-items: center; flex: 0 0 39px; width: 39px; height: 39px; overflow: hidden; color: #9b7b61; background: #fff0d7; border-radius: 13px; font-size: 19px; }
.member-portrait img { width: 100%; height: 100%; object-fit: cover; }
.enemy-portrait { color: #a65c62; background: #ffe6e3; }
.member-main { display: grid; min-width: 0; flex: 1; gap: 3px; }
.member-title { display: flex; align-items: baseline; gap: 5px; min-width: 0; }
.member-title strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.member-title small { color: var(--muted, #827487); font-size: 9px; }
.member-role { overflow: hidden; color: var(--muted, #827487); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.battle-bar { display: block; height: 5px; overflow: hidden; background: #f0ded9; border-radius: 99px; }
.battle-bar i { display: block; height: 100%; background: linear-gradient(90deg, #e7776d, #f2a070); border-radius: inherit; transition: width .28s ease; }
.battle-bar.mp { background: #e0e4f4; }
.battle-bar.mp i { background: linear-gradient(90deg, #628acb, #8eb8e7); }
.enemy-hp i { background: linear-gradient(90deg, #cf6a72, #e59788); }
.member-numbers { color: var(--muted, #827487); font-size: 9px; }
.member-status-tags { display: flex; flex-wrap: wrap; gap: 3px; }
.member-status-tags em { padding: 2px 4px; color: #806c9b; background: #eee9ff; border-radius: 5px; font-size: 8px; font-style: normal; }
.active-mark { position: absolute; right: 7px; top: 6px; padding: 2px 4px; color: #bd665a; background: #ffe2d9; border-radius: 5px; font-size: 8px; }
.enemy-active { color: #a96066; background: #ffe0e0; }
.battle-divider { display: flex; align-items: center; justify-content: center; color: #d2b9a7; font-size: 12px; font-weight: 800; }
.battle-divider::before, .battle-divider::after { content: ''; position: absolute; height: 1px; background: #eadbd1; }
.battle-divider span { position: relative; z-index: 1; padding: 8px 5px; color: #d58b76; background: var(--paper, #fffaf4); border-radius: 50%; }
.battle-empty { padding: 18px 5px; color: var(--muted, #827487); font-size: 11px; text-align: center; }
.battle-log { display: grid; gap: 4px; max-height: 106px; overflow-y: auto; margin-top: 13px; padding: 10px 12px; color: var(--muted, #827487); background: #faf5f0; border-radius: 12px; font-size: 11px; line-height: 1.45; }
.battle-log p { margin: 0; }
.battle-log .log-good { color: #4a866c; }
.battle-log .log-danger { color: #b45d64; }
.battle-log .log-muted { color: #ad9baa; }
.battle-actions { margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--line, #eadfd8); }
.action-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; color: #66596f; font-size: 13px; }
.action-heading small { color: var(--muted, #827487); font-size: 10px; }
.battle-action-tabs { display: flex; gap: 5px; overflow-x: auto; margin-bottom: 9px; padding: 3px; background: #f5eef1; border-radius: 10px; scrollbar-width: thin; }
.battle-action-tabs button { flex: 1 0 62px; padding: 7px 10px; color: #7d7185; background: transparent; border-radius: 8px; font-size: 11px; white-space: nowrap; }
.battle-action-tabs button.active { color: #67558f; background: #fff; box-shadow: 0 2px 7px rgba(61, 45, 78, .08); font-weight: 700; }
.battle-action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.battle-action-empty { grid-column: 1 / -1; margin: 0; padding: 10px; color: var(--muted, #827487); font-size: 11px; }
.battle-action { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 10px; color: #594d6b; background: #f1ecff; border: 1px solid transparent; border-radius: 12px; text-align: left; transition: border-color .15s ease, transform .15s ease; }
.battle-action:hover:not(:disabled), .battle-action.selected { border-color: #aa98da; transform: translateY(-1px); }
.battle-action:disabled { opacity: .44; cursor: not-allowed; }
.battle-action-icon { display: grid; place-items: center; flex: 0 0 29px; width: 29px; height: 29px; color: #9077bd; background: #fff; border-radius: 10px; font-size: 15px; }
.battle-action-copy { display: grid; min-width: 0; gap: 3px; }
.battle-action-copy strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.battle-action-copy small { overflow: hidden; color: #8c7f9b; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 680px) { .battle-action-copy strong, .battle-action-copy small { overflow: visible; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; } }
@media (max-width: 680px) { .turn-battle-panel { padding: 14px 11px; } .battle-field { grid-template-columns: minmax(0, 1fr) 20px minmax(0, 1fr); gap: 4px; } .battle-side { max-height: 34dvh; overflow-y: auto; } .battle-divider::before, .battle-divider::after { display: none; } .battle-divider span { padding: 3px 1px; font-size: 10px; } .battle-member { align-items: flex-start; gap: 5px; padding: 6px 4px; } .member-portrait { flex-basis: 26px; width: 26px; height: 26px; border-radius: 8px; font-size: 14px; } .member-title strong { font-size: 10px; } .side-heading { font-size: 10px; } .side-heading small { font-size: 9px; } .battle-action-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 420px) { .battle-action-grid { grid-template-columns: 1fr; } }
</style>
