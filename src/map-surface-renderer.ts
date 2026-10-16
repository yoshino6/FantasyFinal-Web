import { gameAssetUrl } from './game-assets';
import sceneryBounds from './map-surface-sprite-bounds.json';
import patchBounds from './map-surface-patch-bounds.json';
import settlementBounds from './map-settlement-sprite-bounds.json';
import { authorizedSurfaceCells, surfaceSceneryGeometry, surfaceSceneryRetained, surfaceRectsOverlap, surfaceTransitionPoint, surfaceViewportRect, surfaceCellVisible, surfaceCellUnionContours, type SurfaceRect } from './map-surface';
import { surfaceEcologySeed } from './map-surface-ecology';
import { MATERIAL_SIDE, MATERIAL_SCALE, MATERIAL_GAIN, MATERIAL_TINT_LIMIT } from './map-surface-quality';
import { prepareSurfaceMaterial } from './map-surface-material';
import { materialColor, rasterGroundTile, type GroundMaterial, type GroundRasterTask, type GroundWorkerOutput } from './map-surface-ground-raster';
import { worldToViewport, type MapVector } from './exploration-map-geometry';
import { isPavedSurfaceRegion, markOpacity, roundedSurfaceRoad, safeSurfacePoints, sampleSurfaceColor, sampleSurfaceRoad, surfaceChunkCoordinate, surfaceNoise, surfaceMaterialIndex, surfacePalette, surfaceRandom, surfaceSceneryVariant, surfaceSplat, surfaceSprite, surfaceWalkFootsteps, walkOpacity, SURFACE_ATLASES, SURFACE_FOOTPRINT_ASSET, SURFACE_GROUND_MATERIAL, type MapSurfaceScene, type SurfaceCell, type SurfacePoint, type SurfaceTerrainField, type SurfaceRoad } from './map-surface';

type View = { camera: MapVector; viewport: { width: number; height: number }; cellSize: number; cells: readonly SurfaceCell[]; z: number; perceptionCells?: readonly SurfaceCell[]; perceptionCenter?: MapVector; perceptionRange?: number; sceneryExclusions?: readonly SurfaceRect[]; mistGroundCells?: readonly SurfaceCell[]; ownedMapGroundCells?: readonly SurfaceCell[] };
export type SurfaceDrawStats = { scenery: number; skippedScenery: number; sceneryVariants: [number, number]; walks: number; marks: number; groundChunks: number; groundGenerated: number; authorizedCells: number; visibleCells: number; missingAtlases: number; groundMaterial: boolean };
// One lazy tile avoids generating sixteen 128px cells for a single entering
// cell. All samples still use the identical global 1/8-cell lattice.
const CHUNK_SIDE = 1, PIXELS_PER_CELL = 128;
// A four-texel gutter prevents drawImage's fractional-edge antialiasing
// from exposing cracks between separate tiles during smooth camera movement.
const RASTER_GUTTER = 4;
const MIST_BLUR = 7, MIST_VEIL_ALPHA = .36, MIST_WHITE = '#f6f5ef', MIST_UNKNOWN = '#e9efed';
const MIST_NEAR_VEIL_ALPHA = .04, MIST_FADE_CELLS = .5, MIST_FADE_STEPS = 32, MIST_PROGRESSIVE_PIXELS = 786_432;
const MIST_INNER_FEATHER = .5, MIST_MASK_DENSITY = 16, MIST_VEIL_MASK_PIXELS = 524_288;
const atlasBounds = [...sceneryBounds, patchBounds, settlementBounds];
export const MAX_SURFACE_RASTER_CACHE_BYTES = 32 * 1024 * 1024;
const chunkAt = (world: number) => surfaceChunkCoordinate(world, CHUNK_SIDE);
const finite = (value: number) => Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
type CellGeometry = { contours: SurfacePoint[][]; boundary: { cell: SurfacePoint; edges: number[][]; corners: number[][] }[]; weight: number };
type AuthorizedGround = { key: string; known: SurfaceCell[]; passableByRegion: Map<number, SurfaceCell[]>; passable: SurfaceCell[]; anchors: Map<string, SurfaceCell> };
const CELL_EDGES = [[0, 1], [1, 0], [0, -1], [-1, 0]], CELL_CORNERS = [[-1, 1], [1, 1], [-1, -1], [1, -1]];

/** Surface rendering never changes collision or the original DOM hit targets. */
export class MapSurfaceRenderer {
  private chunks = new Map<string, HTMLCanvasElement>();
  private transitions = new Map<string, HTMLCanvasElement>();
  private roads = new Map<string, { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number }>();
  private atlases = new Map<number, HTMLImageElement>();
  private materials: GroundMaterial[] = [];
  private inks = new Map<string, { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number }>();
  private rasterCache = new Map<string, { bytes: number; remove: () => void }>();
  private rasterBytes = 0;
  private rasterEvictions = 0;
  private groundGenerated = 0;
  private disposed = false;
  private scope = '';
  private ecologySeed = 0;
  private trails = document.createElement('canvas');
  private footprint?: HTMLImageElement;
  private visibility = document.createElement('canvas');
  private visibilityKey = '';
  private perceptionVisibility = document.createElement('canvas');
  private perceptionVisibilityKey = '';
  private perceptionMaskBuilds = 0;
  private perceptionMaskReuses = 0;
  private visibilityMaskBuilds = 0;
  private lastDrawPhases = { groundMs: 0, tracesMs: 0, sceneryMs: 0, visibilityMs: 0 };
  private mistBase = document.createElement('canvas');
  private mistGround = document.createElement('canvas');
  private mistOuterVisibility = document.createElement('canvas');
  private mistNearVisibility = document.createElement('canvas');
  private mistBlend = document.createElement('canvas');
  // The upper veil replaces the former outward blend. Reuse those two bounded
  // backings for its mask and persistent source instead of allocating more.
  private mistVeilMask = this.mistNearVisibility;
  private mistVeilMaskView?: { key: string; x: number; y: number; width: number; height: number };
  private mistVeilMaskBuilds = 0;
  private mistBlendView?: { base: NonNullable<MapSurfaceRenderer['mistBaseView']>; perception: AuthorizedGround };
  private mistDistanceMaskBuilds = 0;
  private mistBlendBuilds = 0;
  private mistOuterVisibilityKey = '';
  private mistOuterMaskBuilds = 0;
  private mistSnapshot?: { scope: string; z: number; cells: readonly SurfaceCell[] | undefined; surfaceCells: readonly SurfaceCell[]; authorization: AuthorizedGround; fieldsKey: string; groups: Map<number, SurfaceCell[]>; fields: Map<number, SurfaceTerrainField>; publicCells: SurfaceCell[]; publicAnchors: Map<string, SurfaceCell> };
  private mistBaseView?: { snapshot: NonNullable<MapSurfaceRenderer['mistSnapshot']>; camera: MapVector; viewport: View['viewport']; targetViewport: View['viewport']; cellSize: number; dpr: number; scale: number; materials: number; padding: number; progressive: boolean; backdrop?: SurfaceTerrainField };
  private mistBuilds = 0;
  private mistReuses = 0;
  private mistPatternBuilds = 0;
  private mistScatterBuilds = 0;
  private mistColorSamples = 0;
  private mistBackdropBuilds = 0;
  private mistMs = 0;
  private geometryCache = new Map<string, CellGeometry>();
  private geometryWeight = 0;
  private authorizedGround?: AuthorizedGround;
  private perceivedGround?: { authorization: AuthorizedGround; key: string; ground: AuthorizedGround };
  private ownedMapGround?: { key: string; owned: SurfaceCell[]; cells: SurfaceCell[]; visible: SurfaceCell[] };
  private groundPrefetch?: { authorization: AuthorizedGround; scope: string; x: number; y: number; cells: SurfaceCell[]; fields: Map<number, SurfaceTerrainField>; probes: number };
  private groundPrefetchCreated = 0;
  private sceneryScene?: MapSurfaceScene;
  private orderedScenery: MapSurfaceScene['scenery'] = [];
  private groundWorker?: Worker;
  private workerReady = false;
  private gpuGround = false;
  private workerDisabled = false;
  private workerError = '';
  private workerTimer?: ReturnType<typeof setTimeout>;
  private workerGeneration = 0;
  private workerCompleted = 0;
  private workerDiscarded = 0;
  private workerBusy?: GroundRasterTask;
  private workerBusyBackground = false;
  private workerQueue = new Map<string, { job: GroundRasterTask; frame: number; priority: number; background: boolean }>();
  private groundPlaceholders = new Set<string>();
  private transitionPlaceholders = new Set<string>();
  private materialCanvases: HTMLCanvasElement[] = [];
  private pavedMaterials = new Map<string, HTMLCanvasElement>();
  private pavedMaterialBuilds = 0;
  private drawFrame = 0;
  private rasterFocus = { x: 0, y: 0 };
  constructor(private invalidate: () => void, private diagnosticsChanged: () => void = () => {}) {
    const footprint = new Image();
    footprint.onload = () => { if (!this.disposed) { this.footprint = footprint; this.invalidate(); } };
    footprint.onerror = () => { if (!this.disposed) this.invalidate(); };
    footprint.src = gameAssetUrl(SURFACE_FOOTPRINT_ASSET);
    this.mistNearVisibility.width = this.mistNearVisibility.height = this.mistBlend.width = this.mistBlend.height = 0;
    SURFACE_ATLASES.forEach((path, index) => {
      const image = new Image();
      image.onload = () => { if (!this.disposed) { this.atlases.set(index, image); this.invalidate(); } };
      // A missing painted sprite stays absent rather than becoming a geometric substitute.
      image.onerror = () => { if (!this.disposed) this.invalidate(); };
      image.src = gameAssetUrl(path);
    });
    if (SURFACE_GROUND_MATERIAL) {
      const image = new Image();
      image.onload = () => {
        if (this.disposed) return;
        // Keep brush strokes readable at normal zoom. Simplicity comes from
        // the authored pattern, not from blurring its leaves and stones.
        const tile = document.createElement('canvas'); tile.width = tile.height = MATERIAL_SIDE;
        const ink = tile.getContext('2d')!; ink.imageSmoothingQuality = 'high';
        for (let index = 0; index < 6; index++) {
          ink.clearRect(0, 0, tile.width, tile.height);
          ink.drawImage(image, index % 3 * image.naturalWidth / 3, Math.floor(index / 3) * image.naturalHeight / 2, image.naturalWidth / 3, image.naturalHeight / 2, 0, 0, tile.width, tile.height);
          const pixels = prepareSurfaceMaterial(ink.getImageData(0, 0, tile.width, tile.height).data, MATERIAL_SIDE), mean = [0, 0, 0];
          for (let i = 0; i < pixels.length; i += 4) for (let channel = 0; channel < 3; channel++) mean[channel] += pixels[i + channel];
          this.materials.push({ pixels, mean: mean.map(total => total / (tile.width * tile.height)) });
          const source = document.createElement('canvas'); source.width = source.height = MATERIAL_SIDE;
          const imageData = source.getContext('2d')!.createImageData(MATERIAL_SIDE, MATERIAL_SIDE); imageData.data.set(pixels); source.getContext('2d')!.putImageData(imageData, 0, 0); this.materialCanvases.push(source);
        }
        this.clearRasterCache(); this.initializeGroundWorker(); this.invalidate();
      };
      image.src = gameAssetUrl(SURFACE_GROUND_MATERIAL);
    }
  }
  get rasterCacheBytes() { return this.rasterBytes; }
  get rasterCacheEvictions() { return this.rasterEvictions; }
  get drawDiagnostics() { return { ...this.lastDrawPhases, perceptionMaskBuilds: this.perceptionMaskBuilds, perceptionMaskReuses: this.perceptionMaskReuses, visibilityMaskBuilds: this.visibilityMaskBuilds,
    groundPrefetchCreated: this.groundPrefetchCreated, groundPrefetchCandidates: this.groundPrefetch?.cells.length ?? 0, groundPrefetchProbes: this.groundPrefetch?.probes ?? 0,
    ownedMapGroundCells: this.ownedMapGround?.owned.length ?? 0,
    mistBuilds: this.mistBuilds, mistReuses: this.mistReuses, mistPatternBuilds: this.mistPatternBuilds,
    mistScatterBuilds: this.mistScatterBuilds, mistColorSamples: this.mistColorSamples, mistMs: this.mistMs,
    mistBackdropBuilds: this.mistBackdropBuilds, mistDecorativeBackdrop: !!this.mistBaseView?.backdrop,
    mistAuthorizedCells: [...(this.mistSnapshot?.groups.values() ?? [])].reduce((sum, cells) => sum + cells.length, 0),
    pavedMaterialBuilds: this.pavedMaterialBuilds, pavedMaterialCacheBytes: [...this.pavedMaterials.values()].reduce((sum, source) => sum + source.width * source.height * 4, 0),
    mistOuterMaskBuilds: this.mistOuterMaskBuilds, mistOuterMaskBytes: this.mistOuterVisibility.width * this.mistOuterVisibility.height * 4,
    mistDistanceMaskBuilds: this.mistDistanceMaskBuilds, mistBlendBuilds: this.mistBlendBuilds,
    mistVeilMaskBuilds: this.mistVeilMaskBuilds, mistVeilMaskBytes: this.mistVeilMask.width * this.mistVeilMask.height * 4,
    mistCacheBytes: (this.mistBase.width * this.mistBase.height + this.mistGround.width * this.mistGround.height + this.mistOuterVisibility.width * this.mistOuterVisibility.height + this.mistNearVisibility.width * this.mistNearVisibility.height + this.mistBlend.width * this.mistBlend.height) * 4 }; }
  get groundWorkerDiagnostics() { return { ready: this.workerReady, disabled: this.workerDisabled, generation: this.workerGeneration, queued: this.workerQueue.size, inFlight: this.workerBusy ? 1 : 0, placeholders: this.groundPlaceholders.size, completed: this.workerCompleted, discarded: this.workerDiscarded, error: this.workerError }; }
  get rasterWorkerDiagnostics() { return { active: !!this.groundWorker && !this.workerDisabled, pending: this.workerQueue.size + (this.workerBusy ? 1 : 0), completed: this.workerCompleted, error: this.workerError }; }
  private clearRasterCache() { this.workerGeneration++; this.workerQueue.clear(); this.groundPlaceholders.clear(); this.transitionPlaceholders.clear(); this.rasterCache.clear(); this.rasterBytes = 0; this.rasterEvictions = 0; this.chunks.clear(); this.transitions.clear(); this.roads.clear(); this.inks.clear(); this.groundPrefetch = undefined; this.groundPrefetchCreated = 0; }
  private initializeGroundWorker() {
    if (this.disposed || this.gpuGround || this.workerDisabled || this.groundWorker || this.materials.length !== 6) return;
    try {
      if (typeof Worker === 'undefined') { this.workerDisabled = true; return; }
      const worker = new Worker(new URL('./map-surface-ground-worker.ts', import.meta.url), { type: 'module' }); this.groundWorker = worker;
      worker.onmessage = event => { if (this.groundWorker === worker && !this.gpuGround) this.receiveGroundRaster(event.data as GroundWorkerOutput); };
      worker.onerror = event => { event.preventDefault(); if (this.groundWorker === worker && !this.gpuGround) this.failGroundWorker(event.message || 'Ground worker failed to load'); };
      worker.onmessageerror = () => { if (this.groundWorker === worker && !this.gpuGround) this.failGroundWorker('Ground worker message failed'); };
      const materials = this.materials.map(material => ({ mean: [...material.mean], pixels: new Uint8ClampedArray(material.pixels) }));
      worker.postMessage({ kind: 'init', materials }, materials.map(material => material.pixels.buffer));
      this.workerTimer = setTimeout(() => { if (this.groundWorker === worker && !this.gpuGround) this.failGroundWorker('Ground worker initialization timed out'); }, 5000);
    } catch (error) { this.failGroundWorker(String(error)); }
  }
  private failGroundWorker(message: string) {
    if (this.disposed || this.gpuGround) return;
    clearTimeout(this.workerTimer); this.groundWorker?.terminate(); this.groundWorker = undefined; this.workerReady = false; this.workerDisabled = true; this.workerError = message; this.workerBusy = undefined; this.workerBusyBackground = false;
    this.clearRasterCache(); this.invalidate();
  }
  private receiveGroundRaster(message: GroundWorkerOutput) {
    if (this.disposed || this.gpuGround) return;
    if (message.kind === 'failed') { this.failGroundWorker(message.message); return; }
    if (message.kind === 'ready') { clearTimeout(this.workerTimer); this.workerReady = true; this.dispatchGroundRaster(); this.invalidate(); return; }
    const busy = this.workerBusy, job = message.job;
    if (!busy || job.key !== busy.key || job.generation !== busy.generation) { this.workerDiscarded++; return; }
    const background = this.workerBusyBackground;
    clearTimeout(this.workerTimer); this.workerBusy = undefined; this.workerBusyBackground = false;
    const exact = JSON.stringify(job) === JSON.stringify(busy);
    const canvas = job.kind === 'chunk' ? this.chunks.get(job.key) : this.transitions.get(job.key), placeholders = job.kind === 'chunk' ? this.groundPlaceholders : this.transitionPlaceholders;
    const side = busy.kind === 'chunk' ? busy.chunkSide * busy.density + busy.gutter * 2 : busy.density;
    if (exact && job.generation === this.workerGeneration && job.scope === this.scope && job.ecologySeed === this.ecologySeed && canvas && placeholders.has(job.key)
      && message.side === side && message.pixels instanceof Uint8ClampedArray && message.pixels.length === side * side * 4) {
      const context = canvas.getContext('2d')!, pixels = context.createImageData(side, side); pixels.data.set(message.pixels); context.putImageData(pixels, 0, 0); placeholders.delete(job.key); this.workerCompleted++;
    } else this.workerDiscarded++;
    this.dispatchGroundRaster();
    if (background) { this.fillGroundPrefetch(); this.diagnosticsChanged(); }
    else this.invalidate();
  }
  private queueGroundRaster(field: SurfaceTerrainField, cx: number, cy: number, density: number, key: string, background = false) {
    this.queueRaster({ kind: 'chunk', key, generation: this.workerGeneration, scope: this.scope, ecologySeed: this.ecologySeed, field: { ...field }, cx, cy, density, chunkSide: CHUNK_SIDE, gutter: RASTER_GUTTER }, background);
  }
  private queueRaster(job: GroundRasterTask, background = false) {
    if (!this.groundWorker || this.workerDisabled) return;
    if (this.workerBusy?.kind === job.kind && this.workerBusy.key === job.key && this.workerBusy.generation === this.workerGeneration) {
      // A speculative tile may enter the viewport while its worker job is
      // running. Its completion then owes the current frame an invalidation.
      if (!background) this.workerBusyBackground = false;
      return;
    }
    const key = `${job.kind}:${job.key}`, entry = { job, frame: this.drawFrame, priority: Math.abs(job.cx * CHUNK_SIDE - this.rasterFocus.x) + Math.abs(job.cy * CHUNK_SIDE - this.rasterFocus.y), background };
    this.workerQueue.set(key, entry);
    if (this.workerQueue.size > 64) { const stale = [...this.workerQueue.values()].sort((a, b) => Number(b.background) - Number(a.background) || a.frame - b.frame || b.priority - a.priority)[0]; this.workerQueue.delete(`${stale.job.kind}:${stale.job.key}`); }
    // Collect the current draw's complete visible set before choosing the
    // nearest job; a changing view replaces stale queued work, not 60 jobs/s.
    queueMicrotask(() => this.dispatchGroundRaster());
  }
  private dispatchGroundRaster() {
    if (this.disposed || this.gpuGround || !this.workerReady || !this.groundWorker || this.workerBusy || !this.workerQueue.size) return;
    const next = [...this.workerQueue.values()].sort((a, b) => Number(a.background) - Number(b.background) || b.frame - a.frame || a.priority - b.priority)[0]; this.workerQueue.delete(`${next.job.kind}:${next.job.key}`);
    if (next.job.generation !== this.workerGeneration || !(next.job.kind === 'chunk' ? this.chunks : this.transitions).has(next.job.key)) { this.dispatchGroundRaster(); return; }
    this.workerBusy = next.job; this.workerBusyBackground = next.background;
    try { const worker = this.groundWorker; worker.postMessage({ kind: 'raster', job: next.job }); this.workerTimer = setTimeout(() => { if (this.groundWorker === worker && !this.gpuGround) this.failGroundWorker('Ground worker raster timed out'); }, 5000); }
    catch (error) { this.failGroundWorker(String(error)); }
  }
  private pauseGroundWorker() {
    clearTimeout(this.workerTimer); this.groundWorker?.terminate(); this.groundWorker = undefined; this.workerReady = false; this.workerBusy = undefined; this.workerBusyBackground = false; this.workerQueue.clear(); this.workerGeneration++;
    // Keep completed sources, road/mark rasters and temporary canvases. A CPU
    // context recovery requeues only the still-unfinished ground sources.
  }
  private touchRaster(key: string) {
    const entry = this.rasterCache.get(key);
    if (entry) { this.rasterCache.delete(key); this.rasterCache.set(key, entry); }
  }
  private cacheRaster(key: string, canvas: HTMLCanvasElement, remove: () => void) {
    const bytes = canvas.width * canvas.height * 4;
    this.rasterCache.set(key, { bytes, remove }); this.rasterBytes += bytes;
    // Bound real RGBA allocation across ground, roads and ink, rather than
    // relying on an entry count whose pixel sizes can differ dramatically.
    while (this.rasterBytes > MAX_SURFACE_RASTER_CACHE_BYTES || this.rasterCache.size > 1024) {
      const oldest = this.rasterCache.keys().next().value!, entry = this.rasterCache.get(oldest)!;
      this.rasterCache.delete(oldest); this.rasterBytes -= entry.bytes; this.rasterEvictions++; entry.remove();
    }
  }
  dispose() { this.disposed = true; clearTimeout(this.workerTimer); this.groundWorker?.terminate(); this.groundWorker = undefined; this.workerBusy = undefined; this.workerBusyBackground = false; this.workerReady = false; this.clearRasterCache(); this.geometryCache.clear(); this.geometryWeight = 0; this.authorizedGround = undefined; this.perceivedGround = undefined; this.ownedMapGround = undefined; this.sceneryScene = undefined; this.orderedScenery = []; this.atlases.clear(); this.materials = []; for (const source of this.materialCanvases) source.width = source.height = 0; this.materialCanvases = []; for (const source of this.pavedMaterials.values()) source.width = source.height = 0; this.pavedMaterials.clear(); this.trails.width = 0; this.trails.height = 0; this.visibility.width = 0; this.visibility.height = 0; this.perceptionVisibility.width = 0; this.perceptionVisibility.height = 0; this.mistBase.width = this.mistBase.height = 0; this.mistGround.width = this.mistGround.height = 0; this.mistOuterVisibility.width = this.mistOuterVisibility.height = 0; this.mistNearVisibility.width = this.mistNearVisibility.height = this.mistBlend.width = this.mistBlend.height = 0; this.mistOuterVisibilityKey = ''; this.mistSnapshot = undefined; this.mistBaseView = undefined; this.mistBlendView = undefined; this.mistVeilMask.width = this.mistVeilMask.height = 0; this.mistVeilMaskView = undefined; }
  private geometry(cells: readonly SurfacePoint[]): CellGeometry {
    const key = cells.map(cell => `${cell.x},${cell.y}`).join(';'), cached = this.geometryCache.get(key);
    if (cached) { this.geometryCache.delete(key); this.geometryCache.set(key, cached); return cached; }
    const known = new Set(cells.map(cell => `${cell.x}:${cell.y}`)), contours = surfaceCellUnionContours(cells);
    const boundary = cells.flatMap(cell => {
      const edges = CELL_EDGES.filter(([dx, dy]) => !known.has(`${cell.x + dx}:${cell.y + dy}`));
      const corners = CELL_CORNERS.filter(([dx, dy]) => !known.has(`${cell.x + dx}:${cell.y + dy}`) && known.has(`${cell.x + dx}:${cell.y}`) && known.has(`${cell.x}:${cell.y + dy}`));
      return edges.length || corners.length ? [{ cell: { x: cell.x, y: cell.y }, edges, corners }] : [];
    });
    const result = { contours, boundary, weight: cells.length + contours.reduce((sum, contour) => sum + contour.length, 0) };
    // Geometry is independent of camera, zoom and pixel ratio. Bound vectors
    // separately from the RGBA cache, including fragmented authorized windows.
    if (result.weight <= 8192) {
      this.geometryCache.set(key, result); this.geometryWeight += result.weight;
      while (this.geometryWeight > 8192 || this.geometryCache.size > 64) {
        const oldest = this.geometryCache.keys().next().value!, entry = this.geometryCache.get(oldest)!;
        this.geometryCache.delete(oldest); this.geometryWeight -= entry.weight;
      }
    }
    return result;
  }
  private groundAuthorization(scene: MapSurfaceScene, cells: readonly SurfaceCell[], z: number): AuthorizedGround {
    // Include values as well as identities: a caller may update passability or
    // replace a terrain field in place without allocating another cell array.
    const key = `${z}|${scene.terrainFields.map(field => `${field.regionId}:${field.regionCode}:${field.seed}`).join(';')}|${cells.map(cell => `${cell.x},${cell.y},${cell.z ?? z},${cell.regionId},${cell.regionCode},${cell.passable === true ? 1 : cell.passable === false ? 0 : '?'}`).join(';')}`;
    if (this.authorizedGround?.key === key) return this.authorizedGround;
    const known = authorizedSurfaceCells(scene, cells, z), passableByRegion = new Map<number, SurfaceCell[]>();
    for (const cell of known) {
      if (cell.passable !== false) { const passable = passableByRegion.get(cell.regionId!) ?? []; passable.push(cell); passableByRegion.set(cell.regionId!, passable); }
    }
    return this.authorizedGround = { key, known, passableByRegion, passable: known.filter(cell => cell.passable === true), anchors: new Map(known.map(cell => [`${cell.x}:${cell.y}`, cell])) };
  }
  private perceptionAuthorization(scene: MapSurfaceScene, authorization: AuthorizedGround, view: View): AuthorizedGround {
    if (view.perceptionCells === undefined) return authorization;
    const key = view.perceptionCells.map(cell => `${cell.x},${cell.y},${cell.z ?? view.z},${cell.regionId},${cell.regionCode}`).join(';');
    if (this.perceivedGround?.authorization === authorization && this.perceivedGround.key === key) return this.perceivedGround.ground;
    // Actual perception only removes from the server-authorized ground. Keep
    // the authorized cell's passability and metadata, never the caller's copy.
    const known = authorizedSurfaceCells(scene, view.perceptionCells, view.z).flatMap(cell => {
      const allowed = authorization.anchors.get(`${cell.x}:${cell.y}`); return allowed && allowed.regionId === cell.regionId ? [allowed] : [];
    });
    const passableByRegion = new Map<number, SurfaceCell[]>();
    for (const cell of known) if (cell.passable !== false) { const cells = passableByRegion.get(cell.regionId!) ?? []; cells.push(cell); passableByRegion.set(cell.regionId!, cells); }
    const ground = { key, known, passableByRegion, passable: known.filter(cell => cell.passable === true), anchors: new Map(known.map(cell => [`${cell.x}:${cell.y}`, cell])) };
    this.perceivedGround = { authorization, key, ground }; return ground;
  }
  private ownedMapGroundFor(scene: MapSurfaceScene, view: View) {
    if (scene.scopeToken !== `world:${view.z}` || !view.ownedMapGroundCells?.length) { this.ownedMapGround = undefined; return; }
    const authorization = this.groundAuthorization(scene, view.cells, view.z), foreground = this.perceptionAuthorization(scene, authorization, view);
    const key = `${scene.scopeToken}|${authorization.key}|${foreground.key}|${view.ownedMapGroundCells.map(cell => `${cell.x},${cell.y},${cell.z ?? view.z},${cell.regionId},${cell.regionCode}`).join(';')}`;
    if (this.ownedMapGround?.key === key) return this.ownedMapGround;
    // These cells come only from the separately validated owned-map receipt.
    // They authorize static terrain, never observed objects or interaction.
    const owned = authorizedSurfaceCells(scene, view.ownedMapGroundCells, view.z).filter(cell => {
      const actual = authorization.anchors.get(`${cell.x}:${cell.y}`);
      return !actual || actual.regionId === cell.regionId;
    });
    const cells = new Map(authorization.anchors), visible = new Map(foreground.anchors);
    for (const cell of owned) {
      const key = `${cell.x}:${cell.y}`;
      if (!cells.has(key)) cells.set(key, cell);
      if (!visible.has(key)) visible.set(key, cell);
    }
    return this.ownedMapGround = { key, owned, cells: [...cells.values()], visible: [...visible.values()] };
  }
  /** GPU terrain uses this view; all object/trace rendering keeps the original. */
  staticGroundView(scene: MapSurfaceScene, view: View): View {
    const ground = this.ownedMapGroundFor(scene, view);
    return ground?.owned.length ? { ...view, cells: ground.cells, perceptionCells: ground.visible } : view;
  }
  clearOwnedMapMist(canvas: HTMLCanvasElement, scene: MapSurfaceScene, view: View) {
    if (this.disposed || !canvas.width || !canvas.height || view.cellSize <= 0 || view.viewport.width <= 0 || view.viewport.height <= 0) return;
    const owned = this.ownedMapGroundFor(scene, view)?.owned;
    if (!owned?.length) return;
    const viewport = surfaceViewportRect(view.camera, view.viewport, view.cellSize), visible = owned.filter(cell => surfaceCellVisible(cell, viewport));
    if (!visible.length) return;
    const context = canvas.getContext('2d')!;
    context.save(); context.setTransform(canvas.width / view.viewport.width, 0, 0, canvas.height / view.viewport.height, 0, 0);
    context.globalAlpha = 1; context.globalCompositeOperation = 'destination-out'; context.fillStyle = '#000';
    this.clip(context, visible, view); context.fillRect(0, 0, view.viewport.width, view.viewport.height); context.restore();
  }
  private scenery(scene: MapSurfaceScene) {
    if (this.sceneryScene !== scene) {
      this.sceneryScene = scene; this.orderedScenery = scene.scenery.slice(0, 1024).sort((a, b) => b.y - a.y || a.id.localeCompare(b.id));
    }
    return this.orderedScenery;
  }
  private chunk(field: SurfaceTerrainField, cx: number, cy: number, density = PIXELS_PER_CELL, background = false) {
    const key = `${field.regionId}:${field.regionCode}:${field.seed}:${this.ecologySeed}:${density}:${cx}:${cy}`;
    const existing = this.chunks.get(key);
    if (existing) { this.touchRaster(`ground:${key}`); if (this.groundPlaceholders.has(key)) this.queueGroundRaster(field, cx, cy, density, key, background); return existing; }
    this.groundGenerated++;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = CHUNK_SIDE * density + RASTER_GUTTER * 2;
    const context = canvas.getContext('2d')!;
    if (this.groundWorker && !this.workerDisabled) {
      // Continuous authored brushwork is available immediately. This temporary
      // pattern contains no per-pixel JS loop and no gameplay/world discovery.
      const source = this.preparedMaterial(field.regionCode), pattern = source && context.createPattern(source, 'repeat');
      if (pattern) {
        const scale = density * MATERIAL_SCALE / MATERIAL_SIDE;
        pattern.setTransform(new DOMMatrix([scale, 0, 0, -scale, RASTER_GUTTER - .5 - density * (cx * CHUNK_SIDE - .5), RASTER_GUTTER - .5 + density * (cy * CHUNK_SIDE - .5 + CHUNK_SIDE)]));
        context.fillStyle = pattern; context.fillRect(0, 0, canvas.width, canvas.height);
        const color = sampleSurfaceColor(0, 0, field); context.globalAlpha = .12; context.fillStyle = `rgb(${color.join(',')})`; context.fillRect(0, 0, canvas.width, canvas.height); context.globalAlpha = 1;
      } else { const color = sampleSurfaceColor(0, 0, field); context.fillStyle = `rgb(${color.join(',')})`; context.fillRect(0, 0, canvas.width, canvas.height); }
      this.groundPlaceholders.add(key);
    } else {
      const result = rasterGroundTile(field, cx, cy, this.ecologySeed, this.materials, density, CHUNK_SIDE, RASTER_GUTTER), pixels = context.createImageData(result.side, result.side); pixels.data.set(result.pixels); context.putImageData(pixels, 0, 0);
    }
    this.chunks.set(key, canvas);
    this.cacheRaster(`ground:${key}`, canvas, () => { this.chunks.delete(key); this.groundPlaceholders.delete(key); this.workerQueue.delete(`chunk:${key}`); });
    if (this.groundPlaceholders.has(key)) this.queueGroundRaster(field, cx, cy, density, key, background);
    return canvas;
  }
  private prefetchGround(scene: MapSurfaceScene, authorization: AuthorizedGround, visible: readonly SurfaceCell[], view: View) {
    // Never turn a missing/failed worker or GPU draw into synchronous raster
    // work. Visible sources have already entered the foreground queue.
    if (this.gpuGround || !this.groundWorker || !this.workerReady || this.workerDisabled) return;
    const x = Math.round(view.camera.x), y = Math.round(view.camera.y);
    let window = this.groundPrefetch;
    if (!window || window.authorization !== authorization || window.scope !== this.scope || window.x !== x || window.y !== y) {
      const cells: SurfaceCell[] = [], visibleKeys = new Set(visible.map(cell => `${cell.x}:${cell.y}`)); let probes = 0;
      // Probe the existing authorization dictionary in nearest-first rings.
      // A large authorized window never causes a full-window sort or raster.
      for (let radius = 0; probes < 1024 && cells.length < 128; radius++) {
        for (let dx = -radius; dx <= radius && probes < 1024 && cells.length < 128; dx++) {
          const dy = radius - Math.abs(dx);
          for (const offsetY of dy ? [-dy, dy] : [0]) {
            if (probes >= 1024 || cells.length >= 128) break;
            const key = `${x + dx}:${y + offsetY}`, cell = authorization.anchors.get(key); probes++;
            if (cell && !visibleKeys.has(key)) cells.push(cell);
          }
        }
      }
      window = this.groundPrefetch = { authorization, scope: this.scope, x, y, cells, fields: new Map(scene.terrainFields.map(field => [field.regionId, field])), probes };
    }
    this.fillGroundPrefetch();
  }
  private fillGroundPrefetch() {
    const window = this.groundPrefetch;
    if (!window || window.scope !== this.scope || window.authorization !== this.authorizedGround || this.gpuGround || !this.groundWorker || !this.workerReady || this.workerDisabled) return;
    let created = 0;
    for (const cell of window.cells) {
      if (created >= 6 || this.workerQueue.size + (this.workerBusy ? 1 : 0) >= 48) break;
      // Speculative sources may use free space, never evict completed visible
      // tiles or churn a full cache on an otherwise unchanged viewport.
      const bytes = (CHUNK_SIDE * PIXELS_PER_CELL + RASTER_GUTTER * 2) ** 2 * 4;
      if (this.rasterBytes + bytes > MAX_SURFACE_RASTER_CACHE_BYTES || this.rasterCache.size >= 1024) break;
      const field = window.fields.get(cell.regionId!); if (!field) continue;
      const cx = chunkAt(cell.x), cy = chunkAt(cell.y), key = `${field.regionId}:${field.regionCode}:${field.seed}:${this.ecologySeed}:${PIXELS_PER_CELL}:${cx}:${cy}`;
      // Existing placeholders keep their original queue age/priority. A tile
      // becoming visible is promoted by the regular foreground draw instead.
      if (this.chunks.has(key)) continue;
      this.chunk(field, cx, cy, PIXELS_PER_CELL, true); created++; this.groundPrefetchCreated++;
    }
  }
  private clip(context: CanvasRenderingContext2D, cells: readonly SurfaceCell[], view: View) {
    context.beginPath();
    for (const contour of this.geometry(cells).contours) {
      contour.forEach((point, index) => { const p = this.point(point, view); if (index) context.lineTo(p.x, p.y); else context.moveTo(p.x, p.y); }); context.closePath();
    }
    context.clip();
  }
  private drawTerrainTransitions(context: CanvasRenderingContext2D, scene: MapSurfaceScene, cells: readonly SurfaceCell[], view: View, authorized: readonly SurfaceCell[] = cells) {
    // Off-screen known neighbours still participate in ecotones. Culling them
    // from this metadata would create artificial seams at the viewport edge.
    const lookup = new Map(authorized.map(cell => [`${cell.x}:${cell.y}`, cell.regionId!])), fields = new Map(scene.terrainFields.map(field => [field.regionId, field]));
    for (const cell of cells) {
      const mask: number[] = []; let boundary = false;
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
        const region = lookup.get(`${cell.x + x}:${cell.y + y}`);
        mask.push(region ?? 0);
        if (region !== undefined && region !== cell.regionId) boundary = true;
      }
      if (!boundary) continue;
      // Per-cell neighbourhoods survive a perception-window step. A newly
      // authorized edge only rebuilds the affected 128px cells, rather than
      // invalidating every 512px chunk touched by the changing window.
      const fieldIds = [...new Set(mask)].filter(id => id > 0), key = `${cell.x}:${cell.y}:${this.ecologySeed}:${fieldIds.map(id => `${id}:${fields.get(id)?.seed}:${fields.get(id)?.regionCode}`).join(';')}:${mask.join(',')}`;
      const cx = chunkAt(cell.x), cy = chunkAt(cell.y);
      const job = { kind: 'transition' as const, key, generation: this.workerGeneration, scope: this.scope, ecologySeed: this.ecologySeed, x: cell.x, y: cell.y, cx, cy, density: PIXELS_PER_CELL, chunkSide: CHUNK_SIDE, gutter: RASTER_GUTTER, fields: fieldIds.map(id => ({ ...fields.get(id)! })), mask };
      let canvas = this.transitions.get(key);
      if (canvas) { this.touchRaster(`transition:${key}`); if (this.transitionPlaceholders.has(key)) this.queueRaster(job); }
      if (!canvas) {
        canvas = document.createElement('canvas'); canvas.width = canvas.height = PIXELS_PER_CELL;
        const ink = canvas.getContext('2d')!, sourceX = (cell.x - cx * CHUNK_SIDE) * PIXELS_PER_CELL + RASTER_GUTTER, sourceY = ((cy + 1) * CHUNK_SIDE - cell.y - 1) * PIXELS_PER_CELL + RASTER_GUTTER;
        if (this.groundWorker && !this.workerDisabled) {
          ink.drawImage(this.chunk(fields.get(cell.regionId!)!, cx, cy), sourceX, sourceY, PIXELS_PER_CELL, PIXELS_PER_CELL, 0, 0, PIXELS_PER_CELL, PIXELS_PER_CELL);
          // Short-lived Canvas washes soften a cold join without a 128²×9
          // main-thread mix. The worker replaces them with the exact ecotone.
          for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
            const id = mask[(y + 1) * 3 + x + 1]; if (!id || id === cell.regionId) continue;
            const color = sampleSurfaceColor(0, 0, fields.get(id)!), gradient = ink.createLinearGradient((.5 + x * .5) * PIXELS_PER_CELL, (.5 - y * .5) * PIXELS_PER_CELL, PIXELS_PER_CELL / 2, PIXELS_PER_CELL / 2);
            gradient.addColorStop(0, `rgba(${color.join(',')},.32)`); gradient.addColorStop(1, `rgba(${color.join(',')},0)`); ink.fillStyle = gradient; ink.fillRect(0, 0, PIXELS_PER_CELL, PIXELS_PER_CELL);
          }
          this.transitionPlaceholders.add(key);
        } else {
          const pixels = ink.createImageData(canvas.width, canvas.height);
          const source = new Map(fieldIds.map(id => [id, this.chunk(fields.get(id)!, cx, cy).getContext('2d')!.getImageData(sourceX, sourceY, PIXELS_PER_CELL, PIXELS_PER_CELL).data]));
          for (let py = 0; py < canvas.height; py++) for (let px = 0; px < canvas.width; px++) {
            const wx = cell.x - .5 + (px + .5) / PIXELS_PER_CELL, wy = cell.y + .5 - (py + .5) / PIXELS_PER_CELL, index = (py * canvas.width + px) * 4;
            const blend = surfaceTransitionPoint(wx, wy, this.ecologySeed), weights = new Map<number, number>();
            for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
              const nx = cell.x + x, ny = cell.y + y, id = mask[(y + 1) * 3 + x + 1]; if (!id) continue;
              const distance = Math.hypot(Math.max(Math.abs(blend.x - nx) - .5, 0), Math.max(Math.abs(blend.y - ny) - .5, 0));
              const t = clamp(distance / .48, 0, 1), weight = 1 - t * t * (3 - 2 * t);
              if (weight > 0) weights.set(id, Math.max(weights.get(id) ?? 0, weight));
            }
            const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
            for (let channel = 0; channel < 3; channel++) { let value = 0; for (const [id, weight] of weights) value += source.get(id)![index + channel] * weight; pixels.data[index + channel] = value / total; }
            pixels.data[index + 3] = 255;
          }
          ink.putImageData(pixels, 0, 0);
        }
        this.transitions.set(key, canvas);
        this.cacheRaster(`transition:${key}`, canvas, () => { this.transitions.delete(key); this.transitionPlaceholders.delete(key); this.workerQueue.delete(`transition:${key}`); });
        if (this.transitionPlaceholders.has(key)) this.queueRaster(job);
      }
      const corner = this.point({ x: cell.x - .5, y: cell.y + .5 }, view);
      context.drawImage(canvas, corner.x, corner.y, view.cellSize, view.cellSize);
    }
  }
  private perceptionMask(view: View, dpr: number) {
    const center = this.point(view.perceptionCenter!, view);
    // Camera following moves the world while keeping this screen-space
    // diamond fixed. Its four full-screen gradients need only change when
    // the relative centre, zoom, range, viewport or pixel ratio changes.
    const key = `${view.viewport.width}:${view.viewport.height}:${dpr}:${center.x}:${center.y}:${view.cellSize}:${view.perceptionRange}`;
    const mask = this.perceptionVisibility;
    if (key === this.perceptionVisibilityKey) { this.perceptionMaskReuses++; return mask; }
    this.perceptionVisibilityKey = key; this.perceptionMaskBuilds++;
    const width = Math.ceil(view.viewport.width * dpr), height = Math.ceil(view.viewport.height * dpr);
    if (mask.width !== width || mask.height !== height) { mask.width = width; mask.height = height; }
    const ink = mask.getContext('2d')!;
    ink.setTransform(1, 0, 0, 1, 0, 0); ink.globalCompositeOperation = 'source-over'; ink.clearRect(0, 0, width, height);
    // Ceil-rounded fractional DPR leaves a partial CSS edge texel. The
    // neutral mask must cover its full backing pixel before the gradients.
    ink.fillStyle = '#fff'; ink.fillRect(0, 0, width, height);
    ink.setTransform(dpr, 0, 0, dpr, 0, 0);
    ink.globalCompositeOperation = 'destination-out';
    const extent = ((view.perceptionRange ?? 0) + .75) * view.cellSize, fade = view.cellSize * .65;
    for (const [nx, ny] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const gradient = ink.createLinearGradient(center.x + nx * extent / 2, center.y + ny * extent / 2,
        center.x + nx * (extent - fade) / 2, center.y + ny * (extent - fade) / 2);
      gradient.addColorStop(0, '#000'); gradient.addColorStop(.2, 'rgba(0,0,0,.896)'); gradient.addColorStop(.5, 'rgba(0,0,0,.5)'); gradient.addColorStop(.8, 'rgba(0,0,0,.104)'); gradient.addColorStop(1, '#0000');
      ink.fillStyle = gradient; ink.fillRect(0, 0, view.viewport.width, view.viewport.height);
    }
    return mask;
  }
  private featherVisibility(context: CanvasRenderingContext2D, cells: readonly SurfaceCell[], view: View, dpr: number, cache: 'ground' | 'mist' = 'ground') {
    const key = `${view.viewport.width}:${view.viewport.height}:${dpr}:${view.camera.x}:${view.camera.y}:${view.cellSize}:${view.perceptionCenter?.x}:${view.perceptionCenter?.y}:${view.perceptionRange}:${cells.map(cell => `${cell.x},${cell.y}`).join(';')}`;
    const mask = cache === 'mist' ? this.mistOuterVisibility : this.visibility;
    if (key !== (cache === 'mist' ? this.mistOuterVisibilityKey : this.visibilityKey)) {
      if (cache === 'mist') { this.mistOuterVisibilityKey = key; this.mistOuterMaskBuilds++; }
      else { this.visibilityKey = key; this.visibilityMaskBuilds++; }
      // Mist CSS dimensions derive from an already integer, bounded backing.
      // Avoid floating-point ceil adding a row/column beyond that 2M budget.
      const width = cache === 'mist' ? Math.round(view.viewport.width * dpr) : Math.ceil(view.viewport.width * dpr);
      const height = cache === 'mist' ? Math.round(view.viewport.height * dpr) : Math.ceil(view.viewport.height * dpr);
      if (mask.width !== width || mask.height !== height) { mask.width = width; mask.height = height; }
      const ink = mask.getContext('2d')!; ink.setTransform(1, 0, 0, 1, 0, 0); ink.globalCompositeOperation = 'source-over'; ink.clearRect(0, 0, mask.width, mask.height); ink.setTransform(dpr, 0, 0, dpr, 0, 0); ink.fillStyle = '#fff';
      const geometry = this.geometry(cells), feather = Math.min(56, view.cellSize * .46);
      // Fill the union once: separate antialiased fillRect calls leave faint
      // seams wherever fractional pixel boundaries join neighbouring cells.
      ink.beginPath();
      for (const contour of geometry.contours) { contour.forEach((point, index) => { const p = this.point(point, view); if (index) ink.lineTo(p.x, p.y); else ink.moveTo(p.x, p.y); }); ink.closePath(); }
      ink.fill();
      ink.globalCompositeOperation = 'destination-out';
      for (const { cell, edges, corners } of geometry.boundary) {
        const p = this.point({ x: cell.x - .5, y: cell.y + .5 }, view), size = view.cellSize;
        for (const [dx, dy] of edges) {
          const x = p.x + (dx > 0 ? size : 0), y = p.y + (dy < 0 ? size : 0);
          const gradient = ink.createLinearGradient(x, y, x - dx * feather, y + dy * feather);
          gradient.addColorStop(0, '#000'); gradient.addColorStop(1, '#0000'); ink.fillStyle = gradient;
          ink.fillRect(dx ? x - (dx > 0 ? feather : 0) : p.x, dy ? y - (dy < 0 ? feather : 0) : p.y, dx ? feather : size, dy ? feather : size);
        }
        // A diagonally unknown cell also borders this authorized union. Its
        // concave corner needs the same inward fade as the two neighbouring
        // straight edges; otherwise their shared game-cell line jumps from a
        // faded edge to full opacity. Restrict the quarter-circle to this
        // known cell. Straight unknown edges already have their fade above.
        for (const [dx, dy] of corners) {
          const x = p.x + (dx > 0 ? size : 0), y = p.y + (dy < 0 ? size : 0);
          const gradient = ink.createRadialGradient(x, y, 0, x, y, feather);
          gradient.addColorStop(0, '#000'); gradient.addColorStop(1, '#0000'); ink.fillStyle = gradient;
          ink.fillRect(x - (dx > 0 ? feather : 0), y - (dy < 0 ? feather : 0), feather, feather);
        }
      }
      if (view.perceptionCenter && finite(view.perceptionRange ?? NaN)) {
        // Multiplication only removes from the exact authorized union above.
        // That union still follows the current camera without bitmap shifting.
        ink.globalCompositeOperation = 'destination-in';
        // Both masks have the same backing size. Copy texels directly, also
        // at fractional DPR where rounding CSS dimensions would resample them.
        ink.setTransform(1, 0, 0, 1, 0, 0);
        ink.drawImage(this.perceptionMask(view, dpr), 0, 0);
      }
    }
    context.save(); context.globalCompositeOperation = 'destination-in'; context.drawImage(mask, 0, 0, view.viewport.width, view.viewport.height); context.restore();
  }
  private point(point: SurfacePoint, view: View) { return worldToViewport(point, view.camera, view.cellSize, view.viewport); }
  private pointsVisible(points: readonly SurfacePoint[], padding: number, view: View) {
    if (!points.length) return false;
    return surfaceRectsOverlap({ left: Math.min(...points.map(point => point.x)) - padding, right: Math.max(...points.map(point => point.x)) + padding,
      south: Math.min(...points.map(point => point.y)) - padding, north: Math.max(...points.map(point => point.y)) + padding }, surfaceViewportRect(view.camera, view.viewport, view.cellSize));
  }
  private path(context: CanvasRenderingContext2D, points: SurfacePoint[], view: View) {
    if (points.length < 2) return false;
    const pixelPoints = points.map(point => this.point(point, view));
    context.beginPath(); context.moveTo(pixelPoints[0].x, pixelPoints[0].y);
    // Quadratic joins soften corners without extending beyond committed geometry.
    for (let index = 1; index < pixelPoints.length - 1; index++) {
      const p = pixelPoints[index], next = pixelPoints[index + 1];
      context.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
    }
    const end = pixelPoints[pixelPoints.length - 1]; context.lineTo(end.x, end.y); return true;
  }
  private drawRoad(context: CanvasRenderingContext2D, road: SurfaceRoad, field: SurfaceTerrainField, view: View, cells: readonly SurfaceCell[]) {
    // Preserve the full legal centreline for rounding; only its screen work is
    // culled, before allocating and sampling a potentially large road raster.
    const sourcePoints = safeSurfacePoints(road.points);
    if (!this.pointsVisible(sourcePoints, 1.5, view)) return;
    const points = roundedSurfaceRoad(sourcePoints, cells, road.width); if (points.length < 2) return;
    const key = `${field.seed}:${field.regionCode}:${road.width}:${points.map(p => `${p.x},${p.y}`).join(';')}`;
    let image = this.roads.get(key);
    if (image) this.touchRaster(`road:${key}`);
    if (!image) {
      const x = Math.floor(Math.min(...points.map(p => p.x)) - 1.5), y = Math.ceil(Math.max(...points.map(p => p.y)) + 1.5);
      const width = Math.ceil(Math.max(...points.map(p => p.x)) + 1.5) - x, height = y - Math.floor(Math.min(...points.map(p => p.y)) - 1.5);
      // Enough samples for a clean irregular grass edge and fine mineral detail.
      const resolution = Math.min(64, 1536 / Math.max(width, height));
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * resolution); canvas.height = Math.ceil(height * resolution);
      const paved = isPavedSurfaceRegion(field.regionCode);
      const ink = canvas.getContext('2d')!, pixels = ink.createImageData(canvas.width, canvas.height), material = this.materials[paved ? 5 : 3], detail = new Float32Array(3);
      for (let py = 0; py < canvas.height; py++) for (let px = 0; px < canvas.width; px++) {
        const wx = x + (px + .5) / canvas.width * width, wy = y - (py + .5) / canvas.height * height;
        const wash = sampleSurfaceRoad(wx, wy, points, road.width, field.seed, field.regionCode), index = (py * canvas.width + px) * 4;
        if (!wash[3]) continue;
        if (material) materialColor(material, wx / 2.8 + .19, wy / 2.8 + .37, detail, 0);
        const luminance = material && paved ? (detail[0] - material.mean[0]) * .2126 + (detail[1] - material.mean[1]) * .7152 + (detail[2] - material.mean[2]) * .0722 : 0;
        for (let channel = 0; channel < 3; channel++) pixels.data[index + channel] = wash[channel] + (material ? clamp((paved ? luminance : detail[channel] - material.mean[channel]) * MATERIAL_GAIN, -MATERIAL_TINT_LIMIT, MATERIAL_TINT_LIMIT) : 0);
        pixels.data[index + 3] = wash[3];
      }
      ink.putImageData(pixels, 0, 0); image = { canvas, x, y, width, height }; this.roads.set(key, image);
      this.cacheRaster(`road:${key}`, canvas, () => this.roads.delete(key));
    }
    const corner = this.point(image, view);
    context.drawImage(image.canvas, corner.x, corner.y, image.width * view.cellSize, image.height * view.cellSize);
  }
  private drawWalks(context: CanvasRenderingContext2D, scene: MapSurfaceScene, elapsed: number, view: View, dpr: number, passableByRegion: ReadonlyMap<number, readonly SurfaceCell[]>) {
    const image = this.footprint;
    if (!image || view.z < 0 || scene.scopeToken !== `world:${view.z}`) return 0;
    let count = 0;
    for (const walk of scene.recentWalks.slice(0, 512)) {
      const opacity = walkOpacity(walk, elapsed), stamps = surfaceWalkFootsteps(walk);
      const field = scene.terrainFields.find(field => field.regionId === walk.regionId);
      const cells = (passableByRegion.get(walk.regionId) ?? []).filter(cell => cell.passable === true);
      if (!opacity || !stamps.length || !field || /(?:arena|test|private|story|trial|dungeon|home)/i.test(field.regionCode)
        || !cells.length || !this.pointsVisible(stamps, .2, view)) continue;
      // This is the foreground's actual observed-cell union, never the public
      // preview/backdrop. Fresh sole ink is fully opaque without a layer cap.
      context.save(); this.clip(context, cells, view); context.globalAlpha = opacity;
      for (const stamp of stamps) {
        const origin = this.point(stamp, view), width = stamp.width * view.cellSize, height = stamp.height * view.cellSize;
        context.save(); context.translate(origin.x, origin.y); context.rotate(stamp.angle); context.scale(stamp.flip ? -1 : 1, 1);
        context.drawImage(image, -width / 2, -height / 2, width, height); context.restore();
      }
      context.restore(); count++;
    }
    return count;
  }
  private drawMark(context: CanvasRenderingContext2D, mark: MapSurfaceScene['combatMarks'][number], elapsed: number, view: View) {
    const opacity = markOpacity(mark, elapsed); if (!opacity || mark.z !== view.z || !finite(mark.x) || !finite(mark.y)) return false;
    const origin = this.point(mark, view), random = surfaceRandom(mark.seed), splat = surfaceSplat(mark.seed);
    const radius = view.cellSize * (.85 + random() * .25), rotation = random() * Math.PI * 2;
    const colors = { blood: ['171,21,52', '205,47,70'], slime: ['91,158,94', '149,187,104'], debris: ['130,119,91', '177,157,115'], magic: ['119,116,185', '168,147,214'] };
    const color = colors[mark.kind] ?? colors.blood;
    if (mark.fragments) {
      const groups = new Map<number, SurfacePoint[][]>();
      for (const fragment of mark.fragments.slice(0, 256)) {
        const points = safeSurfacePoints(fragment.points), strength = clamp(fragment.opacity, 0, 1);
        if (points.length >= 3 && strength > 0) groups.set(strength, [...(groups.get(strength) ?? []), points]);
      }
      if (!groups.size) return false;
      // Redacted anchors are not battle centres: actual authorized fragments
      // alone determine the visible ink envelope, including its raster pad.
      if (!this.pointsVisible([...groups.values()].flat(2), .04 + 1 / 96, view)) return false;
      // Geometry and ink use only the authorized world fragments. In particular
      // the redacted visible anchor is never treated as a hidden battle centre.
      const key = `${mark.kind}:${mark.seed}:${JSON.stringify([...groups])}`;
      let image = this.inks.get(key);
      if (image) this.touchRaster(`ink:${key}`);
      if (!image) {
        const points = [...groups.values()].flat(2), padding = .04;
        const x = Math.floor((Math.min(...points.map(point => point.x)) - padding) * 96) / 96;
        const y = Math.ceil((Math.max(...points.map(point => point.y)) + padding) * 96) / 96;
        const width = Math.ceil((Math.max(...points.map(point => point.x)) + padding) * 96) / 96 - x;
        const height = y - Math.floor((Math.min(...points.map(point => point.y)) - padding) * 96) / 96;
        if (![x, y, width, height].every(finite) || width <= 0 || height <= 0 || Math.max(width, height) > 64) return false;
        const density = Math.min(96, 1024 / Math.max(width, height)), canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * density); canvas.height = Math.ceil(height * density);
        const ink = canvas.getContext('2d')!; ink.fillStyle = '#fff';
        for (const [strength, fragments] of groups) {
          ink.globalAlpha = strength; ink.beginPath();
          for (const fragment of fragments) {
            fragment.forEach((point, index) => { const px = (point.x - x) / width * canvas.width, py = (y - point.y) / height * canvas.height; if (index) ink.lineTo(px, py); else ink.moveTo(px, py); });
            ink.closePath();
          }
          // Filling each opacity union once preserves joins between clipped
          // fragments instead of feathering an artificial game-cell grid.
          ink.fill();
        }
        const pixels = ink.getImageData(0, 0, canvas.width, canvas.height), distance = new Float32Array(canvas.width * canvas.height);
        for (let index = 0; index < distance.length; index++) distance[index] = pixels.data[index * 4 + 3] ? 2048 : 0;
        // A two-pass inward distance mask adds a soft irregular rim without
        // blur leaking outside the authorized fragment silhouette.
        for (let py = 0; py < canvas.height; py++) for (let px = 0; px < canvas.width; px++) {
          const index = py * canvas.width + px;
          distance[index] = Math.min(distance[index], px ? distance[index - 1] + 1 : 0, py ? distance[index - canvas.width] + 1 : 0,
            px && py ? distance[index - canvas.width - 1] + 1.414 : 2048, px + 1 < canvas.width && py ? distance[index - canvas.width + 1] + 1.414 : 2048);
        }
        for (let py = canvas.height - 1; py >= 0; py--) for (let px = canvas.width - 1; px >= 0; px--) {
          const index = py * canvas.width + px;
          distance[index] = Math.min(distance[index], px + 1 < canvas.width ? distance[index + 1] + 1 : 0, py + 1 < canvas.height ? distance[index + canvas.width] + 1 : 0,
            px + 1 < canvas.width && py + 1 < canvas.height ? distance[index + canvas.width + 1] + 1.414 : 2048, px && py + 1 < canvas.height ? distance[index + canvas.width - 1] + 1.414 : 2048);
        }
        // A large pool can have a simple server outline. Weather only the
        // already-authorized ink inward, keeping lower-opacity spray intact.
        // The server's opaque-body fragments identify the pool even when a
        // permission edge clips it; no hidden battle centre is reconstructed.
        let bloodMask: Uint8ClampedArray | undefined;
        if (mark.kind === 'blood') {
          const body = document.createElement('canvas'); body.width = canvas.width; body.height = canvas.height;
          const bodyInk = body.getContext('2d')!; bodyInk.fillStyle = '#fff'; bodyInk.beginPath();
          for (const [strength, fragments] of groups) if (strength >= .95) for (const fragment of fragments) {
            fragment.forEach((point, index) => { const px = (point.x - x) / width * canvas.width, py = (y - point.y) / height * canvas.height; if (index) bodyInk.lineTo(px, py); else bodyInk.moveTo(px, py); });
            bodyInk.closePath();
          }
          bodyInk.fill(); bloodMask = bodyInk.getImageData(0, 0, canvas.width, canvas.height).data;
        }
        const rgb = color[0].split(',').map(Number);
        const easedInk = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
        for (let py = 0; py < canvas.height; py++) for (let px = 0; px < canvas.width; px++) {
          const index = py * canvas.width + px, offset = index * 4; if (!pixels.data[offset + 3]) continue;
          const wx = x + (px + .5) / canvas.width * width, wy = y - (py + .5) / canvas.height * height;
          const fine = surfaceNoise(wx * 17.3, wy * 17.3, mark.seed ^ 5231);
          const field = surfaceNoise(wx * 1.8, wy * 1.8, mark.seed ^ 97) * .55 + surfaceNoise(wx * 5.9, wy * 5.9, mark.seed ^ 193) * .3 + fine * .15;
          const tone = (field - .5) * 44 + (fine - .5) * 8, edge = clamp(distance[index] / (density * .028), 0, 1);
          if (bloodMask) {
            const body = bloodMask[offset + 3] / 255;
            const weather = surfaceNoise(wx * 5.7, wy * 5.7, mark.seed ^ 9487);
            // Keep narrow attached jets readable: a thick .06–.12 inward rim
            // erased their authorized tips along with the pool's weathered edge.
            const rim = .016 * (1 - body) + (.018 + weather * .026) * body;
            const retained = .08 + .92 * easedInk(distance[index] / (density * rim));
            const pores = surfaceNoise(wx * 9.1, wy * 9.1, mark.seed ^ 6871) * .68
              + surfaceNoise(wx * 18.7, wy * 18.7, mark.seed ^ 3673) * .32;
            const dry = easedInk((pores - .43) / .27) * body * easedInk((distance[index] / density - .018) / .045);
            // Burgundy pooling and dusty red edges keep the bright anime
            // palette readable without a flat pink heart-shaped decal.
            pixels.data[offset] = 137 + (field - .5) * 44 + (fine - .5) * 14 + dry * 12;
            pixels.data[offset + 1] = 28 + (field - .5) * 15 + dry * 8;
            pixels.data[offset + 2] = 39 + (field - .5) * 17 + dry * 5;
            pixels.data[offset + 3] *= (.76 + field * .24) * edge * edge * (3 - 2 * edge) * retained * (1 - dry * .96);
          } else {
            pixels.data[offset] = rgb[0] + tone * .6; pixels.data[offset + 1] = rgb[1] + tone; pixels.data[offset + 2] = rgb[2] + tone * .65;
            pixels.data[offset + 3] *= (.76 + field * .24) * edge * edge * (3 - 2 * edge);
          }
        }
        ink.putImageData(pixels, 0, 0); image = { canvas, x, y, width, height }; this.inks.set(key, image);
        this.cacheRaster(`ink:${key}`, canvas, () => this.inks.delete(key));
      }
      const corner = this.point(image, view);
      context.save(); context.globalAlpha = opacity; context.drawImage(image.canvas, corner.x, corner.y, image.width * view.cellSize, image.height * view.cellSize); context.restore(); return true;
    }
    // Legacy splats include satellite drops outside the body. Their furthest
    // possible support is under 1.3 cells after rotation and feathering.
    if (!this.pointsVisible([mark], 1.3, view)) return false;
    context.save(); context.translate(origin.x, origin.y); context.rotate(rotation); context.scale(radius, radius);
    // A smooth asymmetric body and disconnected droplets cross cell boundaries.
    context.beginPath();
    const outline = splat.outline, last = outline[outline.length - 1], first = outline[0];
    context.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let i = 0; i < outline.length; i++) { const p = outline[i], next = outline[(i + 1) % outline.length]; context.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2); }
    context.closePath();
    const wash = context.createRadialGradient(.03, -.02, .04, .03, -.02, .54);
    wash.addColorStop(0, `rgba(${color[0]},${opacity})`); wash.addColorStop(.6, `rgba(${color[1]},${opacity * .88})`); wash.addColorStop(1, `rgba(${color[1]},0)`);
    context.fillStyle = wash; context.fill();
    for (const drop of splat.droplets) {
      context.save(); context.translate(drop.x, drop.y); context.rotate(drop.angle);
      const feather = context.createRadialGradient(0, 0, 0, 0, 0, drop.radius * drop.stretch * 1.25);
      feather.addColorStop(0, `rgba(${color[0]},${opacity * .95})`); feather.addColorStop(.55, `rgba(${color[1]},${opacity * .75})`); feather.addColorStop(1, `rgba(${color[1]},0)`);
      context.fillStyle = feather; context.beginPath(); context.ellipse(0, 0, drop.radius * drop.stretch * 1.25, drop.radius * 1.25, 0, 0, Math.PI * 2); context.fill(); context.restore();
    }
    context.restore(); return true;
  }
  private preparedMaterial(regionCode: string) {
    const index = surfaceMaterialIndex(regionCode), source = this.materialCanvases[index];
    if (!source || !isPavedSurfaceRegion(regionCode)) return source;
    const existing = this.pavedMaterials.get(regionCode); if (existing) return existing;
    const material = document.createElement('canvas'); material.width = material.height = MATERIAL_SIDE;
    // The same authored stone joints remain, but moss hue never tints the
    // town/tree pavements. The worker placeholder and mist share one native
    // Canvas conversion per paved region, with no frame-time readbacks.
    const ink = material.getContext('2d')!, color = surfacePalette(regionCode)[0], mean = this.materials[index]?.mean ?? color;
    const luma = (rgb: readonly number[]) => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    ink.fillStyle = `rgb(${color.join(',')})`; ink.fillRect(0, 0, MATERIAL_SIDE, MATERIAL_SIDE);
    ink.globalCompositeOperation = 'luminosity'; ink.filter = `brightness(${luma(color) / Math.max(1, luma(mean))})`; ink.drawImage(source, 0, 0);
    ink.filter = 'none'; ink.globalCompositeOperation = 'source-over';
    this.pavedMaterials.set(regionCode, material); this.pavedMaterialBuilds++; return material;
  }
  private progressiveMist(scene: MapSurfaceScene, view: View, base: NonNullable<MapSurfaceRenderer['mistBaseView']>, perception = this.perceptionAuthorization(scene, base.snapshot.authorization, view)) {
    if (this.mistBlendView?.base === base && this.mistBlendView.perception === perception) return this.mistBlend;
    const mask = this.mistNearVisibility, blend = this.mistBlend;
    for (const canvas of [mask, blend]) if (canvas.width !== this.mistBase.width || canvas.height !== this.mistBase.height) { canvas.width = this.mistBase.width; canvas.height = this.mistBase.height; }
    const ink = mask.getContext('2d')!;
    ink.setTransform(1, 0, 0, 1, 0, 0); ink.globalCompositeOperation = 'source-over'; ink.globalAlpha = 1; ink.filter = 'none'; ink.shadowBlur = 0; ink.clearRect(0, 0, mask.width, mask.height);
    ink.setTransform(base.scale, 0, 0, base.scale, 0, 0); ink.setLineDash([]); ink.lineJoin = 'round'; ink.lineCap = 'round'; ink.beginPath();
    const projected = { ...view, camera: base.camera, viewport: base.viewport };
    for (const contour of this.geometry(perception.known).contours) {
      contour.forEach((point, index) => { const p = this.point(point, projected); if (index) ink.lineTo(p.x, p.y); else ink.moveTo(p.x, p.y); }); ink.closePath();
    }
    // One whole-union stroke per band paints overlapping edges only once.
    // The increments reconstruct a smoothstep distance profile without pixel
    // loops, overlapping-edge multiplication or a white mask entering colour.
    let previous = 0;
    for (let step = MIST_FADE_STEPS - 1; step > 0; step--) {
      const t = step / MIST_FADE_STEPS, weight = 1 - t * t * (3 - 2 * t);
      ink.lineWidth = 2 * MIST_FADE_CELLS * view.cellSize * t;
      ink.strokeStyle = `rgba(0,0,0,${(weight - previous) / (1 - previous)})`; ink.stroke(); previous = weight;
    }
    // A zero-width stroke is ignored by Canvas; only fill the exact clear union.
    ink.fillStyle = '#000'; ink.fill(); this.mistDistanceMaskBuilds++;
    const output = blend.getContext('2d')!;
    output.setTransform(1, 0, 0, 1, 0, 0); output.globalAlpha = 1; output.globalCompositeOperation = 'source-over'; output.clearRect(0, 0, blend.width, blend.height); output.drawImage(this.mistGround, 0, 0);
    output.globalCompositeOperation = 'destination-in'; output.drawImage(mask, 0, 0);
    output.globalCompositeOperation = 'destination-over'; output.drawImage(this.mistBase, 0, 0); output.globalCompositeOperation = 'source-over';
    this.mistBlendView = { base, perception }; this.mistBlendBuilds++; return blend;
  }
  /** Remove the clear interior from the glass image, leaving one veil above
   * terrain, scenery and DOM actors alike. The blurred union rounds the grid
   * corners; world-space noise varies only the inward half-cell transition. */
  applyMistVeil(canvas: HTMLCanvasElement, scene: MapSurfaceScene, view: View) {
    if (this.disposed || !canvas.width || !canvas.height || view.cellSize <= 0) return;
    const authorization = this.groundAuthorization(scene, view.cells, view.z);
    const perception = this.perceptionAuthorization(scene, authorization, view);
    const known = view.perceptionCells === undefined && view.perceptionCenter && finite(view.perceptionRange ?? NaN)
      ? perception.known.filter(cell => Math.abs(cell.x - view.perceptionCenter!.x) + Math.abs(cell.y - view.perceptionCenter!.y) <= view.perceptionRange!)
      : perception.known;
    if (!known.length) return;
    const key = `${scene.scopeToken}:${view.z}:${known.map(cell => `${cell.x},${cell.y}`).join(';')}`;
    let maskView = this.mistVeilMaskView;
    const mask = this.mistVeilMask;
    if (maskView?.key !== key) {
      const padding = .75, x = Math.min(...known.map(cell => cell.x)) - .5 - padding;
      const y = Math.max(...known.map(cell => cell.y)) + .5 + padding;
      const width = Math.max(...known.map(cell => cell.x)) + .5 + padding - x;
      const height = y - Math.min(...known.map(cell => cell.y)) + .5 + padding;
      const density = Math.min(MIST_MASK_DENSITY, 2048 / Math.max(width, height), Math.sqrt(MIST_VEIL_MASK_PIXELS / (width * height)));
      const maskWidth = Math.max(1, Math.floor(width * density)), maskHeight = Math.max(1, Math.floor(height * density)), source = this.mistBlend;
      for (const canvas of [mask, source]) if (canvas.width !== maskWidth || canvas.height !== maskHeight) { canvas.width = maskWidth; canvas.height = maskHeight; }
      const ink = source.getContext('2d')!, sx = mask.width / width, sy = mask.height / height;
      ink.setTransform(1, 0, 0, 1, 0, 0); ink.globalCompositeOperation = 'source-over'; ink.globalAlpha = 1; ink.clearRect(0, 0, source.width, source.height); ink.fillStyle = '#000'; ink.beginPath();
      for (const cell of known) ink.rect((cell.x - .5 - x) * sx, (y - cell.y - .5) * sy, sx, sy);
      ink.fill();
      const output = mask.getContext('2d', { willReadFrequently: true })!;
      output.setTransform(1, 0, 0, 1, 0, 0); output.globalCompositeOperation = 'source-over'; output.globalAlpha = 1; output.clearRect(0, 0, mask.width, mask.height);
      output.filter = `blur(${MIST_INNER_FEATHER * .4 * density}px)`; output.drawImage(source, 0, 0); output.filter = 'none';
      const pixels = output.getImageData(0, 0, mask.width, mask.height), cells = new Set(known.map(cell => `${cell.x}:${cell.y}`));
      const seed = surfaceEcologySeed(scene.scopeToken) ^ 84631;
      for (let py = 0; py < mask.height; py++) for (let px = 0; px < mask.width; px++) {
        const offset = (py * mask.width + px) * 4;
        const wx = x + (px + .5) / sx, wy = y - (py + .5) / sy;
        // Blurring is decorative only: even concave corners cannot remove
        // the opaque cover above an unobserved coordinate or entity overflow.
        if (!cells.has(`${Math.floor(wx + .5)}:${Math.floor(wy + .5)}`)) { pixels.data[offset + 3] = 0; continue; }
        const noise = surfaceNoise(wx * 2.3, wy * 2.3, seed) * .7 + surfaceNoise(wx * 5.7, wy * 5.7, seed ^ 193) * .3;
        const start = .52 + noise * .12, t = clamp((pixels.data[offset + 3] / 255 - start) / (.995 - start), 0, 1);
        pixels.data[offset + 3] = Math.round(t * t * (3 - 2 * t) * 255);
      }
      output.putImageData(pixels, 0, 0);
      maskView = this.mistVeilMaskView = { key, x, y, width, height }; this.mistVeilMaskBuilds++;
    }
    const corner = this.point({ x: maskView.x, y: maskView.y }, view), context = canvas.getContext('2d')!;
    context.save(); context.setTransform(canvas.width / view.viewport.width, 0, 0, canvas.height / view.viewport.height, 0, 0);
    // drawMist already sampled the complete far glass once for this camera.
    // Only subtract the cached clear interior; do not repaint the screen again.
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'destination-out'; context.imageSmoothingEnabled = true;
    context.drawImage(mask, corner.x, corner.y, maskView.width * view.cellSize, maskView.height * view.cellSize); context.restore();
  }
  drawMist(canvas: HTMLCanvasElement, scene: MapSurfaceScene, view: View, fallbackRegionCode: string, _driftSeconds = 0) {
    if (this.disposed || ![view.viewport.width, view.viewport.height, view.cellSize, view.camera.x, view.camera.y].every(finite) || view.viewport.width <= 0 || view.viewport.height <= 0 || view.cellSize <= 0) return;
    const started = performance.now();
    const progressive = view.perceptionCells !== undefined, pixels = progressive ? MIST_PROGRESSIVE_PIXELS : 2_097_152;
    if (!progressive) { this.mistNearVisibility.width = this.mistNearVisibility.height = this.mistBlend.width = this.mistBlend.height = 0; this.mistBlendView = undefined; this.mistVeilMaskView = undefined; }
    const dpr = Math.min(2, window.devicePixelRatio || 1, 2048 / Math.max(view.viewport.width, view.viewport.height), Math.sqrt(pixels / (view.viewport.width * view.viewport.height)));
    const width = Math.max(1, Math.floor(view.viewport.width * dpr)), height = Math.max(1, Math.floor(view.viewport.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const fieldsKey = scene.terrainFields.map(field => `${field.regionId}:${field.regionCode}:${field.seed}`).join(';');
    let snapshot = this.mistSnapshot;
    // These arrays are the immutable, helper-validated server snapshots. The
    // foreground authorization identity also changes for in-place revocation.
    if (!snapshot || snapshot.scope !== scene.scopeToken || snapshot.z !== view.z || snapshot.cells !== view.mistGroundCells || snapshot.surfaceCells !== view.cells || snapshot.authorization !== this.authorizedGround || snapshot.fieldsKey !== fieldsKey) {
      const authorization = this.groundAuthorization(scene, view.cells, view.z);
      const groups = new Map<number, SurfaceCell[]>(), fields = new Map(scene.terrainFields.map(field => [field.regionId, field]));
      if (scene.scopeToken === 'world:0' && view.z === 0 && view.mistGroundCells && view.mistGroundCells.length <= 4096) {
        const allowed = new Map(authorizedSurfaceCells(scene, view.cells, view.z).map(cell => [`${cell.x}:${cell.y}`, cell]));
        for (const cell of authorizedSurfaceCells(scene, view.mistGroundCells, view.z)) {
          if (allowed.get(`${cell.x}:${cell.y}`)?.regionId !== cell.regionId || /(?:arena|test|private|story|trial|dungeon|home)/i.test(cell.regionCode ?? '')) continue;
          const cells = groups.get(cell.regionId!) ?? []; cells.push(cell); groups.set(cell.regionId!, cells);
        }
      }
      const publicCells = [...groups.values()].flat(), publicAnchors = new Map(publicCells.map(cell => [`${cell.x}:${cell.y}`, cell]));
      snapshot = this.mistSnapshot = { scope: scene.scopeToken, z: view.z, cells: view.mistGroundCells, surfaceCells: view.cells, authorization, fieldsKey, groups, fields, publicCells, publicAnchors };
    }
    const perception = progressive ? this.perceptionAuthorization(scene, snapshot.authorization, view) : undefined;
    const anchor = scene.scopeToken === 'world:0' && view.z === 0 && !/(?:arena|test|private|story|trial|dungeon|home)/i.test(fallbackRegionCode)
      ? perception?.known.find(cell => cell.regionCode === fallbackRegionCode && snapshot.publicAnchors.get(`${cell.x}:${cell.y}`)?.regionId === cell.regionId) : undefined;
    const backdrop = anchor ? snapshot.fields.get(anchor.regionId!) : undefined;
    const publicCells = progressive && !backdrop ? [] : snapshot.publicCells;
    let base = this.mistBaseView;
    const materials = this.materialCanvases.length;
    if (!base || base.snapshot !== snapshot || base.cellSize !== view.cellSize || base.dpr !== dpr || base.materials !== materials || base.progressive !== progressive || base.backdrop !== backdrop
      || base.targetViewport.width !== view.viewport.width || base.targetViewport.height !== view.viewport.height
      || Math.abs(view.camera.x - base.camera.x) * view.cellSize > base.padding - (MIST_BLUR * 4 + 2) || Math.abs(view.camera.y - base.camera.y) * view.cellSize > base.padding - (MIST_BLUR * 4 + 2)) {
      const padding = view.cellSize + MIST_BLUR * 4 + 2, requested = { width: view.viewport.width + padding * 2, height: view.viewport.height + padding * 2 };
      const baseDpr = Math.min(dpr, 2048 / Math.max(requested.width, requested.height), Math.sqrt(pixels / (requested.width * requested.height)));
      const baseWidth = Math.max(1, Math.floor(requested.width * baseDpr)), baseHeight = Math.max(1, Math.floor(requested.height * baseDpr));
      if (this.mistBase.width !== baseWidth || this.mistBase.height !== baseHeight) { this.mistBase.width = baseWidth; this.mistBase.height = baseHeight; }
      if (this.mistGround.width !== baseWidth || this.mistGround.height !== baseHeight) { this.mistGround.width = baseWidth; this.mistGround.height = baseHeight; }
      const viewport = { width: this.mistBase.width / baseDpr, height: this.mistBase.height / baseDpr }, camera = { x: Math.round(view.camera.x), y: Math.round(view.camera.y) };
      const projected = { ...view, camera, viewport }, ground = this.mistGround.getContext('2d')!, ink = this.mistBase.getContext('2d')!;
      ground.setTransform(1, 0, 0, 1, 0, 0); ground.globalCompositeOperation = 'source-over'; ground.globalAlpha = 1; ground.fillStyle = MIST_UNKNOWN; ground.fillRect(0, 0, baseWidth, baseHeight); ground.setTransform(baseDpr, 0, 0, baseDpr, 0, 0);
      // Continue only an already observed public material as decoration. This
      // creates no world cells or fields and samples no unknown geography.
      if (backdrop) {
        ground.fillStyle = `rgb(${surfacePalette(backdrop.regionCode)[0].join(',')})`; ground.fillRect(0, 0, viewport.width, viewport.height);
        const material = this.preparedMaterial(backdrop.regionCode), pattern = material && ground.createPattern(material, 'repeat');
        if (pattern) {
          // Broader marks survive the glass scatter at distant screen corners.
          const scale = view.cellSize * MATERIAL_SCALE * 1.75 / MATERIAL_SIDE;
          pattern.setTransform(new DOMMatrix([scale, 0, 0, -scale, viewport.width / 2 - camera.x * view.cellSize, viewport.height / 2 + camera.y * view.cellSize]));
          ground.save(); ground.globalCompositeOperation = 'source-over'; ground.globalAlpha = .7; ground.fillStyle = pattern; ground.fillRect(0, 0, viewport.width, viewport.height); ground.restore(); this.mistPatternBuilds++;
        }
        this.mistBackdropBuilds++;
      }
      // Reuse the far canvas as the temporary public-only layer; the final
      // scatter below replaces it after the soft authorized overlay is copied.
      const terrain = backdrop ? ink : ground;
      if (backdrop) { terrain.setTransform(1, 0, 0, 1, 0, 0); terrain.globalCompositeOperation = 'source-over'; terrain.globalAlpha = 1; terrain.clearRect(0, 0, baseWidth, baseHeight); terrain.setTransform(baseDpr, 0, 0, baseDpr, 0, 0); }
      for (const [regionId, cells] of publicCells.length ? snapshot.groups : []) {
        const field = snapshot.fields.get(regionId)!;
        // The coarse colour field follows the actual public world coordinates,
        // rather than tinting a repeated tile with a single (0, 0) sample.
        // No scenery, road, trace, worker raster or unknown-cell sample enters it.
        terrain.save(); this.clip(terrain, cells, projected);
        for (const cell of cells) {
          const p = this.point({ x: cell.x - .5, y: cell.y + .5 }, projected);
          if (p.x > viewport.width || p.y > viewport.height || p.x + view.cellSize < 0 || p.y + view.cellSize < 0) continue;
          const color = sampleSurfaceColor(cell.x, cell.y, field); this.mistColorSamples++;
          terrain.fillStyle = `rgb(${color.join(',')})`; terrain.fillRect(p.x - .5, p.y - .5, view.cellSize + 1, view.cellSize + 1);
        }
        const material = this.preparedMaterial(field.regionCode), pattern = material && terrain.createPattern(material, 'repeat');
        if (!pattern) { terrain.restore(); continue; }
        const scale = view.cellSize * MATERIAL_SCALE / MATERIAL_SIDE;
        pattern.setTransform(new DOMMatrix([scale, 0, 0, -scale, viewport.width / 2 - camera.x * view.cellSize, viewport.height / 2 + camera.y * view.cellSize]));
        terrain.globalCompositeOperation = 'soft-light'; terrain.globalAlpha = .42; terrain.fillStyle = pattern; terrain.fillRect(0, 0, viewport.width, viewport.height); terrain.restore(); this.mistPatternBuilds++;
      }
      if (backdrop) {
        this.featherVisibility(terrain, publicCells, { ...projected, perceptionCenter: undefined, perceptionRange: undefined }, baseDpr, 'mist');
        ground.save(); ground.setTransform(1, 0, 0, 1, 0, 0); ground.drawImage(this.mistBase, 0, 0); ground.restore();
      }
      // Scatter the complete colour-and-texture image once per cached base.
      // Blurring after region composition softens their shared boundaries.
      // Identity coordinates make the filter radius exactly seven CSS pixels.
      ink.setTransform(1, 0, 0, 1, 0, 0); ink.globalCompositeOperation = 'source-over'; ink.globalAlpha = 1; ink.clearRect(0, 0, baseWidth, baseHeight);
      ink.filter = `blur(${MIST_BLUR * baseDpr}px) saturate(78%) contrast(92%)`; ink.drawImage(this.mistGround, 0, 0); ink.filter = 'none'; this.mistScatterBuilds++;
      ink.setTransform(baseDpr, 0, 0, baseDpr, 0, 0);
      ink.globalAlpha = MIST_VEIL_ALPHA; ink.fillStyle = MIST_WHITE; ink.fillRect(0, 0, viewport.width, viewport.height); ink.globalAlpha = 1;
      // Without a qualified decorative continuation, preserve the protected
      // uniform fallback. With one, only the real terrain overlay was feathered;
      // never cut the full-screen glass back to a public-window-sized ring.
      if (!backdrop && publicCells.length) {
        this.featherVisibility(ink, publicCells, { ...projected, perceptionCenter: undefined, perceptionRange: undefined }, baseDpr, 'mist');
        ink.save(); ink.globalCompositeOperation = 'destination-over'; ink.fillStyle = MIST_UNKNOWN; ink.fillRect(0, 0, viewport.width, viewport.height); ink.restore();
      } else if (!backdrop) { ink.fillStyle = MIST_UNKNOWN; ink.fillRect(0, 0, viewport.width, viewport.height); }
      if (progressive) {
        ground.globalAlpha = MIST_NEAR_VEIL_ALPHA; ground.fillStyle = MIST_WHITE; ground.fillRect(0, 0, viewport.width, viewport.height); ground.globalAlpha = 1;
        if (!backdrop && publicCells.length) {
          this.featherVisibility(ground, publicCells, { ...projected, perceptionCenter: undefined, perceptionRange: undefined }, baseDpr, 'mist');
          ground.save(); ground.globalCompositeOperation = 'destination-over'; ground.fillStyle = MIST_UNKNOWN; ground.fillRect(0, 0, viewport.width, viewport.height); ground.restore();
        } else if (!backdrop) { ground.fillStyle = MIST_UNKNOWN; ground.fillRect(0, 0, viewport.width, viewport.height); }
      }
      base = this.mistBaseView = { snapshot, camera, viewport, targetViewport: { ...view.viewport }, cellSize: view.cellSize, dpr, scale: baseDpr, materials, padding, progressive, backdrop }; this.mistBuilds++;
    } else this.mistReuses++;
    const context = canvas.getContext('2d')!;
    context.setTransform(1, 0, 0, 1, 0, 0); context.fillStyle = MIST_UNKNOWN; context.fillRect(0, 0, width, height); context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = (view.viewport.width - base.viewport.width) / 2 + (base.camera.x - view.camera.x) * view.cellSize;
    const y = (view.viewport.height - base.viewport.height) / 2 + (view.camera.y - base.camera.y) * view.cellSize;
    const source = this.mistBase;
    context.imageSmoothingEnabled = true; context.drawImage(source, x, y, base.viewport.width, base.viewport.height);
    this.mistMs = performance.now() - started;
  }
  draw(canvas: HTMLCanvasElement, scene: MapSurfaceScene, elapsed: number, view: View, options: { skipGround?: boolean } = {}): SurfaceDrawStats {
    let phaseStarted = performance.now();
    this.lastDrawPhases = { groundMs: 0, tracesMs: 0, sceneryMs: 0, visibilityMs: 0 };
    if (this.gpuGround !== !!options.skipGround) { this.gpuGround = !!options.skipGround; if (this.gpuGround) this.pauseGroundWorker(); else this.initializeGroundWorker(); }
    this.drawFrame++; this.rasterFocus = view.camera;
    const ecologySeed = Number.isSafeInteger(scene.cosmeticEcologySeed) && scene.cosmeticEcologySeed! >= 0 && scene.cosmeticEcologySeed! <= 0xffffffff ? scene.cosmeticEcologySeed! >>> 0 : surfaceEcologySeed(scene.scopeToken);
    if (this.scope !== scene.scopeToken || this.ecologySeed !== ecologySeed) { this.scope = scene.scopeToken; this.ecologySeed = ecologySeed; this.clearRasterCache(); }
    const dpr = Math.min(2, window.devicePixelRatio || 1), width = Math.ceil(view.viewport.width * dpr), height = Math.ceil(view.viewport.height * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const generatedBefore = this.groundGenerated;
    const context = canvas.getContext('2d')!, stats: SurfaceDrawStats = { scenery: 0, skippedScenery: 0, sceneryVariants: [0, 0], walks: 0, marks: 0, groundChunks: 0, groundGenerated: 0, authorizedCells: 0, visibleCells: 0, missingAtlases: SURFACE_ATLASES.length - this.atlases.size, groundMaterial: this.materials.length === 6 };
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, view.viewport.width, view.viewport.height);
    if (view.cellSize <= 0 || !view.cells.length && !view.ownedMapGroundCells?.length) return stats;
    const authorization = this.groundAuthorization(scene, view.cells, view.z), foreground = this.perceptionAuthorization(scene, authorization, view), { known, anchors } = foreground;
    const staticView = this.staticGroundView(scene, view), groundKnown = staticView === view ? known : staticView.perceptionCells!;
    const viewport = surfaceViewportRect(view.camera, view.viewport, view.cellSize);
    const visible = known.filter(cell => view.perceptionCells === undefined ? surfaceCellVisible(cell, viewport, view.perceptionCenter, view.perceptionRange) : surfaceCellVisible(cell, viewport));
    const groundVisible = staticView === view ? visible : groundKnown.filter(cell => surfaceCellVisible(cell, viewport));
    stats.authorizedCells = authorization.known.length; stats.visibleCells = visible.length;
    const visibleRegions = new Set(visible.map(cell => cell.regionId));
    context.save(); this.clip(context, groundKnown, view);
    for (const field of scene.terrainFields) {
      const cells = groundVisible.filter(cell => cell.regionId === field.regionId); if (!cells.length) continue;
      context.save(); this.clip(context, cells, view);
      if (!options.skipGround) {
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        const occupied = new Map(cells.map(cell => { const cx = chunkAt(cell.x), cy = chunkAt(cell.y); return [`${cx}:${cy}`, { cx, cy }]; }));
        for (const { cx, cy } of occupied.values()) {
          const gutter = RASTER_GUTTER / PIXELS_PER_CELL, chunk = this.chunk(field, cx, cy), corner = this.point({ x: cx * CHUNK_SIDE - .5 - gutter, y: cy * CHUNK_SIDE - .5 + CHUNK_SIDE + gutter }, view);
          context.drawImage(chunk, corner.x, corner.y, (CHUNK_SIDE + 2 * gutter) * view.cellSize, (CHUNK_SIDE + 2 * gutter) * view.cellSize); stats.groundChunks++;
        }
      }
      context.restore();
    }
    if (!options.skipGround) this.drawTerrainTransitions(context, scene, groundVisible, view, staticView === view ? authorization.known : staticView.cells);
    context.restore();
    if (!options.skipGround) this.prefetchGround(scene, authorization, visible, view);
    // Owned-map cells stop here. Roads, history and scenery still use actual
    // perception and its original passability/region identities.
    context.save(); this.clip(context, known, view);
    for (const field of scene.terrainFields) {
      if (!visibleRegions.has(field.regionId)) continue;
      const cells = foreground.passableByRegion.get(field.regionId) ?? [];
      context.save(); this.clip(context, cells, view);
      for (const road of scene.roads.filter(road => road.regionId === field.regionId)) this.drawRoad(context, road, field, view, cells);
      context.restore();
    }
    this.lastDrawPhases.groundMs = performance.now() - phaseStarted; phaseStarted = performance.now();
    stats.walks = this.drawWalks(context, scene, elapsed, { ...view, cells: known }, dpr, foreground.passableByRegion);
    for (const mark of scene.combatMarks.slice(0, 128)) {
      if (!visibleRegions.has(mark.regionId)) continue;
      context.save(); this.clip(context, foreground.passableByRegion.get(mark.regionId) ?? [], view);
      if (this.drawMark(context, mark, elapsed, view)) stats.marks++;
      context.restore();
    }
    this.lastDrawPhases.tracesMs = performance.now() - phaseStarted; phaseStarted = performance.now();
    context.save(); this.clip(context, foreground.passable, view);
    for (const scenery of this.scenery(scene)) {
      if (scenery.z !== view.z || ![scenery.x, scenery.y, scenery.scale, scenery.rotation].every(finite)) continue;
      // Only noninteractive ground sprites are thinned. Both ground backends
      // share this overlay; actors, obstacles, roads and traces stay untouched.
      if (!surfaceSceneryRetained(scenery.id, scenery.assetKey)) continue;
      const variant = surfaceSceneryVariant(scenery.id), sprite = surfaceSprite(scenery.assetKey, variant);
      // An atlas may finish loading one frame later than its partner. Keep the
      // matching painted identity until the chosen stable variant is ready.
      const atlas = sprite && (this.atlases.has(sprite.atlas) ? sprite.atlas : sprite.baseAtlas), image = atlas === undefined ? undefined : this.atlases.get(atlas);
      const anchor = anchors.get(`${Math.floor(scenery.x + .5)}:${Math.floor(scenery.y + .5)}`);
      if (!sprite || !image || anchor?.passable !== true || anchor.regionId !== scenery.regionId) continue;
      const point = this.point(scenery, view), frame = sprite.row * 4 + sprite.column;
      const bounds = atlasBounds[atlas!]?.[frame], base = atlasBounds[sprite.baseAtlas]?.[frame];
      if (!bounds || !base) continue;
      const geometry = surfaceSceneryGeometry(scenery, bounds, base.extent);
      // The bounds metadata measures opaque brushwork. Cull using the entire
      // rotated source frame, retaining even its faint alpha tails at an edge.
      const paintedFrame = surfaceSceneryGeometry(scenery, { ...bounds, left: 0, top: 0, width: 1, height: 1 }, base.extent).bounds;
      if (!surfaceRectsOverlap(paintedFrame, viewport)) continue;
      // Both authored forms reserve the same identity's stable envelope while
      // an atlas loads. No camera, zoom or frame randomness affects clearance.
      const envelopes = sprite.variantAtlases.map(index => atlasBounds[index][frame])
        .map(subject => surfaceSceneryGeometry(scenery, subject, base.extent).bounds);
      if (view.sceneryExclusions?.some(exclusion => envelopes.some(envelope => surfaceRectsOverlap(envelope, exclusion)))) { stats.skippedScenery++; continue; }
      const size = geometry.size * view.cellSize;
      context.save(); context.translate(point.x, point.y); context.rotate(scenery.rotation * Math.PI / 180); context.scale(scenery.flip ? -1 : 1, 1);
      // Whole transparent source frames preserve irregular silhouettes and never clip to one game cell.
      context.drawImage(image, sprite.column * image.naturalWidth / 4, sprite.row * image.naturalHeight / 4, image.naturalWidth / 4, image.naturalHeight / 4, -size * bounds.anchorX, -size * bounds.anchorY, size, size);
      context.restore(); stats.scenery++; stats.sceneryVariants[sprite.variantAtlases.length === 1 ? 0 : this.atlases.has(sprite.atlas) ? variant : 0]++;
    }
    context.restore();
    this.lastDrawPhases.sceneryMs = performance.now() - phaseStarted; phaseStarted = performance.now();
    // Grid coordinates share the static ground union, including owned maps.
    // Paint after scenery, before the DOM entities; one union fill keeps
    // adjoining lines and their intersections at the same black opacity.
    context.restore();
    context.save(); this.clip(context, groundKnown, view);
    context.fillStyle = '#0007'; context.beginPath();
    for (const cell of groundVisible) {
      const p = this.point({ x: cell.x - .5, y: cell.y + .5 }, view);
      context.rect(p.x, p.y, view.cellSize, 1);
      context.rect(p.x, p.y, 1, view.cellSize);
    }
    context.fill(); context.restore();
    if (view.perceptionCells === undefined) this.featherVisibility(context, known, view, dpr);
    this.lastDrawPhases.visibilityMs = performance.now() - phaseStarted;
    stats.groundGenerated = this.groundGenerated - generatedBefore; return stats;
  }
}
