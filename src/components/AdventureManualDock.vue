<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type ManualSection = 'tasks' | 'footprints' | 'codex' | 'warrants';
type DockPosition = { x: number; y: number };

const props = withDefaults(defineProps<{ sections?: ManualSection[] }>(), {
  sections: () => ['tasks', 'footprints', 'codex', 'warrants']
});
const emit = defineEmits<{
  (event: 'select', section: ManualSection): void;
}>();

const actionDefinitions: { key: ManualSection; label: string; image: string; description: string }[] = [
  { key: 'tasks', label: '任务', image: '/assets/ui/manual/tasks.png', description: '任务与悬赏' },
  { key: 'footprints', label: '足迹', image: '/assets/ui/manual/footprints.png', description: '足迹与成就' },
  { key: 'codex', label: '图鉴', image: '/assets/ui/manual/codex.png', description: '图鉴' },
  { key: 'warrants', label: '通缉', image: '/assets/ui/manual/warrants.png', description: '通缉' }
];
const storageKey = 'fantasy-final.adventure-manual-position';
const edge = 12;
const gap = 6;
const position = ref<DockPosition>({ x: 0.02, y: 0.52 });
const viewport = ref({ width: 390, height: 780 });
const expanded = ref(false);
const dragging = ref(false);
let ignorePointerClickUntil = 0;
let drag: {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
} | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const actions = computed(() => actionDefinitions.filter(item => props.sections.includes(item.key)));
const buttonSize = computed(() => viewport.value.width >= 600 ? 72 : 66);
const verticalBounds = computed(() => {
  const min = Math.min(72, Math.max(edge, viewport.value.height - buttonSize.value - edge));
  // The fixed bottom menu occupies approximately 90 px including the safe area.
  const max = Math.max(min, viewport.value.height - buttonSize.value - 100);
  return { min, max };
});
const horizontalBounds = computed(() => ({
  min: edge,
  max: Math.max(edge, viewport.value.width - buttonSize.value - edge)
}));
const trackWidth = computed(() => Math.max(0, Math.min(
  actions.value.length * buttonSize.value + Math.max(0, actions.value.length - 1) * gap,
  viewport.value.width - edge * 2 - buttonSize.value - gap
)));
const expandedWidth = computed(() => buttonSize.value + (actions.value.length ? gap + trackWidth.value : 0));
const currentX = computed(() => horizontalBounds.value.min +
  (horizontalBounds.value.max - horizontalBounds.value.min) * position.value.x);
const currentY = computed(() => verticalBounds.value.min +
  (verticalBounds.value.max - verticalBounds.value.min) * position.value.y);
const dockLeft = computed(() => expanded.value && actions.value.length
  ? clamp(currentX.value, edge, Math.max(edge, viewport.value.width - expandedWidth.value - edge))
  : currentX.value);
const dockStyle = computed(() => ({
  left: `${dockLeft.value}px`,
  top: `${currentY.value}px`,
  '--manual-button-size': `${buttonSize.value}px`,
  '--manual-track-width': `${trackWidth.value}px`
}));

function updateViewport() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight };
}

function savePosition() {
  try { localStorage.setItem(storageKey, JSON.stringify(position.value)); }
  catch { /* Private browsing can block storage. The dock still works for this session. */ }
}

function updatePosition(x: number, y: number) {
  const xRange = horizontalBounds.value.max - horizontalBounds.value.min;
  const yRange = verticalBounds.value.max - verticalBounds.value.min;
  position.value = {
    x: xRange ? clamp((x - horizontalBounds.value.min) / xRange, 0, 1) : 0,
    y: yRange ? clamp((y - verticalBounds.value.min) / yRange, 0, 1) : 0
  };
}

function beginDrag(event: PointerEvent) {
  if (event.button !== 0 || drag) return;
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: dockLeft.value,
    originY: currentY.value,
    moved: false
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const deltaX = event.clientX - drag.startX;
  const deltaY = event.clientY - drag.startY;
  if (!drag.moved && Math.hypot(deltaX, deltaY) < 7) return;
  drag.moved = true;
  dragging.value = true;
  const maxX = expanded.value && actions.value.length
    ? Math.max(edge, viewport.value.width - expandedWidth.value - edge)
    : horizontalBounds.value.max;
  updatePosition(clamp(drag.originX + deltaX, edge, maxX),
    clamp(drag.originY + deltaY, verticalBounds.value.min, verticalBounds.value.max));
  event.preventDefault();
}

function endDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (drag.moved) {
    ignorePointerClickUntil = Date.now() + 400;
    savePosition();
  }
  drag = null;
  dragging.value = false;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
}

function cancelDrag() {
  drag = null;
  dragging.value = false;
}

function toggle(event: MouseEvent) {
  if (event.detail > 0 && Date.now() < ignorePointerClickUntil) return;
  expanded.value = !expanded.value;
}

function moveWithKeyboard(event: KeyboardEvent) {
  const direction = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
  }[event.key];
  if (!direction) return;
  event.preventDefault();
  const step = event.shiftKey ? 32 : 8;
  const maxX = expanded.value && actions.value.length
    ? Math.max(edge, viewport.value.width - expandedWidth.value - edge)
    : horizontalBounds.value.max;
  updatePosition(clamp(dockLeft.value + direction[0] * step, edge, maxX),
    clamp(currentY.value + direction[1] * step, verticalBounds.value.min, verticalBounds.value.max));
  savePosition();
}

function select(section: ManualSection) {
  expanded.value = false;
  emit('select', section);
}

onMounted(() => {
  updateViewport();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as DockPosition | null;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      position.value = { x: clamp(saved.x, 0, 1), y: clamp(saved.y, 0, 1) };
    }
  } catch { /* Invalid or unavailable storage uses the default position. */ }
  window.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('resize', updateViewport);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport);
  window.visualViewport?.removeEventListener('resize', updateViewport);
});
</script>

<template>
  <nav
    class="adventure-manual-dock"
    :class="{ 'is-expanded': expanded, 'is-dragging': dragging }"
    :style="dockStyle"
    aria-label="冒险手册"
  >
    <button
      class="manual-circle manual-main"
      type="button"
      :aria-expanded="expanded"
      aria-controls="adventure-manual-actions"
      :aria-label="expanded ? '收起冒险手册；方向键可移动位置' : '展开冒险手册；方向键可移动位置'"
      @pointerdown="beginDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="cancelDrag"
      @lostpointercapture="cancelDrag"
      @keydown="moveWithKeyboard"
      @click="toggle"
    >
      <img class="manual-art" src="/assets/ui/manual/manual.png" alt="" />
      <span class="manual-label">手册</span>
    </button>
    <Transition name="manual-actions">
      <div v-show="expanded && actions.length" id="adventure-manual-actions" class="manual-actions">
        <button
          v-for="action in actions"
          :key="action.key"
          class="manual-circle manual-action"
          type="button"
          :title="action.description"
          :aria-label="action.description"
          @click="select(action.key)"
        >
          <img class="manual-art" :src="action.image" alt="" />
          <span class="manual-label">{{ action.label }}</span>
        </button>
      </div>
    </Transition>
  </nav>
</template>

<style scoped>
.adventure-manual-dock {
  position: fixed;
  z-index: 83;
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--manual-button-size);
  width: max-content;
  max-width: calc(100vw - 24px);
  pointer-events: auto;
  transition: left .18s ease;
}
.adventure-manual-dock.is-dragging { transition: none; }
.manual-circle {
  display: flex;
  flex: 0 0 var(--manual-button-size);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: var(--manual-button-size);
  height: var(--manual-button-size);
  padding: 2px;
  border: 2px solid rgba(255, 255, 255, .94);
  border-radius: 50%;
  box-shadow: 0 6px 17px rgba(74, 57, 87, .23);
  color: #4e4480;
  background: linear-gradient(145deg, #fffbef, #e6ddfc);
  line-height: 1;
  user-select: none;
  -webkit-user-select: none;
}
.manual-circle:focus-visible { outline: 3px solid #765dc2; outline-offset: 2px; }
.manual-circle:hover { filter: brightness(1.04); }
.manual-main { color: #57447e; background: linear-gradient(145deg, #fff8e9, #e8dcfa); touch-action: none; cursor: grab; }
.is-dragging .manual-main { cursor: grabbing; }
.manual-art { display: block; width: calc(var(--manual-button-size) * .69); height: calc(var(--manual-button-size) * .69); object-fit: contain; pointer-events: none; }
.manual-label { display: block; font-size: 11px; font-weight: 800; letter-spacing: .02em; white-space: nowrap; }
.manual-actions {
  display: flex;
  flex: 0 1 var(--manual-track-width);
  gap: 6px;
  max-width: var(--manual-track-width);
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}
.manual-actions::-webkit-scrollbar { display: none; }
.manual-action:nth-child(2) { color: #725885; background: linear-gradient(145deg, #fff9f0, #f6def1); }
.manual-action:nth-child(3) { color: #466f7f; background: linear-gradient(145deg, #f6fcff, #d3ebf1); }
.manual-action:nth-child(4) { color: #8d5e65; background: linear-gradient(145deg, #fff9f2, #f4d9d9); }
.manual-actions-enter-active, .manual-actions-leave-active { transition: opacity .18s ease, transform .18s ease; }
.manual-actions-enter-from, .manual-actions-leave-to { opacity: 0; transform: translateX(-10px) scale(.92); }
@media (prefers-reduced-motion: reduce) {
  .adventure-manual-dock, .manual-actions-enter-active, .manual-actions-leave-active { transition: none; }
}
</style>
