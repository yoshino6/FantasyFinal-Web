<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import AnimeIcon from './AnimeIcon.vue';
import TabArtIcon from './TabArtIcon.vue';
import SkillIcon from './SkillIcon.vue';
import { ANIME_SCENES } from '../anime-assets';
import { mapTargetArt } from '../exploration-assets';
import './anime-adventure.css';
import '../battle-viewport.css';
import ViewportPagination from './ViewportPagination.vue';
import { useViewportPagination } from '../useViewportPagination';

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
  skillCode?: string;
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
  (event: 'open-auto-battle'): void;
}>();

const pendingAction = ref<BattleAction | null>(null);
const battleStage = ref<HTMLElement | null>(null);
const battleViewportList = ref<HTMLElement | null>(null);
const battleViewportInfo = ref<{ title: string; text?: string; view?: 'status' | 'log' } | null>(null);
let actionTrigger: HTMLElement | null = null;
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
watch([() => props.battle.revision, () => props.battle.round, () => props.battle.phase], () => { pendingAction.value = null; });
const canAct = computed(() => !props.disabled && (props.battle.phase === undefined || props.battle.phase === 'player'));
watch(canAct, ready => { if (!ready) pendingAction.value = null; });
const phaseLabel = computed(() => {
  if (props.disabled) return '正在处理行动…';
  if (props.battle.turnLabel) return props.battle.turnLabel;
  return ({ player: '轮到你行动', enemy: '敌方行动中', waiting: '等待队伍行动', victory: '战斗胜利', defeat: '战斗失败' }[props.battle.phase ?? 'player'] ?? '准备战斗');
});
const phaseTone = computed(() => props.battle.phase ?? 'player');
const categoryIcon = (category: BattleAction['category']) => category === 'normal' ? 'sword' : category === 'skill' ? 'mana' : category === 'item' ? 'scroll' : 'star';
const actionIcon = (action: BattleAction) => action.id === 'defend' ? 'shield' : action.id === 'escape' ? 'arrow' : categoryIcon(actionCategory(action));
const memberPortrait = (member: BattleMember, side: 'ally' | 'enemy') => member.portrait
  || mapTargetArt({ type: side === 'ally' ? 'member' : '怪物', name: member.name }).src;

const percent = (value: number, max: number) => Math.min(100, Math.max(0, value / Math.max(1, max) * 100));
const memberCanTarget = (member: BattleMember, side: 'ally' | 'enemy') => {
  if (!canAct.value || !pendingAction.value || pendingAction.value.disabled || member.defeated) return false;
  if (pendingAction.value.targeting !== side && pendingAction.value.targeting !== 'any') return false;
  const allowed = pendingAction.value.allowedTargets?.[side];
  return !allowed || allowed.includes(member.id);
};
const battleViewportPagination = useViewportPagination(() => visibleActions.value, {
  container: battleViewportList, rowHeight: 64,
  columns: () => battleViewportList.value ? getComputedStyle(battleViewportList.value).gridTemplateColumns.split(' ').length : 2
});
watch(selectedCategory, () => battleViewportPagination.reset());
const formations = computed(() => ([
  { side: 'ally' as const, label: '我方阵容', members: props.battle.allies },
  { side: 'enemy' as const, label: '敌方阵容', members: props.battle.enemies }
]).map(team => {
  const unknownHp = team.members.some(member => member.unknownHp);
  const hp = team.members.reduce((sum, member) => ({ current: sum.current + member.hp.current, max: sum.max + member.hp.max }), { current: 0, max: 0 });
  return { ...team, hp, unknownHp, alive: team.members.filter(member => !member.defeated).length,
    statusCount: team.members.reduce((count, member) => count + (member.status?.length ?? 0), 0) };
}));
const targetLabel = computed(() => pendingAction.value?.targeting === 'ally' ? '队友' : pendingAction.value?.targeting === 'any' ? '单位' : '敌方目标');
const targetCount = computed(() => formations.value.reduce((count, team) => count + team.members.filter(member => memberCanTarget(member, team.side)).length, 0));
const commandHint = computed(() => pendingAction.value
  ? targetCount.value ? `点击高亮${targetLabel.value}施放 · Esc 取消` : '当前没有可选目标，请更换行动'
  : canAct.value ? '选择下方行动，再点击场上目标' : '可查看状态与记录');
const memberMark = (member: BattleMember, side: 'ally' | 'enemy') => member.defeated ? '已倒下'
  : memberCanTarget(member, side) ? '可选目标' : member.active ? side === 'ally' ? '当前行动' : '当前目标' : '';
const memberLabel = (member: BattleMember, side: 'ally' | 'enemy') => pendingAction.value
  ? `选择${side === 'ally' ? '队友' : '敌方目标'} ${member.name}` : `查看${member.name}状态`;
function battleViewportMemberInfo(member: BattleMember, side: 'ally' | 'enemy') {
  battleViewportInfo.value = { title: member.name, text: [side === 'ally' ? '我方队伍' : '敌方队伍',
    member.role || (side === 'ally' ? '冒险者' : '敌人'), member.level ? `Lv.${member.level}` : '',
    `HP ${member.unknownHp ? '???' : `${member.hp.current} / ${member.hp.max}`}`,
    member.mp && !member.unknownHp ? `MP ${member.mp.current} / ${member.mp.max}` : '',
    member.defeated ? '已被击败' : '', member.active ? side === 'ally' ? '当前行动单位' : '当前目标' : '',
    member.status?.length ? `状态：${member.status.join('、')}` : '暂无附加状态'].filter(Boolean).join('\n') };
}
function battleViewportActionInfo(action: BattleAction) {
  battleViewportInfo.value = { title: action.label, text: [action.description,
    action.cost, action.cooldown ? `冷却 ${action.cooldown} 回合` : '',
    action.targeting === 'none' ? '立即执行' : action.targeting === 'ally' ? '选择队友' : action.targeting === 'any' ? '选择单位' : '选择敌方目标',
    action.disabled ? '当前不可使用' : ''].filter(Boolean).join('\n') };
}
const selectAction = (action: BattleAction, event: MouseEvent) => {
  if (!canAct.value || action.disabled) return;
  actionTrigger = event.currentTarget as HTMLElement;
  pendingAction.value = null;
  if (action.targeting && action.targeting !== 'none') {
    pendingAction.value = action;
    void nextTick(() => {
      const target = battleStage.value?.querySelector<HTMLButtonElement>('.targetable');
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      target?.focus({ preventScroll: true });
    });
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
const cancelTargeting = () => {
  if (!pendingAction.value) return;
  pendingAction.value = null;
  void nextTick(() => { if (actionTrigger?.isConnected) actionTrigger.focus({ preventScroll: true }); });
};
</script>

<template>
  <section class="turn-battle-panel battle-viewport-panel battle-command-layout card-surface anime-adventure"
    :class="'battle-phase-' + phaseTone" :data-battle-pending-action="pendingAction?.id" :data-battle-category="selectedCategory"
    :style="{ '--adventure-scene': 'url(' + ANIME_SCENES.forest + ')' }" :inert="Boolean(battleViewportInfo)"
    aria-label="回合制战斗" @keydown.esc.stop.prevent="cancelTargeting">
    <header class="battle-command-header">
      <div class="battle-heading"><h3><AnimeIcon name="sword" :size="23" />{{ battle.title || '遭遇战' }}</h3><small>回合制战斗</small></div>
      <div class="battle-round-badge" aria-label="当前回合"><small>回合</small><strong>{{ battle.round ?? 1 }}</strong></div>
      <button type="button" class="battle-tool" aria-label="查看完整战斗状态"
        @click="battleViewportInfo = { title: '战斗状态', text: [phaseLabel, battle.statusText].filter(Boolean).join('\n') }">战况 ⓘ</button>
    </header>

    <section class="battle-overview" role="group" aria-label="双方状态与回合信息">
      <template v-for="(team, index) in formations" :key="team.side">
        <div class="battle-team-summary" :class="team.side">
          <span><strong>{{ team.label }}</strong><small>{{ team.alive }} / {{ team.members.length }} 在场</small></span>
          <span class="battle-bar hp"><i :style="{ width: team.unknownHp ? '100%' : percent(team.hp.current, team.hp.max) + '%' }" /></span>
          <small>HP {{ team.unknownHp ? '???' : team.hp.current + ' / ' + team.hp.max }}<template v-if="team.statusCount"> · {{ team.statusCount }} 状态</template></small>
        </div>
        <div v-if="index === 0" class="battle-turn-state" :class="'phase-' + phaseTone" role="status" aria-live="polite">
          <strong>{{ phaseLabel }}</strong><small>{{ pendingAction ? '正在选择目标' : '第 ' + (battle.round ?? 1) + ' 回合' }}</small>
        </div>
      </template>
    </section>

    <section ref="battleStage" class="battle-stage" aria-label="双方阵容">
      <span class="battle-stage-versus" aria-hidden="true">VS</span>
      <section v-for="team in formations" :key="team.side" class="battle-formation" :class="'is-' + team.side" :aria-label="team.label">
        <header><strong>{{ team.label }}</strong><small>{{ pendingAction ? '高亮目标可点选' : '点击立绘查看状态' }}</small></header>
        <div class="battle-formation-units" :style="{ '--formation-columns': Math.min(3, Math.max(1, team.members.length)), '--formation-rows': Math.ceil(team.members.length / 3) }">
          <button v-for="member in team.members" :key="member.id" type="button" class="battle-stage-unit"
            :class="{ targetable: memberCanTarget(member, team.side), untargetable: pendingAction && !memberCanTarget(member, team.side), defeated: member.defeated, active: member.active }"
            :data-battle-member-id="member.id" :data-battle-member-side="team.side" :aria-label="memberLabel(member, team.side)"
            :disabled="Boolean(pendingAction) && !memberCanTarget(member, team.side)"
            @click="pendingAction ? selectMember(member, team.side) : battleViewportMemberInfo(member, team.side)">
            <span class="battle-unit-mark">{{ memberMark(member, team.side) }}</span>
            <span class="battle-unit-art"><img :src="memberPortrait(member, team.side)" :alt="member.name" /></span>
            <strong :title="member.name">{{ member.name }}</strong>
            <span class="battle-bar hp"><i :style="{ width: member.unknownHp ? '100%' : percent(member.hp.current, member.hp.max) + '%' }" /></span>
            <small class="battle-unit-hp">HP {{ member.unknownHp ? '???' : member.hp.current + ' / ' + member.hp.max }}</small>
            <span v-if="member.status?.length" class="battle-unit-tags" :title="member.status.join('、')"><em>{{ member.status[0] }}</em><em v-if="member.status.length > 1">+{{ member.status.length - 1 }}</em></span>
          </button>
          <p v-if="!team.members.length" class="battle-viewport-empty">暂无单位</p>
        </div>
      </section>
    </section>

    <footer class="battle-command-deck">
      <div class="battle-command-toolbar">
        <div class="battle-command-prompt" role="status" aria-live="polite"><strong>{{ pendingAction ? pendingAction.label + ' · 选择' + targetLabel : canAct ? '下达指令' : phaseLabel }}</strong><small>{{ commandHint }}</small></div>
        <button v-if="pendingAction" type="button" class="cancel-targeting" @click="cancelTargeting">取消选取</button>
        <button type="button" class="battle-tool" aria-label="查看双方状态" @click="battleViewportInfo = { title: '双方状态', view: 'status' }">状态</button>
        <button type="button" class="battle-tool" aria-label="查看战斗记录" @click="battleViewportInfo = { title: '战斗记录', view: 'log' }">记录</button>
        <button type="button" class="battle-tool" aria-label="自动战斗设置" :disabled="disabled" @click="emit('open-auto-battle')">自动</button>
      </div>
      <div class="battle-action-tabs" role="group" aria-label="战斗行动分类">
        <button v-for="category in availableCategories" :key="category.id" type="button" :aria-pressed="selectedCategory === category.id"
          :class="{ active: selectedCategory === category.id }" @click="selectCategory(category.id)">
          <TabArtIcon :name="category.id === 'normal' ? 'equipment' : category.id === 'skill' ? 'skills' : category.id === 'item' ? 'consumables' : 'oath'" :size="22" />{{ category.label }}
        </button>
      </div>
      <div ref="battleViewportList" class="battle-viewport-list actions" role="group" aria-label="战斗行动列表">
        <div v-for="action in battleViewportPagination.visibleItems.value" :key="action.id" class="battle-viewport-action-row" :data-battle-action-id="action.id">
          <button type="button" class="battle-action" :class="{ selected: pendingAction?.id === action.id }" :aria-pressed="pendingAction?.id === action.id"
            :aria-label="action.label" :disabled="!canAct || action.disabled" @click="selectAction(action, $event)">
            <span class="battle-action-icon"><SkillIcon v-if="action.skillCode || action.id === 'attack'" :code="action.skillCode || 'basic_slash'" :name="action.label" :size="32" /><AnimeIcon v-else :name="actionIcon(action)" :size="27" /></span>
            <span class="battle-action-copy"><strong>{{ action.label }}</strong><small>{{ action.cooldown ? '冷却 ' + action.cooldown + ' 回合' : action.cost || action.description || (action.targeting === 'none' ? '立即执行' : '选择目标') }}</small></span>
          </button>
          <button type="button" class="battle-viewport-action-info" :aria-label="'查看' + action.label + '详情'" @click="battleViewportActionInfo(action)">ⓘ</button>
        </div>
        <p v-if="!visibleActions.length" class="battle-viewport-empty">当前没有可用行动。</p>
      </div>
      <ViewportPagination v-if="battleViewportPagination.totalPages.value > 1" :page="battleViewportPagination.page.value" :total-pages="battleViewportPagination.totalPages.value" :total="visibleActions.length" label="战斗列表翻页" @update:page="battleViewportPagination.setPage" />
    </footer>

    <Teleport to="body">
      <div v-if="battleViewportInfo" class="battle-viewport-backdrop" @click.self="battleViewportInfo = null">
        <section class="battle-viewport-dialog" role="dialog" aria-modal="true" :aria-label="battleViewportInfo.title" @keydown.esc.stop.prevent="battleViewportInfo = null">
          <header><h3>{{ battleViewportInfo.title }}</h3><button type="button" aria-label="关闭战斗详情" @click="battleViewportInfo = null">关闭 ×</button></header>
          <div>
            <template v-if="battleViewportInfo.view === 'status'">
              <section v-for="team in formations" :key="team.side" class="battle-roster-list">
                <h4>{{ team.label }}</h4>
                <button v-for="member in team.members" :key="member.id" type="button" class="battle-viewport-member"
                  :class="{ defeated: member.defeated, active: member.active }" :aria-label="'查看' + member.name + '状态'" @click="battleViewportMemberInfo(member, team.side)">
                  <span class="battle-viewport-member-portrait"><img :src="memberPortrait(member, team.side)" :alt="member.name" /></span>
                  <span class="battle-viewport-member-copy"><strong>{{ member.name }}</strong><small>HP {{ member.unknownHp ? '???' : member.hp.current + ' / ' + member.hp.max }}<template v-if="member.mp && !member.unknownHp"> · MP {{ member.mp.current }} / {{ member.mp.max }}</template></small><small>{{ member.status?.join('、') || '暂无附加状态' }}</small></span>
                </button>
              </section>
            </template>
            <div v-else-if="battleViewportInfo.view === 'log'" class="battle-record-list">
              <button v-for="(entry, index) in battle.log ?? []" :key="entry.id ?? index" type="button" class="battle-viewport-log-entry"
                :class="'log-' + (entry.tone || 'normal')" :data-battle-log-id="entry.id ?? index" @click="battleViewportInfo = { title: '战斗记录', text: entry.text }">
                <AnimeIcon name="scroll" :size="23" /><span>{{ entry.text }}</span><b aria-hidden="true">›</b>
              </button>
              <p v-if="!battle.log?.length" class="battle-viewport-empty">暂无战斗记录。</p>
            </div>
            <p v-else>{{ battleViewportInfo.text }}</p>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>
