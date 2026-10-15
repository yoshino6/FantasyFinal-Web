<script setup lang="ts">
import { computed } from 'vue';
import { gameAssetUrl } from '../game-assets';

/** Decorative auth glyphs; visible control text supplies the accessible name. */
const props = withDefaults(defineProps<{
  name: 'paw' | 'user' | 'lock' | 'eye' | 'refresh';
  size?: number | string;
}>(), { size: 24 });

// Square pixel windows keep each complete drawing and its transparent gutter.
// The original 1536 x 1024 PNG remains untouched; the sixth cell is unused art.
const frames = {
  paw: { x: 72, y: 73 },
  user: { x: 566, y: 58 },
  lock: { x: 1072, y: 57 },
  eye: { x: 62, y: 550 },
  refresh: { x: 568, y: 539 }
} as const;
const iconStyle = computed(() => ({
  '--auth-glyph-size': typeof props.size === 'number' ? `${props.size}px` : props.size
}));
const spriteStyle = computed(() => {
  const frame = frames[props.name];
  return {
    backgroundImage: `url("${gameAssetUrl('/assets/light-anime/game-ui-v1/auth-icons.webp')}")`,
    backgroundSize: '384% 256%',
    backgroundPosition: `${frame.x / 1136 * 100}% ${frame.y / 624 * 100}%`
  };
});
</script>

<template>
  <span class="auth-glyph" :class="`auth-glyph-${name}`" :data-auth-glyph="name" :style="iconStyle" aria-hidden="true">
    <span class="auth-glyph-sprite" :style="spriteStyle" />
  </span>
</template>

<style scoped>
.auth-glyph { position: relative; display: inline-block; flex: none; width: var(--auth-glyph-size, 24px); height: var(--auth-glyph-size, 24px); aspect-ratio: 1; vertical-align: -.2em; pointer-events: none; }
.auth-glyph-sprite { position: absolute; inset: 0; display: block; width: 100%; height: 100%; background-repeat: no-repeat; pointer-events: none; }
</style>
