import type { ExploreGroundWindow } from './api';
import { surfaceHash, surfaceSnapshotClock, type MapSurfaceScene, type SurfaceCell } from './map-surface';

/** A server receipt can prepare neighbouring public materials, never objects. */
export function groundWindowScene(scene: MapSurfaceScene | undefined, window: ExploreGroundWindow | undefined, z: number): MapSurfaceScene | undefined {
  if (!scene || scene.scopeToken !== 'world:0' || z !== 0 || window?.scopeToken !== 'world:0'
    || !Array.isArray(window.terrainFields) || window.terrainFields.length > 64) return scene;
  const fields = new Map(scene.terrainFields.map(field => [field.regionId, field]));
  const additions = new Map<number, MapSurfaceScene['terrainFields'][number]>();
  for (const field of window.terrainFields) {
    if (!field || !Number.isSafeInteger(field.regionId) || field.regionId <= 0
      || !Number.isSafeInteger(field.seed) || field.seed < 0 || field.seed > 0xffffffff
      || typeof field.regionCode !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(field.regionCode)) return scene;
    const existing = fields.get(field.regionId) ?? additions.get(field.regionId);
    if (existing) {
      if (existing.regionCode !== field.regionCode || existing.seed !== field.seed) return scene;
      continue;
    }
    if ([...fields.values(), ...additions.values()].some(existing => existing.regionCode === field.regionCode)
      || /(?:arena|test|private|story|trial|dungeon|home)/i.test(field.regionCode)
      || field.seed !== surfaceHash(`surface1:world:0:${field.regionCode}`)) return scene;
    additions.set(field.regionId, { ...field });
  }
  if (!additions.size) return scene;
  const result = { ...scene, snapshotId: `${scene.snapshotId}:public-ground:${[...additions.values()].map(field => `${field.regionId}:${field.seed}`).join(',')}`,
    terrainFields: [...scene.terrainFields, ...additions.values()] };
  const clock = surfaceSnapshotClock(scene, performance.now());
  surfaceSnapshotClock(result, clock.receivedAt);
  return result;
}

/** Server-prepared base terrain is draw-only. It never enters route planning,
 * interaction cells, entity snapshots, roads, scenery or traces. */
export function groundWindowCells(scene: MapSurfaceScene | undefined, cells: readonly SurfaceCell[], window: ExploreGroundWindow | undefined, z: number): SurfaceCell[] {
  if (!scene || scene.scopeToken !== 'world:0' || z !== 0 || !window || !Array.isArray(window.cells)
    || window.cells.length > 4096 || !Array.isArray(window.terrainFields)) return [...cells];
  const padding = window.padding ?? 2;
  if (!Number.isSafeInteger(padding) || padding < 2 || padding > 12) return [...cells];
  const preparedScene = groundWindowScene(scene, window, z)!;
  const fields = new Map(preparedScene.terrainFields.map(field => [field.regionId, field]));
  if (window.terrainFields.some(field => !field || !fields.has(field.regionId) || fields.get(field.regionId)!.seed !== field.seed
    || fields.get(field.regionId)!.regionCode !== field.regionCode)) return [...cells];
  const allowed = new Set(window.terrainFields.map(field => field.regionId)), neighbours = new Set<string>();
  // Expand the known diamond once, rather than repeating a padding-sized
  // square for every cell. It is geometry-only and never authorizes objects.
  let frontier = cells.map(cell => ({ x: cell.x, y: cell.y }));
  for (const cell of frontier) neighbours.add(`${cell.x}:${cell.y}`);
  for (let distance = 0; distance < padding; distance++) {
    const next: { x: number; y: number }[] = [];
    for (const cell of frontier) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cell.x + dx, y = cell.y + dy, key = `${x}:${y}`;
      if (![x, y].every(Number.isSafeInteger) || neighbours.has(key)) continue;
      neighbours.add(key); next.push({ x, y });
    }
    frontier = next;
  }
  const combined = new Map<string, SurfaceCell>();
  for (const cell of window.cells) {
    if (!cell) continue;
    const field = fields.get(cell.regionId);
    if (![cell.x, cell.y, cell.z, cell.regionId].every(Number.isSafeInteger) || cell.z !== z
      || !allowed.has(cell.regionId) || cell.regionCode !== field?.regionCode || !neighbours.has(`${cell.x}:${cell.y}`)) continue;
    // This false is a renderer-only sentinel: no road/trace/sprite may paint
    // on a prefetched ground cell. Real collision data lives in `cells` only.
    combined.set(`${cell.x}:${cell.y}`, { x: cell.x, y: cell.y, z, regionId: cell.regionId, regionCode: cell.regionCode, passable: false });
  }
  for (const cell of cells) combined.set(`${cell.x}:${cell.y}`, cell);
  return [...combined.values()].sort((a, b) => a.y - b.y || a.x - b.x || (a.regionId ?? 0) - (b.regionId ?? 0));
}
