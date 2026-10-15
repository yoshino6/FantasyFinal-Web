<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PanelPortrait } from '../api';
import { portraitAssetCandidates } from '../character-assets';
import { gameAssetUrl } from '../game-assets';

const props = withDefaults(defineProps<{
  name: string;
  id?: number | string;
  portrait?: string | PanelPortrait | null;
  size?: number | string;
  shape?: 'round' | 'square';
}>(), { size: 56, shape: 'square' });
const failed = ref(false);
watch(() => props.portrait, () => { failed.value = false; });
const personalized = computed(() => Boolean(props.portrait) && !failed.value);
const src = computed(() => personalized.value
  ? typeof props.portrait === 'string' ? props.portrait : portraitAssetCandidates(props.portrait ?? undefined, 'equipment')[0]
  : gameAssetUrl('/assets/light-anime/social-v1/avatar-neutral.webp'));
</script>

<template>
  <span class="social-avatar" :class="[shape, { personalized }]" :style="{ '--social-avatar-size': typeof size === 'number' ? size + 'px' : size }" :data-avatar-kind="personalized ? 'character' : 'unspecified'">
    <span class="social-avatar-window"><img :src="src" :alt="personalized ? `${name}的角色头像` : `${name}（未提供角色头像）`" loading="lazy" decoding="async" @error="failed = true" /></span>
  </span>
</template>

<style scoped>
.social-avatar { --social-avatar-size:56px; display:inline-grid; flex:0 0 auto; width:var(--social-avatar-size); height:var(--social-avatar-size); box-sizing:border-box; padding:4px; border:1.5px solid #b89470; border-radius:7px 11px 6px 10px; background:linear-gradient(135deg,#fffdf0,#e6d3ae 45%,#fff8df); box-shadow:0 1px 0 #ffffff,0 2px 3px #80552a22; overflow:hidden; }
.social-avatar-window { display:block; position:relative; width:100%; height:100%; overflow:hidden; border:1px solid #5dabb5; border-radius:4px 7px 3px 6px; background:linear-gradient(#98daed,#e7f6e9); box-sizing:border-box; }
img { display:block; width:100%; height:100%; object-fit:cover; }
.personalized img { position:absolute; left:50%; top:0; width:200%; height:auto; max-width:none; transform:translateX(-50%); }
.round { padding:3px; border-radius:50%; border-color:#8c7762; }.round .social-avatar-window { border-radius:50%; border-color:#fffdf2; }
</style>
