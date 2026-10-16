<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PanelPortrait } from '../api';
import { portraitAssetCandidates } from '../character-assets';
import { gameAssetUrl } from '../game-assets';

const props = withDefaults(defineProps<{
  name: string;
  id?: number | string;
  avatarUrl?: string | null;
  portrait?: string | PanelPortrait | null;
  size?: number | string;
  shape?: 'round' | 'square';
}>(), { size: 56, shape: 'square' });
const candidateIndex = ref(0);
watch(() => [props.avatarUrl, props.portrait], () => { candidateIndex.value = 0; }, { deep: true });
const candidates = computed(() => {
  const images: { src: string; kind: 'uploaded' | 'image' | 'character' | 'unspecified' }[] = [];
  if (props.avatarUrl) images.push({ src: props.avatarUrl, kind: 'uploaded' });
  if (typeof props.portrait === 'string' && props.portrait) images.push({ src: props.portrait, kind: 'image' });
  else if (props.portrait && typeof props.portrait === 'object') {
    images.push(...portraitAssetCandidates(props.portrait, 'equipment').map(src => ({ src, kind: 'character' as const })));
  }
  images.push({ src: gameAssetUrl('/assets/light-anime/social-v1/avatar-neutral.webp'), kind: 'unspecified' });
  return images.filter((image, index) => images.findIndex(other => other.src === image.src) === index);
});
const currentImage = computed(() => candidates.value[Math.min(candidateIndex.value, candidates.value.length - 1)]!);
const personalized = computed(() => currentImage.value.kind !== 'unspecified');
const characterPortrait = computed(() => currentImage.value.kind === 'character');
const onImageError = () => { if (candidateIndex.value < candidates.value.length - 1) candidateIndex.value += 1; };
</script>

<template>
  <span class="social-avatar" :class="[shape, { personalized, 'character-portrait': characterPortrait }]" :style="{ '--social-avatar-size': typeof size === 'number' ? size + 'px' : size }" :data-avatar-kind="currentImage.kind">
    <span class="social-avatar-window"><img :key="currentImage.src" :src="currentImage.src" :alt="personalized ? `${name}的角色头像` : `${name}（未提供角色头像）`" loading="lazy" decoding="async" @error="onImageError" /></span>
  </span>
</template>

<style scoped>
.social-avatar { --social-avatar-size:56px; display:inline-grid; flex:0 0 auto; width:var(--social-avatar-size); height:var(--social-avatar-size); box-sizing:border-box; padding:4px; border:1.5px solid #b89470; border-radius:7px 11px 6px 10px; background:linear-gradient(135deg,#fffdf0,#e6d3ae 45%,#fff8df); box-shadow:0 1px 0 #ffffff,0 2px 3px #80552a22; overflow:hidden; }
.social-avatar-window { display:block; position:relative; width:100%; height:100%; overflow:hidden; border:1px solid #5dabb5; border-radius:4px 7px 3px 6px; background:linear-gradient(#98daed,#e7f6e9); box-sizing:border-box; }
img { display:block; width:100%; height:100%; object-fit:cover; }
.character-portrait img { position:absolute; left:50%; top:0; width:200%; height:auto; max-width:none; transform:translateX(-50%); }
.round { padding:3px; border-radius:50%; border-color:#8c7762; }.round .social-avatar-window { border-radius:50%; border-color:#fffdf2; }
</style>
