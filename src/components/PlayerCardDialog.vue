<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { PlayerCardProfile } from '../api';
import { gameAssetUrl } from '../game-assets';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import SocialAvatar from './SocialAvatar.vue';
import SocialGlyph from './SocialGlyph.vue';

const props = withDefaults(defineProps<{
  open: boolean;
  profile: PlayerCardProfile | null;
  loading: boolean;
  busy: boolean;
  error?: string;
  notice?: string;
}>(), { error: '', notice: '' });
const emit = defineEmits<{
  close: [];
  retry: [];
  'add-friend': [];
  'invite-party': [];
  whisper: [];
  'open-invitations': [];
}>();

const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const detailButton = ref<HTMLButtonElement | null>(null);
const detailHeading = ref<HTMLElement | null>(null);
const showingDetails = ref(false);
let previousFocus: HTMLElement | null = null;
const paperStyle = computed(() => ({ '--player-card-paper': `url("${gameAssetUrl('/assets/light-anime/game-ui-v2/panel-parchment.webp')}")` }));
const viewer = computed(() => props.profile?.viewer);
const friendDisabled = computed(() => props.busy || !viewer.value || viewer.value.isSelf || viewer.value.isFriend || viewer.value.friendRequestStatus === 'outgoing');
const friendLabel = computed(() => viewer.value?.isFriend ? '已是好友' : viewer.value?.friendRequestStatus === 'outgoing' ? '已发送申请' : viewer.value?.friendRequestStatus === 'incoming' ? '接受好友申请' : '申请加好友');
const hasIncomingInvitation = computed(() => viewer.value?.partyInvitationStatus === 'incoming');
const partyDisabled = computed(() => props.busy || !viewer.value || viewer.value.isSelf || viewer.value.sameParty || (!hasIncomingInvitation.value && (!viewer.value.canInviteParty || viewer.value.partyInvitationStatus === 'outgoing')));
const partyLabel = computed(() => viewer.value?.sameParty ? '已在同一队伍' : hasIncomingInvitation.value ? '查看组队邀请' : viewer.value?.partyInvitationStatus === 'outgoing' ? '已发送邀请' : '邀请组队');
const partyReason = computed(() => viewer.value?.sameParty ? '你们已在同一支队伍中。' : hasIncomingInvitation.value ? '对方已向你发出组队邀请。' : viewer.value?.inviteDisabledReason || '');
const whisperDisabled = computed(() => props.busy || !viewer.value?.isFriend || viewer.value?.isSelf);
const skillCategoryName = (category: string) => ({ physical: '物理', magic: '魔法', utility: '辅助', bound: '绑定', passive: '被动' } as Record<string, string>)[category] ?? category;

function restoreFocus() {
  if (!previousFocus) return;
  const target = previousFocus?.isConnected && previousFocus !== document.body
    ? previousFocus : document.querySelector<HTMLElement>('.explore-chat-invitations');
  if (target?.getClientRects().length) target.focus({ preventScroll: true });
  previousFocus = null;
}

function focusableElements() {
  return [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter(element => element.getClientRects().length);
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (showingDetails.value) void toggleDetails(false);
    else emit('close');
    return;
  }
  if (event.key !== 'Tab') return;
  const elements = focusableElements();
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (!first || !last) {
    event.preventDefault();
    dialog.value?.focus();
  } else if (event.shiftKey && (document.activeElement === first || !dialog.value?.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.value?.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function onFocusin(event: FocusEvent) {
  if (props.open && dialog.value && event.target instanceof Node && !dialog.value.contains(event.target)) closeButton.value?.focus({ preventScroll: true });
}

async function toggleDetails(next = !showingDetails.value) {
  showingDetails.value = next;
  await nextTick();
  if (next) detailHeading.value?.focus({ preventScroll: true });
  else detailButton.value?.focus({ preventScroll: true });
}

watch(() => props.profile?.gameId, () => { showingDetails.value = false; });
watch(() => props.open, async open => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    showingDetails.value = false;
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('focusin', onFocusin, true);
    await nextTick();
    if (props.open) closeButton.value?.focus({ preventScroll: true });
  } else {
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('focusin', onFocusin, true);
    restoreFocus();
  }
}, { immediate: true, flush: 'post' });
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true);
  document.removeEventListener('focusin', onFocusin, true);
  restoreFocus();
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="player-card-overlay" @click.self="emit('close')">
      <section ref="dialog" class="player-card-dialog" :style="paperStyle" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="player-card-title" :aria-busy="loading || busy">
        <button ref="closeButton" type="button" class="player-card-close exploration-window-close" aria-label="关闭玩家名片" @click="emit('close')"><span class="exploration-close-mark" aria-hidden="true" /></button>
        <header class="player-card-header"><div><span>ADVENTURER</span><h2 id="player-card-title">玩家名片</h2></div><SocialGlyph name="leaf" :size="28" /></header>
        <div class="player-card-scroll">
          <div v-if="loading" class="player-card-empty" role="status"><GameUiFeedbackArt name="loading" :size="64" /><p>正在读取冒险者资料…</p></div>
          <template v-else-if="profile">
            <div class="player-card-identity">
              <div class="player-card-portrait"><SocialAvatar :name="profile.name" :id="profile.gameId" :portrait="profile.portrait" :avatar-url="profile.avatarUrl" :size="76" shape="round" /><span class="player-card-level">Lv. {{ profile.level }}</span></div>
              <div class="player-card-name"><span class="player-card-eyebrow">{{ viewer?.isSelf ? '我的冒险者档案' : viewer?.isFriend ? '我的好友' : '旅途相逢' }}</span><h3>{{ profile.name }}</h3><p>ID <strong>{{ profile.gameId }}</strong></p><span class="player-card-profession">{{ profile.profession || '尚未转职' }}</span></div>
            </div>

            <div v-if="!showingDetails" class="player-card-basic">
              <h3 class="player-card-section-title"><SocialGlyph name="document" :size="20" />基础资料</h3>
              <dl class="player-card-facts"><div><dt>等级</dt><dd>{{ profile.level }} 级</dd></div><div><dt>职业</dt><dd>{{ profile.profession || '尚未转职' }}</dd></div><div><dt>性别</dt><dd>{{ profile.gender || '未公开' }}</dd></div><div><dt>所在地区</dt><dd>{{ profile.regionName || '未公开' }}</dd></div></dl>
              <button ref="detailButton" type="button" class="player-card-detail-link" @click="toggleDetails(true)"><SocialGlyph name="search" :size="19" />查看详细资料<span aria-hidden="true">›</span></button>
            </div>

            <div v-else class="player-card-details">
              <div class="player-card-detail-heading"><h3 ref="detailHeading" class="player-card-section-title" tabindex="-1"><SocialGlyph name="document" :size="20" />详细资料</h3><button type="button" class="player-card-back" @click="toggleDetails(false)">返回名片</button></div>
              <dl class="player-card-facts"><div><dt>职业评级</dt><dd>{{ profile.rank || '暂无评级' }}</dd></div><div><dt>副职业</dt><dd>{{ profile.secondaryProfession || '尚未选择' }}<small v-if="profile.secondaryProfession && profile.secondaryLevel != null">{{ profile.secondaryLevel }} 级</small></dd></div></dl>
              <h4 class="player-card-skill-title">公开技能<span v-if="profile.skillsVisible !== false">{{ profile.skills?.length || 0 }} 项</span></h4>
              <p v-if="profile.skillsVisible === false" class="player-card-muted">技能资料仅自己和好友可见。</p>
              <ul v-else-if="profile.skills?.length" class="player-card-skills"><li v-for="(skill, index) in profile.skills" :key="`${skill.name}-${index}`"><span>{{ skill.name }}<small v-if="skill.category">{{ skillCategoryName(skill.category) }}</small></span><strong>Lv. {{ skill.level }}</strong></li></ul>
              <p v-else class="player-card-muted">暂无公开技能资料。</p>
            </div>
          </template>
          <div v-else class="player-card-empty"><GameUiFeedbackArt name="error" :size="60" /><p>暂时无法读取这位冒险者的资料。</p></div>
          <p v-if="error" class="player-card-feedback player-card-error" role="alert">{{ error }}<button type="button" :disabled="loading || busy" @click="emit('retry')">重新读取</button></p>
          <p v-if="notice" class="player-card-feedback player-card-notice" role="status">{{ notice }}</p>
        </div>
        <footer v-if="profile && !loading" class="player-card-footer">
          <p v-if="viewer?.isSelf" class="player-card-self"><SocialGlyph name="leaf" :size="18" />这是你的玩家名片</p>
          <template v-else>
            <div class="player-card-actions"><button type="button" class="player-card-action player-card-action-primary" :disabled="friendDisabled" @click="emit('add-friend')"><SocialGlyph :name="viewer?.isFriend ? 'check' : 'add'" :size="20" />{{ friendLabel }}</button><button type="button" class="player-card-action" :disabled="partyDisabled" :title="partyReason" @click="hasIncomingInvitation ? emit('open-invitations') : emit('invite-party')"><SocialGlyph name="party" :size="20" />{{ partyLabel }}</button><button type="button" class="player-card-action player-card-whisper" :disabled="whisperDisabled" :title="viewer?.isFriend ? '进入好友私聊' : '成为好友后可私聊'" @click="emit('whisper')"><SocialGlyph name="chat" :size="20" />私聊</button></div>
            <p v-if="busy" class="player-card-action-hint" role="status">正在处理，请稍候…</p><p v-else-if="partyReason" class="player-card-action-hint">{{ partyReason }}</p><p v-else-if="!viewer?.isFriend" class="player-card-action-hint">成为好友后，可以在好友频道私聊。</p>
          </template>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.player-card-overlay { position:fixed; z-index:220; inset:0; display:flex; align-items:center; justify-content:center; padding:24px 18px; background:#302b2666; backdrop-filter:blur(3px); }
.player-card-dialog { position:relative; display:flex; flex-direction:column; width:392px; max-width:100%; max-height:min(680px,calc(var(--app-viewport-height,100dvh) - 48px)); min-width:0; min-height:0; padding:0 16px; border:1px solid #9b7b56; border-radius:12px; color:#61513f; background:linear-gradient(#fff9e9ed,#fcf3dfef),var(--player-card-paper) center/cover; box-shadow:0 15px 50px #241d225c,inset 0 0 0 4px #f5e9cf; font-family:inherit; outline:none; }
.player-card-dialog *, .player-card-dialog *::before, .player-card-dialog *::after { box-sizing:border-box; }
.player-card-dialog button { display:inline-flex; align-items:center; justify-content:center; gap:5px; min-width:0; min-height:0; margin:0; font-family:inherit; font-size:12px; font-weight:600; line-height:1.4; letter-spacing:0; text-shadow:none; cursor:pointer; transition:background .15s,border-color .15s; }
.player-card-dialog button:disabled { opacity:.55; cursor:default; }
.player-card-dialog button:focus-visible, .player-card-dialog [tabindex="-1"]:focus-visible { outline:2px solid #377f75; outline-offset:3px; }
.player-card-dialog .player-card-close { position:absolute; z-index:2; top:-1px; right:-1px; display:grid; place-items:center; width:36px; height:36px; min-width:36px; min-height:36px; padding:0; border:2px solid #fff7ef; border-image:none; border-radius:10px; color:#fff; background:#d94b48; transform:translate(50%,-50%); box-shadow:0 3px 8px #78352f40; }
.player-card-header { display:flex; flex:none; align-items:center; justify-content:space-between; gap:10px; min-width:0; padding:17px 5px 12px; border-bottom:1px solid #ccb791; }
.player-card-header>div>span { display:block; margin-bottom:3px; color:#9a8560; font-size:9px; font-weight:700; letter-spacing:2px; }
.player-card-header h2 { margin:0; color:#557a59; font-size:19px; font-weight:700; line-height:1.3; }
.player-card-header>.social-glyph { margin-right:7px; opacity:.8; }
.player-card-scroll { min-width:0; min-height:0; overflow:auto; padding:16px 2px 15px; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#bdc5a5 #f3ebd9; }
.player-card-identity { display:flex; align-items:center; gap:17px; min-width:0; padding:1px 6px 17px; }
.player-card-portrait { position:relative; flex:none; padding:4px; border:1px solid #bba26c; border-radius:50%; background:#f5edcc; box-shadow:0 0 0 3px #e6eace; }
.player-card-level { position:absolute; left:50%; bottom:-8px; min-width:62px; padding:2px 7px; border:1px solid #749378; border-radius:10px; background:#698e70; color:#fffbed; font-size:11px; font-weight:700; text-align:center; white-space:nowrap; transform:translateX(-50%); }
.player-card-name { min-width:0; flex:1; }
.player-card-eyebrow { color:#97876a; font-size:10px; }
.player-card-name h3 { margin:4px 0 5px; color:#4e6e50; font-size:20px; line-height:1.4; overflow-wrap:anywhere; }
.player-card-name p { margin:0 0 7px; color:#9a8a6e; font-size:11px; }
.player-card-name p strong { margin-left:5px; color:#7d7058; font-weight:500; letter-spacing:.5px; overflow-wrap:anywhere; }
.player-card-profession { display:inline-block; max-width:100%; padding:2px 9px; border:1px solid #bac7a0; border-radius:12px; color:#69815a; background:#eaf0d8; font-size:11px; overflow-wrap:anywhere; }
.player-card-basic, .player-card-details { margin-top:6px; padding:13px 12px 10px; border:1px solid #d4c39f; border-radius:9px; background:#fffdf390; }
.player-card-section-title { display:flex; align-items:center; gap:5px; margin:0 0 11px; color:#77815c; font-size:12px; font-weight:600; line-height:1.5; }
.player-card-facts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 14px; margin:0; }
.player-card-facts>div { min-width:0; }
.player-card-facts dt { margin:0 0 4px; color:#a08e70; font-size:10px; line-height:1.4; }
.player-card-facts dd { margin:0; color:#6c5e46; font-size:13px; line-height:1.5; overflow-wrap:anywhere; }
.player-card-facts dd small { display:block; margin-top:2px; color:#97876b; font-size:10px; }
.player-card-dialog .player-card-detail-link { width:100%; justify-content:flex-start; gap:6px; margin-top:13px; padding:10px 0 1px; border:0; border-top:1px dashed #d1c29f; border-radius:0; color:#548b72; background:transparent; font-size:12px; }
.player-card-detail-link>span { margin-left:auto; padding-right:2px; color:#899d77; font-size:20px; line-height:1; }
.player-card-detail-heading { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.player-card-dialog .player-card-back { flex:none; padding:2px 0; border:0; color:#5d8b74; background:transparent; font-size:11px; }
.player-card-skill-title { display:flex; justify-content:space-between; align-items:center; gap:8px; margin:15px 0 8px; padding-top:11px; border-top:1px dashed #d1c29f; color:#867859; font-size:11px; font-weight:600; }
.player-card-skill-title span { color:#aa9a7d; font-size:10px; font-weight:400; }
.player-card-skills { display:grid; gap:6px; margin:0; padding:0; list-style:none; }
.player-card-skills li { display:flex; align-items:center; justify-content:space-between; gap:9px; padding:6px 8px; border:1px solid #e2d7bc; border-radius:6px; color:#716347; background:#fcf7e7; font-size:11px; }
.player-card-skills li>span { min-width:0; overflow-wrap:anywhere; }
.player-card-skills li small { display:block; margin-top:2px; color:#a08e6d; font-size:9px; }
.player-card-skills li strong { flex:none; color:#819064; font-size:10px; font-weight:500; white-space:nowrap; }
.player-card-muted { margin:7px 0 3px; color:#a29378; font-size:11px; line-height:1.6; }
.player-card-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:11px; min-height:205px; padding:20px 10px; text-align:center; }
.player-card-empty p { margin:0; color:#998a70; font-size:12px; line-height:1.7; overflow-wrap:anywhere; }
.player-card-feedback { display:flex; flex-wrap:wrap; align-items:center; gap:7px; margin:12px 0 0; padding:8px 10px; border:1px solid; border-radius:7px; font-size:11px; line-height:1.7; overflow-wrap:anywhere; }
.player-card-error { border-color:#d1a891; color:#a1664d; background:#fce8da; }
.player-card-notice { border-color:#b7c5a3; color:#627c51; background:#eaf2db; }
.player-card-dialog .player-card-feedback button { flex:none; padding:2px 5px; border:0; border-radius:3px; color:inherit; background:#fff8e9b5; text-decoration:underline; font-size:10px; }
.player-card-footer { flex:none; padding:12px 2px 13px; border-top:1px solid #ccb791; }
.player-card-actions { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 64px; gap:6px; }
.player-card-dialog .player-card-action { min-height:37px; padding:6px 5px; border:1px solid #a9b391; border-radius:7px; color:#69805b; background:#eef1dd; font-size:11px; white-space:normal; }
.player-card-dialog .player-card-action-primary { border-color:#6b9a80; color:#fffdee; background:linear-gradient(#82ad91,#69957b); box-shadow:inset 0 1px #b9cdb0; }
.player-card-dialog .player-card-action:not(:disabled):hover { border-color:#5f947b; background:#e0ead0; }
.player-card-dialog .player-card-action-primary:not(:disabled):hover { background:#6c9d7c; }
.player-card-dialog .player-card-whisper { gap:3px; }
.player-card-action-hint { margin:8px 2px 0; color:#9c8d70; font-size:10px; line-height:1.6; overflow-wrap:anywhere; }
.player-card-self { display:flex; align-items:center; justify-content:center; gap:6px; margin:1px 0; color:#8b9471; font-size:11px; line-height:1.6; }
@media (max-width:360px) {
  .player-card-overlay { padding:22px 18px; }
  .player-card-dialog { padding-inline:12px; max-height:calc(var(--app-viewport-height,100dvh) - 44px); }
  .player-card-identity { gap:13px; padding-inline:4px; }
  .player-card-name h3 { font-size:18px; }
  .player-card-basic, .player-card-details { padding-inline:10px; }
  .player-card-facts { gap:11px; }
  .player-card-actions { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
  .player-card-dialog .player-card-whisper { grid-column:1 / -1; min-height:30px; }
}
@media (max-height:500px) {
  .player-card-overlay { padding-block:20px; }
  .player-card-dialog { max-height:calc(var(--app-viewport-height,100dvh) - 40px); }
  .player-card-header { padding-block:10px 8px; }
  .player-card-scroll { padding-block:12px; }
  .player-card-footer { padding-block:9px; }
}
@media (prefers-reduced-motion:reduce) { .player-card-dialog button { transition:none; } }
</style>
