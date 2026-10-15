import { surfaceSceneryGeometry, surfaceRectsOverlap, type MapSurfaceScene, type SurfaceCell, type SurfaceRect } from './map-surface';
import { isSettlementRegion, SETTLEMENT_SPRITE_BOUNDS, settlementSceneryFootprint } from './map-settlement-geometry';

export type SettlementObservedAnchor = { x: number; y: number; z: number; regionId: number; regionCode?: string };
export type SettlementPublicBounds = { regionId: number; regionCode: string; minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
type Scenery = MapSurfaceScene['scenery'][number];
type EntranceInput = { regionId: number; regionCode: string; cells: readonly SurfaceCell[]; anchors: readonly SettlementObservedAnchor[];
  roads: MapSurfaceScene['roads']; exclusions: readonly SurfaceRect[]; existing: readonly Scenery[]; bounds?: SettlementPublicBounds };
const coordinate = (value: unknown): value is number => Number.isSafeInteger(value) && Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER - 4;
const key = (point: { x: number; y: number }) => `${point.x}:${point.y}`;
const scales = [.95, .72, .95, .8, .9];

export function validSettlementPublicBounds(bounds: SettlementPublicBounds | undefined): bounds is SettlementPublicBounds {
  return !!bounds && Number.isSafeInteger(bounds.regionId) && bounds.regionId > 0 && isSettlementRegion(bounds.regionCode)
    && [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ].every(coordinate)
    && bounds.minX <= bounds.maxX && bounds.minY <= bounds.maxY && bounds.minZ <= 0 && bounds.maxZ >= 0
    && (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1) <= 16_384;
}

const envelope = (item: Scenery): SurfaceRect | undefined => {
  const bounds = SETTLEMENT_SPRITE_BOUNDS[item.assetKey as keyof typeof SETTLEMENT_SPRITE_BOUNDS];
  if (!bounds || ![item.x, item.y, item.scale].every(Number.isFinite) || item.rotation !== 0 || item.flip) return undefined;
  const measured = { ...bounds, extent: bounds.extent ?? 1 };
  return surfaceSceneryGeometry(item, measured, measured.extent).bounds;
};
const spaced = (bounds: SurfaceRect): SurfaceRect => ({ left: bounds.left - .15, right: bounds.right + .15, south: bounds.south - .15, north: bounds.north + .15 });

/** Fixed entrance/plaza slots; authorization clips them without choosing replacements. */
export function planSettlementEntrances(input: EntranceInput): Scenery[] {
  const { regionId, regionCode, cells, anchors, roads, exclusions, existing } = input;
  if (!isSettlementRegion(regionCode) || !Number.isSafeInteger(regionId) || regionId <= 0 || cells.length > 16_384 || anchors.length > 128) return [];
  const known = new Map(cells.filter(cell => cell.regionId === regionId && cell.regionCode === regionCode && (cell.z ?? 0) === 0 && cell.passable === true).map(cell => [key(cell), cell]));
  const observed = [...new Map(anchors.filter(anchor => anchor && coordinate(anchor.x) && coordinate(anchor.y) && anchor.z === 0
    && anchor.regionId === regionId && (anchor.regionCode === undefined || anchor.regionCode === regionCode) && known.has(key(anchor)))
    .map(anchor => [key(anchor), anchor])).values()].sort((a, b) => a.x - b.x || a.y - b.y);
  const bounds = validSettlementPublicBounds(input.bounds) && input.bounds.regionId === regionId && input.bounds.regionCode === regionCode ? input.bounds : undefined;
  const plaza = bounds ? { x: bounds.minX + Math.floor((bounds.maxX - bounds.minX) / 2), y: bounds.minY + Math.floor((bounds.maxY - bounds.minY) / 2) } : undefined;
  const groups = [
    ...(plaza ? [{ ...plaza, identity: `plaza:${bounds!.minX}:${bounds!.maxX}:${bounds!.minY}:${bounds!.maxY}` }] : []),
    ...observed.filter(anchor => !plaza || Math.abs(anchor.x - plaza.x) + Math.abs(anchor.y - plaza.y) > 4).map(anchor => ({ ...anchor, identity: 'entrance' })),
  ];
  // The front approach remains open. These rectangles describe decoration
  // clearance only; no collision cell or road is added or changed.
  const corridors = [...observed, ...(plaza ? [plaza] : [])].map(anchor => ({ left: anchor.x - .58, right: anchor.x + .58, south: anchor.y - 2.5, north: anchor.y + .5 }));
  const roadCells = new Map<string, { x: number; y: number; clearance: number }>();
  let roadPoints = 0;
  for (const road of roads) {
    if (!road || road.regionId !== regionId) continue;
    if (!Number.isFinite(road.width) || road.width <= 0 || road.width > 2 || !Array.isArray(road.points)
      || (roadPoints += road.points.length) > 16_384 || road.points.some(point => !point || !coordinate(point.x) || !coordinate(point.y))) return [];
    const clearance = road.width / 2 * 1.4 + .08;
    road.points.forEach(point => roadCells.set(key(point), { ...point, clearance: Math.max(clearance, roadCells.get(key(point))?.clearance ?? 0) }));
  }
  const roadClearance = [...roadCells.values()].map(point => ({ left: point.x - point.clearance, right: point.x + point.clearance, south: point.y - point.clearance, north: point.y + point.clearance }));
  for (const point of roadCells.values()) {
    const adjacent = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => roadCells.has(`${point.x + dx}:${point.y + dy}`));
    // A clipped legacy-road endpoint is not evidence of a real junction.
    // Reserve extra space only for observed turns or forks, so a window edge
    // cannot suppress an otherwise fully authorized fixed entrance slot.
    const degree = adjacent.filter(Boolean).length;
    if (degree > 2 || degree === 2 && !(adjacent[0] && adjacent[2] || adjacent[1] && adjacent[3])) {
      roadClearance.push({ left: point.x - 1.5, right: point.x + 1.5, south: point.y - 1.5, north: point.y + 1.5 });
    }
  }
  const occupied = existing.filter(item => item && item.regionId === regionId && item.z === 0).map(envelope).filter((value): value is SurfaceRect => !!value).map(spaced);
  const accepted: { item: Scenery; footprint: ReturnType<typeof settlementSceneryFootprint> }[] = [];
  for (const group of groups) {
    // One light and seat form a small rest corner; the opposite flower/wish
    // slot balances it. The same slots are retained in every observed window.
    const assets = regionCode === 'baina_town' ? [0, 2, 1] : [3, 2, 4];
    const offsets = [[2, 0], [1, -2], [-2, 0]];
    for (const [slot, asset] of assets.entries()) {
      const item: Scenery = { id: `settlement-prop1:compat-${group.identity}:${regionCode}:${regionId}:0:${group.x}:${group.y}:${slot}`,
        regionId, assetKey: `settlement_${asset}`, x: group.x + offsets[slot][0], y: group.y + offsets[slot][1], z: 0, scale: scales[asset], rotation: 0, flip: false };
      const painted = envelope(item), footprint = settlementSceneryFootprint(item);
      if (!painted || !footprint.length || [...corridors, ...roadClearance, ...exclusions].some(rect => surfaceRectsOverlap(painted, rect))
        || occupied.some(rect => surfaceRectsOverlap(spaced(painted), rect))) continue;
      // Resolve canonical candidate competition before authorization clipping.
      // An absent window cell never makes a different slot win or move.
      occupied.push(spaced(painted)); accepted.push({ item, footprint });
    }
  }
  return accepted.filter(({ footprint }) => footprint.every(point => known.has(key(point)))).map(({ item }) => item);
}
