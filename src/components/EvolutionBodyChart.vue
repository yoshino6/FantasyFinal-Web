<script setup lang="ts">
defineProps<{ selectedPart?: string | null }>();
const parts = [
  { code: 'eye', name: '眼部', y: 10, side: 'right' },
  { code: 'skin', name: '表皮', y: 23, side: 'left' },
  { code: 'bone', name: '骨骼', y: 61, side: 'left' },
  { code: 'nerve', name: '神经', y: 17, side: 'right' },
  { code: 'chest', name: '胸腔', y: 25, side: 'right' },
  { code: 'organ', name: '脏器', y: 38, side: 'right' },
];
</script>

<template>
  <figure class="evolution-body-chart" aria-label="身体观测部位示意图">
    <figcaption>身体观测图</figcaption>
    <div class="body-chart-illustration"><img src="/assets/light-anime/growth-v1/evolution-body-chart.webp" alt="显示骨骼与内脏位置的身体观测插画" loading="lazy" />
    <span v-for="part in parts" :key="part.code" class="body-chart-label" :class="[part.side, { selected: selectedPart === part.code || selectedPart === part.name }]" :style="{ top: `${part.y}%` }">{{ part.name }}</span></div>
    <small>选择右侧记录查看变异详情</small>
  </figure>
</template>

<style scoped>
.evolution-body-chart { position: relative; align-self: start; min-width: 0; margin: 0; padding: 15px 2px 27px; overflow: hidden; border: 8px solid transparent; border-image: url('/assets/light-anime/paper-frame.svg') 24 fill / 8px; background: #fbefd5; }
figcaption { position: relative; z-index: 2; text-align: center; color: #443738; font: 700 18px/1.3 'KaiTi', 'STKaiti', serif; }
.body-chart-illustration { position: relative; margin: 10px 0; }
img { display: block; width: 100%; height: auto; object-fit: contain; object-position: center; mix-blend-mode: multiply; }
.body-chart-label { position: absolute; z-index: 2; padding: 3px 5px; border: 1px solid #a48c69; border-radius: 2px; color: #514037; background: #fff7e3ed; font: 700 12px/1.4 'KaiTi', 'STKaiti', serif; }
.body-chart-label.left { left: 0; }.body-chart-label.right { right: 0; }
.body-chart-label::after { content: ''; position: absolute; top: 50%; width: 12px; border-top: 1px solid #9a805e; }.left::after { left: 100%; }.right::after { right: 100%; }
.body-chart-label.selected { color: #157a80; border-color: #3ca4a6; background: #e1f4e6; }
small { display: block; color: #8b765d; text-align: center; font-size: 10px; line-height: 1.5; }
@media (max-width: 600px) { figcaption { font-size: 15px; }.evolution-body-chart { padding-top: 10px; border-width: 5px; }.body-chart-label { padding: 2px; font-size: 10px; } }
</style>
