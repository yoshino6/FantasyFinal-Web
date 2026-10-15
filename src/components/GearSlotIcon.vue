<script setup lang="ts">
import { gameUiGearIconStyle } from '../game-ui-item-icons';
defineProps<{ slot: string }>();
</script>

<template>
  <span class="gear-slot-icon" :data-gear-slot="slot" aria-hidden="true">
    <span class="gear-slot-sprite" :style="gameUiGearIconStyle(slot)"></span>
  </span>
</template>

<style scoped>
.gear-slot-icon { position: relative; display: block; width: 100%; height: 100%; padding: 7px; container-type: size; filter: drop-shadow(0 1px 0 #fffaf0); }
.gear-slot-sprite { position: absolute; top: 50%; left: 50%; width: min(100cqw, 100cqh); height: min(100cqw, 100cqh); transform: translate(-50%, -50%); background-repeat: no-repeat; }
</style>
