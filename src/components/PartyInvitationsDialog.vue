<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { PartyInvitation } from '../api';
import { gameAssetUrl } from '../game-assets';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import SocialGlyph from './SocialGlyph.vue';

const props = withDefaults(defineProps<{
  open: boolean;
  items: PartyInvitation[];
  loading: boolean;
  busy: boolean;
  error?: string;
  notice?: string;
}>(), { error: '', notice: '' });
const emit = defineEmits<{
  close: [];
  retry: [];
  respond: [response: { id: number; action: 'accept' | 'reject' }];
  'inspect-player': [player: { gameId: number; name: string }];
}>();

const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;
const paperStyle = computed(() => ({ '--party-invitations-paper': `url("${gameAssetUrl('/assets/light-anime/game-ui-v2/panel-parchment.webp')}")` }));
const unavailable = computed(() => props.loading || props.busy);
const expiryText = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '到期时间未知' : `${date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 到期`;
};

function restoreFocus() {
  if (!previousFocus) return;
  const target = previousFocus?.isConnected && previousFocus !== document.body
    ? previousFocus : document.querySelector<HTMLElement>('.explore-chat-invitations');
  if (target?.getClientRects().length) target.focus({ preventScroll: true });
  previousFocus = null;
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') return;
  const elements = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? [])].filter(element => element.getClientRects().length);
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

watch(() => props.items, async () => {
  await nextTick();
  if (props.open && dialog.value && !dialog.value.contains(document.activeElement)) closeButton.value?.focus({ preventScroll: true });
});
watch(() => props.open, async open => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    <div v-if="open" class="party-invitations-overlay" @click.self="emit('close')">
      <section ref="dialog" class="party-invitations-dialog" :style="paperStyle" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="party-invitations-title" :aria-busy="loading || busy">
        <button ref="closeButton" type="button" class="party-invitations-close exploration-window-close" aria-label="关闭组队邀请" @click="emit('close')"><span class="exploration-close-mark" aria-hidden="true" /></button>
        <header class="party-invitations-heading"><div><span>PARTY INVITATIONS</span><h2 id="party-invitations-title">组队邀请</h2></div><SocialGlyph name="mail" :size="29" /></header>
        <div class="party-invitations-content">
          <p class="party-invitations-intro">收到队长的邀请后，可在这里加入队伍。</p>
          <div v-if="loading && !items.length" class="party-invitations-empty" role="status"><GameUiFeedbackArt name="loading" :size="64" /><p>正在收取组队邀请…</p></div>
          <div v-else-if="!items.length" class="party-invitations-empty"><GameUiFeedbackArt :name="error ? 'error' : 'message'" :size="64" /><h3>{{ error ? '邀请暂时无法读取' : '暂无组队邀请' }}</h3><p>{{ error ? '重新读取后，继续寻找同行伙伴。' : '有队长邀请你时，会出现在这里。' }}</p></div>
          <ul v-else class="party-invitations-list" aria-label="收到的组队邀请"><li v-for="item in items" :key="item.id" class="party-invitation"><div class="party-invitation-party"><span class="party-invitation-emblem"><SocialGlyph name="party" :size="28" /></span><div><small>邀请你加入</small><h3>{{ item.partyName }}</h3></div></div><div class="party-invitation-inviter"><span>队长</span><button type="button" :aria-label="`查看${item.inviterName}的玩家名片`" @click="emit('inspect-player', { gameId: item.inviterGameId, name: item.inviterName })">{{ item.inviterName }}</button><small>ID {{ item.inviterGameId }}</small></div><div class="party-invitation-footer"><time :datetime="item.expiresAt">{{ expiryText(item.expiresAt) }}</time><div class="party-invitation-actions"><button type="button" class="party-invitation-reject" :disabled="unavailable" @click="emit('respond', { id: item.id, action: 'reject' })">拒绝</button><button type="button" class="party-invitation-accept" :disabled="unavailable" @click="emit('respond', { id: item.id, action: 'accept' })"><SocialGlyph name="check" :size="17" />接受邀请</button></div></div></li></ul>
          <p v-if="error" class="party-invitations-feedback party-invitations-error" role="alert">{{ error }}<button type="button" :disabled="unavailable" @click="emit('retry')">重新读取</button></p>
          <p v-if="notice" class="party-invitations-feedback party-invitations-notice" role="status">{{ notice }}</p>
        </div>
        <footer class="party-invitations-bottom"><span role="status">{{ busy ? '正在处理，请稍候…' : loading ? '读取中…' : `${items.length} 条待处理邀请` }}</span><button type="button" :disabled="unavailable" @click="emit('retry')"><SocialGlyph name="refresh" :size="17" />刷新邀请</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.party-invitations-overlay { position:fixed; z-index:220; inset:0; display:flex; align-items:center; justify-content:center; padding:24px 18px; background:#302b2666; backdrop-filter:blur(3px); }
.party-invitations-dialog { position:relative; display:flex; flex-direction:column; width:392px; max-width:100%; max-height:min(680px,calc(var(--app-viewport-height,100dvh) - 48px)); min-width:0; min-height:0; padding:0 16px; border:1px solid #9b7b56; border-radius:12px; color:#61513f; background:linear-gradient(#fff9e9ed,#fcf3dfef),var(--party-invitations-paper) center/cover; box-shadow:0 15px 50px #241d225c,inset 0 0 0 4px #f5e9cf; font-family:inherit; outline:none; }
.party-invitations-dialog *, .party-invitations-dialog *::before, .party-invitations-dialog *::after { box-sizing:border-box; }
.party-invitations-dialog button { display:inline-flex; align-items:center; justify-content:center; gap:5px; min-width:0; min-height:0; margin:0; font-family:inherit; font-size:12px; font-weight:600; line-height:1.4; letter-spacing:0; text-shadow:none; cursor:pointer; transition:background .15s,border-color .15s; }
.party-invitations-dialog button:disabled { opacity:.55; cursor:default; }
.party-invitations-dialog button:focus-visible { outline:2px solid #377f75; outline-offset:3px; }
.party-invitations-dialog .party-invitations-close { position:absolute; z-index:2; top:-1px; right:-1px; display:grid; place-items:center; width:36px; height:36px; min-width:36px; min-height:36px; padding:0; border:2px solid #fff7ef; border-image:none; border-radius:10px; color:#fff; background:#d94b48; transform:translate(50%,-50%); box-shadow:0 3px 8px #78352f40; }
.party-invitations-heading { display:flex; flex:none; align-items:center; justify-content:space-between; gap:10px; min-width:0; padding:17px 5px 12px; border-bottom:1px solid #ccb791; }
.party-invitations-heading>div>span { display:block; margin-bottom:3px; color:#9a8560; font-size:9px; font-weight:700; letter-spacing:1.5px; }
.party-invitations-heading h2 { margin:0; color:#557a59; font-size:19px; font-weight:700; line-height:1.3; }
.party-invitations-heading>.social-glyph { margin-right:7px; opacity:.8; }
.party-invitations-content { min-width:0; min-height:0; overflow:auto; padding:12px 2px 15px; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#bdc5a5 #f3ebd9; }
.party-invitations-intro { margin:0 1px 12px; color:#9a8b6f; font-size:11px; line-height:1.7; overflow-wrap:anywhere; }
.party-invitations-list { display:grid; gap:10px; margin:0; padding:0; list-style:none; }
.party-invitation { min-width:0; padding:11px 12px 10px; border:1px solid #c7c7a1; border-radius:10px; background:linear-gradient(135deg,#f5f8e7,#fff8e6); box-shadow:0 2px 0 #9eaa7c25; }
.party-invitation-party { display:flex; align-items:center; gap:9px; min-width:0; }
.party-invitation-emblem { display:grid; flex:none; place-items:center; width:43px; height:43px; border:1px solid #c7c9a3; border-radius:11px; background:#eaf0d7; }
.party-invitation-party>div { min-width:0; }
.party-invitation-party small { color:#9f9270; font-size:10px; }
.party-invitation-party h3 { margin:3px 0 0; color:#657b50; font-size:14px; line-height:1.5; overflow-wrap:anywhere; }
.party-invitation-inviter { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px; margin:11px 0 9px; color:#9a8968; font-size:10px; }
.party-invitations-dialog .party-invitation-inviter button { justify-content:flex-start; max-width:100%; padding:0; border:0; border-radius:3px; color:#5f876d; background:transparent; font-size:12px; text-align:left; overflow-wrap:anywhere; }
.party-invitation-inviter small { color:#a19375; font-size:10px; overflow-wrap:anywhere; }
.party-invitation-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; padding-top:9px; border-top:1px dashed #c9c7a6; }
.party-invitation-footer time { color:#a29376; font-size:9px; line-height:1.6; }
.party-invitation-actions { display:flex; align-items:center; justify-content:flex-end; gap:6px; margin-left:auto; }
.party-invitations-dialog .party-invitation-reject { min-height:30px; padding:5px 10px; border:1px solid #cab89b; border-radius:7px; color:#968164; background:#fff8e8; font-size:11px; }
.party-invitations-dialog .party-invitation-accept { min-height:30px; padding:5px 10px; border:1px solid #6b9a80; border-radius:7px; color:#fffdee; background:linear-gradient(#82ad91,#69957b); box-shadow:inset 0 1px #b9cdb0; font-size:11px; }
.party-invitations-dialog .party-invitation-reject:not(:disabled):hover { background:#f4ead4; }
.party-invitations-dialog .party-invitation-accept:not(:disabled):hover { background:#6c9d7c; }
.party-invitations-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:9px; min-height:205px; padding:20px 10px; text-align:center; }
.party-invitations-empty h3 { margin:0; color:#87916c; font-size:13px; font-weight:600; }
.party-invitations-empty p { margin:0; color:#998a70; font-size:11px; line-height:1.7; overflow-wrap:anywhere; }
.party-invitations-feedback { display:flex; flex-wrap:wrap; align-items:center; gap:7px; margin:12px 0 0; padding:8px 10px; border:1px solid; border-radius:7px; font-size:11px; line-height:1.7; overflow-wrap:anywhere; }
.party-invitations-error { border-color:#d1a891; color:#a1664d; background:#fce8da; }
.party-invitations-notice { border-color:#b7c5a3; color:#627c51; background:#eaf2db; }
.party-invitations-dialog .party-invitations-feedback button { flex:none; padding:2px 5px; border:0; border-radius:3px; color:inherit; background:#fff8e9b5; text-decoration:underline; font-size:10px; }
.party-invitations-bottom { display:flex; flex:none; align-items:center; justify-content:space-between; gap:10px; padding:11px 3px 12px; border-top:1px solid #ccb791; }
.party-invitations-bottom>span { min-width:0; color:#9c8d70; font-size:10px; line-height:1.6; overflow-wrap:anywhere; }
.party-invitations-dialog .party-invitations-bottom button { flex:none; padding:3px 0; border:0; border-radius:3px; color:#6b8b6c; background:transparent; font-size:11px; }
@media (max-width:360px) {
  .party-invitations-overlay { padding-block:22px; }
  .party-invitations-dialog { padding-inline:12px; max-height:calc(var(--app-viewport-height,100dvh) - 44px); }
  .party-invitation { padding-inline:10px; }
  .party-invitation-footer { gap:5px; }
}
@media (max-height:500px) {
  .party-invitations-overlay { padding-block:20px; }
  .party-invitations-dialog { max-height:calc(var(--app-viewport-height,100dvh) - 40px); }
  .party-invitations-heading { padding-block:10px 8px; }
  .party-invitations-content { padding-block:10px; }
  .party-invitations-bottom { padding-block:9px; }
}
@media (prefers-reduced-motion:reduce) { .party-invitations-dialog button { transition:none; } }
</style>
