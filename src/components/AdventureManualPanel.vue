<script lang="ts">
import type { ManualMessageButton } from '../task-journal';
export type { ManualMessageButton } from '../task-journal';
export type ManualCategory = '主线' | '支线' | '副本' | '委托' | '悬赏' | '其他';
export type ManualFormatNode = { type?: string; value?: unknown; options?: Record<string, unknown> };
export type ManualAction = { actionId: string; revision: string };
export type ManualMessage = {
  text?: string;
  markdown?: string;
  format?: ManualFormatNode[];
  storyImage?: { sceneKey: string; path: string; width: number; height: number; alt: string };
  buttons?: ManualMessageButton[];
};
</script>

<script setup lang="ts">
import AnimeIcon from './AnimeIcon.vue';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import './anime-adventure.css';
import { computed, nextTick, ref, watch } from 'vue';
import { storyImageUrl } from '../story-assets';
import { buildTaskJournal, journalButtonKey, journalButtonLabel } from '../task-journal';
import { GAME_UI_ICON_ATLAS_SIZE, gameUiIconStyle } from '../game-ui-icons';

type RenderedMessage = { text: string; markdown: string; images: string[]; buttons: ManualMessageButton[] };

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  caption?: string;
  messages: ManualMessage[];
  busy?: boolean;
  error?: string;
  category?: ManualCategory;
  availableCategories?: ManualCategory[];
  appearance?: 'default' | 'location';
}>(), {
  busy: false,
  error: '',
  caption: '冒险手册',
  appearance: 'default'
});

const emit = defineEmits<{
  close: [];
  category: [category: ManualCategory];
  action: [action: ManualAction];
  command: [command: string];
}>();

const defaultCategories: ManualCategory[] = ['主线', '支线', '副本', '委托', '悬赏'];
const categories = computed(() => props.availableCategories ?? defaultCategories);
const showCategories = computed(() => props.title === '任务' || props.category !== undefined);
const renderedMessages = ref<RenderedMessage[]>([]);
const closeButton = ref<HTMLButtonElement | null>(null);
const taskQuery = ref('');
const selectedTaskId = ref('');
const taskDetailOpen = ref(false);
const taskJournal = computed(() => buildTaskJournal(renderedMessages.value));
const filteredTasks = computed(() => {
  const query = taskQuery.value.trim();
  return taskJournal.value.entries.filter(task => !query || `${task.title}\n${task.sections.map(section => section.text).join('\n')}`.includes(query));
});
const selectedTask = computed(() => filteredTasks.value.find(task => task.id === selectedTaskId.value) ?? filteredTasks.value[0]);
const taskDetailBody = ref<HTMLElement | null>(null);
// The atlas cell has uneven transparent gutters; frame the visible magnifier locally.
const searchArtworkFrame = { x: 327.5, y: 351, size: 154 };
const taskSearchIconStyle = {
  ...gameUiIconStyle('search'),
  backgroundSize: `${GAME_UI_ICON_ATLAS_SIZE.width / searchArtworkFrame.size * 100}% ${GAME_UI_ICON_ATLAS_SIZE.height / searchArtworkFrame.size * 100}%`,
  backgroundPosition: `${searchArtworkFrame.x / (GAME_UI_ICON_ATLAS_SIZE.width - searchArtworkFrame.size) * 100}% ${searchArtworkFrame.y / (GAME_UI_ICON_ATLAS_SIZE.height - searchArtworkFrame.size) * 100}%`
};

function openTask(id: string) {
  selectedTaskId.value = id;
  taskDetailOpen.value = true;
  void nextTick(() => document.getElementById('task-detail-heading')?.focus());
}

function returnToTasks() {
  taskDetailOpen.value = false;
  void nextTick(() => document.querySelector<HTMLButtonElement>('.task-journal-item[aria-pressed="true"]')?.focus());
}

function taskActionLabel(button: ManualMessageButton) {
  const label = journalButtonLabel(button);
  return /^.+[（(]-?\d+\s*,\s*-?\d+(?:\s*,\s*-?\d+)?[）)]$/.test(label) ? '前往坐标' : label;
}

watch([() => props.category, () => props.open], () => {
  taskQuery.value = '';
  selectedTaskId.value = '';
  taskDetailOpen.value = false;
});
watch(() => selectedTask.value?.id, () => {
  if (taskDetailBody.value) taskDetailBody.value.scrollTop = 0;
});

function plainFormatText(nodes: ManualFormatNode[] | undefined): string {
  const pieces: string[] = [];
  const visit = (items: ManualFormatNode[] | undefined) => {
    for (const node of items ?? []) {
      if (node.type === 'MD.newline') { pieces.push('\n'); continue; }
      if (node.type === 'MD.divider') { pieces.push('\n────────\n'); continue; }
      if (node.type === 'MD.link' && node.value && typeof node.value === 'object') {
        pieces.push(String((node.value as { text?: unknown }).text ?? ''));
        continue;
      }
      if (Array.isArray(node.value)) { visit(node.value as ManualFormatNode[]); continue; }
      if (node.type === 'Text' || node.type === 'MarkdownOriginal' || node.type?.startsWith('MD.') && node.type !== 'MD.image') {
        pieces.push(String(node.value ?? ''));
      }
    }
  };
  visit(nodes);
  return pieces.join('').trim();
}

function imageValues(nodes: ManualFormatNode[] | undefined): unknown[] {
  const values: unknown[] = [];
  const visit = (items: ManualFormatNode[] | undefined) => {
    for (const node of items ?? []) {
      if (node.type === 'Image' || node.type === 'MD.image') values.push(node.value);
      if (Array.isArray(node.value)) visit(node.value as ManualFormatNode[]);
    }
  };
  visit(nodes);
  return values;
}

function safeImageUrl(value: unknown, objectUrls: string[]): string | null {
  if (typeof value === 'string') {
    const source = value.trim();
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(source) && source.length <= 12_000_000) return source;
    if (!source || /[\u0000-\u001f]/.test(source)) return null;
    try {
      const url = new URL(source, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      return url.href;
    } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const image = value as { type?: unknown; data?: unknown; url?: unknown };
  if (typeof image.url === 'string') return safeImageUrl(image.url, objectUrls);
  if (image.type !== 'Buffer' || !Array.isArray(image.data) || image.data.length < 8 || image.data.length > 8_000_000) return null;
  if (!image.data.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return null;
  const bytes = Uint8Array.from(image.data);
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
  const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  const mime = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : isGif ? 'image/gif' : isWebp ? 'image/webp' : '';
  if (!mime) return null;
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  objectUrls.push(url);
  return url;
}

function selectCategory(category: ManualCategory) {
  if (!props.busy && category !== props.category) emit('category', category);
}

function isSupportedButton(button: ManualMessageButton): boolean {
  if (typeof button?.label !== 'string') return false;
  if (button.actionId !== undefined) return typeof button.actionId === 'string' && Boolean(button.actionId.trim())
    && typeof button.revision === 'string' && Boolean(button.revision.trim());
  return typeof button.command === 'string' && Boolean(button.command.trim());
}

function selectButton(button: ManualMessageButton) {
  if (props.busy) return;
  if (typeof button.actionId === 'string' && button.actionId.trim() && typeof button.revision === 'string' && button.revision.trim()) {
    emit('action', { actionId: button.actionId, revision: button.revision });
  } else if (button.actionId === undefined && typeof button.command === 'string' && button.command.trim()) {
    emit('command', button.command);
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

watch(() => props.open, async (open, _previous, onCleanup) => {
  if (!open) return;
  window.addEventListener('keydown', onKeydown);
  onCleanup(() => window.removeEventListener('keydown', onKeydown));
  await nextTick();
  closeButton.value?.focus();
}, { immediate: true });

watch(() => [props.messages, props.open] as const, ([messages, open], _previous, onCleanup) => {
  const objectUrls: string[] = [];
  renderedMessages.value = open ? messages.map(message => {
    const localImage = storyImageUrl(message.storyImage);
    const images = localImage ? [localImage] : imageValues(message.format).map(value => safeImageUrl(value, objectUrls)).filter((url): url is string => Boolean(url));
    const rawText = String(message.text || message.markdown || plainFormatText(message.format)).trim();
    return {
      text: images.length ? rawText.replace(/\[图片\]/g, '').trim() : rawText,
      markdown: String(message.markdown || '').replace(/\[图片\]/g, '').trim(),
      images,
      buttons: Array.isArray(message.buttons)
        ? message.buttons.filter(isSupportedButton)
        : []
    };
  }) : [];
  onCleanup(() => objectUrls.forEach(url => URL.revokeObjectURL(url)));
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="manual-backdrop" :class="{ 'anime-location-refinement': appearance === 'location' }" role="presentation" @click.self="emit('close')">
      <section class="manual-dialog anime-adventure exploration-window" :data-window-theme="title === '任务' ? 'tasks' : 'map'" :class="{ 'task-journal-dialog': showCategories, 'interaction-dialog': caption === '地点互动', 'location-paper-dialog': appearance === 'location' }" role="dialog" aria-modal="true" aria-labelledby="manual-heading">
        <button ref="closeButton" class="manual-close exploration-window-close" type="button" :aria-label="`关闭${title}`" @click="emit('close')"><span class="exploration-close-mark" aria-hidden="true" /></button>
        <header class="manual-header exploration-window-heading">
          <div class="manual-heading-group">
            <span class="manual-mark" aria-hidden="true"><AnimeIcon :name="appearance === 'location' ? 'book' : caption === '地点互动' ? 'home' : 'scroll'" :size="40" /></span>
            <div><p :class="{ 'exploration-window-kicker': showCategories }">{{ showCategories ? 'QUESTS' : caption }}</p><h2 id="manual-heading">{{ title }}</h2></div>
          </div>
        </header>
        <nav v-if="showCategories" class="manual-categories" aria-label="任务分类">
          <button
            v-for="item in categories"
            :key="item"
            type="button"
            :class="{ active: (category ?? '主线') === item }"
            :aria-current="(category ?? '主线') === item ? 'page' : undefined"
            :disabled="busy"
            @click="selectCategory(item)"
          >{{ item }}</button>
        </nav>
        <div v-if="showCategories" class="task-journal" :class="{ 'is-detail-open': taskDetailOpen }" role="region" aria-label="任务内容" :aria-busy="busy">
            <div class="task-journal-layout">
              <aside class="task-journal-index" aria-label="任务列表">
                <div class="task-journal-list-heading"><strong>任务列表</strong><span>{{ busy ? '读取中' : `本页 ${taskJournal.entries.length} 项` }}</span></div>
                <label class="task-journal-search"><span class="task-journal-search-icon" :style="taskSearchIconStyle" aria-hidden="true" /><input v-model="taskQuery" type="search" aria-label="查找本页任务" placeholder="查找本页任务" :disabled="busy || !taskJournal.entries.length" /></label>
                <div class="task-journal-list">
                  <p v-if="busy" class="manual-state" role="status"><GameUiFeedbackArt name="loading" :size="24" /><span>正在读取任务…</span></p>
                  <template v-else>
                  <p v-if="error" class="manual-error" role="alert">{{ error }}</p>
                  <button v-for="task in filteredTasks" :key="task.id" class="task-journal-item" type="button" :aria-pressed="selectedTask?.id === task.id" :data-task-id="task.id" @click="openTask(task.id)">
                    <strong>{{ task.title }}</strong><span>{{ task.summary }}</span><i aria-hidden="true">›</i>
                  </button>
                  <p v-if="!taskJournal.entries.length" class="manual-state"><GameUiFeedbackArt name="empty" :size="24" /><span>{{ error ? '请切换分类重试。' : taskJournal.notices.join('\n') || `当前没有${category ?? ''}任务。` }}</span></p>
                  <p v-else-if="!filteredTasks.length" class="task-journal-no-match">本页没有匹配的任务。</p>
                  </template>
                </div>
                <footer v-if="taskJournal.pageKnown || taskJournal.previous || taskJournal.next" class="task-journal-pagination" aria-label="任务翻页">
                  <button type="button" :data-action-id="taskJournal.previous?.actionId" :data-revision="taskJournal.previous?.revision" :disabled="busy || !taskJournal.previous || (taskJournal.pageKnown && taskJournal.page === 1)" @click="taskJournal.previous && selectButton(taskJournal.previous)">上一页</button>
                  <span>{{ taskJournal.pageKnown ? `${taskJournal.page} / ${taskJournal.totalPages}` : '翻页' }}</span>
                  <button type="button" :data-action-id="taskJournal.next?.actionId" :data-revision="taskJournal.next?.revision" :disabled="busy || !taskJournal.next || (taskJournal.pageKnown && taskJournal.page >= taskJournal.totalPages)" @click="taskJournal.next && selectButton(taskJournal.next)">下一页</button>
                </footer>
              </aside>
              <section v-if="!busy && selectedTask" class="task-journal-detail" aria-label="任务详情">
                <header class="task-journal-detail-heading">
                  <button type="button" class="task-journal-back" @click="returnToTasks">‹ 返回列表</button>
                  <span v-if="selectedTask.kind && selectedTask.kind !== category" class="task-journal-kind">{{ selectedTask.kind }}</span>
                  <h3 id="task-detail-heading" tabindex="-1">{{ selectedTask.title }}</h3>
                </header>
                <div ref="taskDetailBody" class="task-journal-detail-body" tabindex="0" aria-label="任务详情正文">
                  <section v-for="(section, index) in selectedTask.sections" :key="index" class="task-journal-section" :class="{ 'is-fact': section.label }">
                    <h4 v-if="section.label || index === 0">{{ section.label || '任务说明' }}</h4><p class="manual-text">{{ section.text }}</p>
                  </section>
                  <img v-for="(src, index) in selectedTask.images" :key="index" class="manual-image" :src="src" :alt="`${selectedTask.title}图片`" loading="lazy" referrerpolicy="no-referrer" />
                  <p v-if="!selectedTask.sections.length && !selectedTask.images.length" class="manual-text">选择下方操作继续任务。</p>
                </div>
                <footer v-if="selectedTask.buttons.length" class="task-journal-actions" aria-label="当前任务操作">
                  <button v-for="button in selectedTask.buttons" :key="journalButtonKey(button)" type="button" :data-action-id="button.actionId" :data-revision="button.revision" :class="{ 'is-secondary': /放弃|清除/.test(button.label) }" :title="journalButtonLabel(button)" :disabled="busy" @click="selectButton(button)">{{ taskActionLabel(button) }}</button>
                </footer>
              </section>
              <section v-else class="task-journal-detail task-journal-placeholder" aria-label="任务详情">
                <header class="task-journal-detail-heading"><button type="button" class="task-journal-back" @click="returnToTasks">‹ 返回列表</button><h3>任务详情</h3></header>
                <div class="task-journal-detail-body"><p class="task-journal-no-match">{{ busy ? '任务详情将在读取完成后显示。' : '选择任务后在此查看详情。' }}</p></div>
              </section>
            </div>
            <div v-if="!busy && taskJournal.extraButtons.length" class="task-journal-extra"><span>其他操作</span><div class="task-journal-actions"><button v-for="button in taskJournal.extraButtons" :key="journalButtonKey(button)" :data-action-id="button.actionId" :data-revision="button.revision" type="button" :disabled="busy" @click="selectButton(button)">{{ journalButtonLabel(button) }}</button></div></div>
        </div>
        <div v-else class="manual-body" role="region" :aria-label="`${title}内容`">
          <p v-if="busy" class="manual-state game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在读取{{ title }}…</span></p>
          <p v-if="error" class="manual-error" role="alert">{{ error }}</p>
          <div v-if="renderedMessages.some(message => message.text || message.images.length || message.buttons.length)" class="manual-messages">
            <article v-for="(message, index) in renderedMessages" :key="index" class="manual-message" :class="{ 'has-art': message.images.length > 0 }">
              <img v-for="(src, imageIndex) in message.images" :key="imageIndex" class="manual-image" :src="src" :alt="`${title}图片`" loading="lazy" referrerpolicy="no-referrer" />
              <p v-if="message.text" class="manual-text">{{ message.text }}</p>
              <div v-if="message.buttons.length" class="manual-actions">
                <button v-for="(button, buttonIndex) in message.buttons" :key="button.actionId ?? buttonIndex" type="button" :disabled="busy" @click="selectButton(button)"><AnimeIcon v-if="appearance === 'location'" :name="/返回|离开|地图/.test(button.label) ? 'map' : /售|购买|商店|兑换/.test(button.label) ? 'coin' : /书|典|卷/.test(button.label) ? 'book' : /前往|进入/.test(button.label) ? 'arrow' : 'search'" :size="30" /><span>{{ button.label }}</span></button>
              </div>
            </article>
          </div>
          <p v-else class="manual-state game-ui-empty-message"><GameUiFeedbackArt name="empty" :size="36" /><span>暂无{{ title }}内容。</span></p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.manual-backdrop { position: fixed; z-index: 91; inset: 0; display: grid; place-items: center; padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); background: rgba(43, 36, 54, .45); backdrop-filter: blur(4px); }
.manual-dialog { display: flex; flex-direction: column; width: min(720px, 100%); height: min(680px, 100%); min-height: 0; overflow: hidden; color: #51465a; background: #fffaf6; border: 1px solid rgba(255, 255, 255, .9); border-radius: 22px; box-shadow: 0 24px 68px rgba(55, 41, 65, .28); }
.manual-dialog.interaction-dialog { width: min(680px, 100%); height: auto; max-height: calc(100dvh - 32px); }
.manual-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 13px; border-bottom: 1px solid #ebdfde; }
.manual-heading-group { display: flex; align-items: center; gap: 10px; min-width: 0; }
.manual-mark { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; color: #fffaf0; background: #8270b5; border-radius: 11px; font-size: 19px; }
.manual-heading-group p { margin: 0 0 2px; color: #9a8299; font-size: 10px; letter-spacing: .12em; }
.manual-heading-group h2 { margin: 0; overflow: hidden; font-size: 18px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.manual-close { flex: 0 0 32px; width: 32px; height: 32px; padding: 0; color: #a36d74; background: #ffebeb; border-radius: 9px; font-size: 23px; line-height: 1; }
.manual-categories { display: flex; flex: 0 0 auto; gap: 6px; overflow-x: auto; padding: 11px 17px; border-bottom: 1px solid #ebdfde; overscroll-behavior-x: contain; scrollbar-width: thin; }
.manual-categories button { flex: 0 0 auto; min-width: 66px; padding: 8px 12px; color: #85798e; background: #f5efee; border-radius: 10px; font-size: 12px; }
.manual-categories button.active { color: #674b96; background: #eee6fa; font-weight: 700; }
.manual-body { flex: 1; min-height: 0; overflow-y: auto; padding: 17px 20px max(24px, env(safe-area-inset-bottom)); overscroll-behavior: contain; }
.manual-messages { display: grid; gap: 12px; }
.manual-message { min-width: 0; padding: 14px 15px; background: #fff; border: 1px solid #f0e5e0; border-radius: 13px; }
.manual-text { margin: 0; color: #594e60; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-wrap; }
.manual-image { display: block; width: auto; max-width: 100%; max-height: 460px; height: auto; margin: 10px auto 0; object-fit: contain; border-radius: 9px; }
.manual-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.manual-actions button { min-height: 36px; padding: 7px 11px; color: #71548e; background: #eee7f9; border-radius: 9px; font-size: 12px; }
.manual-state { margin: 0; padding: 30px 12px; color: #9a8a9a; font-size: 13px; text-align: center; }
.manual-error { margin: 0; padding: 13px 14px; color: #ad4e5b; background: #fff0ed; border-radius: 10px; font-size: 13px; line-height: 1.5; }
.manual-close:focus-visible, .manual-categories button:focus-visible, .manual-actions button:focus-visible { outline: 3px solid #765dc2; outline-offset: 2px; }
@media (max-width: 600px) {
  .manual-backdrop { padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); }
  .manual-dialog { height: 100%; border-radius: 17px; }
  .manual-header { padding: 13px 14px 11px; }
  .manual-categories { padding: 9px 12px; }
  .manual-body { padding: 13px 12px max(20px, env(safe-area-inset-bottom)); }
  .manual-message { padding: 12px; }
}
</style>

<style scoped>
.manual-dialog.task-journal-dialog .manual-categories { gap: 4px; padding-block: 6px; }
.manual-dialog.exploration-window.task-journal-dialog .manual-categories button { min-width: 0; min-height: 32px; padding: 4px 5px; }
.task-journal { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; padding-top: 6px; overflow: hidden; }
.task-journal > .manual-error { flex: none; margin-bottom: 8px; }
.task-journal-layout { display: grid; flex: 1; grid-template-columns: minmax(0, .8fr) minmax(0, 1.35fr); gap: 8px; min-height: 0; }
.task-journal-index, .task-journal-detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border: 1px solid #dfd1b3; border-radius: 10px; background: #fffdf7; }
.task-journal-index { background: #f5efdf; }
.task-journal-list-heading { display: flex; justify-content: space-between; align-items: center; flex: none; gap: 4px; padding: 6px 8px 4px; color: #695132; font-size: 12px; }
.task-journal-list-heading > span { color: #8f816b; font-size: 10px; }
.task-journal-search { display: flex; align-items: center; gap: 4px; flex: none; height: 32px; margin: 0 6px 4px; padding: 0 5px; border: 1px solid #dfd1b3; border-radius: 7px; background: #fffdf7; }
.task-journal-search-icon { display: block; flex: 0 0 23.04px; width: 23.04px; height: 23.04px; background-repeat: no-repeat; }
.task-journal-dialog .task-journal-search input { display: block; flex: 1; width: 100%; min-width: 0; height: 24px; min-height: 24px; margin: 0; padding: 0; border: 0; border-radius: 0; outline: none; box-shadow: none; color: #594e3c; background: transparent; font: inherit; font-size: 12px; line-height: 24px; appearance: none; }
.task-journal-dialog .task-journal-search input:focus-visible { outline: none; box-shadow: none; }
.task-journal-dialog .task-journal-search:focus-within { border-color: #976b2e; box-shadow: 0 0 0 2px #976b2e20; }
.task-journal-list { flex: 1; min-height: 0; padding: 0 4px 4px; overflow-y: auto; overscroll-behavior: contain; }
.task-journal-item { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 2px; width: 100%; margin-bottom: 2px; padding: 6px 20px 6px 8px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: #5b4b35; text-align: left; }
.task-journal-item[aria-pressed='true'] { border-color: #c9aa70; background: #fff8e4; box-shadow: inset 3px 0 #ad7a32; }
.task-journal-item strong { font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
.task-journal-item > span { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: #8e806a; font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
.task-journal-item > i { position: absolute; top: 7px; right: 7px; color: #a78b5e; font-size: 18px; font-style: normal; }
.task-journal-detail-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 7px; flex: none; padding: 7px 10px; border-bottom: 1px solid #e8dcc5; }
.task-journal-detail-heading h3 { margin: 0; color: #6f4e28; font-size: 17px; line-height: 1.5; overflow-wrap: anywhere; }
.task-journal-kind { display: block; width: 100%; margin: 0; color: #a68a5d; font-size: 10px; }
.task-journal-detail-body { flex: 1; min-height: 0; padding: 8px 10px; overflow-y: auto; overscroll-behavior: contain; }
.task-journal .task-journal-detail-body .manual-text { line-height: 1.55; }
.task-journal-section + .task-journal-section { margin-top: 8px; }
.task-journal-section h4 { margin: 0 0 3px; color: #99805b; font-size: 11px; font-weight: 500; line-height: 1.4; }
.task-journal-section.is-fact { display: grid; grid-template-columns: 3.5em minmax(0, 1fr); align-items: baseline; gap: 6px; padding-left: 6px; border-left: 2px solid #d9c5a0; }
.task-journal-section.is-fact h4 { margin: 0; overflow-wrap: anywhere; }
.task-journal-section.is-fact + .task-journal-section.is-fact { margin-top: 5px; }
.task-journal-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; flex: none; gap: 5px; padding: 6px 8px; border-top: 1px solid #e8dcc5; background: #faf5e9; }
.task-journal-actions button, .task-journal-pagination button { min-width: 0; min-height: 30px; padding: 5px 9px; border: 1px solid #b9a174; border-radius: 7px; color: #fffaf0; background: #96703e; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.task-journal-actions button.is-secondary { margin-right: auto; color: #927c65; background: #fffdf7; border-color: #d4c7b2; }
.task-journal-actions button:disabled, .task-journal-pagination button:disabled { cursor: default; opacity: .45; }
.task-journal-pagination { display: flex; justify-content: space-between; align-items: center; flex: none; gap: 4px; padding: 4px 6px; border-top: 1px solid #dfd1b3; color: #8e806a; font-size: 11px; }
.task-journal-pagination button { padding: 3px 6px; min-height: 28px; color: #806340; background: #fffdf7; border-color: #d4c7b2; font-size: 11px; }
.task-journal-no-match { margin: 0; padding: 12px 6px; color: #9a8a72; font-size: 12px; text-align: center; }
.task-journal .manual-state { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 12px 6px; font-size: 12px; }
.task-journal-back { display: none; }
.task-journal-extra { flex: none; max-height: 28%; margin-top: 6px; overflow-y: auto; border: 1px solid #dfd1b3; border-radius: 8px; }
.task-journal-extra > span { display: block; padding: 6px 10px 0; color: #9a8a72; font-size: 10px; }
.task-journal-extra .task-journal-actions { justify-content: flex-start; border: 0; }
.task-journal-item:focus-visible, .task-journal-actions button:focus-visible, .task-journal-back:focus-visible { outline: 2px solid #976b2e; outline-offset: -3px; }
@media (max-width: 600px) {
  .task-journal-layout { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .task-journal-detail { display: none; }
  .task-journal.is-detail-open .task-journal-index { display: none; }
  .task-journal.is-detail-open .task-journal-detail { display: flex; }
  .task-journal-back { display: block; margin: 0; padding: 0; min-height: 26px; color: #8d734b; background: transparent; font-size: 11px; }
  .task-journal-detail-heading { padding: 6px 8px; }
  .task-journal-detail-heading h3 { flex: 1; min-width: 0; font-size: 16px; }
  .task-journal-detail-body { padding: 8px; }
  .task-journal-actions { padding: 6px; }
  .task-journal-actions button { flex: 1 1 60px; padding: 5px 6px; }
  .task-journal-item { padding-block: 6px; }
}
@media (max-height: 600px) {
  .task-journal-detail-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; padding: 6px 9px; }
  .task-journal-detail-heading h3 { flex: 1; min-width: 0; font-size: 15px; }
  .task-journal-kind { width: 100%; margin: 0; }
  .task-journal-back { flex: none; min-height: 26px; margin: 0; font-size: 11px; }
  .task-journal-actions { gap: 5px; padding: 6px; }
  .task-journal-actions button { flex: 1 1 60px; min-height: 30px; padding: 5px 3px; font-size: 11px; }
  .task-journal-detail-body { padding: 7px; }
  .task-journal-list-heading { padding-block: 6px 4px; }
  .task-journal-item { padding-block: 5px; }
}
</style>
