import { authorizedSurfaceCells, surfaceHash, surfaceSnapshotClock, validSurfaceScene, type MapSurfaceScene, type SurfaceCell, type SurfaceRect } from './map-surface';
import { isSettlementRegion, planSettlementRoadside } from './map-settlement-geometry';
import { planSettlementEntrances, validSettlementPublicBounds, type SettlementObservedAnchor, type SettlementPublicBounds } from './map-settlement-entrances';
export type { SettlementObservedAnchor, SettlementPublicBounds } from './map-settlement-entrances';

const derivedScenes = new WeakMap<MapSurfaceScene, Map<string, MapSurfaceScene>>();
const plannedIdentity = (id: unknown) => typeof id === 'string' && /^settlement-(?:scene|road|scenery|prop)/.test(id);
const plannedAsset = (assetKey: unknown) => typeof assetKey === 'string' && /^settlement_/.test(assetKey);

/** Decorate old public roads and observed entrances/public plaza rest corners. */
export function settlementSurfaceScene(scene: MapSurfaceScene | undefined, actualCells: readonly SurfaceCell[] | undefined, z: number,
  exclusions: readonly SurfaceRect[] = [], observedAnchors: readonly SettlementObservedAnchor[] = [], publicBounds?: SettlementPublicBounds): MapSurfaceScene | undefined {
  if (!scene || scene.scopeToken !== 'world:0' || z !== 0 || !Array.isArray(scene.terrainFields)
    || scene.terrainFields.length > 64 || scene.terrainFields.some(field => !field || !Number.isSafeInteger(field.regionId) || field.regionId <= 0
      || typeof field.regionCode !== 'string' || !Number.isFinite(field.seed)) || !validSurfaceScene(scene)
    || scene.roads.length > 16_384 || scene.scenery.length > 16_384 || !Array.isArray(actualCells) || !actualCells.length || actualCells.length > 16_384
    || !Array.isArray(observedAnchors) || observedAnchors.length > 128 || !Array.isArray(exclusions) || exclusions.length > 16_384 || exclusions.some(rect => !rect
      || ![rect.left, rect.right, rect.south, rect.north].every(Number.isFinite) || rect.left >= rect.right || rect.south >= rect.north)) return scene;
  const identities = new Map<number, MapSurfaceScene['terrainFields'][number]>();
  for (const field of scene.terrainFields) {
    const previous = identities.get(field.regionId);
    if (previous && (previous.regionCode !== field.regionCode || previous.seed !== field.seed)) return scene;
    identities.set(field.regionId, field);
  }
  const claimed = new Map<string, SurfaceCell>(), denied = new Set<string>();
  for (const cell of actualCells) {
    if (!cell || !Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) || (cell.z ?? z) !== z) continue;
    const key = `${cell.x}:${cell.y}`, previous = claimed.get(key);
    if (cell.passable !== true || identities.get(cell.regionId!)?.regionCode !== cell.regionCode
      || previous && (previous.regionId !== cell.regionId || previous.regionCode !== cell.regionCode)) denied.add(key);
    if (!previous) claimed.set(key, cell);
  }
  const known = authorizedSurfaceCells(scene, [...claimed].filter(([key]) => !denied.has(key)).map(([, cell]) => cell), z).filter(cell => cell.passable === true)
    .map(cell => ({ ...cell, z, passable: true })).sort((a, b) => a.regionId! - b.regionId! || a.x - b.x || a.y - b.y);
  const regions = [...new Set(known.filter(cell => isSettlementRegion(cell.regionCode)).map(cell => cell.regionId!))];
  if (!regions.length) return scene;
  const knownIndex = new Map(known.map(cell => [`${cell.x}:${cell.y}`, cell]));
  const anchors = [...new Map(observedAnchors.filter(anchor => anchor && Number.isSafeInteger(anchor.x) && Number.isSafeInteger(anchor.y) && anchor.z === z
    && anchor.regionId === knownIndex.get(`${anchor.x}:${anchor.y}`)?.regionId && (anchor.regionCode === undefined || anchor.regionCode === knownIndex.get(`${anchor.x}:${anchor.y}`)?.regionCode))
    .map(anchor => [`${anchor.regionId}:${anchor.x}:${anchor.y}`, { x: anchor.x, y: anchor.y, z, regionId: anchor.regionId, regionCode: knownIndex.get(`${anchor.x}:${anchor.y}`)!.regionCode }])).values()]
    .sort((a, b) => a.regionId - b.regionId || a.x - b.x || a.y - b.y);
  const bounds = validSettlementPublicBounds(publicBounds) && identities.get(publicBounds.regionId)?.regionCode === publicBounds.regionCode ? publicBounds : undefined;
  // Rectangles may be freshly allocated by Vue while their world geometry is
  // unchanged. Cache by values so walking never rerolls or republishes a scene.
  const signature = JSON.stringify([known.map(cell => [cell.x, cell.y, cell.regionId, cell.regionCode]),
    exclusions.map(rect => [rect.left, rect.right, rect.south, rect.north]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]),
    anchors.map(anchor => [anchor.regionId, anchor.x, anchor.y]), bounds && [bounds.regionId, bounds.regionCode, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ]]);
  let cache = derivedScenes.get(scene);
  const cached = cache?.get(signature);
  if (cached) return cached;
  const targets = new Set(regions), authoritative = new Set<number>();
  if (/settlement[-:]scene/.test(scene.snapshotId)) regions.forEach(regionId => authoritative.add(regionId));
  for (const road of scene.roads) if (road && targets.has(road.regionId) && plannedIdentity(road.id)) authoritative.add(road.regionId);
  for (const item of scene.scenery) if (item && targets.has(item.regionId) && (plannedIdentity(item.id) || plannedAsset(item.assetKey))) authoritative.add(item.regionId);
  const scenery = scene.scenery.filter(item => !item || !targets.has(item.regionId) || plannedIdentity(item.id) || plannedAsset(item.assetKey)
    || !/^scenery_(?:patch_)?\d+$/.test(item.assetKey));
  for (const regionId of regions) if (!authoritative.has(regionId)) {
    const regionCode = identities.get(regionId)!.regionCode;
    const roads = scene.roads.filter(road => road?.regionId === regionId);
    scenery.push(...planSettlementRoadside({ regionId, regionCode, z, cells: known, roads, exclusions }));
    scenery.push(...planSettlementEntrances({ regionId, regionCode, cells: known, anchors, roads, exclusions, existing: scenery, bounds }));
  }
  let result = scene;
  if (scenery.length !== scene.scenery.length || scenery.some((item, index) => item !== scene.scenery[index])) {
    result = { ...scene, snapshotId: `${scene.snapshotId}:settlement-compat:${surfaceHash(signature)}`, scenery };
    const clock = surfaceSnapshotClock(scene, performance.now());
    surfaceSnapshotClock(result, clock.receivedAt);
  }
  if (!cache) { cache = new Map(); derivedScenes.set(scene, cache); }
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(signature, result);
  return result;
}
