<script setup lang="ts">
import { computed } from 'vue';
import AnimeIcon from './AnimeIcon.vue';
import { gameAssetUrl } from '../game-assets';
import type { GameUiIconName } from '../game-ui-icons';

const props = withDefaults(defineProps<{ name: string; size?: number | string }>(), { size: 24 });
const shared: Record<string, GameUiIconName> = {
  friends: 'party', party: 'party', star: 'star', paw: 'paw', mail: 'mail',
  search: 'search', add: 'plus', check: 'check', close: 'close', heart: 'heart', leaf: 'leaf',
};
// Each measured square contains one complete painted symbol and its alpha gutter.
const frames: Record<string, { x: number; y: number; size: number }> = {
  document: { x: 28, y: 46, size: 260 },
  chat: { x: 339, y: 38, size: 272 },
  send: { x: 650, y: 33, size: 278 },
  history: { x: 954, y: 25, size: 286 },
  down: { x: 23, y: 337, size: 272 },
  smile: { x: 334, y: 334, size: 272 },
  location: { x: 654, y: 343, size: 260 },
  crown: { x: 952, y: 337, size: 288 },
  tree: { x: 8, y: 616, size: 308 },
  flower: { x: 336, y: 636, size: 284 },
  flag: { x: 679, y: 621, size: 290 },
  quill: { x: 968, y: 629, size: 286 },
  refresh: { x: 25, y: 939, size: 268 },
  megaphone: { x: 332, y: 926, size: 284 },
  logout: { x: 670, y: 930, size: 280 },
  oath: { x: 963, y: 947, size: 268 },
};
const sharedName = computed(() => Object.prototype.hasOwnProperty.call(shared, props.name) ? shared[props.name] : undefined);
const spriteStyle = computed(() => {
  const frame = Object.prototype.hasOwnProperty.call(frames, props.name) ? frames[props.name] : frames.document;
  return {
    backgroundImage: `url("${gameAssetUrl('/assets/light-anime/game-ui-v1/social-icons.webp')}")`,
    backgroundSize: `${1254 / frame.size * 100}% ${1254 / frame.size * 100}%`,
    backgroundPosition: `${frame.x / (1254 - frame.size) * 100}% ${frame.y / (1254 - frame.size) * 100}%`,
  };
});
const sizeStyle = computed(() => ({ '--social-glyph-size': typeof props.size === 'number' ? `${props.size}px` : props.size }));
</script>

<template>
  <AnimeIcon v-if="sharedName" class="social-glyph" :class="`social-glyph-${name}`" :name="sharedName" :size="size" :data-social-glyph="name" />
  <span v-else class="social-glyph" :class="`social-glyph-${name}`" :style="sizeStyle" :data-social-glyph="name" aria-hidden="true"><span class="social-glyph-art" :style="spriteStyle" /></span>
</template>

<style scoped>
.social-glyph { position: relative; display: inline-block; flex: 0 0 auto; vertical-align: middle; color: inherit; }
.social-glyph:not(.anime-icon) { width: var(--social-glyph-size, 24px); height: var(--social-glyph-size, 24px); aspect-ratio: 1; }
.social-glyph-art { position: absolute; inset: 0; display: block; width: 100%; height: 100%; background-repeat: no-repeat; pointer-events: none; }
</style>
