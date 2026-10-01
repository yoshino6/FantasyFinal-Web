<script setup lang="ts">
import { computed, ref } from 'vue';

export type MapPosition = {
  x: number;
  y: number;
  z?: number;
  name?: string;
};

export type MapPointAction = {
  id: string;
  label: string;
  command?: string;
  commands?: string[];
  /** 资源采集使用服务端资源出生实例编号，不使用物品 code。 */
  resourceId?: number;
  position?: MapPosition;
  tone?: 'primary' | 'soft' | 'danger';
};

export type ExploreMapPoint = {
  id: string;
  code?: string;
  name: string;
  type?: string;
  icon?: string;
  x: number;
  y: number;
  z?: number;
  description?: string;
  distance?: number;
  discovered?: boolean;
  interactable?: boolean;
  actions?: MapPointAction[];
};

type MapCell = {
  key: string;
  position: MapPosition;
  distance: number;
  isCurrent: boolean;
  isInsideMap: boolean;
  isMovable: boolean;
  points: ExploreMapPoint[];
};

export type MapBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type MapActionLock = { title: string; detail: string; countdown?: string; stopLabel?: string; stopDisabled?: boolean };

const props = withDefaults(defineProps<{
  current?: MapPosition;
  bounds?: MapBounds;
  points?: ExploreMapPoint[];
  moveRange?: number;
  sightRange?: number;
  title?: string;
  subtitle?: string;
  disabled?: boolean;
  loading?: boolean;
  actionLock?: MapActionLock | null;
}>(), {
  current: () => ({ x: 0, y: 0, name: '未知区域' }),
  points: () => [],
  moveRange: 2,
  sightRange: 3,
  title: '附近地图',
  subtitle: '选择移速范围内的格子移动，点击标记查看互动。',
  disabled: false,
  loading: false,
  actionLock: null,
});

const emit = defineEmits<{
  (event: 'move', position: MapPosition): void;
  (event: 'interact', point: ExploreMapPoint): void;
  (event: 'action', payload: { point: ExploreMapPoint; action: MapPointAction }): void;
  (event: 'selected', point: ExploreMapPoint | null): void;
  (event: 'open-region-map'): void;
  (event: 'open-auto-battle'): void;
  (event: 'stop-action'): void;
}>();

const selectedPoint = ref<ExploreMapPoint | null>(null);
// The grid is the player's actual perception square.  Keep the value supplied
// by the movement profile intact; capping it here would hide cells the player
// is allowed to perceive.
const radius = computed(() => Math.max(0, Math.floor(Number(props.sightRange) || 0)));
// The two map shortcuts each need at least a 2x2 block. When the actual
// perception square is smaller, add an outer ring of inert coordinate cells;
// these cells stay outside the player's perception and are never movable.
const gridRadius = computed(() => Math.max(2, radius.value));
const side = computed(() => gridRadius.value * 2 + 1);
const moveRange = computed(() => Math.max(0, Math.floor(Number(props.moveRange) || 0)));
const offsets = computed(() => Array.from({ length: side.value }, (_, index) => index - gridRadius.value));
// CSS grid places the first generated row at the top.  World coordinates grow
// upward, so generate positive Y offsets first to keep the visual axis correct.
const rowOffsets = computed(() => [...offsets.value].reverse());
const mapPointIndex = computed(() => {
  const result = new Map<string, ExploreMapPoint[]>();
  for (const point of props.points) {
    const key = `${point.x}:${point.y}`;
    const existing = result.get(key) ?? [];
    existing.push(point);
    result.set(key, existing);
  }
  return result;
});
const cells = computed<MapCell[]>(() => rowOffsets.value.flatMap((dy) => offsets.value.map((dx) => {
  const position = { x: props.current.x + dx, y: props.current.y + dy, z: props.current.z };
  // The game movement service counts one cardinal step per point.  Keep the
  // perception square visible, but only enable cells the server can reach in
  // the current movement budget (Manhattan distance).
  const distance = Math.abs(dx) + Math.abs(dy);
  const key = `${position.x}:${position.y}`;
  const bounds = props.bounds;
  const isInsideMap = !bounds
    || (position.x >= bounds.minX && position.x <= bounds.maxX
      && position.y >= bounds.minY && position.y <= bounds.maxY
      && (position.z === undefined || (position.z >= bounds.minZ && position.z <= bounds.maxZ)));
  return {
    key,
    position,
    distance,
    isCurrent: dx === 0 && dy === 0,
    isInsideMap,
    // The server resolves the destination region from the coordinate.  Keep
    // boundary cells inside the movement range clickable so adjacent map
    // areas can be entered instead of stopping at the current rectangle.
    isMovable: distance > 0 && distance <= moveRange.value,
    points: mapPointIndex.value.get(key) ?? [],
  };
})));
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${side.value}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${side.value}, minmax(0, 1fr))`
}));
type GridBlock = { row: number; column: number; span: number };
// Keep the region map shortcut in the upper-right corner. Prefer a 3x3 block,
// then 2x2; the outer inert ring guarantees the minimum touch target.
const mapButtonPlacement = computed<GridBlock | null>(() => {
  const total = side.value;
  const maxSpan = Math.min(3, total);
  const isSafeBlock = (row: number, column: number, span: number) => {
    for (let y = row; y < row + span; y += 1) {
      for (let x = column; x < column + span; x += 1) {
        const cell = cells.value[y * total + x];
        if (!cell || cell.isCurrent || cell.isMovable || cell.points.length > 0) return false;
      }
    }
    return true;
  };
  for (let span = maxSpan; span >= 2; span -= 1) {
    for (let row = 0; row <= total - span; row += 1) {
      for (let column = total - span; column >= 0; column -= 1) {
        if (isSafeBlock(row, column, span)) return { row, column, span };
      }
    }
  }
  // The inert outer ring makes this fallback safe while guaranteeing the
  // minimum 2x2 hit target requested by the mobile layout.
  return { row: 0, column: total - 2, span: 2 };
});
const mapButtonStyle = computed(() => {
  const block = mapButtonPlacement.value;
  return block ? { gridColumn: `${block.column + 1} / span ${block.span}`, gridRow: `${block.row + 1} / span ${block.span}` } : {};
});
// Keep auto battle in the lower-left corner, separate from the upper-right
// region map shortcut. Prefer 3x3, then 2x2.
const autoButtonPlacement = computed<GridBlock | null>(() => {
  const total = side.value;
  const mapBlock = mapButtonPlacement.value;
  if (!mapBlock) return null;
  const occupied = (row: number, column: number, span: number) => {
    for (let y = row; y < row + span; y += 1) {
      for (let x = column; x < column + span; x += 1) {
        const cell = cells.value[y * total + x];
        if (!cell || cell.isCurrent || cell.isMovable || cell.points.length > 0) return true;
        if (y >= mapBlock.row && y < mapBlock.row + mapBlock.span && x >= mapBlock.column && x < mapBlock.column + mapBlock.span) return true;
      }
    }
    return false;
  };
  for (let span = Math.min(3, total); span >= 2; span -= 1) {
    const row = total - span;
    for (let column = 0; column <= total - span; column += 1) {
      if (!occupied(row, column, span)) return { row, column, span };
    }
  }
  return { row: total - 2, column: 0, span: 2 };
});
const autoButtonStyle = computed(() => {
  const block = autoButtonPlacement.value;
  return block ? { gridColumn: `${block.column + 1} / span ${block.span}`, gridRow: `${block.row + 1} / span ${block.span}` } : {};
});
const pointNumbers = computed(() => new Map(props.points.map((point, index) => [point.id, index + 1])));
const pointIsInteractive = (point: ExploreMapPoint) => point.interactable !== false || Boolean(point.actions?.length);

const choosePoint = (point: ExploreMapPoint) => {
  // 感知范围内的特殊格先打开操作菜单；“前往”或具体互动操作再由菜单决定。
  if (props.disabled || props.loading || !pointIsInteractive(point)) return;
  selectedPoint.value = point;
  emit('selected', point);
};

const closePoint = () => {
  selectedPoint.value = null;
  emit('selected', null);
};

const moveTo = (cell: MapCell) => {
  if (props.disabled || props.loading || !cell.isMovable) return;
  emit('move', cell.position);
};

const handleCellClick = (cell: MapCell) => {
  if (props.disabled || props.loading) return;
  const point = cell.points.find(pointIsInteractive);
  if (point) { choosePoint(point); return; }
  moveTo(cell);
};

const runPointAction = (point: ExploreMapPoint, action: MapPointAction) => {
  emit('action', { point, action });
  closePoint();
};

const defaultInteract = () => {
  if (!selectedPoint.value) return;
  emit('interact', selectedPoint.value);
  closePoint();
};
</script>

<template>
  <section class="world-map-panel card-surface" aria-label="探索地图">
    <div class="world-map-heading">
      <div>
        <h3>{{ title }}</h3>
        <p class="world-map-location-line"><strong>{{ current.name || '未命名区域' }}</strong></p>
      </div>
    </div>

    <div class="world-map-legend" aria-label="地图图例">
      <div class="world-map-legend-items">
        <span><i class="legend-dot current" />当前</span>
        <span><i class="legend-dot movable" />可移动</span>
        <span><i class="legend-dot point" />地点</span>
      </div>
      <div class="world-map-range world-map-heading-range" aria-label="移动与感知范围">
        <span>移 {{ moveRange }} 格</span>
        <span>感知 {{ radius }} 格</span>
      </div>
    </div>

    <div class="world-map-grid-shell">
      <div class="world-map-coordinate world-map-grid-coordinate"><span>当前坐标</span><strong>({{ current.x }}, {{ current.y }}<template v-if="current.z !== undefined">, {{ current.z }}</template>)</strong></div>
      <div class="world-map-grid-overlay" :style="gridStyle" aria-label="地图快捷设置">
        <button v-if="mapButtonPlacement" type="button" class="world-map-sidebar-button" :style="mapButtonStyle" :disabled="disabled || loading" aria-label="打开世界地图" @click="emit('open-region-map')">
          <span aria-hidden="true">🗺</span><small>地图</small>
        </button>
        <button v-if="autoButtonPlacement" type="button" class="world-map-auto-button" :style="autoButtonStyle" :disabled="disabled || loading" aria-label="打开自动战斗设置" @click="emit('open-auto-battle')">
          <span aria-hidden="true">⚔</span><small>自动战斗</small>
        </button>
      </div>
      <div class="world-map-grid" :style="gridStyle" role="grid" aria-label="附近方格地图">
      <button
        v-for="cell in cells"
        :key="cell.key"
        type="button"
        class="world-map-cell"
        :class="{
          'is-current': cell.isCurrent,
          'is-movable': cell.isMovable && !cell.isCurrent,
          'has-point': cell.points.length > 0,
          'has-interactive-point': cell.points.some(pointIsInteractive),
          'is-out-of-range': !cell.isCurrent && !cell.isMovable,
          'is-disabled': disabled || loading || (!cell.points.length && !cell.isCurrent && !cell.isMovable),
        }"
        :disabled="disabled || loading || (!cell.points.length && !cell.isCurrent && !cell.isMovable)"
        :aria-label="cell.points.length ? `查看 ${cell.points.map(point => point.name).join('、')}` : (cell.isCurrent ? '当前位置' : (cell.isMovable ? `移动到 ${cell.position.x}, ${cell.position.y}` : `当前地图外或不可移动 ${cell.position.x}, ${cell.position.y}`))"
        role="gridcell"
        @click="handleCellClick(cell)"
      >
        <span v-if="cell.isCurrent" class="map-player-marker" aria-label="玩家当前位置">●</span>
        <span v-if="cell.points.length" class="map-point-stack" :class="`point-count-${Math.min(cell.points.length, 4)}`">
          <span v-for="(point, pointIndex) in cell.points" :key="point.id" class="map-point-visual" :class="`point-index-${pointIndex}`" :title="point.name">
            <span class="map-point-icon" aria-hidden="true">{{ point.icon || '✦' }}</span>
            <span class="map-point-marker">{{ pointNumbers.get(point.id) }}</span>
            <small>{{ point.name }}</small>
          </span>
        </span>
        <span v-else-if="cell.isMovable" class="move-arrow" aria-hidden="true">＋</span>
      </button>
      </div>
      <div v-if="actionLock" class="world-map-action-lock">
        <div class="world-map-action-card" role="status" aria-live="off">
          <strong>{{ actionLock.title }}</strong>
          <span>{{ actionLock.detail }}</span>
          <p v-if="actionLock.countdown">剩余 <b>{{ actionLock.countdown }}</b></p>
          <button v-if="actionLock.stopLabel" type="button" :disabled="actionLock.stopDisabled" @click="emit('stop-action')">{{ actionLock.stopLabel }}</button>
        </div>
      </div>
    </div>

    <div v-if="points.length" class="nearby-target-list" aria-label="感知到的目标">
      <p class="nearby-target-title">感知目标</p>
      <div v-for="(point, index) in points" :key="`target:${point.id}`" class="nearby-target">
        <span class="nearby-target-number">{{ index + 1 }}</span>
        <span class="nearby-target-icon">{{ point.icon || '✦' }}</span>
        <span class="nearby-target-copy"><strong>{{ point.name }}</strong><small>{{ point.type || '附近目标' }} · {{ point.distance ?? 0 }} 格</small></span>
        <span v-if="point.actions?.length" class="nearby-target-actions">
          <button v-for="action in point.actions" :key="`${point.id}:${action.id}`" type="button" class="nearby-target-action" :class="`tone-${action.tone || 'soft'}`" :disabled="disabled || loading" @click.stop="runPointAction(point, action)">{{ action.label }}</button>
        </span>
      </div>
    </div>

    <div v-if="loading" class="world-map-loading">正在更新附近地图…</div>

    <div v-if="selectedPoint" class="map-point-dialog-backdrop" role="presentation" @click.self="closePoint">
      <div class="map-point-dialog" role="dialog" aria-modal="true" :aria-label="selectedPoint.name">
        <button type="button" class="dialog-close" aria-label="关闭地点详情" @click="closePoint">×</button>
        <span class="dialog-point-icon">{{ selectedPoint.icon || '✦' }}</span>
        <p class="eyebrow">{{ selectedPoint.type || '附近地点' }}</p>
        <h4>{{ selectedPoint.name }}</h4>
        <p class="dialog-description">{{ selectedPoint.description || '这里似乎有值得探索的线索。' }}</p>
        <div v-if="selectedPoint.actions?.length" class="dialog-actions">
          <button v-for="action in selectedPoint.actions" :key="action.id" type="button" class="map-dialog-button" :class="`tone-${action.tone || 'soft'}`" @click="runPointAction(selectedPoint, action)">{{ action.label }}</button>
        </div>
        <button v-else type="button" class="map-dialog-button tone-primary" @click="defaultInteract">查看互动</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.world-map-panel { position: relative; padding: 12px 14px 14px; overflow: hidden; }
.world-map-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 7px; }
.world-map-heading h3 { margin: 0; font-size: 16px; }
.world-map-location-line { display: flex; align-items: center; gap: 7px; margin: 3px 0 0; color: var(--muted, #827487); font-size: 10px; }
.world-map-location-line strong { color: #66596f; font-size: 11px; font-weight: 600; }
.world-map-coordinate { display: flex; align-items: baseline; gap: 8px; color: #8c7898; }
.world-map-coordinate span { font-size: 11px; }
.world-map-coordinate strong { color: #5b4b68; font-size: 20px; letter-spacing: .04em; }
.world-map-range { display: flex; flex: 0 0 auto; align-items: center; gap: 5px; color: #8b769f; font-size: 10px; white-space: nowrap; }
.world-map-range span { padding: 4px 6px; background: #f6f0ff; border-radius: 7px; }
.world-map-heading-range { align-self: center; }
.world-map-legend { display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; gap: 6px; margin-bottom: 7px; color: var(--muted, #827487); font-size: 9px; }
.world-map-legend-items { display: flex; align-items: center; flex-wrap: nowrap; gap: 5px 9px; min-width: 0; }
.world-map-legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.legend-dot.current { background: var(--coral, #ed806f); box-shadow: 0 0 0 3px rgba(237, 128, 111, .16); }
.legend-dot.movable { background: #d6c9f3; }
.legend-dot.point { background: #f2c84b; box-shadow: 0 0 0 3px rgba(242, 200, 75, .16); }
.world-map-grid-shell { position: relative; display: block; width: min(100%, 480px); max-width: 100%; height: auto; min-width: 0; min-height: 0; flex: 0 0 auto; margin: 0 auto; aspect-ratio: 1 / 1; }
.world-map-action-lock { position: absolute; z-index: 6; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding: clamp(10px, 5vw, 28px); background: rgba(51, 43, 65, .48); border-radius: 14px; backdrop-filter: blur(2px); }
.world-map-action-card { display: grid; justify-items: center; gap: 7px; width: min(100%, 340px); padding: 15px 12px; color: #463c59; background: rgba(255, 251, 246, .94); border: 1px solid rgba(255, 255, 255, .9); border-radius: 17px; box-shadow: 0 12px 30px rgba(40, 31, 53, .25); text-align: center; }
.world-map-action-card strong { font-size: clamp(14px, 3vw, 18px); }
.world-map-action-card span { color: #756a81; font-size: 11px; }
.world-map-action-card p { margin: 0; font-size: 12px; }
.world-map-action-card p b { color: #b35476; font-size: clamp(18px, 5vw, 25px); }
.world-map-action-card button { min-width: 116px; min-height: 38px; padding: 7px 16px; color: white; background: #bd6778; border-radius: 11px; font-weight: 700; }
.world-map-action-card button:disabled { opacity: .55; }
.world-map-grid { position: absolute; inset: 0; display: grid; grid-auto-flow: row; grid-auto-rows: minmax(0, 1fr); gap: 3px; width: 100%; height: 100%; min-width: 0; min-height: 0; aspect-ratio: 1 / 1; margin: 0; padding: 4px; background: rgba(243, 233, 226, .62); border: 1px solid rgba(255, 255, 255, .75); border-radius: 14px; }
.world-map-grid-coordinate { position: absolute; z-index: 3; top: 8px; left: 8px; margin: 0; padding: 4px 7px; color: #7c6a88; background: rgba(255, 252, 248, .84); border-radius: 8px; pointer-events: none; }
.world-map-grid-coordinate strong { color: #51415f; font-size: 20px; font-weight: 800; }
.world-map-grid-overlay { position: absolute; z-index: 4; inset: 0; display: grid; gap: 3px; padding: 4px; pointer-events: none; }
.world-map-sidebar-button { display: grid; place-items: center; align-content: center; min-width: 0; min-height: 0; width: 100%; height: 100%; padding: 3px; color: #f2f9ff; background: linear-gradient(145deg, rgba(38, 119, 194, .96), rgba(53, 157, 218, .96)); border: 1px solid rgba(197, 231, 255, .95); border-radius: 7px; font-size: clamp(24px, 5vw, 42px); font-weight: 700; line-height: 1; cursor: pointer; pointer-events: auto; }
.world-map-sidebar-button small { margin-top: 3px; font-size: clamp(13px, 2.6vw, 18px); line-height: 1.05; }
.world-map-sidebar-button:hover:not(:disabled) { color: #fff; background: linear-gradient(145deg, #1d73be, #2e9edc); box-shadow: 0 6px 16px rgba(29, 115, 190, .28); }
.world-map-sidebar-button:disabled { cursor: not-allowed; opacity: .52; }
.world-map-auto-button { display: grid; place-items: center; align-content: center; min-width: 0; min-height: 0; width: 100%; height: 100%; padding: 3px; color: #fff7f5; background: linear-gradient(145deg, rgba(225, 126, 117, .96), rgba(245, 164, 141, .96)); border: 1px solid rgba(255, 223, 215, .95); border-radius: 7px; font-size: clamp(24px, 5vw, 42px); font-weight: 700; line-height: 1; cursor: pointer; pointer-events: auto; }
.world-map-auto-button small { margin-top: 3px; font-size: clamp(12px, 2.4vw, 17px); line-height: 1.05; }
.world-map-auto-button:hover:not(:disabled) { background: linear-gradient(145deg, #d96c68, #ec9482); box-shadow: 0 6px 16px rgba(210, 111, 104, .28); }
.world-map-auto-button:disabled { cursor: not-allowed; opacity: .52; }
.world-map-cell { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; min-width: 0; min-height: 0; aspect-ratio: 1 / 1; padding: 2px; color: #b8a9b4; background: rgba(255, 252, 248, .72); border: 1px solid rgba(225, 215, 211, .75); border-radius: 6px; cursor: default; transition: transform .15s ease, background .15s ease, border-color .15s ease; }
.world-map-cell:disabled { opacity: 1; }
.world-map-cell.is-movable { color: #a495cc; background: rgba(242, 238, 255, .78); cursor: pointer; }
.world-map-cell.is-movable:hover { z-index: 1; border-color: #aa98da; transform: translateY(-1px); box-shadow: 0 6px 12px rgba(110, 86, 145, .14); }
.world-map-cell.has-point { color: #77561d; background: linear-gradient(145deg, #f8dc72, #f2bf45); border-color: rgba(255, 235, 146, .98); box-shadow: inset 0 0 0 1px rgba(255,255,255,.34), 0 3px 8px rgba(194, 145, 31, .18); }
.world-map-cell.has-point.is-movable { background: linear-gradient(145deg, #f8dc72, #f2bf45); border-color: rgba(255, 235, 146, .98); }
.world-map-cell.has-interactive-point { cursor: pointer; }
.world-map-cell.is-out-of-range { color: #c9bec8; background: rgba(248, 245, 243, .45); border-color: rgba(225, 215, 211, .46); cursor: not-allowed; }
.world-map-cell.is-current { color: white; background: linear-gradient(145deg, #ee8978, #e7a47c); border-color: transparent; box-shadow: 0 7px 14px rgba(231, 131, 111, .27); }
.world-map-cell.is-disabled { cursor: not-allowed; }
.map-player-marker { display: grid; place-items: center; flex: 0 0 auto; box-sizing: border-box; width: clamp(23px, 5vw, 38px); height: clamp(23px, 5vw, 38px); aspect-ratio: 1 / 1; color: #fff9eb; background: rgba(155, 65, 78, .23); border: 2px solid rgba(255,255,255,.86); border-radius: 50%; font-size: clamp(13px, 2.8vw, 22px); line-height: 1; box-shadow: 0 0 0 4px rgba(255,255,255,.24); }
.map-point-stack { position: absolute; inset: 0; display: block; width: 100%; height: 100%; max-width: 100%; line-height: 1; pointer-events: none; }
.map-point-visual { position: absolute; inset: 0; display: block; width: 100%; height: 100%; min-width: 0; max-width: 100%; padding: 2px 4px; text-shadow: 0 1px 2px rgba(92, 61, 17, .38); }
.map-point-icon { position: absolute; top: 50%; left: 50%; z-index: 1; transform: translate(-50%, -50%); font-size: clamp(20px, 5vw, 42px); line-height: .9; }
.map-point-marker { position: absolute; top: 1px; right: 1px; z-index: 3; display: grid; place-items: center; flex: 0 0 auto; box-sizing: border-box; width: clamp(17px, 3.2vw, 26px); height: clamp(17px, 3.2vw, 26px); aspect-ratio: 1 / 1; color: #fff; background: linear-gradient(145deg, #8b5fbd, #684098); border: 2px solid rgba(255,255,255,.94); border-radius: 50%; font-size: clamp(9px, 1.8vw, 14px); font-weight: 800; line-height: 1; box-shadow: 0 2px 5px rgba(84, 45, 121, .34); }
.point-count-1 .point-index-0 .map-point-marker { top: 50%; right: auto; left: 50%; transform: translate(-50%, -50%); }
.point-count-2 .point-index-0 .map-point-marker { top: 50%; right: auto; left: 30%; transform: translate(-50%, -50%); }
.point-count-2 .point-index-1 .map-point-marker { top: 50%; right: auto; left: 70%; transform: translate(-50%, -50%); }
.point-count-3 .point-index-0 .map-point-marker { top: 28%; right: auto; left: 28%; transform: translate(-50%, -50%); }
.point-count-3 .point-index-1 .map-point-marker { top: 28%; right: auto; left: 72%; transform: translate(-50%, -50%); }
.point-count-3 .point-index-2 .map-point-marker { top: 72%; right: auto; left: 28%; transform: translate(-50%, -50%); }
.point-count-4 .point-index-0 .map-point-marker { top: 27%; right: auto; left: 27%; transform: translate(-50%, -50%); }
.point-count-4 .point-index-1 .map-point-marker { top: 27%; right: auto; left: 73%; transform: translate(-50%, -50%); }
.point-count-4 .point-index-2 .map-point-marker { top: 73%; right: auto; left: 27%; transform: translate(-50%, -50%); }
.point-count-4 .point-index-3 .map-point-marker { top: 73%; right: auto; left: 73%; transform: translate(-50%, -50%); }
.map-point-visual small { position: absolute; right: 2px; bottom: 2px; left: 2px; z-index: 2; overflow: hidden; color: #6b4b1b; font-size: clamp(9px, 2vw, 15px); font-weight: 800; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.move-arrow { color: #aa98da; font-size: clamp(15px, 3vw, 22px); font-weight: 600; opacity: .72; }
.world-map-loading, .world-map-hint { padding: 7px 0 0; color: var(--muted, #827487); font-size: 10px; text-align: center; }
.nearby-target-list { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 6px; margin-top: 12px; }
.nearby-target-title { grid-column: 1 / -1; margin: 0 2px 1px; color: #786681; font-size: 12px; font-weight: 700; }
.nearby-target { display: flex; align-items: center; gap: 7px; min-width: 0; min-height: 42px; padding: 3px 9px; color: var(--ink, #4d4354); background: #fcf5ef; border: 1px solid transparent; border-radius: 11px; text-align: left; }
.nearby-target-number { display: grid; place-items: center; flex: 0 0 22px; width: 22px; height: 22px; color: #fff; background: #bd86a5; border-radius: 50%; font-size: 11px; font-weight: 700; }
.nearby-target-icon { display: grid; place-items: center; flex: 0 0 25px; width: 25px; height: 25px; color: #b37a51; background: #fff0d6; border-radius: 8px; font-size: 14px; }
.nearby-target-copy { display: grid; flex: 1 1 auto; min-width: 0; gap: 2px; }
.nearby-target-copy strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.nearby-target-copy small { color: var(--muted, #827487); font-size: 9px; }
.nearby-target-actions { display: flex; flex: 0 1 auto; align-self: center; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 4px; max-width: min(57%, 240px); margin-left: auto; }
.nearby-target-action { display: grid; place-items: center; flex: 0 0 36px; width: 36px; min-width: 36px; height: 36px; min-height: 36px; padding: 2px; border: 1px solid transparent; border-radius: 8px; font-size: 9px; line-height: 1.1; white-space: normal; }
.nearby-target-action.tone-primary { color: #fff; background: #df8a78; }
.nearby-target-action.tone-danger { color: #fff; background: #c96772; }
.nearby-target-action.tone-soft { color: #5e5070; background: #eee8ff; }
.nearby-target-action:disabled { opacity: .6; cursor: not-allowed; }
.nearby-point-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-top: 14px; }
.nearby-point { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 10px; color: var(--ink, #4d4354); background: #fcf5ef; border: 1px solid transparent; border-radius: 13px; text-align: left; transition: border-color .15s ease, transform .15s ease; }
.nearby-point:hover:not(:disabled) { border-color: #ddcde7; transform: translateY(-1px); }
.nearby-point:disabled { opacity: .58; }
.nearby-point-icon { display: grid; place-items: center; flex: 0 0 28px; width: 28px; height: 28px; color: #b37a51; background: #fff0d6; border-radius: 10px; }
.nearby-point-copy { display: grid; min-width: 0; gap: 3px; }
.nearby-point-copy strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.nearby-point-copy small { color: var(--muted, #827487); font-size: 10px; }
.nearby-point-chevron { margin-left: auto; color: #b29fc7; font-size: 18px; }
.map-point-dialog-backdrop { position: fixed; z-index: 20; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(57, 46, 65, .24); backdrop-filter: blur(4px); }
.map-point-dialog { position: relative; width: min(360px, 100%); padding: 28px 24px 23px; color: var(--ink, #4d4354); background: #fffaf4; border: 1px solid rgba(255,255,255,.9); border-radius: 23px; box-shadow: 0 25px 60px rgba(60, 45, 71, .22); text-align: center; }
.dialog-close { position: absolute; top: 9px; right: 12px; padding: 2px 8px; color: var(--muted, #827487); background: transparent; font-size: 22px; }
.dialog-point-icon { display: grid; place-items: center; width: 50px; height: 50px; margin: 0 auto 11px; color: #aa7950; background: #fff0d7; border-radius: 17px; font-size: 26px; }
.map-point-dialog .eyebrow { margin-bottom: 4px; }
.map-point-dialog h4 { margin: 0 0 8px; font-size: 20px; }
.dialog-description { margin: 0 auto 18px; color: var(--muted, #827487); font-size: 13px; line-height: 1.6; }
.dialog-actions { display: grid; gap: 8px; }
.map-dialog-button { width: 100%; padding: 11px 14px; border-radius: 12px; }
.map-dialog-button.tone-primary { color: #fff; background: linear-gradient(135deg, var(--coral, #ed806f), #f4a374); }
.map-dialog-button.tone-soft { color: #594d6b; background: #f1ecff; }
.map-dialog-button.tone-danger { color: #a14c56; background: #ffeded; }
@media (max-width: 520px) {
  .world-map-panel { padding: 10px 10px 12px; }
  .world-map-heading { gap: 6px; }
  .world-map-heading h3 { font-size: 15px; }
  .world-map-range { gap: 3px; font-size: 9px; }
  .world-map-range span { padding: 3px 5px; }
  .world-map-coordinate strong { font-size: 18px; }
  .world-map-grid-coordinate { top: 6px; left: 6px; padding: 3px 5px; }
  .world-map-grid-coordinate strong { font-size: 17px; }
  .nearby-target-list { grid-template-columns: 1fr; }
}
</style>
