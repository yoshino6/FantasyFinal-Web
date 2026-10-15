<script setup lang="ts">
import { gameAssetUrl } from '../game-assets';
withDefaults(defineProps<{ name: 'flame' | 'clock' | 'leaf' | 'star'; size?: number }>(), { size: 28 });
const icons = {
  flame: '/assets/light-anime/skills-imagegen-v2/__effect_flame.png',
  clock: '/assets/light-anime/skills-imagegen-v2/__effect_clock.png',
  leaf: '/assets/light-anime/skills-imagegen-v2/__effect_leaf.png',
  star: '/assets/light-anime/skills-imagegen-v2/__effect_star.png',
} as const;
</script>
<template>
  <img class="skill-effect-icon" :src="gameAssetUrl(icons[name])" :width="size" :height="size" alt="" aria-hidden="true" decoding="async" loading="lazy" />
</template>
<style scoped>
.skill-effect-icon { display: block; object-fit: contain; flex: 0 0 auto; border-radius: 14%; }
</style>
