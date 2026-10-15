<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { PanelPortrait, PartyApplication, Recruitment } from '../api';
import SocialGlyph from './SocialGlyph.vue';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import SocialAvatar from './SocialAvatar.vue';
import ViewportPagination from './ViewportPagination.vue';
import { useViewportPagination } from '../useViewportPagination';
import './anime-party-refinement.css';
import './party-viewport.css';
import '../game-ui-party.css';

type PartyMember = {
  id: number;
  gameId: number;
  name: string;
  level?: number;
  portrait?: PanelPortrait | string;
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

const activeTab = ref<'members' | 'recruitments' | 'applications'>('recruitments');
const modal = ref<'create' | 'publish' | 'rename' | 'leave' | 'recruitment' | 'member' | 'application' | null>(null);
const listViewport = ref<HTMLElement | null>(null);
const dialogRoot = ref<HTMLElement | null>(null);
let dialogTrigger: HTMLElement | null = null;
const selectedMember = ref<PartyMember | null>(null);
const selectedApplicationId = ref<number | null>(null);
const createName = ref('');
const createDescription = ref('');
const createPreview = ref(false);
const keyword = ref('');
const region = ref('');
const searchTargetCount = ref<number | ''>('');
const selectedRecruitmentId = ref<number | null>(null);
const renameName = ref('');
const publishDescription = ref('');
const publishTargetCount = ref(4);
const publishPreview = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

const leader = computed(() => props.party?.leader ?? props.party?.members.find(member => member.isLeader) ?? null);
const memberCount = computed(() => props.party?.memberCount ?? props.party?.members.length ?? 0);
const maxMembers = computed(() => props.party?.maxMembers ?? 4);
const canSubmitPublish = computed(() => Boolean(props.party?.canRecruit && publishTargetCount.value > memberCount.value && publishTargetCount.value <= maxMembers.value && !props.busy && !props.loading));
const selectedRecruitment = computed(() => props.recruitments.find(item => item.id === selectedRecruitmentId.value) ?? null);
const selectedApplication = computed(() => props.applications.find(item => item.id === selectedApplicationId.value) ?? null);
const members = computed(() => props.party?.members ?? []);
const listRowHeight = () => typeof window !== 'undefined' && window.innerHeight < 450 ? 76 : 108;
const memberPaging = useViewportPagination(() => members.value, { container: listViewport, rowHeight: listRowHeight, gap: 6 });
const recruitmentPaging = useViewportPagination(() => props.recruitments, { container: listViewport, rowHeight: listRowHeight, gap: 6 });
const applicationPaging = useViewportPagination(() => props.applications, { container: listViewport, rowHeight: listRowHeight, gap: 6 });
const activePaging = computed(() => activeTab.value === 'members' ? memberPaging : activeTab.value === 'applications' ? applicationPaging : recruitmentPaging);
const activeTotal = computed(() => activeTab.value === 'members' ? members.value.length : activeTab.value === 'applications' ? props.applications.length : props.recruitments.length);
const pagerLabel = computed(() => activeTab.value === 'members' ? '队伍成员翻页' : activeTab.value === 'applications' ? '入队申请翻页' : '队伍招募翻页');

onMounted(() => { clock = setInterval(() => { now.value = Date.now(); }, 30_000); });
onUnmounted(() => { if (clock) clearInterval(clock); });

watch(() => props.party?.id, () => {
  activeTab.value = props.party ? 'members' : 'recruitments';
  modal.value = null;
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
watch(() => props.party?.isLeader, isLeader => {
  if (isLeader) return;
  if (activeTab.value === 'applications') activeTab.value = props.party ? 'members' : 'recruitments';
  if (modal.value === 'application') modal.value = null;
});
watch(modal, async (value, previous) => {
  if (value && !previous) dialogTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  if (value) dialogRoot.value?.querySelector<HTMLElement>('input,textarea,select,[aria-label="关闭队伍详情"]')?.focus({ preventScroll: true });
  else if (dialogTrigger?.isConnected) dialogTrigger.focus({ preventScroll: true });
});
function trapDialogFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const controls = [...(dialogRoot.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)') ?? [])];
  const first = controls[0], last = controls[controls.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function previewCreate() {
  if (!createName.value.trim()) return;
  createPreview.value = true;
}

function submitCreate() {
  if (!createName.value.trim() || props.busy || props.loading) return;
  emit('create', { name: createName.value.trim(), description: createDescription.value.trim() });
  createPreview.value = false;
  modal.value = null;
}

function submitSearch() {
  selectedRecruitmentId.value = null;
  const filters: { keyword: string; region: string; targetCount?: number } = { keyword: keyword.value.trim(), region: region.value.trim() };
  if (typeof searchTargetCount.value === 'number') filters.targetCount = searchTargetCount.value;
  emit('search', filters);
  recruitmentPaging.reset();
}

function submitRename() {
  const name = renameName.value.trim();
  if (!name || !props.party?.canRename || props.busy || props.loading) return;
  emit('rename', name);
  modal.value = null;
}

function previewPublish() {
  if (!canSubmitPublish.value) return;
  publishPreview.value = true;
}

function submitPublish() {
  if (!canSubmitPublish.value) return;
  emit('publish', { description: publishDescription.value.trim(), targetCount: publishTargetCount.value });
  publishPreview.value = false;
  modal.value = null;
}

function submitLeave() {
  if (!props.party?.canLeave || props.busy || props.loading) return;
  emit('leave');
  modal.value = null;
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
  return !props.party && !item.own && item.status !== 'closed' && (item.openSlots ?? item.targetCount - item.memberCount) > 0
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

function applicationCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    : value;
}

function closeModal() { modal.value = null; }
function showRecruitment(id: number) { selectedRecruitmentId.value = id; modal.value = 'recruitment'; }
function showMember(member: PartyMember) { selectedMember.value = member; modal.value = 'member'; }
function showApplication(application: PartyApplication) { selectedApplicationId.value = application.id; modal.value = 'application'; }
function respondApplication(id: number, accept: boolean) {
  if (!props.party?.isLeader || props.busy || props.loading || props.applications.find(item => item.id === id)?.status !== 'pending') return;
  if (accept) emit('accept', id);
  else emit('reject', id);
}
</script>

<template>
  <div class="party-popup anime-party-refinement party-viewport-panel" :data-party-view="activeTab">
    <header class="party-toolbar">
      <span><SocialGlyph name="party" :size="18" /><strong>{{ party?.name || '寻找同行者' }}</strong><small v-if="party">{{ memberCount }}/{{ maxMembers }} 人</small></span>
      <div class="party-toolbar-actions"><button v-if="!party" type="button" class="party-primary" :disabled="busy || loading" @click="modal = 'create'; createPreview = false">创建队伍</button><button type="button" class="party-text-button" :disabled="busy || loading" @click="emit('refresh')">刷新</button></div>
    </header>
    <p v-if="loading" class="party-state game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在读取队伍信息…</span></p><p v-if="error" class="party-error" role="alert">{{ error }}</p>
    <nav class="party-viewport-tabs" role="tablist" aria-label="队伍分类">
      <button type="button" role="tab" :aria-selected="activeTab === 'members'" :disabled="!party" @click="activeTab = 'members'">成员<span v-if="party"> ({{ members.length }})</span></button>
      <button type="button" role="tab" :aria-selected="activeTab === 'recruitments'" @click="activeTab = 'recruitments'">招募</button>
      <button type="button" role="tab" :aria-selected="activeTab === 'applications'" :disabled="!party?.isLeader" @click="activeTab = 'applications'">申请<span v-if="applications.length"> ({{ applications.length }})</span></button>
    </nav>
    <form v-if="activeTab === 'recruitments'" class="party-search-form" @submit.prevent="submitSearch">
      <label><span>关键词</span><input v-model="keyword" maxlength="80" aria-label="队伍关键词" placeholder="队伍名、队长或说明" /></label>
      <label><span>地区</span><input v-model="region" maxlength="64" aria-label="队伍地区" placeholder="不限" /></label>
      <label><span>人数</span><select v-model.number="searchTargetCount" aria-label="队伍目标人数"><option value="">不限</option><option :value="2">2 人</option><option :value="3">3 人</option><option :value="4">4 人</option></select></label>
      <button class="party-primary" type="submit" :disabled="busy || loading">搜索</button>
    </form>
    <div ref="listViewport" class="party-list-viewport" role="tabpanel" :aria-label="activeTab === 'members' ? '队伍成员' : activeTab === 'applications' ? '入队申请' : '公开招募'">
      <div v-if="activeTab === 'members'" class="party-viewport-list">
        <article v-for="member in memberPaging.visibleItems.value" :key="member.id" class="party-viewport-row party-member" :data-member-id="member.id">
          <SocialAvatar :name="member.name" :id="member.gameId" :portrait="member.portrait" :size="58" />
          <button type="button" class="party-row-copy" @click="showMember(member)"><strong>{{ member.name }}<small v-if="member.isLeader"> · 队长</small><small v-if="member.id === party?.ownId"> · 我</small></strong><span>Lv.{{ member.level ?? '—' }} · {{ member.gameId }}</span><small>{{ memberLocation(member) }}</small></button>
        </article><p v-if="!members.length" class="party-empty game-ui-empty-message"><GameUiFeedbackArt name="message" :size="36" /><span>尚未加入队伍。</span></p>
      </div>
      <div v-else-if="activeTab === 'recruitments'" class="party-viewport-list">
        <article v-for="item in recruitmentPaging.visibleItems.value" :key="item.id" class="party-viewport-row party-recruitment-card" :data-recruitment-id="item.id">
          <SocialAvatar :name="item.creatorName || '队长'" :id="item.leaderGameId" :portrait="item.leaderPortrait" :size="58" />
          <button type="button" class="party-row-copy" @click="showRecruitment(item.id)"><strong>{{ item.partyName }}</strong><span>{{ item.regionName || item.regionCode || '未知地区' }} · {{ item.memberCount }}/{{ item.targetCount }} 人 · {{ recruitmentStatus(item) || remainingTime(item) }}</span><small>{{ item.description || '队长暂未填写招募说明。' }}</small></button>
        </article><p v-if="!recruitments.length && !loading" class="party-empty game-ui-empty-message"><GameUiFeedbackArt name="empty" :size="36" /><span>暂无符合条件的公开招募。</span></p>
      </div>
      <div v-else class="party-viewport-list">
        <article v-for="application in applicationPaging.visibleItems.value" :key="application.id" class="party-viewport-row party-application" :data-application-id="application.id">
          <SocialAvatar :name="application.name" :id="application.gameId" :portrait="application.portrait" :size="58" />
          <button type="button" class="party-row-copy" @click="showApplication(application)"><strong>{{ application.name }}</strong><span>Lv.{{ application.level ?? '—' }} · {{ application.gameId }} · {{ applicationStatus(application.status) }}</span><small>{{ application.message || '点击查看申请详情' }}</small></button>
        </article><p v-if="!applications.length" class="party-empty game-ui-empty-message"><GameUiFeedbackArt :name="party?.recruitment ? 'empty' : 'message'" :size="36" /><span>{{ party?.recruitment ? '暂无入队申请。' : '发布招募后，申请会显示在这里。' }}</span></p>
      </div>
    </div>
    <ViewportPagination :page="activePaging.page.value" :total-pages="activePaging.totalPages.value" :total="activeTotal" :label="pagerLabel" @update:page="activePaging.setPage" />
    <footer class="party-viewport-actions">
      <button v-if="activeTab === 'recruitments' && hasMore" type="button" class="party-load-more" :disabled="busy || loading || loadingMore" @click="emit('load-more')">{{ loadingMore ? '正在加载…' : '加载更多队伍' }}</button>
      <template v-if="party && activeTab !== 'recruitments'"><button v-if="party.canRename" type="button" class="party-primary" :disabled="busy || loading" @click="modal = 'rename'">修改队伍名</button><button v-if="party.canLeave" type="button" class="party-danger" :disabled="busy || loading" @click="modal = 'leave'">退出队伍</button><button v-if="party.canRecruit" type="button" class="party-gold" :disabled="busy || loading" @click="modal = 'publish'; publishPreview = false">发布招募</button><small v-if="party.story">剧情队伍由主线流程管理。</small></template>
    </footer>
  </div>
  <Teleport to="body">
    <div v-if="modal" class="party-dialog-backdrop anime-party-refinement" @click.self="closeModal" @keydown.esc="closeModal">
      <section ref="dialogRoot" class="party-viewport-dialog" role="dialog" aria-modal="true" :aria-label="modal === 'create' ? '创建队伍' : modal === 'publish' ? '发布招募' : modal === 'rename' ? '修改队伍名' : modal === 'leave' ? '退出队伍确认' : modal === 'recruitment' ? '队伍招募详情' : modal === 'member' ? '队伍成员详情' : '入队申请详情'" @keydown="trapDialogFocus">
        <header><h3>{{ modal === 'create' ? '创建队伍' : modal === 'publish' ? '发布招募' : modal === 'rename' ? '修改队伍名' : modal === 'leave' ? '退出队伍确认' : modal === 'recruitment' ? '队伍招募详情' : modal === 'member' ? '队伍成员详情' : '入队申请详情' }}</h3><button type="button" class="party-quiet" aria-label="关闭队伍详情" @click="closeModal">关闭</button></header>
        <form v-if="modal === 'create'" class="party-dialog-form" @submit.prevent="createPreview ? submitCreate() : previewCreate()">
          <div class="party-dialog-body"><template v-if="!createPreview"><label>队伍名<input v-model="createName" maxlength="32" required placeholder="最多32字" /></label><p>人数上限：4 人</p><label>招募说明 <small>{{ createDescription.length }}/300</small><textarea v-model="createDescription" maxlength="300" rows="4" placeholder="说说你想一起探索什么" /></label></template><template v-else><h4>{{ createName.trim() }} · 最多 4 人</h4><p>{{ createDescription.trim() || '暂无招募说明' }}</p><small v-if="createDescription.trim()">创建成功后，这段说明会立即发布到组队频道。</small></template></div>
          <footer><button v-if="createPreview" type="button" class="party-quiet" @click="createPreview = false">返回修改</button><button class="party-primary" type="submit" :disabled="busy || loading || !createName.trim()">{{ createPreview ? '确认创建' : '预览创建' }}</button></footer>
        </form>
        <form v-else-if="modal === 'publish' && party" class="party-dialog-form" @submit.prevent="publishPreview ? submitPublish() : previewPublish()">
          <div class="party-dialog-body"><template v-if="!publishPreview"><label>招募说明 <small>{{ publishDescription.length }}/300</small><textarea v-model="publishDescription" maxlength="300" rows="4" placeholder="向组队频道介绍你的队伍" /></label><label>招募目标人数<select v-model.number="publishTargetCount"><option v-for="count in [2, 3, 4]" :key="count" :value="count" :disabled="count <= memberCount || count > maxMembers">{{ count }} 人</option></select></label><p v-if="party.recruitment">当前招募：{{ party.recruitment.description || '暂无招募说明' }} · {{ remainingTime(party.recruitment) }}</p></template><template v-else><h4>将发送到组队频道：{{ party.name }}</h4><p>{{ party.regionName || leader?.regionName || '未知地区' }} · 空位 {{ Math.max(0, publishTargetCount - memberCount) }} · {{ memberCount }}/{{ publishTargetCount }} 人</p><p>{{ publishDescription.trim() || '暂无招募说明' }}</p></template></div>
          <footer><button v-if="publishPreview" type="button" class="party-quiet" @click="publishPreview = false">返回修改</button><button class="party-primary" type="submit" :disabled="!canSubmitPublish">{{ publishPreview ? party.recruitment ? '确认更新' : '发送到组队频道' : party.recruitment ? '预览更新' : '预览发布' }}</button></footer>
        </form>
        <form v-else-if="modal === 'rename'" class="party-dialog-form" @submit.prevent="submitRename"><div class="party-dialog-body"><label>新队伍名<input v-model="renameName" maxlength="32" required /></label></div><footer><button class="party-primary" type="submit" :disabled="busy || loading || !renameName.trim()">确认修改</button></footer></form>
        <template v-else-if="modal === 'leave'"><div class="party-dialog-body"><p>确认退出 {{ party?.name }}？</p></div><footer><button type="button" class="party-quiet" @click="closeModal">取消</button><button type="button" class="party-danger" :disabled="busy || loading" @click="submitLeave">确认退出</button></footer></template>
        <template v-else-if="modal === 'recruitment' && selectedRecruitment"><div class="party-dialog-body"><h4>{{ selectedRecruitment.partyName }}</h4><p>队长：{{ selectedRecruitment.creatorName || '队长未提供姓名' }} · {{ selectedRecruitment.leaderGameId }}</p><p>{{ selectedRecruitment.regionName || selectedRecruitment.regionCode || '未知地区' }} · 当前人数 {{ selectedRecruitment.memberCount }}/{{ selectedRecruitment.targetCount }} · 空位 {{ Math.max(0, selectedRecruitment.openSlots ?? selectedRecruitment.targetCount - selectedRecruitment.memberCount) }}</p><p>{{ selectedRecruitment.description || '队长暂未填写招募说明。' }}</p><small>{{ recruitmentStatus(selectedRecruitment) || remainingTime(selectedRecruitment) }}</small></div><footer><button v-if="canApply(selectedRecruitment)" type="button" class="party-primary" :disabled="busy || loading" @click="emit('apply', selectedRecruitment.id)">{{ selectedRecruitment.applicationStatus === 'rejected' ? '再次申请' : '申请加入' }}</button></footer></template>
        <template v-else-if="modal === 'member' && selectedMember"><div class="party-dialog-body"><h4>{{ selectedMember.name }}{{ selectedMember.isLeader ? ' · 队长' : '' }}{{ selectedMember.id === party?.ownId ? ' · 我' : '' }}</h4><p>Lv.{{ selectedMember.level ?? '—' }} · Game ID {{ selectedMember.gameId }}</p><p>{{ memberLocation(selectedMember) }}</p></div></template>
        <template v-else-if="modal === 'application' && selectedApplication"><div class="party-dialog-body"><h4>{{ selectedApplication.name }}</h4><p>Lv.{{ selectedApplication.level ?? '—' }} · Game ID {{ selectedApplication.gameId }} · {{ applicationStatus(selectedApplication.status) }}</p><p>{{ selectedApplication.message || '未填写申请说明。' }}</p><time v-if="selectedApplication.createdAt" :datetime="selectedApplication.createdAt">申请时间：{{ applicationCreatedAt(selectedApplication.createdAt) }}</time></div><footer v-if="party?.isLeader && selectedApplication.status === 'pending'"><button type="button" class="party-primary" :disabled="busy || loading" @click="respondApplication(selectedApplication.id, true)">同意</button><button type="button" class="party-danger" :disabled="busy || loading" @click="respondApplication(selectedApplication.id, false)">拒绝</button></footer></template>
      </section>
    </div>
  </Teleport>
</template>
