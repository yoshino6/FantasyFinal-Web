<script setup lang="ts">
import { computed } from 'vue';
import { gameUiAdventureArtStyle, type GameUiAdventureArtName } from '../game-ui-adventure-art';

/** Decorative artwork; the parent control retains its live label and action. */
const props = withDefaults(defineProps<{
  name: GameUiAdventureArtName;
  size?: number | string;
}>(), { size: 48 });
const artStyle = computed(() => gameUiAdventureArtStyle(props.name));
const sizeStyle = computed(() => ({ '--adventure-art-size': typeof props.size === 'number' ? `${props.size}px` : props.size }));
</script>

<template>
  <span class="anime-adventure-art" :class="`adventure-art-${name}`" :data-adventure-art="name" :style="sizeStyle" aria-hidden="true"><span class="adventure-art-sprite" :style="artStyle" /></span>
</template>

<style scoped>
.anime-adventure-art { position: relative; display: inline-block; flex-shrink: 0; width: var(--adventure-art-size, 48px); height: var(--adventure-art-size, 48px); aspect-ratio: 1; vertical-align: middle; }
.adventure-art-sprite { position: absolute; inset: 0; display: block; width: 100%; height: 100%; background-repeat: no-repeat; pointer-events: none; }
</style>
