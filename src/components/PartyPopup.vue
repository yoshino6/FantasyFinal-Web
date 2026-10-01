<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { PartyApplication, Recruitment } from '../api';

type PartyMember = {
  id: number;
  gameId: number;
  name: string;
  level?: number;
  isLeader: boolean;
  regionCode?: string;
  regionName?: string;
  position?: { x: number; y: number; z: number } | null;
};

type Party = {
  id: string;
  name: string;
  story?: boolean;
  leaderId: number;
  ownId: number;
  isLeader: boolean;
  leader?: PartyMember | null;
  members: PartyMember[];
  memberCount: number;
  maxMembers: number;
  regionCode?: string;
  regionName?: string;
  canLeave: boolean;
  canRename: boolean;
  canRecruit: boolean;
  recruitment?: Recruitment | null;
  pendingApplicationCount?: number;
};

const props = withDefaults(defineProps<{
  party: Party | null;
  recruitments: Recruitment[];
  applications: PartyApplication[];
  hasMore?: boolean;
  loadingMore?: boolean;
  busy?: boolean;
  loading?: boolean;
  error?: string;
}>(), {
  busy: false,
  loading: false,
  hasMore: false,
  loadingMore: false,
  error: ''
});

const emit = defineEmits<{
  create: [payload: { name: string; description: string }];
  search: [payload: { keyword: string; region: string; targetCount?: number }];
  'load-more': [];
  apply: [recruitmentId: number];
  publish: [payload: { description: string; targetCount: number }];
  leave: [];
  rename: [name: string];
  refresh: [];
  accept: [applicationId: number];
  reject: [applicationId: number];
}>();

const activeTab = ref<'create' | 'search'>('create');
const createName = ref('');
const createDescription = ref('');
const createPreview = ref(false);
const keyword = ref('');
const region = ref('');
const searchTargetCount = ref<number | ''>('');
const selectedRecruitmentId = ref<number | null>(null);
const renameOpen = ref(false);
const renameName = ref('');
const leaveConfirm = ref(false);
const publishDescription = ref('');
const publishTargetCount = ref(4);
const publishPreview = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

const leader = computed(() => props.party?.leader ?? props.party?.members.find(member => member.isLeader) ?? null);
const memberCount = computed(() => props.party?.memberCount ?? props.party?.members.length ?? 0);
const maxMembers = computed(() => props.party?.maxMembers ?? 4);
const canSubmitPublish = computed(() => Boolean(props.party?.canRecruit && publishTargetCount.value > memberCount.value && publishTargetCount.value <= maxMembers.value && !props.busy && !props.loading));

onMounted(() => { clock = setInterval(() => { now.value = Date.now(); }, 30_000); });
onUnmounted(() => { if (clock) clearInterval(clock); });

watch(() => props.party?.id, () => {
  renameOpen.value = false;
  leaveConfirm.value = false;
  publishPreview.value = false;
  renameName.value = props.party?.name ?? '';
  publishDescription.value = props.party?.recruitment?.description ?? '';
  publishTargetCount.value = props.party?.recruitment?.targetCount ?? props.party?.maxMembers ?? 4;
}, { immediate: true });

watch(() => props.party?.recruitment?.id, () => {
  publishDescription.value = props.party?.recruitment?.description ?? '';
  publishTargetCount.value = props.party?.recruitment?.targetCount ?? props.party?.maxMembers ?? 4;
  publishPreview.value = false;
});

watch(() => props.recruitments, list => {
  if (selectedRecruitmentId.value && !list.some(item => item.id === selectedRecruitmentId.value)) selectedRecruitmentId.value = null;
});

function previewCreate() {
  if (!createName.value.trim()) return;
  createPreview.value = true;
}

function submitCreate() {
  if (!createName.value.trim() || props.busy || props.loading) return;
  emit('create', { name: createName.value.trim(), description: createDescription.value.trim() });
  createPreview.value = false;
}

function submitSearch() {
  selectedRecruitmentId.value = null;
  const filters: { keyword: string; region: string; targetCount?: number } = { keyword: keyword.value.trim(), region: region.value.trim() };
  if (typeof searchTargetCount.value === 'number') filters.targetCount = searchTargetCount.value;
  emit('search', filters);
}

function submitRename() {
  const name = renameName.value.trim();
  if (!name || !props.party?.canRename || props.busy || props.loading) return;
  emit('rename', name);
  renameOpen.value = false;
}

function previewPublish() {
  if (!canSubmitPublish.value) return;
  publishPreview.value = true;
}

function submitPublish() {
  if (!canSubmitPublish.value) return;
  emit('publish', { description: publishDescription.value.trim(), targetCount: publishTargetCount.value });
  publishPreview.value = false;
}

function submitLeave() {
  if (!props.party?.canLeave || props.busy || props.loading) return;
  emit('leave');
  leaveConfirm.value = false;
}

function remainingTime(item: Recruitment): string {
  if (!item.expiresAt) return '';
  const remaining = new Date(item.expiresAt).getTime() - now.value;
  if (!Number.isFinite(remaining) || remaining <= 0) return '已过期';
  if (remaining < 60_000) return '不足 1 分钟';
  if (remaining < 3_600_000) return `剩余 ${Math.ceil(remaining / 60_000)} 分钟`;
  return `剩余 ${Math.ceil(remaining / 3_600_000)} 小时`;
}

function recruitmentStatus(item: Recruitment): string {
  switch (item.applicationStatus) {
    case 'pending': return '待处理';
    case 'accepted': return '已加入';
    case 'rejected': return '已拒绝';
    case 'cancelled': return '已取消';
    case 'expired': return '已过期';
  }
  if (item.own) return '我的队伍';
  if (item.status === 'closed' || (item.openSlots ?? item.targetCount - item.memberCount) <= 0) return '人数已满';
  if (item.expiresAt && new Date(item.expiresAt).getTime() <= now.value) return '已过期';
  return '';
}

function canApply(item: Recruitment): boolean {
  return !item.own && item.status !== 'closed' && (item.openSlots ?? item.targetCount - item.memberCount) > 0
    && (!item.expiresAt || new Date(item.expiresAt).getTime() > now.value)
    && !['pending', 'accepted'].includes(item.applicationStatus ?? '') && !props.busy && !props.loading;
}

function applicationStatus(status: string): string {
  switch (status) {
    case 'pending': return '待处理';
    case 'accepted': return '已加入';
    case 'rejected': return '已拒绝';
    case 'cancelled': return '已取消';
    case 'expired': return '已过期';
    default: return status;
  }
}

function memberLocation(member: PartyMember): string {
  const regionName = member.regionName || member.regionCode || '未知区域';
  const position = member.position;
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return regionName;
  return `${regionName} · (${position.x}, ${position.y}, ${position.z})`;
}
</script>

<template>
  <div class="party-popup">
    <div class="party-toolbar">
      <span>{{ party ? '当前队伍' : '寻找同行者' }}</span>
      <button type="button" class="party-text-button" :disabled="busy || loading" @click="emit('refresh')">刷新</button>
    </div>
    <p v-if="loading" class="party-state" role="status">正在读取队伍信息…</p>
    <p v-if="error" class="party-error" role="alert">{{ error }}</p>

    <template v-if="!party">
      <div class="party-tabs" role="tablist" aria-label="队伍操作">
        <button type="button" role="tab" :aria-selected="activeTab === 'create'" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">创建队伍</button>
        <button type="button" role="tab" :aria-selected="activeTab === 'search'" :class="{ active: activeTab === 'search' }" @click="activeTab = 'search'">搜索队伍</button>
      </div>

      <section v-if="activeTab === 'create'" class="party-section" aria-label="创建队伍">
        <form class="party-form" @submit.prevent="previewCreate">
          <label>队伍名<input v-model="createName" maxlength="32" required placeholder="给队伍取个名字" @input="createPreview = false" /></label>
          <div class="party-fixed-count"><span>人数上限</span><strong>4 人</strong></div>
          <label>招募说明<textarea v-model="createDescription" maxlength="300" rows="2" placeholder="说说你想一起探索什么" @input="createPreview = false" /></label>
          <button class="party-primary" type="submit" :disabled="busy || loading || !createName.trim()">预览创建</button>
        </form>
        <div v-if="createPreview" class="party-preview">
          <strong>确认创建队伍</strong>
          <p>{{ createName.trim() }} · 最多 4 人</p>
          <p v-if="createDescription.trim()">招募说明：{{ createDescription.trim() }}</p>
          <small v-if="createDescription.trim()">创建成功后，这段说明会立即发布到组队频道。</small>
          <div class="party-actions">
            <button type="button" class="party-primary" :disabled="busy || loading" @click="submitCreate">确认创建</button>
            <button type="button" class="party-quiet" @click="createPreview = false">返回修改</button>
          </div>
        </div>
      </section>

      <section v-else class="party-section" aria-label="搜索队伍">
        <form class="party-search-form" @submit.prevent="submitSearch">
          <label>关键词<input v-model="keyword" maxlength="80" placeholder="队伍名、队长或说明" /></label>
          <label>地区<input v-model="region" maxlength="64" placeholder="不限地区" /></label>
          <label>目标人数<select v-model.number="searchTargetCount"><option value="">不限</option><option :value="2">2 人</option><option :value="3">3 人</option><option :value="4">4 人</option></select></label>
          <button class="party-primary" type="submit" :disabled="busy || loading">搜索</button>
        </form>
        <p class="party-section-caption">仅显示仍有空位的公开招募。</p>
        <div v-if="recruitments.length" class="party-recruitment-list">
          <article v-for="item in recruitments" :key="item.id" class="party-recruitment-card">
            <button type="button" class="party-recruitment-summary" :aria-expanded="selectedRecruitmentId === item.id" @click="selectedRecruitmentId = selectedRecruitmentId === item.id ? null : item.id">
              <span class="party-avatar" aria-hidden="true">{{ (item.creatorName || item.partyName || '队').slice(0, 1) }}</span>
              <span class="party-recruitment-heading"><strong>{{ item.partyName }}</strong><small>{{ item.creatorName || '队长' }} · {{ item.regionName || '未知地区' }}</small></span>
              <span class="party-recruitment-count"><strong>{{ item.memberCount }}/{{ item.targetCount }}</strong><small v-if="recruitmentStatus(item)">{{ recruitmentStatus(item) }}</small></span>
            </button>
            <div v-if="selectedRecruitmentId === item.id" class="party-recruitment-detail">
              <p v-if="item.description">{{ item.description }}</p>
              <p v-else class="party-muted">队长暂未填写招募说明。</p>
              <div class="party-recruitment-foot">
                <span>{{ remainingTime(item) }}</span>
                <span v-if="recruitmentStatus(item)" class="party-status">{{ recruitmentStatus(item) }}</span>
                <button v-if="canApply(item)" type="button" class="party-primary" :disabled="busy || loading" @click="emit('apply', item.id)">{{ item.applicationStatus === 'rejected' ? '再次申请' : '申请加入' }}</button>
              </div>
            </div>
          </article>
        </div>
        <p v-else-if="!loading" class="party-empty">暂无符合条件的公开招募。</p>
        <button v-if="hasMore" type="button" class="party-load-more" :disabled="busy || loading || loadingMore" @click="emit('load-more')">{{ loadingMore ? '正在加载…' : '加载更多队伍' }}</button>
      </section>
    </template>

    <template v-else>
      <section class="party-section" aria-label="当前队伍">
        <div class="party-current-heading">
          <div><strong>{{ party.name }}</strong><small>{{ party.regionName || leader?.regionName || '未知地区' }}</small></div>
          <span>{{ memberCount }}/{{ maxMembers }} 人</span>
        </div>
        <div class="party-member-list">
          <div v-for="member in party.members" :key="member.id" class="party-member">
            <span class="party-avatar" aria-hidden="true">{{ member.name.slice(0, 1) }}</span>
            <div><strong>{{ member.name }}<em v-if="member.isLeader">队长</em><em v-if="member.id === party.ownId">我</em></strong><small>Game ID {{ member.gameId }} · {{ memberLocation(member) }}</small></div>
          </div>
        </div>
        <p v-if="!party.members.length" class="party-empty">正在读取队伍成员…</p>
        <div class="party-actions party-member-actions">
          <button v-if="party.canRename" type="button" class="party-quiet" :disabled="busy || loading" @click="renameOpen = !renameOpen; leaveConfirm = false">修改队伍名</button>
          <button v-if="party.canLeave" type="button" class="party-quiet" :disabled="busy || loading" @click="leaveConfirm = !leaveConfirm; renameOpen = false">退出队伍</button>
        </div>
        <form v-if="renameOpen && party.canRename" class="party-inline-form" @submit.prevent="submitRename">
          <label>新队伍名<input v-model="renameName" maxlength="32" required /></label>
          <button class="party-primary" type="submit" :disabled="busy || loading || !renameName.trim()">确认修改</button>
        </form>
        <div v-if="leaveConfirm && party.canLeave" class="party-preview">
          <p>确认退出 {{ party.name }}？</p>
          <div class="party-actions"><button type="button" class="party-danger" :disabled="busy || loading" @click="submitLeave">确认退出</button><button type="button" class="party-quiet" @click="leaveConfirm = false">取消</button></div>
        </div>
        <p v-if="party.story" class="party-section-caption">剧情队伍由主线流程管理，暂不能退出、改名或发布招募。</p>
      </section>

      <section v-if="party.isLeader" class="party-section" aria-label="队伍招募">
        <div class="party-section-heading"><strong>组队频道招募</strong><span v-if="party.recruitment" class="party-status">已发布</span></div>
        <div v-if="party.recruitment" class="party-current-recruitment">
          <p>{{ party.recruitment.description || '暂无招募说明' }}</p>
          <small>{{ party.recruitment.memberCount }}/{{ party.recruitment.targetCount }} 人 · {{ remainingTime(party.recruitment) }}</small>
        </div>
        <form v-if="party.canRecruit" class="party-form" @submit.prevent="previewPublish">
          <label>招募说明<textarea v-model="publishDescription" maxlength="300" rows="2" placeholder="向组队频道介绍你的队伍" @input="publishPreview = false" /></label>
          <label>招募目标人数<select v-model.number="publishTargetCount" @change="publishPreview = false"><option v-for="count in [2, 3, 4]" :key="count" :value="count" :disabled="count <= memberCount || count > maxMembers">{{ count }} 人</option></select></label>
          <button class="party-primary" type="submit" :disabled="!canSubmitPublish">{{ party.recruitment ? '预览更新' : '预览发布' }}</button>
        </form>
        <p v-else class="party-section-caption">{{ party.story ? '剧情队伍不能发布招募。' : memberCount >= maxMembers ? '队伍已满，不能发布招募。' : '当前无法发布招募，请刷新后查看队伍状态。' }}</p>
        <div v-if="publishPreview && party.canRecruit" class="party-preview">
          <strong>将发送到组队频道</strong>
          <p>{{ party.name }} · {{ party.regionName || leader?.regionName || '未知地区' }} · 空位 {{ Math.max(0, publishTargetCount - memberCount) }} · {{ memberCount }}/{{ publishTargetCount }} 人</p>
          <p>{{ publishDescription.trim() || '暂无招募说明' }}</p>
          <small>频道卡片将提供申请加入入口。</small>
          <div class="party-actions"><button type="button" class="party-primary" :disabled="!canSubmitPublish" @click="submitPublish">{{ party.recruitment ? '确认更新' : '发送到组队频道' }}</button><button type="button" class="party-quiet" @click="publishPreview = false">返回修改</button></div>
        </div>
      </section>

      <section v-if="party.isLeader" class="party-section" aria-label="入队申请">
        <div class="party-section-heading"><strong>入队申请</strong><span v-if="party.pendingApplicationCount" class="party-status">待处理 {{ party.pendingApplicationCount }}</span></div>
        <div v-if="applications.length" class="party-application-list">
          <article v-for="application in applications" :key="application.id" class="party-application">
            <div><strong>{{ application.name }}</strong><small>Game ID {{ application.gameId }} · {{ applicationStatus(application.status) }}</small><p v-if="application.message">{{ application.message }}</p></div>
            <div v-if="application.status === 'pending'" class="party-actions"><button type="button" class="party-primary" :disabled="busy || loading" @click="emit('accept', application.id)">同意</button><button type="button" class="party-quiet" :disabled="busy || loading" @click="emit('reject', application.id)">拒绝</button></div>
          </article>
        </div>
        <p v-else class="party-empty">{{ party.recruitment ? '暂无入队申请。' : '发布招募后，申请会显示在这里。' }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.party-popup { display: grid; gap: 10px; max-height: min(620px, calc(78vh - 56px)); overflow-y: auto; overscroll-behavior: contain; padding: 2px 4px 6px; color: #594d62; font-size: 12px; }
.party-toolbar, .party-current-heading, .party-section-heading, .party-recruitment-foot, .party-fixed-count { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.party-toolbar { padding: 3px 4px 0; color: #9a7181; font-size: 11px; font-weight: 700; }
.party-text-button { padding: 4px 6px; color: #7763a8; background: transparent; font-size: 11px; }
.party-tabs { display: flex; gap: 4px; padding: 3px; background: #f6eeed; border-radius: 10px; }
.party-tabs button { flex: 1; padding: 8px; color: #8b7f8e; background: transparent; border-radius: 8px; font-size: 12px; }
.party-tabs button.active { color: #665197; background: #fff; box-shadow: 0 2px 8px rgba(77, 54, 87, .08); font-weight: 700; }
.party-section { display: grid; gap: 9px; padding: 12px; background: rgba(255, 255, 255, .74); border: 1px solid #f1e7e5; border-radius: 12px; }
.party-section-heading strong { font-size: 13px; }
.party-form, .party-search-form { display: grid; gap: 8px; }
.party-form label, .party-search-form label, .party-inline-form label { margin: 0; color: #756c7a; font-size: 11px; }
.party-form input, .party-form textarea, .party-form select, .party-search-form input, .party-search-form select, .party-inline-form input { width: 100%; min-height: 34px; margin-top: 4px; padding: 7px 9px; color: #594d62; background: #fff; border: 1px solid #e8dedd; border-radius: 8px; font: inherit; font-size: 12px; }
.party-form textarea { min-height: 60px; resize: vertical; }
.party-search-form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 84px auto; align-items: end; }
.party-search-form button { min-height: 34px; }
.party-fixed-count { padding: 8px 10px; color: #756c7a; background: #f8f0ec; border-radius: 8px; font-size: 11px; }
.party-fixed-count strong { color: #665197; }
.party-primary, .party-quiet, .party-danger { min-height: 30px; padding: 6px 10px; border-radius: 8px; font-size: 11px; white-space: nowrap; }
.party-primary { color: #fff; background: #9477b9; }
.party-quiet { color: #735d88; background: #f0eaf6; }
.party-danger { color: #ae505c; background: #ffe8e9; }
.party-primary:disabled, .party-quiet:disabled, .party-danger:disabled, .party-text-button:disabled { cursor: default; opacity: .55; }
.party-preview { display: grid; gap: 6px; padding: 10px; background: #f6f0ff; border: 1px solid #e7def4; border-radius: 9px; }
.party-preview p, .party-current-recruitment p { margin: 0; overflow-wrap: anywhere; line-height: 1.5; }
.party-preview small, .party-current-recruitment small, .party-muted { color: #8f8296; }
.party-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.party-section-caption { margin: 0; color: #948895; font-size: 11px; line-height: 1.5; }
.party-recruitment-list, .party-member-list, .party-application-list { display: grid; gap: 6px; }
.party-recruitment-card, .party-member, .party-application { min-width: 0; background: #fcf7f2; border-radius: 9px; }
.party-recruitment-summary { display: flex; align-items: center; gap: 7px; width: 100%; padding: 8px; color: inherit; background: transparent; text-align: left; }
.party-avatar { display: grid; place-items: center; flex: 0 0 27px; width: 27px; height: 27px; color: #fff; background: #a391bd; border-radius: 8px; font-size: 11px; }
.party-recruitment-heading, .party-member > div { display: grid; min-width: 0; gap: 2px; }
.party-recruitment-heading { flex: 1; }
.party-recruitment-heading strong, .party-member strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.party-recruitment-heading small, .party-member small, .party-application small { overflow: hidden; color: #918493; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.party-recruitment-count { display: grid; justify-items: end; flex: 0 0 auto; gap: 2px; color: #786998; font-size: 11px; }
.party-recruitment-count small { color: #a57485; font-size: 9px; }
.party-recruitment-detail { display: grid; gap: 7px; padding: 0 9px 9px 44px; }
.party-recruitment-detail p { margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
.party-recruitment-foot { justify-content: flex-start; flex-wrap: wrap; color: #938496; font-size: 10px; }
.party-recruitment-foot button { margin-left: auto; }
.party-status { padding: 3px 6px; color: #785e91; background: #eee8f5; border-radius: 6px; font-size: 10px; white-space: nowrap; }
.party-current-heading { padding: 8px 10px; background: #f7f0ec; border-radius: 9px; }
.party-current-heading > div { display: grid; gap: 2px; min-width: 0; }
.party-current-heading strong { font-size: 13px; }
.party-current-heading small, .party-current-heading > span { color: #8c7d8a; font-size: 10px; }
.party-member { display: flex; align-items: center; gap: 7px; padding: 7px 8px; }
.party-member > div { flex: 1; }
.party-member em { margin-left: 5px; color: #b67285; font-size: 10px; font-style: normal; }
.party-member-actions { margin-top: 2px; }
.party-inline-form { display: flex; align-items: end; gap: 6px; }
.party-inline-form label { flex: 1; }
.party-current-recruitment { display: grid; gap: 4px; padding: 8px 10px; background: #f7f0ec; border-radius: 9px; }
.party-application { display: flex; align-items: center; justify-content: space-between; gap: 7px; padding: 8px; }
.party-application > div:first-child { display: grid; min-width: 0; gap: 2px; }
.party-application p { margin: 2px 0 0; color: #756b7a; font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
.party-empty, .party-state { margin: 0; padding: 14px 8px; color: #978b99; font-size: 11px; text-align: center; }
.party-load-more { justify-self: center; padding: 6px 12px; color: #735d88; background: #f0eaf6; border-radius: 8px; font-size: 11px; }
.party-load-more:disabled { opacity: .55; }
.party-error { margin: 0; padding: 8px 10px; color: #ad4e5b; background: #fff0ed; border-radius: 8px; font-size: 11px; }
.party-popup button:focus-visible, .party-popup input:focus-visible, .party-popup textarea:focus-visible, .party-popup select:focus-visible { outline: 2px solid #765dc2; outline-offset: 2px; }
@media (max-width: 460px) { .party-search-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .party-search-form button { grid-column: 1 / -1; } .party-application { align-items: flex-start; flex-direction: column; } }
</style>
