<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { ChatChannel, ChatMessage, PanelPortrait, Recruitment, WebNotification } from '../api';
import { gameAssetUrl } from '../game-assets';
import SocialAvatar from './SocialAvatar.vue';
import SocialGlyph from './SocialGlyph.vue';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';

export type ExploreChatTab = 'world' | 'recruitment' | 'team' | 'friend' | 'system';
export type InspectPlayerTarget = { gameId?: number | string; messageId?: number; channelId?: string; senderId?: string | number; name: string; portrait?: PanelPortrait; avatarUrl?: string; own?: boolean };

const props = defineProps<{
  open: boolean;
  tab: ExploreChatTab;
  messages: ChatMessage[];
  friendChannels: ChatChannel[];
  activeChannelId: string;
  channelName: string;
  draft: string;
  busy: boolean;
  canSend: boolean;
  statusText: string;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  hasNew: boolean;
  systemItems: WebNotification[];
  systemLoading: boolean;
  systemHasMore: boolean;
  systemError: string;
  partyBusy: boolean;
  invitationCount?: number;
  panelStyle: Record<string, string>;
  messagePortrait: (message: ChatMessage) => PanelPortrait | undefined;
  friendPortrait: (channel: ChatChannel) => PanelPortrait | undefined;
  recruitmentStatus: (item: Recruitment) => string;
  canApply: (item: Recruitment) => boolean;
}>();

const emit = defineEmits<{
  close: [];
  'select-tab': [tab: ExploreChatTab];
  'select-friend': [id: string];
  'update:draft': [value: string];
  send: [];
  earlier: [];
  latest: [];
  scroll: [];
  'manage-party': [];
  apply: [message: ChatMessage];
  'refresh-system': [];
  'more-system': [];
  'panel-element': [element: HTMLElement | null];
  'list-element': [element: HTMLElement | null];
  'drag-start': [event: PointerEvent];
  'resize-start': [event: PointerEvent];
  'inspect-player': [player: InspectPlayerTarget];
  'open-invitations': [];
}>();

const tabs = [
  { key: 'world', label: '世界', caption: '与旅途中的冒险者相遇' },
  { key: 'recruitment', label: '招募', caption: '寻找同行伙伴，一起出发' },
  { key: 'team', label: '队伍', caption: '和队友分享此刻的冒险' },
  { key: 'friend', label: '好友', caption: '把旅途见闻悄悄告诉好友' },
  { key: 'system', label: '系统', caption: '收好这份来自旅途的消息' }
] as const;
const panelElement = ref<HTMLElement | null>(null);
const listElement = ref<HTMLElement | null>(null);
const closeElement = ref<HTMLButtonElement | null>(null);
let returnFocus: HTMLElement | null = null;
const activeTab = computed(() => tabs.find(item => item.key === props.tab) ?? tabs[0]);
const friendSelected = computed(() => props.friendChannels.some(channel => channel.id === props.activeChannelId));
const unavailable = computed(() => props.tab === 'team' && !props.canSend || props.tab === 'friend' && !friendSelected.value);
const canSubmit = computed(() => props.canSend && !props.busy && Boolean(props.draft.trim()) && props.draft.length <= 200 && !unavailable.value);
const panelArt = computed(() => ({ '--chat-parchment': `url("${gameAssetUrl('/assets/light-anime/game-ui-v2/panel-parchment.webp')}")` }));
const emptyText = computed(() => props.tab === 'friend' ? '还没有私信，和好友打个招呼吧。' : props.tab === 'team' ? '队伍频道还没有消息。' : props.tab === 'recruitment' ? '暂时还没有招募消息。' : '这里还没有消息，和大家打个招呼吧。');
const timeText = (value: string, withDate = false) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString('zh-CN', withDate
    ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' });
};
// System notices are read-only. Their text remains escaped, including command links.
const noticeText = (item: WebNotification) => item.messages.map(message => message.text || message.markdown || message.format?.map(part => typeof part.value === 'string' || typeof part.value === 'number' ? String(part.value) : '').join('') || '').filter(Boolean).join('\n');
const updateDraft = (event: Event) => emit('update:draft', (event.target as HTMLInputElement).value);
const send = () => { if (canSubmit.value) emit('send'); };
const inspectMessage = (message: ChatMessage) => emit('inspect-player', {
  gameId: message.recruitment?.leaderGameId ?? message.senderGameId,
  messageId: message.id,
  channelId: props.activeChannelId,
  senderId: message.senderId,
  name: message.recruitment?.creatorName || message.senderName,
  portrait: message.recruitment?.leaderPortrait ?? props.messagePortrait(message),
  avatarUrl: message.recruitment?.leaderAvatarUrl ?? message.senderAvatarUrl,
  own: message.recruitment?.own ?? message.own,
});
const inspectFriend = (channel: ChatChannel) => emit('inspect-player', {
  gameId: channel.gameId,
  name: channel.name,
  portrait: props.friendPortrait(channel),
  avatarUrl: channel.avatarUrl,
});
const tabKeydown = (event: KeyboardEvent, index: number) => {
  let next = index;
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault();
  emit('select-tab', tabs[next].key);
  panelElement.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
};
const restoreFocus = () => {
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
};
watch(panelElement, element => emit('panel-element', element), { flush: 'post' });
watch(listElement, element => emit('list-element', element), { flush: 'post' });
watch(() => props.open, async open => {
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    if (props.open) closeElement.value?.focus({ preventScroll: true });
  } else {
    emit('panel-element', null);
    emit('list-element', null);
    restoreFocus();
  }
}, { immediate: true, flush: 'post' });
onBeforeUnmount(() => {
  emit('panel-element', null);
  emit('list-element', null);
  restoreFocus();
});
</script>

<template>
  <section v-if="open" ref="panelElement" class="explore-chat-panel exploration-window" :style="[panelStyle, panelArt]" role="dialog" aria-modal="false" aria-label="冒险聊天面板" @keydown.esc.stop.prevent="emit('close')">
    <header class="explore-chat-heading" @pointerdown="emit('drag-start', $event)">
      <nav class="explore-chat-tabs" role="tablist" aria-label="聊天频道" @pointerdown.stop>
        <button v-for="(item, index) in tabs" :key="item.key" type="button" role="tab" :aria-label="`${item.label}频道`" :aria-selected="tab === item.key" :tabindex="tab === item.key ? 0 : -1" :class="{ active: tab === item.key }" @click="emit('select-tab', item.key)" @keydown="tabKeydown($event, index)"><span>{{ item.label }}</span></button>
      </nav>
      <span aria-hidden="true" />
    </header>
    <button ref="closeElement" type="button" class="explore-chat-close exploration-window-close" aria-label="关闭聊天面板" @pointerdown.stop @click.stop="emit('close')"><span class="exploration-close-mark" aria-hidden="true" /></button>

    <div class="explore-chat-page">
    <div class="explore-chat-channel-heading">
      <div><strong>{{ channelName || `${activeTab.label}频道` }}</strong><span>{{ activeTab.caption }}</span></div>
      <div class="explore-chat-channel-actions"><button v-if="tab === 'team' || tab === 'recruitment'" type="button" class="explore-chat-text-button" @click="emit('manage-party')"><SocialGlyph name="party" :size="17" />管理队伍</button><button v-else-if="tab === 'system'" type="button" class="explore-chat-text-button" :disabled="systemLoading" @click="emit('refresh-system')"><SocialGlyph name="refresh" :size="17" />{{ systemLoading ? '读取中' : '刷新' }}</button><button type="button" class="explore-chat-text-button explore-chat-invitations" @click="emit('open-invitations')"><SocialGlyph name="mail" :size="17" />组队邀请<small v-if="invitationCount && invitationCount > 0">{{ invitationCount }}</small></button></div>
    </div>

    <div v-if="tab === 'friend' && friendChannels.length" class="explore-chat-friends" role="group" aria-label="好友私信对象">
      <div v-for="channel in friendChannels" :key="channel.id" class="explore-chat-friend" :class="{ active: activeChannelId === channel.id }"><button type="button" class="explore-chat-player-avatar" :aria-label="`查看${channel.name}的玩家名片`" @click="inspectFriend(channel)"><SocialAvatar :name="channel.name" :portrait="friendPortrait(channel)" :avatar-url="channel.avatarUrl" :size="34" shape="round" /></button><button type="button" class="explore-chat-friend-select" :aria-pressed="activeChannelId === channel.id" :aria-label="`与${channel.name}私聊`" @click="emit('select-friend', channel.id)"><span>{{ channel.name }}<small v-if="channel.unreadCount">{{ channel.unreadCount }} 条未读</small></span></button></div>
    </div>

    <div v-if="tab === 'system'" class="explore-chat-system">
      <p v-if="systemError" class="explore-chat-error" role="alert">{{ systemError }}</p>
      <div class="explore-chat-system-list" role="log" aria-label="系统消息" aria-live="polite" :aria-busy="systemLoading">
        <div v-if="!systemItems.length" class="explore-chat-empty" role="status"><GameUiFeedbackArt :name="systemLoading ? 'loading' : systemError ? 'error' : 'message'" :size="56" /><p>{{ systemLoading ? '正在收取系统消息…' : systemError ? '系统消息暂时无法读取，请刷新重试。' : '暂时没有系统消息。' }}</p></div>
        <article v-for="item in systemItems" :key="item.id" class="explore-chat-notice"><div class="explore-chat-notice-heading"><SocialGlyph name="document" :size="23" /><h3>{{ item.title || '系统消息' }}</h3><time :datetime="item.createdAt">{{ timeText(item.createdAt, true) }}</time></div><p>{{ noticeText(item) }}</p></article>
      </div>
      <button v-if="systemHasMore" type="button" class="explore-chat-history" :disabled="systemLoading" @click="emit('more-system')">{{ systemLoading ? '读取中…' : '加载更多系统消息' }}<SocialGlyph name="history" :size="17" /></button>
      <p class="explore-chat-readonly"><SocialGlyph name="leaf" :size="16" />旅途消息簿 · 系统频道只读</p>
    </div>

    <div v-else class="explore-chat-conversation">
      <div v-if="unavailable" class="explore-chat-empty explore-chat-unavailable" role="status"><GameUiFeedbackArt name="message" :size="66" /><p>{{ statusText || (tab === 'team' ? '加入队伍后，就能和队友聊天了。' : friendChannels.length ? '选择一位好友，开始悄悄话。' : '还没有可用的好友私信频道。') }}</p><button v-if="tab === 'team'" type="button" class="explore-chat-primary" @click="emit('manage-party')"><SocialGlyph name="party" :size="20" />寻找同行伙伴</button></div>
      <template v-else>
        <p v-if="statusText" class="explore-chat-status" role="status">{{ statusText }}</p>
        <button v-if="hasEarlier || loadingEarlier" type="button" class="explore-chat-history" :disabled="loadingEarlier" @click="emit('earlier')"><SocialGlyph name="history" :size="17" />{{ loadingEarlier ? '读取中…' : '查看更早消息' }}</button>
        <div ref="listElement" class="explore-chat-message-list" role="log" aria-label="聊天消息" aria-live="polite" aria-relevant="additions" @scroll="emit('scroll')">
          <div v-if="!messages.length" class="explore-chat-empty"><GameUiFeedbackArt name="message" :size="56" /><p>{{ emptyText }}</p></div>
          <article v-for="message in messages" :key="message.id" class="explore-chat-message" :class="{ 'is-own': message.own, 'is-recruitment': Boolean(message.recruitment) }">
            <template v-if="message.recruitment">
              <div class="explore-chat-recruitment">
                <div class="explore-chat-recruitment-heading"><button type="button" class="explore-chat-player-avatar" :aria-label="`查看${message.recruitment.creatorName || message.senderName}的玩家名片`" @click="inspectMessage(message)"><SocialAvatar :name="message.recruitment.creatorName || message.senderName" :portrait="message.recruitment.leaderPortrait" :avatar-url="message.recruitment.leaderAvatarUrl || message.senderAvatarUrl" :size="40" shape="round" /></button><div><button type="button" class="explore-chat-player-name" @click="inspectMessage(message)"><strong>{{ message.recruitment.creatorName || message.senderName }}</strong></button><small>队长<span v-if="message.recruitment.leaderGameId"> · {{ message.recruitment.leaderGameId }}</span></small></div><span class="explore-chat-recruitment-count">{{ message.recruitment.memberCount }}/{{ message.recruitment.targetCount }} 人</span></div>
                <h3><SocialGlyph name="flag" :size="23" />{{ message.recruitment.title || message.recruitment.partyName }}</h3>
                <p class="explore-chat-recruitment-region"><SocialGlyph name="location" :size="17" />{{ message.recruitment.regionName || '地区未提供' }}</p>
                <p v-if="message.recruitment.description" class="explore-chat-recruitment-description">{{ message.recruitment.description }}</p>
                <div class="explore-chat-recruitment-footer"><span>{{ recruitmentStatus(message.recruitment) || `空余 ${message.recruitment.openSlots ?? Math.max(0, message.recruitment.targetCount - message.recruitment.memberCount)} 位` }}</span><button v-if="canApply(message.recruitment)" type="button" class="explore-chat-primary" :disabled="partyBusy" @click="emit('apply', message)"><SocialGlyph name="add" :size="18" />申请加入</button><time :datetime="message.createdAt">{{ timeText(message.createdAt) }}</time></div>
              </div>
            </template>
            <template v-else><button type="button" class="explore-chat-player-avatar" :aria-label="`查看${message.senderName}的玩家名片`" @click="inspectMessage(message)"><SocialAvatar :name="message.senderName" :id="message.senderId" :portrait="messagePortrait(message)" :avatar-url="message.senderAvatarUrl" :size="39" shape="round" /></button><div class="explore-chat-message-body"><div class="explore-chat-message-meta"><button type="button" class="explore-chat-player-name" @click="inspectMessage(message)"><strong>{{ message.senderName }}</strong></button><time :datetime="message.createdAt">{{ timeText(message.createdAt) }}</time></div><p class="explore-chat-bubble">{{ message.content }}</p></div></template>
          </article>
        </div>
        <button v-if="hasNew" type="button" class="explore-chat-latest" @click="emit('latest')">有新消息，跳到最新<SocialGlyph name="down" :size="16" /></button>
      </template>
      <form v-if="!unavailable" class="explore-chat-composer" @submit.prevent="send"><div class="explore-chat-input"><SocialGlyph name="quill" :size="22" /><input :value="draft" maxlength="200" :disabled="!canSend" aria-label="聊天消息内容" :placeholder="canSend ? `发送到 ${channelName || `${activeTab.label}频道`}` : statusText || '频道暂不可发送'" @input="updateDraft" /><span class="explore-chat-character-count">{{ draft.length }}/200</span></div><button type="submit" class="explore-chat-primary explore-chat-send" :disabled="!canSubmit">发送<SocialGlyph name="send" :size="21" /></button></form>
    </div>

    </div>
    <div class="explore-chat-resize" role="separator" aria-orientation="horizontal" aria-label="调整聊天窗口高度" @pointerdown="emit('resize-start', $event)"><span /></div>
  </section>
</template>

<style scoped>
.explore-chat-panel { --chat-ink:#5a4939; --chat-teal:#458f82; position:fixed; z-index:160; left:50%; top:calc(var(--app-viewport-height,100dvh) / 2); display:flex; flex-direction:column; width:var(--explore-window-width); max-width:calc(100vw - 24px); height:min(var(--chat-height,var(--explore-window-height)),calc(var(--app-viewport-height,100dvh) - 24px)); max-height:calc(var(--app-viewport-height,100dvh) - 24px); min-width:0; min-height:0; box-sizing:border-box; overflow:visible; transform:translate(calc(-50% + var(--modal-x,0px)),calc(-50% + var(--modal-y,0px))); color:var(--chat-ink); border:1px solid #9b7b56; border-radius:8px; background:#fcf6e4; box-shadow:0 12px 36px #46372e45; font-family:inherit; isolation:isolate; pointer-events:auto; }
.explore-chat-panel *, .explore-chat-panel *::before, .explore-chat-panel *::after { box-sizing:border-box; }
.explore-chat-panel button { display:inline-flex; align-items:center; justify-content:center; gap:5px; margin:0; min-width:0; min-height:0; font-family:inherit; font-size:12px; font-weight:600; line-height:1.35; letter-spacing:0; text-shadow:none; cursor:pointer; transition:background .15s,border-color .15s,box-shadow .15s; }
.explore-chat-panel button:disabled { cursor:default; opacity:.5; }
.explore-chat-panel button:focus-visible, .explore-chat-panel input:focus-visible { outline:2px solid #377f75; outline-offset:2px; }
.explore-chat-heading { position:relative; flex:none; display:grid; grid-template-columns:minmax(0,1fr) 44px; gap:6px; align-items:center; min-height:54px; padding:5px 8px 5px 10px; cursor:move; touch-action:none; }
.explore-chat-panel .explore-chat-close { position:absolute; z-index:3; top:-1px; right:-1px; display:grid; place-items:center; flex:none; width:36px; height:36px; min-width:36px; min-height:36px; margin:0; padding:0; border:2px solid #fff7ef; border-image:none; border-radius:10px; color:#fff; background:#d94b48; transform:translate(50%,-50%); box-shadow:0 3px 8px #78352f40; touch-action:manipulation; }
.explore-chat-tabs { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:4px; min-width:0; padding:0; }
.explore-chat-panel .explore-chat-tabs button { width:100%; height:44px; padding:3px 1px; border:0; border-bottom:2px solid transparent; border-radius:0; color:#79654b; background:transparent; box-shadow:none; font-size:15px; white-space:nowrap; }
.explore-chat-panel .explore-chat-tabs button.active { color:#386e4c; border-bottom-color:#7a9c68; background:#e5edd7; box-shadow:none; }
.explore-chat-page { display:flex; flex:1; flex-direction:column; min-height:0; min-width:0; overflow:hidden; margin:0 8px 4px; border:14px solid transparent; border-image:var(--chat-parchment) 170 fill / 14px stretch; }
.explore-chat-channel-heading { flex:none; display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:37px; margin:0 4px; padding:3px 1px 7px; border-bottom:1px dashed #bca98780; }
.explore-chat-channel-heading>div { min-width:0; display:flex; align-items:baseline; gap:10px; }
.explore-chat-channel-heading>div:first-child { flex:1; }
.explore-chat-channel-heading strong { min-width:0; overflow:hidden; font-size:13px; color:#477e6e; text-overflow:ellipsis; white-space:nowrap; }
.explore-chat-channel-heading span { font-size:10px; color:#9b896d; }
.explore-chat-channel-heading>.explore-chat-channel-actions { flex:none; display:flex; align-items:center; flex-wrap:wrap; justify-content:flex-end; gap:7px; }
.explore-chat-panel .explore-chat-text-button { flex:none; padding:3px 0 3px 4px; border:0; border-radius:5px; background:transparent; color:#65816a; font-size:11px; }
.explore-chat-invitations small { display:inline-grid; place-items:center; min-width:15px; height:15px; padding:0 3px; border-radius:8px; background:#dce9c9; color:#597e58; font-size:9px; font-weight:600; }
.explore-chat-conversation, .explore-chat-system { position:relative; display:flex; flex:1; flex-direction:column; min-height:0; min-width:0; overflow:hidden; padding:0 4px; }
.explore-chat-friends { display:flex; flex:none; align-items:center; gap:7px; padding:7px 4px; overflow-x:auto; overscroll-behavior:contain; scrollbar-width:thin; }
.explore-chat-friend { display:flex; align-items:center; flex:none; gap:5px; max-width:190px; padding:4px 9px 4px 4px; border:1px solid #c4b092; border-radius:24px; background:#fff9eec9; color:#78674f; }
.explore-chat-friend.active { background:#deefda; border-color:#78a996; color:#3c7f6c; }
.explore-chat-panel .explore-chat-friend-select { justify-content:flex-start; align-self:stretch; padding:0; border:0; border-radius:5px; color:inherit; background:transparent; text-align:left; }
.explore-chat-panel .explore-chat-player-avatar { flex:none; padding:0; border:0; border-radius:50%; background:transparent; line-height:0; }
.explore-chat-panel .explore-chat-player-name { display:inline-flex; justify-content:flex-start; max-width:100%; padding:0; border:0; border-radius:3px; color:inherit; background:transparent; font-size:inherit; text-align:left; }
.explore-chat-panel .explore-chat-player-name:hover { color:#377f75; }
.explore-chat-panel .explore-chat-player-avatar:hover { box-shadow:0 0 0 2px #79a995; }
.explore-chat-friends span { min-width:0; max-width:125px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }
.explore-chat-friends small { display:block; color:#a17e56; font-size:9px; text-align:left; }
.explore-chat-message-list, .explore-chat-system-list { flex:1; min-height:0; min-width:0; overflow:auto; padding:11px 2px; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#b5c6a9 #f4ecd9; }
.explore-chat-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; min-height:100%; padding:20px 8px; text-align:center; color:#93836b; }
.explore-chat-empty p { max-width:290px; margin:0; font-size:12px; line-height:1.8; overflow-wrap:anywhere; }
.explore-chat-unavailable { flex:1; min-height:0; }
.explore-chat-unavailable .explore-chat-primary { margin-top:5px; }
.explore-chat-status, .explore-chat-error { flex:none; margin:6px 0 0; padding:6px 9px; border:1px solid #c9b894; border-radius:8px; background:#f8edc9; color:#927146; font-size:11px; line-height:1.5; overflow-wrap:anywhere; }
.explore-chat-error { color:#9c6251; background:#fce8dc; border-color:#d4aa91; }
.explore-chat-panel .explore-chat-history { align-self:center; flex:none; min-height:25px; padding:4px 9px; border:0; border-radius:8px; color:#8d806b; background:transparent; font-size:10px; }
.explore-chat-message { display:flex; align-items:flex-start; gap:8px; min-width:0; margin:0 0 13px; }
.explore-chat-message:last-child { margin-bottom:2px; }
.explore-chat-message-body { display:flex; align-items:flex-start; flex-direction:column; min-width:0; max-width:calc(100% - 47px); }
.explore-chat-message-meta { display:flex; align-items:baseline; flex-wrap:wrap; gap:8px; max-width:100%; padding:0 2px 4px; font-size:11px; color:#7d715c; }
.explore-chat-message-meta strong { font-weight:600; overflow-wrap:anywhere; }
.explore-chat-message-meta time, .explore-chat-recruitment-footer time, .explore-chat-notice time { color:#a3937b; font-size:9px; font-weight:400; white-space:nowrap; }
.explore-chat-bubble { max-width:100%; margin:0; padding:9px 12px; border:1px solid #d4c3a2; border-radius:3px 13px 13px 13px; background:#fffdf4f2; box-shadow:0 2px 0 #b59c6920; color:#655440; font-size:13px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }
.explore-chat-message.is-own { flex-direction:row-reverse; }
.explore-chat-message.is-own .explore-chat-message-body { align-items:flex-end; }
.explore-chat-message.is-own .explore-chat-bubble { border-radius:13px 3px 13px 13px; border-color:#9fbea3; background:#e0efd8; color:#44694f; }
.explore-chat-panel .explore-chat-latest { position:absolute; right:25px; bottom:65px; padding:5px 10px; border:1px solid #83a697; border-radius:20px; color:#3e806c; background:#eff8e5; box-shadow:0 2px 6px #6c70552a; font-size:10px; }
.explore-chat-composer { display:flex; flex:none; align-items:center; gap:8px; padding:10px 0 3px; border-top:1px dashed #bca98780; }
.explore-chat-input { display:flex; flex:1; align-items:center; gap:6px; min-width:0; min-height:37px; padding:3px 9px; border:1px solid #beac8b; border-radius:11px; background:#fffdf3; box-shadow:inset 0 1px 3px #bbaa7818; }
.explore-chat-input:focus-within { border-color:#6eaa94; }
.explore-chat-panel .explore-chat-input input { flex:1; width:0; min-width:0; height:29px; margin:0; padding:0; border:0; border-radius:0; background:transparent; outline:0; color:#665641; font-family:inherit; font-size:12px; line-height:29px; box-shadow:none; }
.explore-chat-input input::placeholder { color:#aa9c85; opacity:1; }
.explore-chat-character-count { color:#b0a18a; font-size:9px; white-space:nowrap; }
.explore-chat-panel .explore-chat-primary { flex:none; min-height:32px; padding:6px 12px; border:1px solid #729d85; border-radius:9px; color:#fffdf1; background:linear-gradient(#81b398,#659b80); box-shadow:inset 0 1px #bdd7b9,0 2px 0 #557e6130; }
.explore-chat-panel .explore-chat-send { min-height:37px; padding:6px 12px; }
.explore-chat-message.is-recruitment { display:block; }
.explore-chat-recruitment { width:100%; padding:10px 12px; border:1px solid #b9c09c; border-radius:12px; background:linear-gradient(135deg,#f5f8e7,#fff8e6); box-shadow:0 2px 0 #9eaa7c25; }
.explore-chat-recruitment-heading { display:flex; align-items:center; gap:8px; min-width:0; }
.explore-chat-recruitment-heading>div { min-width:0; flex:1; }
.explore-chat-recruitment-heading strong { display:block; font-size:12px; color:#657752; overflow-wrap:anywhere; }
.explore-chat-recruitment-heading small { display:block; margin-top:3px; color:#a09071; font-size:10px; }
.explore-chat-recruitment-count { flex:none; border:1px solid #c3c7a4; border-radius:8px; background:#edf2d9; padding:4px 7px; color:#6b835a; font-size:11px; }
.explore-chat-recruitment h3 { display:flex; align-items:center; gap:4px; margin:9px 0 2px; color:#667e51; font-size:14px; line-height:1.5; overflow-wrap:anywhere; }
.explore-chat-recruitment-region { display:flex; align-items:center; gap:3px; margin:1px 0 6px; color:#9a8968; font-size:10px; }
.explore-chat-recruitment-description { margin:5px 0 9px; color:#7c6d51; font-size:12px; line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }
.explore-chat-recruitment-footer { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding-top:7px; border-top:1px dashed #c9c7a6; }
.explore-chat-recruitment-footer>span { flex:1; min-width:40px; color:#839462; font-size:11px; }
.explore-chat-recruitment-footer time { margin-left:auto; }
.explore-chat-panel .explore-chat-recruitment-footer button { min-height:28px; padding:4px 8px; font-size:11px; }
.explore-chat-notice { margin:0 0 10px; padding:12px; border:1px solid #d3c29d; border-radius:10px; background:#fffcefdf; box-shadow:0 2px 0 #b6a3761a; }
.explore-chat-notice-heading { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.explore-chat-notice h3 { flex:1; min-width:0; margin:0; color:#7c7955; font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
.explore-chat-notice p { margin:7px 0 0; color:#85745b; font-size:12px; line-height:1.75; white-space:pre-wrap; overflow-wrap:anywhere; }
.explore-chat-readonly { flex:none; display:flex; align-items:center; justify-content:center; gap:4px; margin:0; padding:6px 0 2px; border-top:1px dashed #c5b79588; color:#a09579; font-size:10px; }
.explore-chat-resize { flex:none; display:flex; align-items:center; justify-content:center; height:12px; cursor:ns-resize; touch-action:none; }
.explore-chat-resize span { width:35px; height:3px; border-radius:3px; background:#baad8a88; }
@media (max-width:480px) {
  .explore-chat-heading { min-height:50px; padding:3px 6px; gap:4px; }
  .explore-chat-page { margin:0 5px 2px; border-width:12px; border-image-width:12px; }
  .explore-chat-channel-heading { min-height:33px; gap:5px; }
  .explore-chat-channel-heading>div { gap:5px; }
  .explore-chat-channel-heading strong { font-size:12px; }
  .explore-chat-channel-heading>div>span { display:none; }
  .explore-chat-channel-heading>.explore-chat-channel-actions { gap:4px; }
  .explore-chat-panel .explore-chat-channel-actions .explore-chat-text-button { gap:3px; padding-left:0; font-size:10px; }
  .explore-chat-friends { padding-block:6px; }
  .explore-chat-message { gap:6px; margin-bottom:12px; }
  .explore-chat-message-body { max-width:calc(100% - 45px); }
  .explore-chat-bubble { padding:7px 9px; font-size:12px; }
  .explore-chat-composer { gap:6px; padding-top:8px; }
  .explore-chat-input { padding-inline:7px; gap:3px; }
  .explore-chat-input :deep(.social-glyph) { display:none; }
  .explore-chat-character-count { font-size:8px; }
  .explore-chat-panel .explore-chat-send { padding-inline:8px; gap:3px; }
  .explore-chat-recruitment { padding:8px; }
  .explore-chat-notice { padding:9px; }
  .explore-chat-notice-heading time { width:100%; padding-left:29px; }
  .explore-chat-panel .explore-chat-latest { right:15px; bottom:61px; }
}
@media (max-height:450px) {
  .explore-chat-heading { min-height:48px; padding-block:2px; }
  .explore-chat-page { border-width:10px; border-image-width:10px; }
  .explore-chat-channel-heading { min-height:27px; padding-block:2px 4px; }
  .explore-chat-friends { padding-block:3px; }
  .explore-chat-friends :deep(.social-avatar) { width:28px; height:28px; }
  .explore-chat-friend { padding-block:2px; }
  .explore-chat-panel .explore-chat-history { min-height:21px; padding-block:2px; }
  .explore-chat-message-list, .explore-chat-system-list { padding-block:7px; }
  .explore-chat-composer { padding-top:5px; }
  .explore-chat-input, .explore-chat-panel .explore-chat-send { min-height:33px; }
  .explore-chat-input input { height:25px; line-height:25px; }
  .explore-chat-empty { gap:4px; padding:8px; }
  .explore-chat-empty :deep(.game-ui-feedback-art) { width:40px; height:40px; }
  .explore-chat-readonly { padding-block:3px 0; }
  .explore-chat-resize { height:9px; }
  .explore-chat-panel .explore-chat-latest { bottom:53px; }
}
@media (prefers-reduced-motion:reduce) { .explore-chat-panel button { transition:none; } }
</style>
