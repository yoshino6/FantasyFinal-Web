import { gameAssetUrl } from './game-assets';
import spriteBounds from './map-environment-sprite-bounds.json';
import northLogBounds from './map-environment-north-bounds.json';
import eastLogBounds from './map-environment-east-bounds.json';
import singleSpriteBounds from './map-environment-single-bounds.json';
import directionalSpriteBounds from './map-environment-directional-bounds.json';

/** Coordinates are whole cells. Positive dy is north, as on the server map. */
export type EnvironmentObjectView = {
  id: string; templateId: string; name: string; description: string;
  x: number; y: number; z: number; footprint: { dx: number; dy: number }[];
  width: number; height: number; assetKey: string; state: string; revision: number;
  blocking?: boolean; destructible: boolean; canClear: boolean; clearReason?: string;
  workSeconds: number; remainingSeconds?: number;
};
export type EnvironmentPosition = { x: number; y: number; z?: number };
/** 80% transparent: retain 20% opacity outside occupied whole cells. */
export const ENVIRONMENT_OVERFLOW_OPACITY = 0.2;
export const ENVIRONMENT_ATLAS = '/assets/light-anime/map-surface-v3/obstacles-v5.webp';
export const ENVIRONMENT_SPRITES = [
  'forest_log', 'rock_cluster', 'root_cluster', 'ice_cluster',
  'ruin_wall', 'reed_cluster', 'red_rocks', 'crystal_cluster',
  'forest_stump', 'thorn_cluster', 'dead_tree', 'ancient_statue',
  'grass_tuft', 'forest_mushroom', 'pebble_scatter', 'frost_grass'
] as const;
// Collision dimensions select independent perspective paintings. They never
// turn an upright front face onto its side with a CSS quarter rotation.
const DIRECTIONAL_FOOTPRINTS: Record<string, { width: number; height: number; bodyCoverage?: number }> = {
  forest_log: { width: 3, height: 1 }, ruin_wall: { width: 3, height: 1, bodyCoverage: .9 },
  reed_cluster: { width: 2, height: 1 }
};

/** Invalid or fractional footprints never acquire a collision-shaped hit area. */
export function environmentFootprint(object: EnvironmentObjectView): EnvironmentPosition[] {
  if (![object.x, object.y, object.z, object.width, object.height].every(Number.isSafeInteger)
    || object.width < 1 || object.height < 1 || object.width > 16 || object.height > 16
    || !Array.isArray(object.footprint) || !object.footprint.length || object.footprint.length > 256) return [];
  const keys = new Set<string>();
  const cells: EnvironmentPosition[] = [];
  for (const offset of object.footprint) {
    if (!Number.isSafeInteger(offset.dx) || !Number.isSafeInteger(offset.dy)
      || offset.dx < 0 || offset.dy < 0 || offset.dx >= object.width || offset.dy >= object.height) return [];
    const key = `${offset.dx}:${offset.dy}`;
    if (keys.has(key)) return [];
    keys.add(key); cells.push({ x: object.x + offset.dx, y: object.y + offset.dy, z: object.z });
  }
  return cells;
}

export function environmentDistance(object: EnvironmentObjectView, position: EnvironmentPosition): number {
  if ((position.z ?? 0) !== object.z) return Infinity;
  const cells = environmentFootprint(object);
  return cells.length ? Math.min(...cells.map(cell => Math.abs(cell.x - position.x) + Math.abs(cell.y - position.y))) : Infinity;
}

/** Approach an unoccupied server-confirmed edge cell, never the obstacle anchor. */
export function environmentApproach(object: EnvironmentObjectView, current: EnvironmentPosition,
  cells: readonly (EnvironmentPosition & { passable: boolean; reachable?: boolean })[]): EnvironmentPosition | undefined {
  if (environmentDistance(object, current) <= 1) return;
  const candidates = cells.filter(cell => cell.passable && cell.reachable !== false
    && (cell.z ?? current.z ?? 0) === object.z && environmentDistance(object, cell) === 1);
  candidates.sort((a, b) => Math.abs(a.x - current.x) + Math.abs(a.y - current.y)
    - Math.abs(b.x - current.x) - Math.abs(b.y - current.y) || a.y - b.y || a.x - b.x);
  const target = candidates[0];
  return target ? { x: target.x, y: target.y, z: target.z ?? current.z } : undefined;
}

export type NativeSpriteBounds = { assetPath: string; width: number; height: number; left: number; top: number; right: number; bottom: number; alphaEnvelope: { left: number; top: number; right: number; bottom: number } };
export type DirectionalSpriteBounds = NativeSpriteBounds & { direction: 'east' | 'north'; bodyCoverage?: number };
/** Only exact registered footprints acquire direction-specific original art. */
export function environmentDirectionalSprite(assetKey: string, shape?: Pick<EnvironmentObjectView, 'width' | 'height'>): DirectionalSpriteBounds | undefined {
  const base = Object.prototype.hasOwnProperty.call(DIRECTIONAL_FOOTPRINTS, assetKey) ? DIRECTIONAL_FOOTPRINTS[assetKey] : undefined;
  if (!base || !shape) return;
  const direction = shape.width === base.width && shape.height === base.height ? 'east'
    : shape.width === base.height && shape.height === base.width ? 'north' : undefined;
  if (!direction) return;
  const registry = directionalSpriteBounds as Record<string, Partial<Record<'east' | 'north', NativeSpriteBounds>>>;
  const source = Object.prototype.hasOwnProperty.call(registry, assetKey) ? registry[assetKey]?.[direction] : undefined;
  if (source) return { ...source, direction, bodyCoverage: base.bodyCoverage };
  if (assetKey === 'forest_log') {
    const bounds = direction === 'east' ? eastLogBounds : northLogBounds;
    return { ...bounds, assetPath: `/assets/light-anime/map-surface-v3/forest-log-${direction}.webp`,
      alphaEnvelope: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }, direction };
  }
}
/** New independent paintings never acquire a slot in the legacy 4×4 atlas. */
export function environmentSingleSprite(assetKey: string): NativeSpriteBounds | undefined {
  return Object.prototype.hasOwnProperty.call(singleSpriteBounds, assetKey)
    ? (singleSpriteBounds as Record<string, NativeSpriteBounds>)[assetKey] : undefined;
}

export function environmentSpriteStyle(assetKey: string, shape?: Pick<EnvironmentObjectView, 'width' | 'height'>) {
  const single = environmentDirectionalSprite(assetKey, shape) ?? environmentSingleSprite(assetKey);
  if (single) return { backgroundImage: `url("${gameAssetUrl(single.assetPath)}")`, backgroundSize: 'contain',
    backgroundPosition: '50% 50%', backgroundRepeat: 'no-repeat' as const };
  const index = ENVIRONMENT_SPRITES.indexOf(assetKey as typeof ENVIRONMENT_SPRITES[number]);
  const safeIndex = index < 0 ? 1 : index;
  return {
    backgroundImage: `url("${gameAssetUrl(ENVIRONMENT_ATLAS)}")`,
    backgroundSize: '400% 400%', backgroundPosition: `${safeIndex % 4 / 3 * 100}% ${Math.floor(safeIndex / 4) / 3 * 100}%`,
    backgroundRepeat: 'no-repeat' as const
  };
}

/** Sprite bounds can overhang; only exact full-cell masks are rendered opaque. */
export function environmentGeometry(object: EnvironmentObjectView, cellSize: number) {
  const cells = environmentFootprint(object);
  const directional = environmentDirectionalSprite(object.assetKey, object);
  const single = directional ?? environmentSingleSprite(object.assetKey);
  if (single) {
    const aspect = single.width / single.height;
    const coverage = directional?.bodyCoverage;
    const scale = Math.min((coverage ? object.width * coverage : object.width + .1) / ((single.right - single.left) * aspect),
      (coverage ? object.height * coverage : object.height + .1) / (single.bottom - single.top));
    const width = scale * aspect * cellSize, height = scale * cellSize;
    const sprite = { left: (object.width - 1) / 2 * cellSize - (single.left + single.right) / 2 * width,
      top: (.5 - (coverage ? object.height * (1 - coverage) / 2 : 0)) * cellSize - single.bottom * height, width, height };
    // Fit the visible body at alpha>=16; reserve every alpha>0 tail as well.
    // WorldMapPanel reads this envelope for scenery clearance, not just the trunk.
    const alpha = single.alphaEnvelope;
    const painted = { left: sprite.left + alpha.left * width, top: sprite.top + alpha.top * height,
      width: (alpha.right - alpha.left) * width, height: (alpha.bottom - alpha.top) * height };
    return { sprite, rotation: 0, painted, cells: cells.map(cell => ({ ...cell,
      left: (cell.x - object.x - .5) * cellSize, top: -(cell.y - object.y + .5) * cellSize,
      width: cellSize, height: cellSize })) };
  }
  type Bounds = { left: number; top: number; right: number; bottom: number };
  const measured = (spriteBounds as Record<string, Bounds>)[object.assetKey];
  const sourceBounds = measured ?? (object.width >= object.height * 2
    ? { left: .05, top: .35, right: .95, bottom: .65 }
    : { left: .08, top: .08, right: .92, bottom: .92 });
  // A missing independent direction keeps the original upright perspective.
  // It must not rotate front faces, highlights or ground shadows by 90 degrees.
  const bounds = sourceBounds;
  // The atlas cells stay square to preserve the original art proportions. Its
  // measured painted bounds determine both scale and the stable southern foot.
  // Ground obstacles keep their main silhouette inside the occupied cells.
  // Small authored tips may overhang, but a tall default allowance must not
  // push half the subject into the translucent layer.
  const scale = Math.min((object.width + .1) / (bounds.right - bounds.left),
    (object.height + .1) / (bounds.bottom - bounds.top));
  const sprite = { left: ((object.width - 1) / 2 - (bounds.left + bounds.right) / 2 * scale) * cellSize,
    top: (.5 - bounds.bottom * scale) * cellSize, width: scale * cellSize, height: scale * cellSize };
  // Origin is the centre of the south-west occupied cell. Convert northward y.
  const painted = { left: sprite.left + bounds.left * sprite.width, top: sprite.top + bounds.top * sprite.height,
    width: (bounds.right - bounds.left) * sprite.width, height: (bounds.bottom - bounds.top) * sprite.height };
  return { sprite, rotation: 0, painted, cells: cells.map(cell => ({ ...cell,
    left: (cell.x - object.x - 0.5) * cellSize,
    top: -(cell.y - object.y + 0.5) * cellSize, width: cellSize, height: cellSize })) };
}
