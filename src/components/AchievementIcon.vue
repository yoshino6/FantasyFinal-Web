<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { achievementArtFor, ACHIEVEMENT_ART_FALLBACK } from '../achievement-art';
import { gameAssetUrl } from '../game-assets';

const props = defineProps<{ entry: { id: string; name: string; category: string; rarity?: string; description?: string } }>();
const source = computed(() => achievementArtFor(props.entry));
const failed = ref(false);
watch(source, () => { failed.value = false; });
</script>

<template>
  <img class="achievement-icon" :data-achievement-art="entry.id" :src="failed ? gameAssetUrl(ACHIEVEMENT_ART_FALLBACK) : source" alt="" aria-hidden="true" decoding="async" @error="failed = true" />
</template>

<style scoped>
.achievement-icon { display: block; width: 100%; height: 100%; min-width: 0; object-fit: contain; border-radius: inherit; }
</style>
