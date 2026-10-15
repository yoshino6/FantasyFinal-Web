<script setup lang="ts">
import { computed, ref } from 'vue';
import { professionIconUrl, resolveProfessionIconCode } from '../profession-icons';

const props = withDefaults(defineProps<{ code?: string | null; name?: string | null; size?: number }>(), { size: 36 });
const failedSource = ref('');
const professionCode = computed(() => resolveProfessionIconCode(props.code, props.name));
const source = computed(() => professionIconUrl(professionCode.value));
const iconCode = computed(() => failedSource.value === source.value ? 'novice' : professionCode.value);
const displaySource = computed(() => professionIconUrl(iconCode.value));
</script>

<template>
  <img class="profession-icon" :data-profession-icon="iconCode" :src="displaySource" alt="" aria-hidden="true" :width="size" :height="size" :style="{ width: `${size}px`, height: `${size}px` }" draggable="false" @error="failedSource = source" />
</template>

<style scoped>
.profession-icon { display:inline-block; flex:none; max-width:100%; max-height:100%; object-fit:contain; vertical-align:middle; pointer-events:none; }
</style>
