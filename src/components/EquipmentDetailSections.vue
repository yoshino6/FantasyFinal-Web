<script setup lang="ts">
import { computed } from 'vue';
import type { EquipmentDetailSection, EquipmentDetailSet } from '../api';

const props = defineProps<{
  sections: readonly EquipmentDetailSection[];
  sets: readonly EquipmentDetailSet[];
  appearanceName?: string;
  armorType?: string;
}>();

const displaySections = computed(() => {
  const armorLines: string[] = [];
  const sections = props.sections.flatMap(section => {
    let lines = section.lines;
    if (section.key === 'special') {
      armorLines.push(...lines.filter(line => line.startsWith('甲类逐件乘算：')).map(line => props.armorType ? `${props.armorType}：${line.slice('甲类逐件乘算：'.length)}` : line));
      lines = lines.filter(line => !line.startsWith('甲类逐件乘算：') && line.trim() && line.trim() !== '无');
    }
    if (section.key === 'basic' && props.appearanceName && !lines.some(line => line.startsWith('外观：'))) {
      lines = [...lines, `外观：${props.appearanceName}`];
    }
    const title = section.key === 'secondary' ? '副属性' : section.key === 'description' ? '装备说明' : section.title;
    return lines.length ? [{ ...section, title, lines }] : [];
  });
  if (armorLines.length) sections.push({ key: 'armor', title: '甲类效果', lines: armorLines });
  return sections;
});
</script>

<template>
  <div class="equipment-details-sections">
    <section v-for="section in displaySections" :key="section.key" class="equipment-details-section" :data-section="section.key" :aria-label="section.title">
      <h3>{{ section.title }}</h3>
      <ul><li v-for="(line, index) in section.lines" :key="index">{{ line }}</li></ul>
    </section>
    <section v-if="sets.length" class="equipment-details-section equipment-details-set-section" data-section="sets" aria-label="套装效果">
      <h3>套装效果</h3>
      <article v-for="set in sets" :key="set.code" class="equipment-details-set" :data-set-code="set.code" :data-set-count="set.count">
        <h4>{{ set.name }} <span>{{ set.count }}/{{ set.maxPieces }}件</span></h4>
        <div v-for="threshold in set.thresholds" :key="threshold.pieces" class="equipment-details-set-threshold" :class="threshold.active ? 'is-active' : 'is-inactive'" :data-pieces="threshold.pieces" :data-active="threshold.active">
          <p class="equipment-details-set-state">{{ threshold.pieces }}件套 · {{ threshold.active ? '已激活' : '未激活' }}</p>
          <ul><li v-for="(line, index) in threshold.lines" :key="index">{{ line }}</li></ul>
        </div>
      </article>
    </section>
  </div>
</template>
