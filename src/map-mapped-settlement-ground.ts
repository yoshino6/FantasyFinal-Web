import { surfaceHash, surfaceSnapshotClock, validSurfaceScene, type MapSurfaceScene, type SurfaceCell } from './map-surface';

export type MappedSettlementArea = { minX: number; maxX: number; minY: number; maxY: number };
export type MappedSettlementReceipt = { schemaVersion: 1; regionId: number; regionCode: string; z: number; scopeToken: string; terrainSeed: number; areas: MappedSettlementArea[]; excludedAreas: MappedSettlementArea[] };
export type PreparedMappedSettlement = { receipt: MappedSettlementReceipt; scene: MapSurfaceScene };
export type MappedSettlementViewport = { minX: number; maxX: number; minY: number; maxY: number };
type ReceiptContext = { current: { x: number; y: number; z?: number }; regionCode: string; originCell?: SurfaceCell };
type GroundView = { camera: { x: number; y: number }; viewport: { width: number; height: number }; cellSize: number };
type MappedSettlementRouteCell = SurfaceCell & { z: number; regionId: number; regionCode: string; passable: boolean };

const areaContains = (area: MappedSettlementArea, point: { x: number; y: number }) => point.x >= area.minX && point.x <= area.maxX && point.y >= area.minY && point.y <= area.maxY;
const validArea = (area: MappedSettlementArea) => !!area && [area.minX, area.maxX, area.minY, area.maxY].every(Number.isSafeInteger) && area.minX <= area.maxX && area.minY <= area.maxY;
const covered = (receipt: MappedSettlementReceipt, point: { x: number; y: number }) => receipt.areas.some(area => areaContains(area, point)) && !receipt.excludedAreas.some(area => areaContains(area, point));

/** An owned-map receipt authorizes static public ground, never interaction. */
export function prepareMappedSettlementGround(scene: MapSurfaceScene | undefined, receipt: MappedSettlementReceipt | undefined, context: ReceiptContext): PreparedMappedSettlement | undefined {
  const { current, regionCode, originCell } = context, z = current.z ?? 0;
  if (!Array.isArray(scene?.terrainFields) || scene.terrainFields.some(field => !field) || !validSurfaceScene(scene) || !receipt || receipt.schemaVersion !== 1
    || ![current.x, current.y, z, receipt.regionId, receipt.z, receipt.terrainSeed].every(Number.isSafeInteger)
    || z < 0 || receipt.regionId <= 0 || receipt.z !== z || receipt.terrainSeed < 0 || receipt.terrainSeed > 0xffffffff
    || typeof receipt.regionCode !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(receipt.regionCode)
    || /(?:arena|test|private|story|trial|dungeon|home)/i.test(receipt.regionCode)
    || receipt.regionCode !== regionCode || receipt.scopeToken !== `world:${z}` || scene.scopeToken !== receipt.scopeToken
    || receipt.terrainSeed !== surfaceHash(`surface1:${receipt.scopeToken}:${receipt.regionCode}`)
    || !originCell || originCell.x !== current.x || originCell.y !== current.y || (originCell.z ?? z) !== z
    || originCell.regionId !== receipt.regionId || originCell.regionCode !== receipt.regionCode
    || !Array.isArray(receipt.areas) || !receipt.areas.length || receipt.areas.length > 64 || !receipt.areas.every(validArea)
    || !Array.isArray(receipt.excludedAreas) || receipt.excludedAreas.length > 256 || !receipt.excludedAreas.every(validArea)
    || !covered(receipt, current)) return;
  // An existing ID/code belongs to its existing material. A receipt may fill
  // an absent field, but cannot replace a conflicting registered identity.
  const related = scene.terrainFields.filter(field => field.regionId === receipt.regionId || field.regionCode === receipt.regionCode);
  if (related.some(field => field.regionId !== receipt.regionId || field.regionCode !== receipt.regionCode || field.seed !== receipt.terrainSeed)) return;
  const copyArea = ({ minX, maxX, minY, maxY }: MappedSettlementArea) => ({ minX, maxX, minY, maxY });
  const normalized: MappedSettlementReceipt = { schemaVersion: 1, regionId: receipt.regionId, regionCode: receipt.regionCode, z, scopeToken: receipt.scopeToken, terrainSeed: receipt.terrainSeed,
    areas: receipt.areas.map(copyArea), excludedAreas: receipt.excludedAreas.map(copyArea) };
  if (related.length) return { scene, receipt: normalized };
  const completed = { ...scene, snapshotId: `${scene.snapshotId}:mapped-ground:${receipt.regionId}:${receipt.terrainSeed}`,
    terrainFields: [...scene.terrainFields, { regionId: receipt.regionId, regionCode: receipt.regionCode, seed: receipt.terrainSeed }] };
  const clock = surfaceSnapshotClock(scene, performance.now());
  surfaceSnapshotClock(completed, clock.receivedAt);
  return { scene: completed, receipt: normalized };
}

/** Exact visible-cell intersection plus at most one cell of overscan. */
export function mappedSettlementViewport(view: GroundView): MappedSettlementViewport | undefined {
  const { camera, viewport, cellSize } = view;
  if (![camera.x, camera.y, viewport.width, viewport.height, cellSize].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0 || cellSize <= 0) return;
  const width = viewport.width / (2 * cellSize), height = viewport.height / (2 * cellSize);
  const bounds = { minX: Math.floor(camera.x - width + .5) - 1, maxX: Math.ceil(camera.x + width - .5) + 1,
    minY: Math.floor(camera.y - height + .5) - 1, maxY: Math.ceil(camera.y + height - .5) + 1 };
  if (!Object.values(bounds).every(Number.isSafeInteger) || (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1) > 4096) return;
  return bounds;
}

/** Renderer-only sentinel cells; collision and observed cells stay separate. */
export function mappedSettlementViewportCells(prepared: PreparedMappedSettlement | undefined, viewport: MappedSettlementViewport | undefined): SurfaceCell[] {
  if (!prepared || !viewport || !validArea(viewport) || (viewport.maxX - viewport.minX + 1) * (viewport.maxY - viewport.minY + 1) > 4096) return [];
  const receipt = prepared.receipt, result: SurfaceCell[] = [];
  for (let y = viewport.minY; y <= viewport.maxY; y++) for (let x = viewport.minX; x <= viewport.maxX; x++) {
    if (covered(receipt, { x, y })) result.push({ x, y, z: receipt.z, regionId: receipt.regionId, regionCode: receipt.regionCode, passable: false });
  }
  return result;
}

/** A bounded route hint over known public ground; every real step checks collision. */
export function mappedSettlementRouteCells(prepared: PreparedMappedSettlement | undefined, observed: readonly SurfaceCell[]): MappedSettlementRouteCell[] | undefined {
  if (!prepared) return;
  const receipt = prepared.receipt, maximumCells = 16384, result = new Map<string, MappedSettlementRouteCell>();
  const known = new Map(observed.filter(cell => (cell.z ?? receipt.z) === receipt.z).map(cell => [`${cell.x}:${cell.y}`, cell]));
  for (const area of receipt.areas) {
    const count = (area.maxX - area.minX + 1) * (area.maxY - area.minY + 1);
    if (!Number.isSafeInteger(count) || count < 1 || count > maximumCells) return;
    for (let y = area.minY; y <= area.maxY; y++) for (let x = area.minX; x <= area.maxX; x++) {
      if (!covered(receipt, { x, y })) continue;
      const key = `${x}:${y}`, cell = known.get(key);
      result.set(key, { x, y, z: receipt.z, regionId: receipt.regionId, regionCode: receipt.regionCode,
        passable: !cell || cell.passable === true && cell.regionId === receipt.regionId && cell.regionCode === receipt.regionCode });
      if (result.size > maximumCells) return;
    }
  }
  return [...result.values()];
}
