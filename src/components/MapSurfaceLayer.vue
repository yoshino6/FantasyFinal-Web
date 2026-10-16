<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUpdated, ref, toRaw, watch } from 'vue';
import { SURFACE_ATLASES, surfaceSnapshotClock, type MapSurfaceScene, type SurfaceCell, type SurfaceRect } from '../map-surface';
import { MapSurfaceRenderer, type SurfaceDrawStats } from '../map-surface-renderer';
import { MapSurfaceGroundWebGL } from '../map-surface-ground-webgl';
import type { MapVector } from '../exploration-map-geometry';
const props = defineProps<{ scene: MapSurfaceScene; cells: readonly SurfaceCell[]; perceptionCells?: readonly SurfaceCell[]; mistGroundCells?: readonly SurfaceCell[]; ownedMapGroundCells?: readonly SurfaceCell[]; camera: MapVector; viewport: { width: number; height: number }; cellSize: number; z: number; fallbackRegionCode: string; perceptionCenter?: MapVector; perceptionRange?: number; perceptionMoving?: boolean; sceneryExclusions?: readonly SurfaceRect[]; visualOnly?: boolean }>();
const canvas = ref<HTMLCanvasElement>(), mist = ref<HTMLCanvasElement>(), ground = ref<HTMLCanvasElement>(), gpuActive = ref(false);
let renderer: MapSurfaceRenderer | undefined, clock = surfaceSnapshotClock(toRaw(props.scene), performance.now());
let groundRenderer: MapSurfaceGroundWebGL | undefined;
let frame = 0, timer: ReturnType<typeof setTimeout> | undefined;
let dirty = true, drawing = false, drawVersion = 0;
const currentView = () => ({ cells: props.cells, perceptionCells: props.perceptionCells, mistGroundCells: props.mistGroundCells, ownedMapGroundCells: props.ownedMapGroundCells, camera: props.camera, viewport: props.viewport, cellSize: props.cellSize, z: props.z, perceptionCenter: props.perceptionCenter, perceptionRange: props.perceptionRange, sceneryExclusions: props.sceneryExclusions });
function drawMist() {
  if (renderer && mist.value) {
    const view = currentView();
    renderer.drawMist(mist.value, props.scene, view, props.fallbackRegionCode);
    renderer.applyMistVeil(mist.value, props.scene, view);
    renderer.clearOwnedMapMist(mist.value, props.scene, view);
  }
}
function visibilityChanged() { invalidate(); }
function refreshRasterDiagnostics() {
  if (!canvas.value || !renderer) return;
  const worker = renderer.rasterWorkerDiagnostics;
  Object.assign(canvas.value.dataset, { groundWorkerActive: String(worker.active), groundWorkerPending: String(worker.pending),
    groundWorkerCompleted: String(worker.completed), groundWorkerError: worker.error },
    Object.fromEntries(Object.entries(renderer.drawDiagnostics).map(([name, value]) => [name, String(value)])));
}
function drawLatest() {
  if (!dirty || drawing || !canvas.value || !renderer) return;
  // A Vue update triggered by the stats below must not redraw the same view.
  dirty = false; drawing = true;
  const started = performance.now();
  try {
    const elapsed = clock.elapsed(performance.now());
    const view = currentView();
    gpuActive.value = groundRenderer?.draw(props.scene, renderer.staticGroundView(props.scene, view)) ?? false;
    const stats: SurfaceDrawStats = renderer.draw(canvas.value, props.scene, elapsed, view, { skipGround: gpuActive.value });
    drawMist();
    const diagnostics = groundRenderer?.diagnostics;
    // These describe the completed bitmap, never the incoming props. Keeping
    // them nonreactive also avoids a second component update for diagnostics.
    Object.assign(canvas.value.dataset, { drawVersion: String(++drawVersion), drawnCameraX: String(view.camera.x), drawnCameraY: String(view.camera.y),
      drawnPerceptionX: String(view.perceptionCenter?.x ?? ''), drawnPerceptionY: String(view.perceptionCenter?.y ?? ''),
      drawnAtMs: String(performance.now()), drawDurationMs: String(performance.now() - started) });
    const worker = renderer.rasterWorkerDiagnostics;
    Object.assign(canvas.value.dataset, { groundWorkerActive: String(worker.active), groundWorkerPending: String(worker.pending),
      groundWorkerCompleted: String(worker.completed), groundWorkerError: worker.error,
      elapsedMs: String(Math.floor(elapsed)), groundRenderer: gpuActive.value ? 'webgl2' : 'canvas2d',
      gpuUploads: String(diagnostics?.uploads ?? 0), gpuDraws: String(diagnostics?.draws ?? 0),
      gpuBytes: String(diagnostics?.dataBytes ?? 0), gpuError: diagnostics?.error ?? '',
      sceneryCount: String(stats.scenery), scenerySkipped: String(stats.skippedScenery), sceneryVariants: stats.sceneryVariants.join(','),
      walkCount: String(stats.walks), markCount: String(stats.marks), groundChunks: String(stats.groundChunks), groundGenerated: String(stats.groundGenerated),
      authorizedCells: String(stats.authorizedCells), visibleCells: String(stats.visibleCells), missingAtlases: String(stats.missingAtlases),
      groundMaterial: String(stats.groundMaterial), rasterCacheBytes: String(renderer.rasterCacheBytes), rasterCacheEvictions: String(renderer.rasterCacheEvictions) });
    const phases = renderer.drawDiagnostics;
    Object.assign(canvas.value.dataset, Object.fromEntries(Object.entries(phases).map(([name, value]) => [name, String(value)])));
  } finally { drawing = false; }
}
function invalidate() {
  dirty = true;
  // Image loading and trace expiry happen outside a Vue update. Coalesce them
  // into one frame, while prop updates consume this work before that paint.
  if (!renderer || frame) return;
  frame = requestAnimationFrame(() => { frame = 0; drawLatest(); });
}
function viewChanged() {
  dirty = true;
  // The parent motion RAF has already requested this Vue update. Waiting for
  // another RAF here makes the terrain one frame older than the actor DOM.
  if (frame) { cancelAnimationFrame(frame); frame = 0; }
}
function tick() {
  clearTimeout(timer); invalidate();
  if ([...props.scene.recentWalks, ...props.scene.combatMarks].some(trace => trace.remainingMs > clock.elapsed(performance.now()))) timer = setTimeout(tick, 1000);
}
watch(() => props.scene, () => {
  // Replace the full snapshot, including after changing world/instance/floor/account.
  clock = surfaceSnapshotClock(toRaw(props.scene), performance.now()); tick(); viewChanged();
});
// Camera/perception change each animation frame. Keep their scalar watcher
// independent so it does not retraverse all cells and entity envelopes.
watch(() => [props.camera.x, props.camera.y, props.viewport.width, props.viewport.height, props.cellSize, props.z, props.fallbackRegionCode, props.perceptionCenter?.x, props.perceptionCenter?.y, props.perceptionRange], viewChanged);
// Both arrays are immutable computed values from WorldMapPanel. Observe their
// identities instead of traversing every cell/actor on each movement frame.
watch(() => props.cells, viewChanged);
watch(() => props.perceptionCells, viewChanged);
watch(() => props.mistGroundCells, viewChanged);
watch(() => props.ownedMapGroundCells, viewChanged);
watch(() => props.sceneryExclusions, viewChanged);
onUpdated(drawLatest);
onMounted(() => { renderer = new MapSurfaceRenderer(invalidate, refreshRasterDiagnostics); if (ground.value) groundRenderer = new MapSurfaceGroundWebGL(ground.value, invalidate); tick(); viewChanged(); drawLatest(); document.addEventListener('visibilitychange', visibilityChanged); });
onBeforeUnmount(() => { clearTimeout(timer); cancelAnimationFrame(frame); renderer?.dispose(); groundRenderer?.dispose(); document.removeEventListener('visibilitychange', visibilityChanged); });
</script>
<template>
  <canvas ref="mist" class="map-surface-mist" :data-fog-mode="ownedMapGroundCells?.length ? 'owned-public-map-ground' : 'perception'" data-fog-style="irregular-inward-glass" data-fog-boundary="rounded-observed-union" data-fog-inner-cells="0.5" data-fog-covers="terrain-scenery-entities" data-fog-ground="public-ground-pattern-only" data-fog-blur-css="7" data-fog-veil-alpha="0.36" data-fog-moving="false" aria-hidden="true" />
  <canvas ref="ground" class="map-surface-gpu" :style="{ visibility: gpuActive ? 'visible' : 'hidden' }" aria-hidden="true" />
  <canvas ref="canvas" class="map-surface-layer" aria-hidden="true" :data-visual-only="visualOnly ? 'true' : undefined" :data-scope-token="scene.scopeToken" :data-snapshot-id="scene.snapshotId" :data-server-now-ms="scene.serverNowMs" :data-perception-x="perceptionCenter?.x" :data-perception-y="perceptionCenter?.y" :data-perception-range="perceptionRange" :data-perception-moving="perceptionMoving ? 'true' : undefined" :data-atlas-count="SURFACE_ATLASES.length" />
</template>
<style scoped>
.map-surface-layer { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; pointer-events: none; }
.map-surface-mist, .map-surface-gpu { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.map-surface-gpu { z-index: 0; }
/* The viewport is a separate stacking context below the fixed map controls. */
.map-surface-mist { z-index: 2147483646; }
</style>
