<script setup lang="ts">
import { computed } from 'vue';
import { gameAssetUrl } from '../game-assets';

/** Decorative only: the adjacent live text carries the state and accessible name. */
const props = withDefaults(defineProps<{
  name: 'empty' | 'loading' | 'error' | 'message' | 'success' | 'connecting';
  size?: number;
}>(), { size: 48 });
const frames = {
  empty: [0, 0], loading: [1, 0], error: [2, 0],
  message: [0, 1], success: [1, 1], connecting: [2, 1]
} as const;
const style = computed(() => {
  const [column, row] = frames[props.name] ?? frames.empty;
  return {
    '--game-ui-feedback-size': `${props.size}px`,
    backgroundImage: `url("${gameAssetUrl('/assets/light-anime/game-ui-v2/feedback-states.webp')}")`,
    backgroundSize: '300% 200%',
    backgroundPosition: `${column * 50}% ${row * 100}%`
  };
});
</script>

<template>
  <span class="game-ui-feedback-art" :data-feedback-art="name" :style="style" aria-hidden="true" />
</template>

<style scoped>
.game-ui-feedback-art { display: inline-block; flex: none; width: var(--game-ui-feedback-size, 48px); height: var(--game-ui-feedback-size, 48px); aspect-ratio: 1; background-repeat: no-repeat; pointer-events: none; }
</style>
