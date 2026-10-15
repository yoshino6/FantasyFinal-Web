<script setup lang="ts">
import { gameUiItemIconStyle } from '../game-ui-item-icons';
</script>

<template>
  <span class="explore-potion-glyph" :style="gameUiItemIconStyle('potion')" aria-hidden="true"></span>
</template>

<style scoped>
.explore-potion-glyph { display: inline-block; flex-shrink: 0; width: 29px; height: 29px; background-repeat: no-repeat; vertical-align: middle; }
</style>
