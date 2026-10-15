<script setup lang="ts">
import { ref, watch } from 'vue';
import type { GameActionButton, GameActionMessage } from '../api';
import { storyImageUrl } from '../story-assets';
import AnimeIcon from './AnimeIcon.vue';
import './anime-adventure.css';

type FormatNode = NonNullable<GameActionMessage['format']>[number];
type RenderedMessage = { text: string; images: string[]; imageAlt: string; buttons: GameActionButton[] };

const props = withDefaults(defineProps<{
  messages: GameActionMessage[];
  busy?: boolean;
}>(), { busy: false });

const emit = defineEmits<{
  action: [action: { actionId: string; revision: string }];
  command: [command: string];
}>();

const renderedMessages = ref<RenderedMessage[]>([]);

function plainFormatText(nodes: FormatNode[] | undefined): string {
  const pieces: string[] = [];
  const visit = (items: FormatNode[] | undefined) => {
    for (const node of items ?? []) {
      if (node.type === 'MD.newline') { pieces.push('\n'); continue; }
      if (node.type === 'MD.divider') { pieces.push('\n────────\n'); continue; }
      if (node.type === 'MD.link' && node.value && typeof node.value === 'object') {
        pieces.push(String((node.value as { text?: unknown }).text ?? ''));
        continue;
      }
      if (Array.isArray(node.value)) { visit(node.value as FormatNode[]); continue; }
      if (node.type === 'Text' || node.type === 'MarkdownOriginal' || node.type?.startsWith('MD.') && node.type !== 'MD.image') {
        pieces.push(String(node.value ?? ''));
      }
    }
  };
  visit(nodes);
  return pieces.join('').trim();
}

function imageValues(nodes: FormatNode[] | undefined): unknown[] {
  const values: unknown[] = [];
  const visit = (items: FormatNode[] | undefined) => {
    for (const node of items ?? []) {
      if (node.type === 'Image' || node.type === 'MD.image') values.push(node.value);
      if (Array.isArray(node.value)) visit(node.value as FormatNode[]);
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

function isSupportedButton(button: GameActionButton): boolean {
  if (typeof button?.label !== 'string') return false;
  if (button.actionId !== undefined) return typeof button.actionId === 'string' && Boolean(button.actionId.trim())
    && typeof button.revision === 'string' && Boolean(button.revision.trim());
  return typeof button.command === 'string' && Boolean(button.command.trim());
}

function selectButton(button: GameActionButton) {
  if (props.busy) return;
  if (typeof button.actionId === 'string' && button.actionId.trim() && typeof button.revision === 'string' && button.revision.trim()) {
    emit('action', { actionId: button.actionId, revision: button.revision });
  } else if (button.actionId === undefined && typeof button.command === 'string' && button.command.trim()) {
    emit('command', button.command);
  }
}

watch(() => props.messages, (messages, _previous, onCleanup) => {
  const objectUrls: string[] = [];
  renderedMessages.value = messages.map(message => {
    const localImage = storyImageUrl(message.storyImage);
    const images = localImage ? [localImage] : imageValues(message.format).map(value => safeImageUrl(value, objectUrls)).filter((url): url is string => Boolean(url));
    const rawText = String(message.text || plainFormatText(message.format) || message.markdown || '').trim();
    return {
      text: images.length ? rawText.replace(/\[图片\]/g, '').trim() : rawText,
      images,
      imageAlt: localImage ? message.storyImage!.alt : '剧情图片',
      buttons: Array.isArray(message.buttons) ? message.buttons.filter(isSupportedButton) : []
    };
  });
  onCleanup(() => objectUrls.forEach(url => URL.revokeObjectURL(url)));
}, { immediate: true });
</script>

<template>
  <div class="story-guide-content anime-adventure" :aria-busy="busy">
    <article v-for="(message, index) in renderedMessages" :key="index" class="story-message" :class="{ 'has-art': message.images.length > 0 }">
      <img v-for="(src, imageIndex) in message.images" :key="imageIndex" class="story-image" :src="src" :alt="message.imageAlt" referrerpolicy="no-referrer" />
      <div v-if="message.text" class="story-narration"><AnimeIcon class="story-narration-mark" name="scroll" :size="26" /><p class="story-guide-text">{{ message.text }}</p></div>
      <div v-if="message.buttons.length" class="story-actions">
        <button v-for="(button, buttonIndex) in message.buttons" :key="button.actionId ?? buttonIndex" class="soft-button" type="button" :disabled="busy" @click="selectButton(button)">{{ button.label }}</button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.story-guide-content { display: grid; gap: 10px; min-width: 0; }
.story-message { min-width: 0; }
.story-message + .story-message { padding-top: 10px; border-top: 1px solid var(--line); }
.story-guide-text { margin: 0 0 8px; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.story-image { display: block; width: auto; max-width: 100%; max-height: 460px; height: auto; margin: 8px auto; object-fit: contain; border-radius: 9px; }
.story-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
.story-actions button { min-height: 40px; max-width: 100%; padding: 8px 12px; font-size: 12px; overflow-wrap: anywhere; }
.story-actions button:focus-visible { outline: 3px solid #765dc2; outline-offset: 2px; }
@media (max-width: 600px) {
  .story-image { max-height: 60vh; }
  .story-actions button { flex: 1 1 132px; }
}
</style>
