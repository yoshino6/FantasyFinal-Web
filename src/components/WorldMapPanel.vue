<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';
import AnimeIcon from './AnimeIcon.vue';
import AnimeAdventureArt from './AnimeAdventureArt.vue';
import AnimatedMapAvatar from './AnimatedMapAvatar.vue';
import MapEnvironmentObject from './MapEnvironmentObject.vue';
import MapSurfaceLayer from './MapSurfaceLayer.vue';
import { surfaceSnapshotClock, validSurfaceScene, type MapSurfaceScene, type SurfaceCell, type SurfaceRect } from '../map-surface';
import { fallbackSurfaceScene } from '../map-surface-fallback';
import { groundWindowCells, groundWindowScene } from '../exploration-ground-window';
import { prepareMappedSettlementGround, mappedSettlementViewport, mappedSettlementViewportCells, type MappedSettlementReceipt, type MappedSettlementViewport } from '../map-mapped-settlement-ground';
import { settlementSurfaceScene, type SettlementObservedAnchor, type SettlementPublicBounds } from '../map-settlement-layout';
import type { ExploreGroundWindow } from '../api';
import { environmentApproach, environmentDistance, environmentFootprint, environmentGeometry, environmentSpriteStyle, environmentDirectionalSprite, environmentSingleSprite, ENVIRONMENT_ATLAS, ENVIRONMENT_SPRITES, type EnvironmentObjectView } from '../map-environment';
import type { PanelPortrait } from '../api';
import { currentTargetPopupRequest, type MapTargetPopupRequest } from '../exploration-target-popup';
import { mapAvatarAtlas, mapAvatarGroundPadding, mapAvatarPaintedSize, mapTargetArt, mapTargetPaintedSize, mapTargetSpriteStyle, mapTargetSpriteFrame } from '../exploration-assets';
import { mapActorSpriteBox, mapSpriteOverlapMask, type MapSpriteBox } from '../map-sprite-overlap';
import { loadMapSpriteSilhouette } from '../map-sprite-silhouette';
import { standingSceneryGeometry } from '../map-standing-scenery';
import { gameAssetUrl } from '../game-assets';
import { cellGroundStyle, type TerrainContext } from '../exploration-terrain';
import { cameraForZoom, clampMapZoom, inPerception, viewportToWorld, worldToViewport, type MapVector } from '../exploration-map-geometry';
import './anime-adventure.css';
import './anime-exploration-map.css';

export type MapPosition = { x: number; y: number; z?: number; name?: string };
export type MapHeading = 'up' | 'down' | 'left' | 'right';
export type MapVisualCenter = MapPosition & { regionCode?: string };
export type MapPointAction = {
  id: string; label: string; command?: string; commands?: string[];
  /** Concrete server resource spawn id, never the item code. */
  resourceId?: number; position?: MapPosition; tone?: 'primary' | 'soft' | 'danger';
};
export type ExploreMapPoint = {
  id: string; code?: string; templateCode?: string; portrait?: PanelPortrait;
  name: string; type?: string; icon?: string; x: number; y: number; z?: number; regionId?: number; regionCode?: string;
  description?: string; level?: number; distance?: number; discovered?: boolean;
  interactable?: boolean; actions?: MapPointAction[]; interaction?: { type: string; id: string };
};
export type MapBounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
export type MapActionLock = { title: string; detail: string; countdown?: string; stopLabel?: string; stopDisabled?: boolean };
export type ExploreMapCell = { x: number; y: number; z?: number; regionId?: number; regionCode?: string; passable: boolean; reachable?: boolean };
type MapCell = { key: string; position: MapPosition; regionId?: number; regionCode: string; groundStyle: ReturnType<typeof cellGroundStyle>; isCurrent: boolean; isMovable: boolean; passable: boolean; reachable: boolean; points: ExploreMapPoint[]; kind: string };
type MapEntity = { point: ExploreMapPoint; cellKey: string; index: number; count: number; offset: MapVector; foot: MapVector; affinity: 'hostile' | 'friendly' | 'neutral'; kind: string };
type MapEntityLayout = Omit<MapEntity, 'foot'>;

const props = withDefaults(defineProps<{
  current?: MapPosition; displayPosition?: MapPosition; regionCode?: string;
  travelVisualCenter?: MapVisualCenter; movementHeading?: MapHeading; movementSpeed?: number; actualMovementSpeed?: number;
  playerPortrait?: string; playerIdentity?: PanelPortrait; playerKey?: string; moving?: boolean;
  movementTarget?: MapPosition; bounds?: MapBounds; points?: ExploreMapPoint[]; cells?: ExploreMapCell[];
  environment?: EnvironmentObjectView[];
  surfaceScene?: MapSurfaceScene;
  groundWindow?: ExploreGroundWindow;
  mappedSettlement?: MappedSettlementReceipt;
  targetPopupRequest?: MapTargetPopupRequest;
  moveRange?: number; sightRange?: number; title?: string; subtitle?: string;
  disabled?: boolean; loading?: boolean; actionLock?: MapActionLock | null; actionArt?: string; chatOpen?: boolean; renderScene?: boolean;
}>(), {
  current: () => ({ x: 0, y: 0, name: '未知区域' }), regionCode: '', playerPortrait: '',
  moving: false, points: () => [], moveRange: 2, sightRange: 3, title: '附近地图',
  subtitle: '点击方格前往，到达后点击所在方格互动；拖动缩放地图。', disabled: false, loading: false, actionLock: null, renderScene: true,
});
const emit = defineEmits<{
  (event: 'move', position: MapPosition): void;
  (event: 'interact', point: ExploreMapPoint): void;
  (event: 'action', payload: { point: ExploreMapPoint; action: MapPointAction }): void;
  (event: 'selected', point: ExploreMapPoint | null): void;
  (event: 'target-popup-consumed', id: number): void;
  (event: 'heading-change', heading: MapHeading): void;
  (event: 'open-region-map'): void;
  (event: 'open-auto-battle'): void;
  (event: 'open-chat'): void;
  (event: 'stop-action'): void;
  (event: 'clear-environment', object: EnvironmentObjectView): void;
}>();

const hasSurfaceScene = computed(() => validSurfaceScene(props.surfaceScene));

const viewportElement = ref<HTMLElement>();
const viewport = ref({ width: 390, height: 520 });
const zoom = ref(1), followPlayer = ref(true);
const freeCamera = ref<MapVector>({ ...props.current });
const selectedPoint = ref<ExploreMapPoint | null>(null);
const selectedCell = ref<MapCell | null>(null);
const selectedEnvironment = ref<EnvironmentObjectView | null>(null);
const gestureActive = ref(false);
const playerSpriteFrame = ref(0);
const silhouettePaths = ref(new Map<string, string>());
const requestedSilhouettes = new Set<string>();
// A display position can outlive its walking animation while a committed step
// is still being received. Keep the camera, grid and fog on that position;
// props.current remains the authority for movement and interaction checks.
const displayPosition = computed(() => {
  const point = props.displayPosition, floor = props.current.z ?? 0;
  return point && [point.x, point.y].every(value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER)
    && Number.isSafeInteger(point.z ?? floor) && (point.z ?? floor) === floor ? { ...point, z: point.z ?? floor } : undefined;
});
const sceneCenter = computed<MapVisualCenter>((previous) => {
  const center = props.travelVisualCenter
    ? { ...props.travelVisualCenter, z: props.travelVisualCenter.z ?? props.current.z }
    : props.current;
  const point = displayPosition.value;
  const next: MapVisualCenter = point ? { ...center, x: Math.round(point.x), y: Math.round(point.y), z: point.z } : center;
  return previous && previous.x === next.x && previous.y === next.y && previous.z === next.z
    && previous.name === next.name && previous.regionCode === next.regionCode ? previous : next;
});
const sceneRegionCode = computed(() => props.travelVisualCenter?.regionCode ?? props.regionCode);
const playerPosition = computed(() => displayPosition.value ?? props.travelVisualCenter ?? props.current);
const camera = computed(() => followPlayer.value ? playerPosition.value : freeCamera.value);
const radius = computed(() => Math.max(0, Math.floor(Number(props.sightRange) || 0)));
const hasAuthorizedGround = computed(() => !!props.cells?.some(cell => Number.isSafeInteger(cell.regionId) && cell.regionId! > 0 && (cell.z ?? props.current.z ?? 0) === (props.current.z ?? 0)));
const continuousPerception = computed(() => (hasSurfaceScene.value || hasAuthorizedGround.value) && !!displayPosition.value);
const visualVisibility = (point: MapVector) => {
  if (!continuousPerception.value) return 1;
  // Perception changes one complete cell at a time; the camera still follows
  // the interpolated player every frame. Never slice an edge tile diagonally.
  return inPerception(point, sceneCenter.value, radius.value) ? 1 : 0;
};
const actualSpeedLabel = computed(() => typeof props.actualMovementSpeed === 'number' && Number.isFinite(props.actualMovementSpeed) && props.actualMovementSpeed > 0 ? props.actualMovementSpeed : '—');
const side = computed(() => radius.value * 2 + 1);
const baseCellSize = computed(() => Math.min(viewport.value.width, viewport.value.height) / Math.min(side.value, 7));
const cellSize = computed(() => baseCellSize.value * zoom.value);
// Orthographic world scale: enlarge art equally at every map coordinate.
const avatarSize = computed(() => Math.min(112, Math.max(34, baseCellSize.value * 0.88)) * zoom.value * 1.5);
const visiblePoints = computed<ExploreMapPoint[]>((previous) => {
  const next = props.points.filter(point => (point.z ?? props.current.z ?? 0) === (props.current.z ?? 0) && (continuousPerception.value
  ? serverCellIndex.value?.has(`${point.x}:${point.y}:${point.z ?? props.current.z ?? 0}`) && visualVisibility(point) > 0
  : inPerception(point, props.current, radius.value) && inPerception(point, sceneCenter.value, radius.value)));
  return previous?.length === next.length && next.every((point, index) => point === previous[index]) ? previous : next;
});
const pointKind = (point: ExploreMapPoint): string => /怪物|敌人|魔物/.test(point.type || '') ? 'monster'
  : /矿脉|矿石/.test(point.type || '') ? 'ore'
    : /建筑|NPC|域民|地点|入口|地标|building|landmark/.test(point.type || '') ? 'building'
      : /植被|资源/.test(point.type || '') ? 'resource' : 'friendly';
const pointIndex = computed(() => {
  const index = new Map<string, ExploreMapPoint[]>();
  for (const point of visiblePoints.value) {
    const key = `${point.x}:${point.y}`;
    index.set(key, [...(index.get(key) ?? []), point]);
  }
  return index;
});
const serverCellIndex = computed(() => props.cells === undefined ? null : new Map(props.cells.map(cell => [`${cell.x}:${cell.y}:${cell.z ?? props.current.z ?? 0}`, cell])));
// Unknown scenery uses only the current authoritative region. A travel visual
// must not reveal the terrain or decorations of its unobserved destination.
const terrainContext = computed<TerrainContext>(() => ({ fallbackRegion: { code: props.regionCode, name: props.current.name } }));
const cells = computed<MapCell[]>(() => {
  const observed = (continuousPerception.value && props.cells ? props.cells.map(cell => ({ x: cell.x, y: cell.y, z: cell.z ?? props.current.z }))
  : Array.from({ length: side.value * side.value }, (_, index) => ({ x: sceneCenter.value.x - radius.value + index % side.value, y: sceneCenter.value.y + radius.value - Math.floor(index / side.value), z: sceneCenter.value.z })))
    .filter(position => continuousPerception.value ? visualVisibility(position) > 0
      : inPerception(position, sceneCenter.value, radius.value) && inPerception(position, props.current, radius.value));
  const positions = new Map(observed.map(position => [`${position.x}:${position.y}:${position.z ?? 0}`, position]));
  for (const cell of ownedMapGroundCells.value) positions.set(`${cell.x}:${cell.y}:${cell.z ?? 0}`, { x: cell.x, y: cell.y, z: cell.z ?? props.current.z });
  return [...positions.values()]
  .map((position): MapCell | null => {
  const { x, y } = position;
  if ((position.z ?? 0) !== (props.current.z ?? 0)) return null;
  const points = pointIndex.value.get(`${x}:${y}`) ?? [], kinds = points.map(pointKind);
  const key = `${x}:${y}:${position.z ?? 0}`;
  const mapped = ownedMapCellIndex.value.has(key);
  if (!mapped && serverCellIndex.value !== null && !serverCellIndex.value.has(key)) return null;
  const serverCell = serverCellIndex.value?.get(key);
  // Mapped ground offers a destination request, never a client route or a
  // collision verdict. The server checks its real footprint before walking.
  const passable = serverCell ? serverCell.passable === true : mapped;
  const reachable = serverCell?.reachable !== false;
  const terrainCell = { ...position, regionId: serverCell?.regionId ?? (mapped ? ownedMapGround.value?.receipt.regionId : undefined), regionCode: serverCell?.regionCode || props.regionCode };
  return { key, position, regionId: terrainCell.regionId, regionCode: terrainCell.regionCode,
    groundStyle: cellGroundStyle(terrainCell, terrainContext.value),
    isCurrent: x === sceneCenter.value.x && y === sceneCenter.value.y,
    // Current-region bounds must not veto a reachable neighbouring region.
    isMovable: passable && reachable && (mapped || inPerception(position, props.current, radius.value)), passable, reachable, points,
    kind: ['monster', 'ore', 'building', 'resource', 'friendly'].find(kind => kinds.includes(kind)) ?? 'empty' };
}).filter((cell): cell is MapCell => cell !== null);
});
// Keep ground authorization independent of animated points and camera frames.
// The GPU uploads this tiny integer mask only when the committed window changes.
const receivedSurfaceScene = computed(() => groundWindowScene(props.surfaceScene && toRaw(props.surfaceScene), props.groundWindow, props.current.z ?? 0));
const ownedMapGround = computed(() => prepareMappedSettlementGround(receivedSurfaceScene.value, props.mappedSettlement, {
  current: props.current, regionCode: props.regionCode,
  originCell: serverCellIndex.value?.get(`${props.current.x}:${props.current.y}:${props.current.z ?? 0}`),
}));
const surfaceBaseScene = computed(() => ownedMapGround.value?.scene ?? receivedSurfaceScene.value);
const ownedMapViewport = computed<MappedSettlementViewport | undefined>((previous) => {
  const next = ownedMapGround.value && mappedSettlementViewport({ camera: camera.value, viewport: viewport.value, cellSize: cellSize.value });
  return previous && next && previous.minX === next.minX && previous.maxX === next.maxX && previous.minY === next.minY && previous.maxY === next.maxY ? previous : next;
});
const ownedMapGroundCells = computed(() => mappedSettlementViewportCells(ownedMapGround.value, ownedMapViewport.value));
const ownedMapCellIndex = computed(() => new Set(ownedMapGroundCells.value.map(cell => `${cell.x}:${cell.y}:${cell.z ?? 0}`)));
const surfaceCells = computed(() => groundWindowCells(surfaceBaseScene.value, (props.cells ?? []).filter(cell => (cell.z ?? props.current.z ?? 0) === (props.current.z ?? 0)
  && (continuousPerception.value || inPerception(cell, props.current, radius.value) && inPerception(cell, sceneCenter.value, radius.value)))
  .map(cell => ({ ...cell, regionCode: cell.regionCode || props.regionCode }))
  .sort((a, b) => a.y - b.y || a.x - b.x || (a.regionId ?? 0) - (b.regionId ?? 0)), props.groundWindow, props.current.z ?? 0));
// Only real observed cells authorize the clear foreground. The separate
// public ground window is exclusively for the glass-covered background.
const perceptionCells = computed<SurfaceCell[]>((previous) => {
  const next = (props.cells ?? []).filter(cell => (cell.z ?? props.current.z ?? 0) === (props.current.z ?? 0)
    && inPerception(cell, sceneCenter.value, radius.value)
    && (continuousPerception.value || inPerception(cell, props.current, radius.value)))
    .map(cell => ({ ...cell, z: cell.z ?? props.current.z ?? 0, regionCode: cell.regionCode || props.regionCode }));
  return previous?.length === next.length && next.every((cell, index) => Object.keys(cell)
    .every(key => cell[key as keyof SurfaceCell] === previous[index][key as keyof SurfaceCell])) ? previous : next;
});
const mistGroundCells = computed(() => {
  const scene = surfaceBaseScene.value;
  if (!props.groundWindow || scene?.scopeToken !== 'world:0' || (props.current.z ?? 0) !== 0) return undefined;
  const fields = new Map(scene.terrainFields.map(field => [field.regionId, field]));
  return surfaceCells.value.filter(cell => fields.get(cell.regionId!)?.regionCode === cell.regionCode
    && !/(?:arena|test|private|story|trial|dungeon|home)/i.test(cell.regionCode ?? ''));
});
const groundScene = computed<MapSurfaceScene | undefined>(() => {
  if (hasSurfaceScene.value) {
    const scene = surfaceBaseScene.value!;
    const registered = new Set(scene.terrainFields.map(field => field.regionId));
    // The public history extension intentionally omits private/arena/dungeon
    // fields. Their already-authorized cells still need static ground at a
    // boundary; otherwise one valid public field makes the other half vanish.
    const missing = surfaceCells.value.filter(cell => !registered.has(cell.regionId!));
    if (!missing.length) return scene;
    const bridge = fallbackSurfaceScene(missing, { scopeToken: scene.scopeToken, z: props.current.z ?? 0 });
    if (!bridge) return scene;
    const completed = { ...scene, snapshotId: `${scene.snapshotId}:ground-bridge:${bridge.snapshotId}`,
      terrainFields: [...scene.terrainFields, ...bridge.terrainFields] };
    // Only static materials are supplemented. Preserve the source receipt
    // clock so replacing a boundary window cannot revive paths or blood.
    const clock = surfaceSnapshotClock(toRaw(scene), performance.now());
    surfaceSnapshotClock(completed, clock.receivedAt);
    return completed;
  }
  // Old servers, private areas and underground maps get the same continuous
  // cosmetic drawing path. Only the server's existing authorized cells are
  // used; no environment objects, collision or public history are invented.
  return fallbackSurfaceScene(surfaceCells.value, {
    scopeToken: `visual-only:${props.playerKey ?? 'local'}:${props.current.z ?? 0}:${props.regionCode}`, z: props.current.z ?? 0,
  });
});
const hasContinuousGround = computed(() => !!groundScene.value);
const entityLayouts = computed<MapEntityLayout[]>(() => cells.value.flatMap(cell => {
  const points = [...cell.points].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (!points.length) return [];
  const columns = Math.ceil(Math.sqrt(points.length));
  const centerRow = points.reduce((total, _point, index) => total + Math.floor(index / columns), 0) / points.length;
  const furthestRow = Math.max(centerRow, Math.floor((points.length - 1) / columns) - centerRow);
  const rowSpacing = furthestRow ? Math.min(0.42, 0.4 / furthestRow) : 0;
  return points.map((point, index) => {
    const row = Math.floor(index / columns), rowCount = Math.min(columns, points.length - row * columns);
    const columnSpacing = rowCount > 1 ? Math.min(0.68, 0.8 / (rowCount - 1)) : 0;
    const offset = { x: (index % columns - (rowCount - 1) / 2) * columnSpacing, y: (row - centerRow) * rowSpacing };
    const kind = pointKind(point);
    return { point, cellKey: cell.key, index, count: points.length, offset,
      kind,
      affinity: kind === 'monster' ? 'hostile' : /NPC|域民/.test(point.type || '') ? 'friendly' : 'neutral' };
  });
}));
const entities = computed<MapEntity[]>(() => entityLayouts.value.map(entity => {
  const center = worldToViewport(entity.point, camera.value, cellSize.value, viewport.value);
  return { ...entity, foot: { x: center.x + entity.offset.x * cellSize.value, y: center.y + entity.offset.y * cellSize.value } };
}));
const isBuildingPoint = (point: ExploreMapPoint) => /^(?:建筑|building)$/i.test(point.type ?? '');
const entitySize = (point: ExploreMapPoint) => avatarSize.value * (isBuildingPoint(point) ? 2 : 1);
const entityDepth = (position: MapVector, offsetY = 0) => Math.max(2, 20 + Math.round((sceneCenter.value.y + radius.value - position.y + offsetY) * 100));
const entityStyle = (entity: MapEntity) => ({
  transform: props.renderScene ? `translate3d(${entity.foot.x - avatarSize.value / 2}px, ${entity.foot.y - avatarSize.value * 1.25}px, 0)`
    : `translate3d(${entity.foot.x}px, ${entity.foot.y - cellSize.value * .12}px, 0) translate(-50%, -50%)`,
  zIndex: entityDepth(entity.point, entity.offset.y),
  '--map-avatar-size': `${entitySize(entity.point)}px`,
  '--map-ground-size': `${avatarSize.value}px`,
  '--map-entity-hit-size': `${avatarSize.value}px`,
  '--map-marker-width': `${Math.max(32, Math.min(112, cellSize.value * .86 / Math.max(1, Math.ceil(Math.sqrt(entity.count)))))}px`,
  '--map-avatar-ground-padding': mapAvatarGroundPadding(entity.point.portrait),
  opacity: visualVisibility(entity.point),
});
// Normalize painted bounds inside one fixed actor box. Portrait atlases keep
// their original frame sizes and use a separate ground-padding correction.
const normalizedArt = (point: ExploreMapPoint) => point.portrait ? {} : mapTargetSpriteStyle(point, pointKind(point) === 'ore');
const worldStyle = computed(() => {
  const center = sceneCenter.value;
  const northWest = worldToViewport({ x: center.x - radius.value - 0.5, y: center.y + radius.value + 0.5 }, camera.value, cellSize.value, viewport.value);
  const size = side.value * cellSize.value;
  return { width: `${size}px`, height: `${size}px`, transform: `translate3d(${northWest.x}px, ${northWest.y}px, 0)`,
    '--map-cell-size': `${cellSize.value}px`, '--map-side': side.value };
});
const cellStyle = (cell: MapCell) => ({ left: `${(cell.position.x - sceneCenter.value.x + radius.value) * cellSize.value}px`, top: `${(sceneCenter.value.y + radius.value - cell.position.y) * cellSize.value}px` });
// A cell-shaped mask reveals the true Manhattan perception area, including
// its stepped corners. Unknown coordinates never acquire a clickable element.
const perceptionRows = computed(() => {
  if (sceneCenter.value.z !== undefined && props.current.z !== undefined && sceneCenter.value.z !== props.current.z) return [];
  const r = radius.value, center = sceneCenter.value;
  return Array.from({ length: side.value }, (_, row) => {
    const y = center.y + r - row, sceneExtent = r - Math.abs(row - r);
    const authorityExtent = r - Math.abs(y - props.current.y);
    if (authorityExtent < 0) return null;
    const left = Math.max(center.x - sceneExtent, props.current.x - authorityExtent) - center.x + r;
    const right = Math.min(center.x + sceneExtent, props.current.x + authorityExtent) - center.x + r;
    return left <= right ? { row, left, right } : null;
  }).filter((row): row is { row: number; left: number; right: number } => row !== null);
});
const perceptionClip = computed(() => {
  if (ownedMapGround.value) return 'none';
  if (continuousPerception.value) return 'none'; // Every moving cell still comes from the adjacent authorized snapshots.
  const total = side.value, rows = perceptionRows.value;
  if (!rows.length) return 'polygon(0 0, 0 0, 0 0)';
  const vertices: string[] = [];
  for (const { row, left } of rows) {
    vertices.push(`${left / total * 100}% ${row / total * 100}%`, `${left / total * 100}% ${(row + 1) / total * 100}%`);
  }
  for (const { row, right: column } of [...rows].reverse()) {
    const right = column + 1;
    vertices.push(`${right / total * 100}% ${(row + 1) / total * 100}%`, `${right / total * 100}% ${row / total * 100}%`);
  }
  return `polygon(${vertices.join(',')})`;
});
const environmentPerceptionClip = computed(() => {
  if (hasContinuousGround.value) return `path("${perceptionCells.value.map(cell => {
    const p = worldToViewport({ x: cell.x - .5, y: cell.y + .5 }, camera.value, cellSize.value, viewport.value);
    return `M${p.x} ${p.y}h${cellSize.value}v${cellSize.value}h${-cellSize.value}Z`;
  }).join(' ')}")`;
  if (!perceptionRows.value.length) return 'polygon(0 0, 0 0, 0 0)';
  const corner = worldToViewport({ x: sceneCenter.value.x - radius.value - 0.5, y: sceneCenter.value.y + radius.value + 0.5 }, camera.value, cellSize.value, viewport.value);
  const vertex = (x: number, y: number) => `${corner.x + x * cellSize.value}px ${corner.y + y * cellSize.value}px`;
  return `polygon(${[
    ...perceptionRows.value.flatMap(({ row, left }) => [vertex(left, row), vertex(left, row + 1)]),
    ...[...perceptionRows.value].reverse().flatMap(({ row, right }) => [vertex(right + 1, row + 1), vertex(right + 1, row)])
  ].join(',')})`;
});
const visibleEnvironment = computed<EnvironmentObjectView[]>((previous) => {
  const next = (props.environment ?? []).filter(object => object.state !== 'cleared' && object.z === (props.current.z ?? 0)
  && !(hasSurfaceScene.value && object.blocking === false && !object.destructible)
  && environmentFootprint(object).some(cell => (continuousPerception.value ? visualVisibility(cell) > 0 : inPerception(cell, props.current, radius.value)
    && inPerception(cell, sceneCenter.value, radius.value)) && serverCellIndex.value?.has(`${cell.x}:${cell.y}:${cell.z}`)));
  return previous?.length === next.length && next.every((object, index) => object === previous[index]) ? previous : next;
});
const environmentCellIndex = computed(() => {
  const index = new Map<string, EnvironmentObjectView>();
  for (const object of visibleEnvironment.value) for (const cell of environmentFootprint(object)) {
    if (object.blocking !== false || object.destructible) index.set(`${cell.x}:${cell.y}:${cell.z}`, object);
  }
  return index;
});
// World-relative pixels avoid recomputing the stationary overlap set when the
// camera follows a walking player. Only the player's box changes each frame.
const stationarySpriteBoxes = computed<MapSpriteBox[]>(() => props.renderScene ? [
  ...entityLayouts.value.map(entity => {
    const size = entitySize(entity.point), point = entity.point;
    const painted = point.portrait ? mapAvatarPaintedSize(point.portrait, size) : mapTargetPaintedSize(point, size);
    return mapActorSpriteBox(`point:${point.id}`, { x: (point.x + entity.offset.x) * cellSize.value, y: (-point.y + entity.offset.y) * cellSize.value }, size, { ...painted, groundBase: entity.kind === 'ore' });
  }),
  ...visibleEnvironment.value.map(object => {
    const { painted } = environmentGeometry(object, cellSize.value);
    return { id: `environment:${object.id}`, left: object.x * cellSize.value + painted.left, right: object.x * cellSize.value + painted.left + painted.width,
      top: -object.y * cellSize.value + painted.top, bottom: -object.y * cellSize.value + painted.top + painted.height };
  }),
  ...standingScenery.value.map(({ item, geometry }) => ({ id: `scenery:${item.id}`,
    left: item.x * cellSize.value + geometry.painted.left, right: item.x * cellSize.value + geometry.painted.left + geometry.painted.width,
    top: -item.y * cellSize.value + geometry.painted.top, bottom: -item.y * cellSize.value + geometry.painted.top + geometry.painted.height })),
] : []);
type SpriteArtwork = { source: string; frame: { left: number; top: number; width: number; height: number }; crop?: { column: number; row: number; columns: number; rows: number }; flip?: boolean };
const artworkKey = (art: SpriteArtwork) => `${art.source}:${art.crop ? `${art.crop.column}:${art.crop.row}:${art.crop.columns}:${art.crop.rows}` : 'full'}`;
const spriteArtwork = computed(() => {
  const art = new Map<string, SpriteArtwork>();
  const actor = (id: string, foot: MapVector, size: number, portrait?: PanelPortrait, point?: ExploreMapPoint, frame = 0, left = false) => {
    const atlas = mapAvatarAtlas(portrait);
    if (portrait && atlas.src) art.set(id, { source: atlas.src, frame: { left: foot.x - size / 2, top: foot.y - size * 1.25 * (1 - mapAvatarGroundPadding(portrait)), width: size, height: size * 1.25 },
      crop: { column: frame % atlas.columns, row: Math.floor(frame / atlas.columns), columns: atlas.columns, rows: atlas.rows }, flip: atlas.nativeLeftFrames.includes(frame) !== left });
    else {
      const target = portrait ? { type: '玩家' } : point ?? { type: '玩家' };
      const relative = mapTargetSpriteFrame(target, size, pointKind(target as ExploreMapPoint) === 'ore');
      art.set(id, { source: mapTargetArt(target).src, frame: { ...relative, left: foot.x + relative.left, top: foot.y + relative.top } });
    }
  };
  for (const entity of entityLayouts.value) actor(`point:${entity.point.id}`, { x: (entity.point.x + entity.offset.x) * cellSize.value, y: (-entity.point.y + entity.offset.y) * cellSize.value }, entitySize(entity.point), entity.point.portrait, entity.point);
  actor('player', { x: playerPosition.value.x * cellSize.value, y: -playerPosition.value.y * cellSize.value }, avatarSize.value, props.playerIdentity, undefined, playerSpriteFrame.value, movementDirection.value === 'left');
  for (const object of visibleEnvironment.value) {
    const native = environmentDirectionalSprite(object.assetKey, object) ?? environmentSingleSprite(object.assetKey), { sprite } = environmentGeometry(object, cellSize.value);
    const registeredIndex = ENVIRONMENT_SPRITES.indexOf(object.assetKey as typeof ENVIRONMENT_SPRITES[number]), index = registeredIndex < 0 ? 1 : registeredIndex;
    art.set(`environment:${object.id}`, { source: gameAssetUrl(native?.assetPath ?? ENVIRONMENT_ATLAS),
      frame: { ...sprite, left: object.x * cellSize.value + sprite.left, top: -object.y * cellSize.value + sprite.top },
      ...(native ? {} : { crop: { column: index % 4, row: Math.floor(index / 4), columns: 4, rows: 4 } }) });
  }
  for (const { item, geometry } of standingScenery.value) art.set(`scenery:${item.id}`, { source: gameAssetUrl(geometry.source), frame: { ...geometry.frame, left: item.x * cellSize.value + geometry.frame.left, top: -item.y * cellSize.value + geometry.frame.top } });
  return art;
});
const allSpriteBoxes = computed(() => [...stationarySpriteBoxes.value,
  mapActorSpriteBox('player', { x: playerPosition.value.x * cellSize.value, y: -playerPosition.value.y * cellSize.value }, avatarSize.value,
    props.playerIdentity ? mapAvatarPaintedSize(props.playerIdentity, avatarSize.value) : undefined)].map(box => {
    const art = spriteArtwork.value.get(box.id), path = art && silhouettePaths.value.get(artworkKey(art));
    // A walking atlas frame can extend beyond the measured idle silhouette.
    // Keep its full source frame eligible; the real alpha outline alone decides
    // which pixels fade, including arms and feet in every animation frame.
    const frame = art?.frame;
    return { ...box, ...(frame ? { left: Math.min(box.left, frame.left), right: Math.max(box.right, frame.left + frame.width),
      top: Math.min(box.top, frame.top), bottom: Math.max(box.bottom, frame.top + frame.height) } : {}),
      ...(art && path ? { silhouette: { path, frame: art.frame, flip: art.flip } } : {}) };
  }));
const spriteBoxIndex = computed(() => new Map(allSpriteBoxes.value.map(box => [box.id, box])));
const overlapMask = (id: string, frame: { left: number; top: number; width: number; height: number }) => {
  const box = spriteBoxIndex.value.get(id);
  return box ? mapSpriteOverlapMask(box, allSpriteBoxes.value, frame) : {};
};
const entityArtMask = (entity: MapEntity) => {
  const size = entitySize(entity.point);
  return overlapMask(`point:${entity.point.id}`, { left: (entity.point.x + entity.offset.x) * cellSize.value - size / 2,
    top: (-entity.point.y + entity.offset.y) * cellSize.value - size * 1.25, width: size, height: size * 1.25 });
};
const playerArtMask = computed(() => overlapMask('player', { left: playerPosition.value.x * cellSize.value - avatarSize.value / 2,
  top: -playerPosition.value.y * cellSize.value - avatarSize.value * 1.25, width: avatarSize.value, height: avatarSize.value * 1.25 }));
const environmentArtMask = (object: EnvironmentObjectView) => overlapMask(`environment:${object.id}`, {
  left: camera.value.x * cellSize.value - viewport.value.width / 2, top: -camera.value.y * cellSize.value - viewport.value.height / 2,
  width: viewport.value.width, height: viewport.value.height });
const sceneryExclusions = computed<SurfaceRect[]>(() => {
  const margin = .08;
  // Reserve actual authorized resource/NPC/monster actor envelopes. The moving
  // self avatar is separate from entities, so walking never pops nearby grass.
  const actors = entityLayouts.value.map(entity => {
    const actor = entitySize(entity.point) / cellSize.value;
    const x = entity.point.x + entity.offset.x, y = entity.point.y - entity.offset.y;
    return { left: x - actor * 1.02 / 2 - margin, right: x + actor * 1.02 / 2 + margin,
      south: y - margin, north: y + actor * 1.25 * 1.045 + margin };
  });
  const obstacles = visibleEnvironment.value.flatMap(object => {
    const { painted } = environmentGeometry(object, cellSize.value);
    return [{ left: object.x + painted.left / cellSize.value - .04, right: object.x + (painted.left + painted.width) / cellSize.value + .04,
      south: object.y - (painted.top + painted.height) / cellSize.value - .04, north: object.y - painted.top / cellSize.value + .04 },
    ...environmentFootprint(object).map(cell => ({ left: cell.x - .54, right: cell.x + .54, south: cell.y - .54, north: cell.y + .54 }))];
  });
  return [...actors, ...obstacles];
});
const settlementAnchors = computed<SettlementObservedAnchor[]>((previous) => {
  const next = visiblePoints.value.filter(point => point.discovered !== false && /^(?:建筑|地标|地点|入口|building|landmark)$/i.test(point.type ?? '')).flatMap(point => {
    const z = point.z ?? props.current.z ?? 0, cell = serverCellIndex.value?.get(`${point.x}:${point.y}:${z}`);
    return cell?.passable === true && Number.isSafeInteger(cell.regionId) ? [{ x: point.x, y: point.y, z, regionId: point.regionId ?? cell.regionId!, regionCode: point.regionCode ?? cell.regionCode }] : [];
  });
  return previous?.length === next.length && next.every((anchor, index) => Object.keys(anchor).every(key => anchor[key as keyof SettlementObservedAnchor] === previous[index][key as keyof SettlementObservedAnchor])) ? previous : next;
});
const settlementBounds = computed<SettlementPublicBounds | undefined>(() => {
  const cell = serverCellIndex.value?.get(`${props.current.x}:${props.current.y}:${props.current.z ?? 0}`);
  return props.bounds && cell?.passable === true && cell.regionCode === props.regionCode && Number.isSafeInteger(cell.regionId)
    ? { ...props.bounds, regionId: cell.regionId!, regionCode: props.regionCode } : undefined;
});
const decoratedGroundScene = computed(() => settlementSurfaceScene(toRaw(groundScene.value), props.cells, props.current.z ?? 0, sceneryExclusions.value, settlementAnchors.value, settlementBounds.value));
const standingScenery = computed(() => (props.renderScene ? decoratedGroundScene.value?.scenery ?? [] : []).flatMap(item => {
  const cell = serverCellIndex.value?.get(`${item.x}:${item.y}:${item.z}`);
  const geometry = standingSceneryGeometry(item, cellSize.value);
  return geometry && item.z === (props.current.z ?? 0) && cell?.regionId === item.regionId && cell.passable === true
    && inPerception(item, sceneCenter.value, radius.value) && (continuousPerception.value || inPerception(item, props.current, radius.value))
    ? [{ item, geometry }] : [];
}));
// Standing props share the actors' depth order. The ground pass keeps brushwork,
// roads and traces, so a grid line can no longer cross the face of a town lamp.
const flatGroundScene = computed(() => {
  const source = decoratedGroundScene.value;
  if (!source) return source;
  const scenery = source.scenery.filter(item => !standingSceneryGeometry(item, cellSize.value));
  if (scenery.length === source.scenery.length) return source;
  const scene = { ...source, scenery };
  const clock = surfaceSnapshotClock(toRaw(source), performance.now());
  surfaceSnapshotClock(scene, clock.receivedAt);
  return scene;
});
const standingSceneryStyle = ({ item, geometry }: typeof standingScenery.value[number]) => {
  const point = worldToViewport(item, camera.value, cellSize.value, viewport.value);
  const frame = { ...geometry.frame, left: item.x * cellSize.value + geometry.frame.left, top: -item.y * cellSize.value + geometry.frame.top };
  return { left: `${point.x + geometry.frame.left}px`, top: `${point.y + geometry.frame.top}px`, width: `${geometry.frame.width}px`, height: `${geometry.frame.height}px`,
    zIndex: entityDepth(item, geometry.groundY / cellSize.value), ...overlapMask(`scenery:${item.id}`, frame) };
};
const environmentVisibility = (object: EnvironmentObjectView) => Math.max(0, ...environmentFootprint(object).map(visualVisibility));
const environmentOrigin = (object: EnvironmentObjectView) => worldToViewport(object, camera.value, cellSize.value, viewport.value);
const environmentMarkerStyle = (object: EnvironmentObjectView) => {
  const position = environmentOrigin(object);
  return { left: `${position.x}px`, top: `${position.y + cellSize.value * .26}px`, zIndex: entityDepth(object, .48),
    maxWidth: `${Math.max(32, Math.min(112, cellSize.value * .86))}px` };
};
const approachEnvironmentPosition = computed(() => selectedEnvironment.value
  ? environmentApproach(selectedEnvironment.value, props.current, (props.cells ?? []).filter(cell => inPerception(cell, props.current, radius.value))) : undefined);
const selectedEnvironmentDistance = computed(() => selectedEnvironment.value ? environmentDistance(selectedEnvironment.value, props.current) : Infinity);
const perceptionEdges = computed(() => {
  const known = new Set(perceptionRows.value.flatMap(({ row, left, right }) => Array.from({ length: right - left + 1 }, (_, index) => `${left + index}:${row}`)));
  return perceptionRows.value.flatMap(({ row, left, right }) => Array.from({ length: right - left + 1 }, (_, index) => {
    const column = left + index;
    return (['top', 'right', 'bottom', 'left'] as const).filter(edge => {
      const dx = edge === 'right' ? 1 : edge === 'left' ? -1 : 0;
      const dy = edge === 'bottom' ? 1 : edge === 'top' ? -1 : 0;
      return !known.has(`${column + dx}:${row + dy}`);
    }).map(edge => ({ key: `${column}:${row}:${edge}`, edge, style: { left: `${column * cellSize.value}px`, top: `${row * cellSize.value}px` } }));
  }).flat());
});
// Decorative, noninteractive tiles keep exactly the same world lattice as the
// known cells. Two extra rows cover the blurred fog's overscan while panning.
const fogWest = computed(() => Math.floor(camera.value.x - viewport.value.width / (2 * cellSize.value) - 2));
const fogEast = computed(() => Math.ceil(camera.value.x + viewport.value.width / (2 * cellSize.value) + 2));
const fogNorth = computed(() => Math.ceil(camera.value.y + viewport.value.height / (2 * cellSize.value) + 2));
const fogSouth = computed(() => Math.floor(camera.value.y - viewport.value.height / (2 * cellSize.value) - 2));
const fogGroundStyle = computed(() => cellGroundStyle({ x: 0, y: 0 }, terrainContext.value));
const fogTiles = computed(() => {
  const columns = fogEast.value - fogWest.value + 1, rows = fogNorth.value - fogSouth.value + 1;
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    const x = fogWest.value + column, y = fogNorth.value - row;
    return { key: `${x}:${y}`, x, y, style: { left: `calc(var(--map-cell-size) * ${column})`, top: `calc(var(--map-cell-size) * ${row})` } };
  });
});
const fogTerrainStyle = computed(() => {
  const northWest = worldToViewport({ x: fogWest.value - 0.5, y: fogNorth.value + 0.5 }, camera.value, cellSize.value, viewport.value);
  return { transform: `translate3d(${northWest.x + 24}px, ${northWest.y + 24}px, 0)`, '--map-cell-size': `${cellSize.value}px` };
});
const playerStyle = computed(() => {
  const point = worldToViewport(playerPosition.value, camera.value, cellSize.value, viewport.value);
  return { transform: `translate3d(${point.x}px, ${point.y}px, 0)`, '--map-avatar-size': `${avatarSize.value}px`, '--map-avatar-ground-padding': mapAvatarGroundPadding(props.playerIdentity), zIndex: entityDepth(playerPosition.value) };
});
const movementDirection = ref<MapHeading>(props.movementHeading ?? 'down');
watch(spriteArtwork, artwork => {
  for (const art of artwork.values()) {
    const key = artworkKey(art);
    if (!art.source || requestedSilhouettes.has(key)) continue;
    requestedSilhouettes.add(key);
    void loadMapSpriteSilhouette(art.source, art.crop).then(path => { if (path) silhouettePaths.value.set(key, path); });
  }
}, { immediate: true, flush: 'post' });
let hasMovementDirection = !!props.movementHeading;
function rememberHeading(heading: MapHeading, notify = true) {
  hasMovementDirection = true;
  if (movementDirection.value === heading) return;
  movementDirection.value = heading;
  if (notify) emit('heading-change', heading);
}
function vectorHeading(dx: number, dy: number): MapHeading | undefined {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) < 0.000001) return;
  return dx > 0 ? 'right' : 'left';
}
watch(() => ({ moving: props.moving, heading: props.movementHeading, target: props.movementTarget, position: { ...playerPosition.value } }), (motion, previous) => {
  if (!motion.moving) {
    if (!hasMovementDirection && motion.heading) rememberHeading(motion.heading, false);
    return;
  }
  const target = motion.target, position = motion.position;
  const targetHeading = target && (target.z === undefined || position.z === undefined || target.z === position.z)
    ? vectorHeading(target.x - position.x, target.y - position.y) : undefined;
  if (targetHeading) { rememberHeading(targetHeading); return; }
  // A vertical final approach keeps the last left/right facing direction.
  if (target) return;
  if (motion.heading === 'left' || motion.heading === 'right') { rememberHeading(motion.heading); return; }
  if (!previous || (position.z !== undefined && previous.position.z !== undefined && position.z !== previous.position.z)) return;
  const dx = position.x - previous.position.x, dy = position.y - previous.position.y;
  // A discontinuous transfer is not a walking direction.
  if (Math.abs(dx) + Math.abs(dy) > 1.000001) return;
  const heading = vectorHeading(dx, dy);
  if (heading) rememberHeading(heading);
}, { immediate: true });
watch([() => props.playerKey, () => props.playerIdentity?.baseKey, () => props.playerIdentity?.fallbackKey, () => props.playerIdentity ? undefined : props.playerPortrait], () => {
  movementDirection.value = props.movementHeading ?? 'down'; hasMovementDirection = !!props.movementHeading;
});
const pointArt = (point: ExploreMapPoint) => mapTargetArt(point).src;
const pointIcon = (point: ExploreMapPoint) => /玩家|队员|NPC|域民/.test(point.type || '') ? 'party' : /怪物|敌人|魔物/.test(point.type || '') ? 'paw' : /建筑|地点/.test(point.type || '') ? 'home' : 'map';
const pointLevel = (point: ExploreMapPoint) => typeof point.level === 'number' && Number.isFinite(point.level) ? point.level : undefined;
const selectablePosition = (position: MapPosition) => (position.z ?? props.current.z ?? 0) === (props.current.z ?? 0) && inPerception(position, props.current, radius.value)
  && (serverCellIndex.value?.get(`${position.x}:${position.y}:${position.z ?? props.current.z ?? 0}`)?.passable === true
    && serverCellIndex.value.get(`${position.x}:${position.y}:${position.z ?? props.current.z ?? 0}`)?.reachable !== false);
const blocked = computed(() => props.disabled || props.loading || props.moving || !!displayPosition.value || !!props.travelVisualCenter);

function closePoint() { selectedPoint.value = null; selectedCell.value = null; selectedEnvironment.value = null; emit('selected', null); }
function chooseEnvironment(object: EnvironmentObjectView) {
  if (performance.now() < ignoreClickUntil || blocked.value || !visibleEnvironment.value.some(item => item.id === object.id)) return;
  selectedPoint.value = null; selectedCell.value = null; selectedEnvironment.value = object; emit('selected', null);
}
function approachEnvironment() {
  const target = approachEnvironmentPosition.value;
  if (!target || blocked.value || !selectablePosition(target)) return;
  emit('move', target); closePoint();
}
function clearEnvironment() {
  const object = selectedEnvironment.value;
  if (!object || blocked.value || !object.canClear || selectedEnvironmentDistance.value > 1) return;
  emit('clear-environment', object); closePoint();
}
function choosePoint(point: ExploreMapPoint) {
  if (performance.now() < ignoreClickUntil || blocked.value || !selectablePosition(point)) return;
  selectedCell.value = null; selectedEnvironment.value = null; selectedPoint.value = point; emit('selected', point);
}
let consumedTargetPopup = 0;
function openRequestedTargetPopup() {
  const request = props.targetPopupRequest;
  if (!request || request.id <= consumedTargetPopup) return;
  consumedTargetPopup = request.id;
  emit('target-popup-consumed', request.id);
  if (blocked.value || selectedPoint.value || selectedCell.value || selectedEnvironment.value
    || !currentTargetPopupRequest(request, props.current, props.playerKey, props.regionCode)) return;
  const points = visiblePoints.value.filter(point => request.pointIds.includes(point.id) && selectablePosition(point)
    && point.discovered !== false && point.interactable !== false);
  if (points.length === 1) {
    selectedPoint.value = points[0]!; emit('selected', points[0]!);
  } else if (points.length > 1) {
    const cell = cells.value.find(item => item.isCurrent);
    if (cell) selectedCell.value = { ...cell, points };
  }
}
let ignoreClickUntil = 0;
function chooseCell(cell: MapCell) {
  if (performance.now() < ignoreClickUntil || blocked.value) return;
  const object = environmentCellIndex.value.get(cell.key);
  if (object && (!cell.isMovable || cell.isCurrent)) { chooseEnvironment(object); return; }
  if (cell.isCurrent) {
    if (cell.points.length === 1) choosePoint(cell.points[0]!);
    else if (cell.points.length > 1) { closePoint(); selectedCell.value = cell; }
    return;
  }
  if (!cell.isMovable) return;
  emit('move', cell.position); closePoint();
}
function moveToSelectedCell() {
  const cell = selectedCell.value;
  if (!cell || blocked.value || cell.isCurrent || !selectablePosition(cell.position)) return;
  emit('move', cell.position); closePoint();
}
function runPointAction(point: ExploreMapPoint, action: MapPointAction) {
  if (blocked.value || !selectablePosition(point) || point.discovered === false) return;
  emit('action', { point, action }); closePoint();
}
function defaultInteract(point: ExploreMapPoint) {
  if (blocked.value || !selectablePosition(point) || point.interactable === false || point.discovered === false) return;
  emit('interact', point); closePoint();
}
function clampCamera(value: MapVector): MapVector {
  const center = sceneCenter.value;
  const dx = value.x - center.x, dy = value.y - center.y;
  const distance = Math.abs(dx) + Math.abs(dy);
  const ratio = distance > radius.value ? radius.value / distance : 1;
  return { x: center.x + dx * ratio, y: center.y + dy * ratio };
}
function releaseFollow() { if (followPlayer.value) { freeCamera.value = { ...camera.value }; followPlayer.value = false; } }
function setFollow(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  if (!checked) freeCamera.value = { ...camera.value };
  followPlayer.value = checked;
}
function setZoom(value: number, anchor = { x: viewport.value.width / 2, y: viewport.value.height / 2 }) {
  const worldAnchor = viewportToWorld(anchor, camera.value, cellSize.value, viewport.value);
  zoom.value = clampMapZoom(value);
  if (!followPlayer.value) freeCamera.value = clampCamera(cameraForZoom(anchor, worldAnchor, cellSize.value, viewport.value));
}
const pointers = new Map<number, MapVector>();
let gesture: { distance: number; zoom: number; camera: MapVector; first: MapVector; worldAnchor: MapVector } | null = null;
function localPoint(event: PointerEvent | WheelEvent): MapVector {
  const rect = viewportElement.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function startGesture() {
  const values = [...pointers.values()];
  if (!values.length) { gesture = null; return; }
  const first = values[0]!, second = values[1];
  const midpoint = second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } : first;
  gesture = { distance: second ? Math.hypot(first.x - second.x, first.y - second.y) : 0,
    zoom: zoom.value, camera: { ...camera.value }, first,
    worldAnchor: viewportToWorld(midpoint, camera.value, cellSize.value, viewport.value) };
}
function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('.map-canvas-control')) return;
  pointers.set(event.pointerId, localPoint(event));
  // Capturing a simple tap on the viewport would retarget its native click
  // away from the cell button. Capture only once a drag/pinch is established.
  startGesture();
}
function onPointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId) || !gesture) return;
  pointers.set(event.pointerId, localPoint(event));
  const values = [...pointers.values()], first = values[0]!, second = values[1];
  if (second && gesture.distance > 0) {
    gestureActive.value = true; ignoreClickUntil = performance.now() + 350;
    for (const pointerId of pointers.keys()) viewportElement.value?.setPointerCapture(pointerId);
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    zoom.value = clampMapZoom(gesture.zoom * Math.hypot(first.x - second.x, first.y - second.y) / gesture.distance);
    if (!followPlayer.value) freeCamera.value = clampCamera(cameraForZoom(midpoint, gesture.worldAnchor, cellSize.value, viewport.value));
  } else {
    const dx = first.x - gesture.first.x, dy = first.y - gesture.first.y;
    if (!gestureActive.value && Math.hypot(dx, dy) < 6) return;
    gestureActive.value = true; ignoreClickUntil = performance.now() + 350; releaseFollow();
    viewportElement.value?.setPointerCapture(event.pointerId);
    freeCamera.value = clampCamera({ x: gesture.camera.x - dx / cellSize.value, y: gesture.camera.y + dy / cellSize.value });
  }
}
function onPointerEnd(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  if (gestureActive.value || event.type === 'pointercancel') ignoreClickUntil = performance.now() + 350;
  pointers.delete(event.pointerId);
  if (viewportElement.value?.hasPointerCapture(event.pointerId)) viewportElement.value.releasePointerCapture(event.pointerId);
  gestureActive.value = false; startGesture();
}
function onLostPointerCapture(event: PointerEvent) {
  // Touch starts with an implicit capture on the cell. Its loss bubbles when
  // an established drag transfers capture to the viewport; that is not an end.
  if (event.target === viewportElement.value) onPointerEnd(event);
}
function onWheel(event: WheelEvent) { event.preventDefault(); setZoom(zoom.value * Math.exp(-event.deltaY * 0.0015), localPoint(event)); }
function onMapKeydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest('.map-canvas-control, .world-map-cell')) return;
  if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(zoom.value + 0.1); }
  else if (event.key === '-') { event.preventDefault(); setZoom(zoom.value - 0.1); }
  else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault(); releaseFollow();
    const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const dy = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    freeCamera.value = clampCamera({ x: freeCamera.value.x + dx, y: freeCamera.value.y + dy });
  }
}
function onEscape(event: KeyboardEvent) { if (event.key === 'Escape') closePoint(); }
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(entries => {
    const size = entries[0]?.contentRect;
    if (size?.width && size.height) viewport.value = { width: size.width, height: size.height };
  });
  if (viewportElement.value) observer.observe(viewportElement.value);
  document.addEventListener('keydown', onEscape);
});
watch([() => sceneRegionCode.value, () => sceneCenter.value.z], () => {
  freeCamera.value = { ...sceneCenter.value }; closePoint();
});
watch([() => sceneCenter.value.x, () => sceneCenter.value.y, () => props.current.x, () => props.current.y, () => props.sightRange], () => {
  freeCamera.value = clampCamera(freeCamera.value);
  if (selectedPoint.value && !selectablePosition(selectedPoint.value)) closePoint();
  if (selectedCell.value && !selectablePosition(selectedCell.value.position)) closePoint();
});
watch(() => props.points, () => {
  if (!selectedPoint.value) return;
  const updated = visiblePoints.value.find(point => point.id === selectedPoint.value!.id);
  if (updated) selectedPoint.value = updated; else closePoint();
});
watch(() => props.cells, () => {
  if (selectedPoint.value && !selectablePosition(selectedPoint.value)) closePoint();
  if (selectedCell.value && !selectablePosition(selectedCell.value.position)) closePoint();
});
watch(visibleEnvironment, objects => {
  if (!selectedEnvironment.value) return;
  selectedEnvironment.value = objects.find(object => object.id === selectedEnvironment.value!.id) ?? null;
});
watch(() => props.moving, moving => { if (moving) closePoint(); });
watch(() => !!props.travelVisualCenter, travelling => { if (travelling) closePoint(); });
watch(() => props.playerKey, () => closePoint());
watch(() => props.targetPopupRequest, openRequestedTargetPopup, { immediate: true, flush: 'post' });
onBeforeUnmount(() => { observer?.disconnect(); pointers.clear(); document.removeEventListener('keydown', onEscape); });
</script>

<template>
  <section class="world-map-panel anime-adventure exploration-map exploration-canvas" :class="{ 'is-lightweight': !renderScene }" :data-region-code="sceneRegionCode" :data-render-scene="renderScene" :data-surface-mode="!renderScene ? 'lightweight' : hasSurfaceScene ? 'server-scene' : groundScene ? 'cosmetic-fallback' : 'no-authorized-ground'" aria-label="探索地图">
    <div ref="viewportElement" class="world-map-viewport" :class="{ 'is-dragging': gestureActive, 'has-surface-scene': renderScene && hasContinuousGround }" :data-zoom="zoom" :data-camera-x="camera.x" :data-camera-y="camera.y" :data-visual-center-x="sceneCenter.x" :data-visual-center-y="sceneCenter.y" :data-travel-visual="!!travelVisualCenter" tabindex="0" aria-label="可拖动缩放的感知地图" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerEnd" @pointercancel="onPointerEnd" @lostpointercapture="onLostPointerCapture" @wheel="onWheel" @keydown="onMapKeydown">
      <div v-if="renderScene && !hasContinuousGround" class="world-map-fog-terrain" aria-hidden="true"><div class="map-fog-ground-grid" :style="fogTerrainStyle" :data-cell-size="cellSize"><span v-for="tile in fogTiles" :key="tile.key" class="map-fog-ground-tile" :style="{ ...fogGroundStyle, ...tile.style }" :data-fog-x="tile.x" :data-fog-y="tile.y" :data-region-code="regionCode" /></div></div>
      <div class="world-map-fog" :data-authority-x="current.x" :data-authority-y="current.y" :data-center-x="sceneCenter.x" :data-center-y="sceneCenter.y" :data-range="radius" :data-perception-empty="!perceptionRows.length" aria-hidden="true" />
      <MapSurfaceLayer v-if="renderScene && flatGroundScene" :scene="flatGroundScene" :visual-only="!hasSurfaceScene" :cells="surfaceCells" :perception-cells="perceptionCells" :mist-ground-cells="mistGroundCells" :owned-map-ground-cells="ownedMapGroundCells" :camera="camera" :viewport="viewport" :cell-size="cellSize" :z="current.z ?? 0" :fallback-region-code="regionCode" :perception-center="continuousPerception ? playerPosition : current" :perception-range="radius" :perception-moving="continuousPerception" :scenery-exclusions="sceneryExclusions" />
      <div class="world-map-world" :class="{ 'is-travel-visual': !!travelVisualCenter, 'has-surface-scene': renderScene && hasContinuousGround }" :style="{ ...worldStyle, clipPath: perceptionClip }" role="grid" :aria-label="`附近感知地图，范围 ${radius} 格`">
        <button v-for="cell in cells" :key="cell.key" type="button" class="world-map-cell" :style="cellStyle(cell)" :class="{ 'is-current': cell.isCurrent, 'is-movable': cell.isMovable, 'is-out-of-range': !cell.isMovable, 'has-point': cell.points.length, 'is-selected': selectedPoint ? cell.points.some(point => point.id === selectedPoint?.id) : selectedCell?.key === cell.key }" :data-x="cell.position.x" :data-y="cell.position.y" :data-region-id="cell.regionId" :data-region-code="cell.regionCode" :data-kind="cell.kind" data-visible="true" :data-movable="cell.isMovable" :data-passable="cell.passable" :data-reachable="cell.reachable" :disabled="blocked || (!cell.isMovable && !environmentCellIndex.has(cell.key))" :aria-label="cell.isCurrent ? '当前位置' : `前往坐标 ${cell.position.x}, ${cell.position.y}`" role="gridcell" @click="chooseCell(cell)">
          <span class="map-cell-tint" :class="`tint-${cell.kind}`" aria-hidden="true" />
          <span v-if="!renderScene" class="map-cell-coordinate">{{ cell.position.x }}, {{ cell.position.y }}</span>
        </button>
        <span v-for="edge in perceptionEdges" :key="edge.key" class="map-perception-edge" :class="`edge-${edge.edge}`" :style="edge.style" aria-hidden="true" />
      </div>
      <div class="map-entities-layer" :style="{ '--map-avatar-size': `${avatarSize}px` }">
        <template v-if="renderScene"><MapEnvironmentObject v-for="object in visibleEnvironment" :key="object.id" :object="object" :style="{ opacity: environmentVisibility(object) }" :cell-size="cellSize" :origin="environmentOrigin(object)" :depth="object.blocking === false && !object.destructible ? 1 : entityDepth(object, environmentGeometry(object, cellSize).standing ? .15 : .48)" :perception-clip="environmentPerceptionClip" :overlap-mask="environmentArtMask(object)" /></template>
        <template v-else><span v-for="object in visibleEnvironment" :key="object.id" type="button" class="map-environment-marker" :style="environmentMarkerStyle(object)" aria-hidden="true">{{ object.name }}</span></template>
        <span v-for="scenery in standingScenery" :key="scenery.item.id" class="map-standing-scenery" :style="standingSceneryStyle(scenery)" :data-scenery-id="scenery.item.id" :data-asset-key="scenery.item.assetKey" :data-x="scenery.item.x" :data-y="scenery.item.y" :data-ground-y="scenery.geometry.groundY" aria-hidden="true"><img :src="gameAssetUrl(scenery.geometry.source)" alt="" /></span>
        <span v-for="entity in entities" :key="entity.point.id" class="map-target-entity" :class="{ 'is-monster': entity.kind === 'monster', 'is-building': isBuildingPoint(entity.point), 'is-selected': selectedPoint?.id === entity.point.id }" :style="entityStyle(entity)" :data-point-id="entity.point.id" :data-x="entity.point.x" :data-y="entity.point.y" :data-cell-key="entity.cellKey" :data-entity-index="entity.index" :data-entity-count="entity.count" :data-offset-x="entity.offset.x" :data-offset-y="entity.offset.y" :data-foot-x="entity.foot.x" :data-foot-y="entity.foot.y" :data-entity-size="entitySize(entity.point)" :data-affinity="entity.affinity" :data-movable="selectablePosition(entity.point)" aria-hidden="true" :title="entity.point.name">
          <span v-if="renderScene && (entity.affinity !== 'neutral' || isBuildingPoint(entity.point))" class="map-entity-ground" :class="isBuildingPoint(entity.point) ? 'ground-building' : `ground-${entity.affinity}`" aria-hidden="true" />
          <span v-if="renderScene" class="map-entity-art-box" :style="entityArtMask(entity)" aria-hidden="true"><span class="map-entity-breath"><AnimatedMapAvatar v-if="entity.point.portrait" :portrait="entity.point.portrait" :style="normalizedArt(entity.point)" :running="false" grounded direction="down" /><img v-else-if="pointArt(entity.point)" class="map-entity-image" :style="normalizedArt(entity.point)" :src="pointArt(entity.point)" alt="" /><AnimeIcon v-else :name="pointIcon(entity.point)" size="100%" /></span></span>
          <span v-else class="map-target-label">{{ entity.point.name }}</span>
        </span>
      </div>
      <span class="map-player-position" :style="playerStyle" :data-player-x="playerPosition.x" :data-player-y="playerPosition.y" :data-movement-heading="movementDirection" :data-movement-speed="movementSpeed" aria-label="玩家当前位置"><template v-if="renderScene"><span class="map-player-ground" /><span class="map-player-art" :style="playerArtMask"><AnimatedMapAvatar v-if="playerIdentity" :portrait="playerIdentity" :identity-key="playerKey" @frame-change="playerSpriteFrame = $event" :running="moving" :direction="movementDirection" :movement-speed="movementSpeed" grounded /><img v-else-if="playerPortrait" :src="playerPortrait" alt="冒险者" /><AnimeIcon v-else name="sword" :size="44" /></span></template><span v-else class="map-player-label">我</span></span>
    </div>
    <div class="map-canvas-toolbar map-canvas-control">
      <div class="map-canvas-coordinate"><strong>{{ sceneCenter.name || '未知区域' }}</strong><span>({{ sceneCenter.x }}, {{ sceneCenter.y }}<template v-if="sceneCenter.z !== undefined">, {{ sceneCenter.z }}</template>) · ↑ N</span></div>
      <label class="map-follow-toggle"><input type="checkbox" :checked="followPlayer" aria-label="始终角色在中心" @change="setFollow" /><span>始终角色在中心</span></label>
      <div class="map-canvas-legend"><span><i class="monster" />怪物</span><span><i class="ore" />矿脉</span><span><i class="building" />建筑 / NPC</span><small>移速 {{ actualSpeedLabel }} 格/秒 · 感知 {{ radius }}</small></div>
      <div class="map-canvas-shortcuts map-canvas-control"><button type="button" aria-label="打开世界地图" :disabled="disabled || loading" @click="emit('open-region-map')"><AnimeAdventureArt name="map" :size="35" /><span>地图</span></button><button type="button" aria-label="打开自动战斗设置" :disabled="disabled || loading" @click="emit('open-auto-battle')"><AnimeAdventureArt name="auto" :size="35" /><span>自动</span></button><button type="button" class="map-sidebar-toggle" :aria-expanded="chatOpen" aria-label="打开聊天频道" @click="emit('open-chat')"><AnimeIcon name="mail" :size="29" /><span>频道</span></button></div>
    </div>
    <div class="world-map-zoom map-canvas-control"><button type="button" aria-label="放大地图" @click="setZoom(zoom + 0.1)"><AnimeIcon name="plus" :size="20" /></button><input type="range" min="50" max="300" step="1" :value="Math.round(zoom * 100)" aria-label="地图缩放倍率" @input="setZoom(Number(($event.target as HTMLInputElement).value) / 100)" /><output class="world-map-zoom-value">{{ Math.round(zoom * 100) }}%</output><button type="button" aria-label="缩小地图" @click="setZoom(zoom - 0.1)"><AnimeIcon name="minus" :size="20" /></button></div>
    <div v-if="$slots['map-footer']" class="map-canvas-manual map-canvas-control"><slot name="map-footer" /></div>
    <div v-if="loading" class="world-map-loading" role="status">正在更新附近地图…</div>
    <div v-if="actionLock" class="world-map-action-lock"><div class="world-map-action-card" role="status" aria-live="off"><img v-if="renderScene && actionArt" class="world-map-action-art" :src="actionArt" alt="" /><strong>{{ actionLock.title }}</strong><span>{{ actionLock.detail }}</span><p v-if="actionLock.countdown">剩余 <b>{{ actionLock.countdown }}</b></p><button v-if="actionLock.stopLabel" type="button" :disabled="actionLock.stopDisabled" @click="emit('stop-action')">{{ actionLock.stopLabel }}</button></div></div>
    <div v-if="selectedCell || selectedPoint || selectedEnvironment" class="map-point-sheet-wrapper"><section class="map-point-dialog exploration-window" data-window-theme="map" role="dialog" aria-modal="false" :aria-label="selectedEnvironment?.name ?? selectedPoint?.name ?? '坐标互动'"><button type="button" class="dialog-close exploration-window-close" aria-label="关闭地点详情" @click="closePoint"><span class="exploration-close-mark" aria-hidden="true" /></button><header class="exploration-window-heading"><h3>地点详情</h3></header><div class="exploration-window-body" tabindex="0" aria-label="地点详情内容">
      <template v-if="selectedEnvironment"><div class="map-sheet-heading"><span v-if="renderScene" class="dialog-point-icon environment-detail-art" :style="environmentSpriteStyle(selectedEnvironment.assetKey, selectedEnvironment)" aria-hidden="true" /><div><p class="eyebrow">{{ selectedEnvironment.destructible ? '可清理障碍' : '环境景观' }} · {{ selectedEnvironment.width }}×{{ selectedEnvironment.height }} 整格占地</p><h4>{{ selectedEnvironment.name }}</h4><p class="dialog-coordinate">({{ selectedEnvironment.x }}, {{ selectedEnvironment.y }}, {{ selectedEnvironment.z }}) · {{ environmentFootprint(selectedEnvironment).length }} 个完整方格</p></div></div><p class="dialog-description">{{ selectedEnvironment.description }}</p><p v-if="selectedEnvironment.state === 'clearing' && selectedEnvironment.remainingSeconds !== undefined" class="environment-work-copy">正在清理 · 剩余约 {{ Math.ceil(selectedEnvironment.remainingSeconds) }} 秒</p><p v-else-if="selectedEnvironment.destructible" class="environment-work-copy">清理约 {{ Math.ceil(selectedEnvironment.workSeconds) }} 秒，可能获得材料。</p><div class="dialog-actions"><button v-if="selectedEnvironmentDistance > 1" class="map-dialog-button tone-primary" type="button" :disabled="blocked || !approachEnvironmentPosition" @click="approachEnvironment">靠近</button><button v-if="selectedEnvironment.destructible" class="map-dialog-button tone-primary" type="button" :disabled="blocked || !selectedEnvironment.canClear || selectedEnvironmentDistance > 1" @click="clearEnvironment">清理</button></div><p v-if="selectedEnvironment.clearReason" class="map-observation-only">{{ selectedEnvironment.clearReason }}</p><p v-else-if="selectedEnvironmentDistance > 1" class="map-observation-only">靠近占地边缘后可互动。</p><p v-else-if="!selectedEnvironment.destructible" class="map-observation-only">这处景观无法清理，可以绕行。</p></template>
      <template v-if="selectedPoint"><div class="map-sheet-heading"><span v-if="renderScene" class="dialog-point-icon"><AnimatedMapAvatar v-if="selectedPoint.portrait" :portrait="selectedPoint.portrait" :running="false" direction="down" /><img v-else-if="pointArt(selectedPoint)" :src="pointArt(selectedPoint)" alt="" /><AnimeIcon v-else :name="pointIcon(selectedPoint)" :size="48" /></span><div><p class="eyebrow">{{ selectedPoint.type || '附近目标' }}<template v-if="pointLevel(selectedPoint) !== undefined"> · Lv.{{ pointLevel(selectedPoint) }}</template></p><h4>{{ selectedPoint.name }}</h4><p class="dialog-coordinate">({{ selectedPoint.x }}, {{ selectedPoint.y }}<template v-if="selectedPoint.z !== undefined">, {{ selectedPoint.z }}</template>)</p></div></div><p class="dialog-description">{{ selectedPoint.description || '选择下方操作，与这个目标互动。' }}</p><div v-if="selectedPoint.discovered !== false && selectedPoint.actions?.length" class="dialog-actions"><button v-for="action in selectedPoint.actions" :key="action.id" type="button" class="map-dialog-button" :class="`tone-${action.tone || 'soft'}`" :disabled="blocked" @click="runPointAction(selectedPoint, action)">{{ action.label }}</button></div><button v-else-if="selectedPoint.discovered !== false && selectedPoint.interactable !== false" type="button" class="map-dialog-button tone-primary" :disabled="blocked" @click="defaultInteract(selectedPoint)">查看互动</button><p v-else class="map-observation-only">这个目标暂时只能观察。</p></template>
      <template v-else-if="selectedCell"><p class="eyebrow">{{ selectedCell.isCurrent ? '当前位置' : '坐标互动' }}</p><h4>({{ selectedCell.position.x }}, {{ selectedCell.position.y }}<template v-if="selectedCell.position.z !== undefined">, {{ selectedCell.position.z }}</template>)</h4><ul v-if="selectedCell.points.length" class="map-cell-target-list"><li v-for="point in selectedCell.points" :key="point.id"><button type="button" class="map-cell-target" :disabled="blocked" @click="choosePoint(point)"><span v-if="renderScene" class="map-cell-target-art"><AnimatedMapAvatar v-if="point.portrait" :portrait="point.portrait" :running="false" direction="down" /><img v-else-if="pointArt(point)" :src="pointArt(point)" alt="" /><AnimeIcon v-else :name="pointIcon(point)" :size="30" /></span><span><strong>{{ point.name }}</strong><small>{{ point.type || '附近目标' }}<template v-if="pointLevel(point) !== undefined"> · Lv.{{ pointLevel(point) }}</template></small></span><AnimeIcon name="arrow" :size="19" /></button></li></ul><button v-else-if="!selectedCell.isCurrent" type="button" class="map-dialog-button tone-primary" :disabled="blocked" @click="moveToSelectedCell">前往</button><p v-else class="map-observation-only">你正站在这里。</p></template>
    </div></section></div>
  </section>
</template>

<style scoped>
.world-map-panel.anime-adventure.exploration-map.exploration-canvas.is-lightweight .world-map-cell { background: #edf3e8; color: #587263; --cell-border: #9cafa0; }
.world-map-panel.anime-adventure.exploration-map.exploration-canvas.is-lightweight .world-map-cell.is-out-of-range { background: #d4dfd6; }
.world-map-panel.anime-adventure.exploration-map.exploration-canvas.is-lightweight .world-map-cell.is-current { background: #cce8d8; --cell-border: #507e6c; }
.is-lightweight .world-map-fog { background: #dee7e1; }
.map-cell-coordinate { position: absolute; left: 4px; bottom: 3px; font-size: clamp(8px, 2vw, 11px); line-height: 1.2; }
.world-map-panel.anime-adventure.exploration-map.exploration-canvas.is-lightweight .map-target-entity { display: grid; place-items: center; width: var(--map-marker-width); height: auto; min-height: 24px; padding: 3px 4px; border: 1px solid #708b79; border-radius: 5px; background: #f8fbef; color: #335b48; }
.world-map-panel.anime-adventure.exploration-map.exploration-canvas.is-lightweight .map-target-entity.is-monster { border-color: #bb7772; color: #8c3f3b; background: #fff1ec; }
.map-target-label { display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; line-height: 1.3; }
.map-environment-marker { position: absolute; transform: translate(-50%, -50%); min-height: 23px; padding: 3px 5px; border: 1px solid #8c986e; border-radius: 5px; background: #f4f4de; color: #5f6845; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; line-height: 1.3; pointer-events: none; }
.map-player-label { position: absolute; left: -12px; top: -12px; display: grid; place-items: center; width: 24px; height: 24px; border: 2px solid #fff; border-radius: 50%; background: #2a7a6b; color: #fff; font-size: 12px; font-weight: 700; }
</style>
