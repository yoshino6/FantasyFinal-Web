<script lang="ts">
export type ManualCategory = '主线' | '支线' | '副本' | '委托' | '悬赏';
export type ManualFormatNode = { type?: string; value?: unknown; options?: Record<string, unknown> };
export type ManualAction = { actionId: string; revision: string };
export type ManualMessageButton =
  | { label: string; actionId: string; revision: string; expiresAt?: string; command?: never }
  | { label: string; command: string; actionId?: never; revision?: never; expiresAt?: never };
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

type RenderedMessage = { text: string; images: string[]; buttons: ManualMessageButton[] };

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
      <section class="manual-dialog anime-adventure" :class="{ 'interaction-dialog': caption === '地点互动', 'location-paper-dialog': appearance === 'location' }" role="dialog" aria-modal="true" aria-labelledby="manual-heading">
        <header class="manual-header">
          <div class="manual-heading-group">
            <span class="manual-mark" aria-hidden="true"><AnimeIcon :name="appearance === 'location' ? 'book' : caption === '地点互动' ? 'home' : 'scroll'" :size="40" /></span>
            <div><p>{{ caption }}</p><h2 id="manual-heading">{{ title }}</h2></div>
          </div>
          <button ref="closeButton" class="manual-close" type="button" :aria-label="`关闭${title}`" @click="emit('close')"><AnimeIcon name="close" :size="24" /></button>
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
        <div class="manual-body" role="region" :aria-label="`${title}内容`">
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
