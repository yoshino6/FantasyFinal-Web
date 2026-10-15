<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { GameActionMessage } from '../api';
import StoryGuideContent from './StoryGuideContent.vue';
import AnimeIcon from './AnimeIcon.vue';
import './anime-adventure.css';

const props = defineProps<{
  open: boolean;
  messages: GameActionMessage[];
  busy: boolean;
  error: string;
  canFinish: boolean;
  inBattle: boolean;
}>();
const emit = defineEmits<{
  action: [action: { actionId: string; revision: string }];
  command: [command: string];
  refresh: [];
  finish: [];
}>();
const dialog = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
function constrainTab(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !props.open) return;
  const controls = [...document.querySelectorAll<HTMLElement>('.story-dialog button:not(:disabled), .story-topbar .settings-button, .story-settings-layer button:not(:disabled), .story-settings-layer input:not(:disabled), .story-settings-layer select:not(:disabled)')]
    .filter(element => element.getClientRects().length > 0);
  if (!controls.length) { event.preventDefault(); dialog.value?.focus(); return; }
  const current = controls.indexOf(document.activeElement as HTMLElement);
  const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current + 1) % controls.length;
  event.preventDefault();
  controls[next]?.focus();
}
watch(() => props.open, (open, _previous, onCleanup) => {
  if (!open) return;
  window.addEventListener('keydown', constrainTab, true);
  onCleanup(() => window.removeEventListener('keydown', constrainTab, true));
}, { immediate: true });
watch(() => [props.open, props.messages] as const, async ([open]) => {
  if (!open) return;
  await nextTick();
  if (body.value) body.value.scrollTop = 0;
  // Settings remain accessible above the mask. Move keyboard focus away from
  // the underlying map without trapping it outside the settings controls.
  if (!document.activeElement?.closest('.settings-layer')) dialog.value?.focus();
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="story-backdrop">
      <section ref="dialog" class="story-dialog anime-adventure" role="dialog" aria-labelledby="story-dialog-heading" tabindex="-1">
        <header class="story-dialog-header"><AnimeIcon name="book" :size="30" /><h2 id="story-dialog-heading">冒险剧情</h2></header>
        <div ref="body" class="story-dialog-body">
          <StoryGuideContent :messages="messages" :busy="busy" @action="action => emit('action', action)" @command="command => emit('command', command)" />
          <p v-if="busy" class="story-dialog-status" role="status">正在继续剧情…</p>
          <div v-if="error" class="story-dialog-error" role="alert"><p>{{ error }}</p><button type="button" class="soft-button" :disabled="busy" @click="emit('refresh')">重新读取当前剧情</button></div>
          <button v-if="inBattle || canFinish" class="primary-button story-finish" :class="{ 'is-battle': inBattle }" type="button" :disabled="busy" @click="emit('finish')"><AnimeIcon :name="inBattle ? 'sword' : 'map'" :size="26" />{{ inBattle ? '进入战斗' : '返回地图' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.story-backdrop { position: fixed; z-index: 100; inset: 0; display: flex; align-items: center; justify-content: center; padding: 108px 16px 20px; background: rgba(39, 32, 49, .52); }
.story-dialog { display: flex; flex-direction: column; width: min(680px, 100%); max-height: 100%; overflow: hidden; color: var(--ink); background: #fffaf4; border: 1px solid #ead8ce; border-radius: 18px; box-shadow: 0 22px 64px rgba(31, 20, 39, .3); outline: none; }
.story-dialog-header { display: flex; align-items: center; gap: 8px; flex-shrink: 0; padding: 13px 17px; border-bottom: 1px solid var(--line); }
.story-dialog-header span { color: #b998cf; }
.story-dialog-header h2 { font-size: 17px; }
.story-dialog-body { overflow-y: auto; overscroll-behavior: contain; padding: 17px; font-size: 14px; line-height: 1.8; }
.story-dialog-status { margin: 9px 0 0; font-size: 12px; color: var(--muted); }
.story-dialog-error { margin-top: 12px; padding: 10px; color: #bd5364; background: #fff0ed; border-radius: 10px; font-size: 12px; }
.story-dialog-error p { margin: 0 0 6px; }
.story-finish { display: block; margin: 14px auto 0; min-height: 40px; }
@media (max-width: 600px) { .story-backdrop { padding: 84px 12px max(14px, env(safe-area-inset-bottom)); } .story-dialog-body { padding: 13px; font-size: 13px; } }
</style>
