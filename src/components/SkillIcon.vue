<script setup lang="ts">
import { computed } from 'vue';
import { skillArtwork } from '../skill-art';
import { gameAssetUrl } from '../game-assets';

const props = withDefaults(defineProps<{ code?: string | null; name?: string | null; category?: string; size?: number }>(), { size: 64, category: 'magic' });
const artwork = computed(() => skillArtwork(props.code, props.name));
const src = computed(() => gameAssetUrl(artwork.value?.src || '/assets/light-anime/skills-imagegen-v2/__fallback.png'));
</script>

<template>
  <img class="skill-icon" :src="src" :alt="name || artwork?.name || '通用技能'" :width="size" :height="size" :style="{ '--skill-icon-size': size + 'px' }" :data-skill-code="artwork?.code" decoding="async" loading="lazy" />
</template>

<style scoped>
.skill-icon { display: block; width: var(--skill-icon-size); height: var(--skill-icon-size); flex: 0 0 auto; object-fit: contain; max-width: 100%; background: transparent; border-radius: 14%; filter: drop-shadow(0 2px 2px #55463330); }
</style>
