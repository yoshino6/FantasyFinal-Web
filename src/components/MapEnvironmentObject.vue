<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import { environmentGeometry, environmentSpriteStyle, environmentDirectionalSprite, ENVIRONMENT_OVERFLOW_OPACITY, type EnvironmentObjectView } from '../map-environment';
const props = defineProps<{ object: EnvironmentObjectView; cellSize: number; origin: { x: number; y: number }; depth: number; perceptionClip: string; overlapMask?: CSSProperties }>();
const geometry = computed(() => environmentGeometry(props.object, props.cellSize));
const direction = computed(() => environmentDirectionalSprite(props.object.assetKey, props.object)?.direction);
const art = computed(() => ({ ...environmentSpriteStyle(props.object.assetKey, props.object), transform: `rotate(${geometry.value.rotation}deg)`, transformOrigin: '50% 50%' }));
const sprite = computed(() => ({ ...art.value, left: `${props.origin.x + geometry.value.sprite.left}px`, top: `${props.origin.y + geometry.value.sprite.top}px`, width: `${geometry.value.sprite.width}px`, height: `${geometry.value.sprite.height}px` }));
const maskStyle = (cell: typeof geometry.value.cells[number]) => ({ left: `${props.origin.x + cell.left}px`, top: `${props.origin.y + cell.top}px`, width: `${cell.width}px`, height: `${cell.height}px` });
const maskedSpriteStyle = (cell: typeof geometry.value.cells[number]) => ({ ...art.value, left: `${geometry.value.sprite.left - cell.left}px`, top: `${geometry.value.sprite.top - cell.top}px`, width: `${geometry.value.sprite.width}px`, height: `${geometry.value.sprite.height}px` });
</script>

<template>
  <span class="map-environment-object" :style="{ zIndex: depth, clipPath: perceptionClip, ...overlapMask }" :data-environment-id="object.id" :data-template-id="object.templateId" :data-state="object.state" :data-x="object.x" :data-y="object.y" :data-footprint-width="object.width" :data-footprint-height="object.height" :data-footprint-count="geometry.cells.length" :data-sprite-direction="direction" :data-sprite-rotation="geometry.rotation" :data-standing="geometry.standing">
    <span v-if="geometry.standing" class="map-environment-sprite" :style="sprite" aria-hidden="true" />
    <template v-else>
    <span class="map-environment-sprite map-environment-overflow" :style="{ ...sprite, opacity: ENVIRONMENT_OVERFLOW_OPACITY }" aria-hidden="true" />
    <span v-for="cell in geometry.cells" :key="`${cell.x}:${cell.y}`" class="map-environment-opaque-cell" :style="maskStyle(cell)" aria-hidden="true"><span class="map-environment-sprite" :style="maskedSpriteStyle(cell)" /></span>
    </template>
  </span>
</template>
