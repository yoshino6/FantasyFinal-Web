<script setup lang="ts">
import { computed } from 'vue';
import { gameAssetUrl } from '../game-assets';

export type TabArtKey = 'profile' | 'equipment' | 'skills' | 'evolution' | 'advanced-profession' | 'all-items' | 'consumables' | 'materials' | 'friends' | 'oath' | 'party' | 'overview' | 'market' | 'home' | 'paw' | 'chat' | 'mail' | 'forest';
const props = withDefaults(defineProps<{ name: TabArtKey; size?: number }>(), { size: 28 });
const source = computed(() => gameAssetUrl(`/assets/light-anime/tab-icons-imagegen-v1/${props.name}.png`));
</script>

<template>
  <img class="tab-art-icon" :data-tab-art="name" :src="source" alt="" aria-hidden="true" :width="size" :height="size" :style="{ width: `${size}px`, height: `${size}px` }" draggable="false" />
</template>

<style scoped>
.tab-art-icon { display:inline-block; flex:none; max-width:100%; object-fit:contain; vertical-align:middle; pointer-events:none; }
</style>
