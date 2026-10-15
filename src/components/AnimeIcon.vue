<script setup lang="ts">
import { computed } from 'vue';
import { gameUiIconStyle, type GameUiIconName } from '../game-ui-icons';

/** Decorative semantic artwork. Put the accessible label on the parent control. */
const props = withDefaults(defineProps<{
  name: GameUiIconName;
  size?: number | string;
}>(), { size: 24 });
const iconStyle = computed(() => ({
  '--anime-icon-size': typeof props.size === 'number' ? `${props.size}px` : props.size,
}));
const spriteStyle = computed(() => gameUiIconStyle(props.name));
</script>

<template>
  <span class="anime-icon" :class="`anime-icon-${name}`" :data-ui-icon="name" :style="iconStyle" aria-hidden="true">
    <span class="anime-icon-sprite" :style="spriteStyle" />
  </span>
</template>

<style scoped>
.anime-icon { position: relative; display: inline-block; flex-shrink: 0; width: var(--anime-icon-size, 24px); height: var(--anime-icon-size, 24px); aspect-ratio: 1; vertical-align: -.2em; overflow: visible; }
.anime-icon-sprite { position: absolute; inset: 0; display: block; width: 100%; height: 100%; background-repeat: no-repeat; pointer-events: none; }
</style>
