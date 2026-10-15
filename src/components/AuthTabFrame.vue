<script setup lang="ts">
defineProps<{ active: boolean }>();
</script>

<template>
  <svg class="auth-tab-frame" viewBox="0 0 320 100" preserveAspectRatio="none" aria-hidden="true" :class="{ selected: active }">
    <path d="M5 98V25L12 20V14L23 8H294L306 15V23L315 28V98Z" class="tab-shadow" />
    <path d="M8 97V27Q17 26 17 16Q17 10 30 10H288Q303 10 303 20Q303 28 312 29V97Z" class="tab-fill" />
    <path d="M16 94V32Q27 31 27 20H291Q291 34 304 35V94" class="tab-inset" />
    <path d="M22 18H291M10 96H312" class="tab-shine" />
    <g class="tab-flourish">
      <path d="M29 79q16-12 25-2q-16 8-25 2Zm8-12q-7-17 7-21q6 17-7 21Zm-6 14q-18 3-15 14q15-1 15-14Zm8-5q12-20 22-12q-6 14-22 12Z" />
      <path d="M289 79q-16-12-25-2q16 8 25 2Zm-8-12q7-17-7-21q-6 17 7 21Zm6 14q18 3 15 14q-15-1-15-14Zm-8-5q-12-20-22-12q6 14 22 12Z" />
    </g>
  </svg>
</template>

<style scoped>
.tab-shadow { fill: #986c3c; stroke: #fff3d8; stroke-width: 3; }
.tab-fill { fill: var(--auth-tab-fill, #f8efd9); stroke: #d8b77d; stroke-width: 2; transition: fill .22s ease; }
.tab-inset { fill: none; stroke: var(--auth-tab-line, #e5cda4); stroke-width: 2; }
.tab-shine { fill: none; stroke: #fff7df; stroke-width: 2; opacity: .9; }
.tab-flourish { fill: var(--auth-tab-leaf, #bea477); opacity: .18; }
.selected { --auth-tab-fill: #149ba9; --auth-tab-line: #a5e3d8; --auth-tab-leaf: #daf6e9; }
</style>
