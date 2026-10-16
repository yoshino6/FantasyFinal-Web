import { SETTLEMENT_SPRITE_BOUNDS } from './map-settlement-geometry';
import type { SurfaceScenery } from './map-surface';

export type StandingSceneryRect = { left: number; top: number; width: number; height: number };
export type StandingSceneryGeometry = {
  source: string;
  name: string;
  /** Complete original PNG frame, relative to the owning cell's screen centre. */
  frame: StandingSceneryRect;
  /** Complete nonzero-alpha envelope in the same screen coordinate system. */
  painted: StandingSceneryRect;
  /** Contact base centre, positive towards screen south. */
  groundY: number;
};

type StandingAssetKey = 'settlement_0' | 'settlement_1' | 'settlement_2' | 'settlement_3' | 'settlement_4';
type StandingAsset = { file: string; name: string; referenceScale: number; paintedHeight: number; groundAnchorX: number; groundOffset?: number };
// Each authored cutout is a 256-square transparent frame. Contact-base X was
// measured from alpha >= 24 in the 5% band immediately above the shared base Y;
// centring that base keeps asymmetrical lamps standing on their own cell.
const assets: Record<StandingAssetKey, StandingAsset> = {
  settlement_0: { file: 'town-lantern.png', name: '百纳镇路灯', referenceScale: .95, paintedHeight: 1.9, groundAnchorX: 113.5 / 256 },
  settlement_1: { file: 'town-planter.png', name: '百纳镇花箱', referenceScale: .72, paintedHeight: .55, groundAnchorX: 128 / 256 },
  // Keep both legs in one cell. A northward contact point lets the backrest
  // rise into the next row without widening or stretching the original bench.
  settlement_2: { file: 'town-bench.png', name: '百纳镇长椅', referenceScale: .95, paintedHeight: .55, groundAnchorX: 128 / 256, groundOffset: -.15 },
  settlement_3: { file: 'worldtree-lamp.png', name: '世界树灯', referenceScale: .8, paintedHeight: 1.85, groundAnchorX: 126.5 / 256 },
  settlement_4: { file: 'worldtree-prayer.png', name: '祈愿碑', referenceScale: .9, paintedHeight: 1.25, groundAnchorX: 122 / 256 },
};

/** Pure display geometry; it grants no cell visibility, collision or movement. */
export function standingSceneryGeometry(scenery: SurfaceScenery, cellSize: number): StandingSceneryGeometry | undefined {
  if (!scenery || typeof scenery.id !== 'string' || !scenery.id || typeof scenery.assetKey !== 'string'
    || !/^settlement_[0-4]$/.test(scenery.assetKey)
    || ![scenery.x, scenery.y, scenery.z, scenery.regionId].every(Number.isSafeInteger) || scenery.regionId <= 0
    || !Number.isFinite(scenery.scale) || scenery.scale < .15 || scenery.scale > 1.4
    // Authored town furniture stands upright, as in the existing layout plan.
    || scenery.rotation !== 0 || scenery.flip !== false || !Number.isFinite(cellSize) || cellSize <= 0) return;
  const key = scenery.assetKey as StandingAssetKey, asset = assets[key], bounds = SETTLEMENT_SPRITE_BOUNDS[key]!;
  const frameSize = cellSize * asset.paintedHeight / bounds.height * scenery.scale / asset.referenceScale;
  const groundY = cellSize * (asset.groundOffset ?? .15);
  const frame = { left: -asset.groundAnchorX * frameSize, top: groundY - bounds.anchorY * frameSize, width: frameSize, height: frameSize };
  const painted = { left: frame.left + bounds.left * frameSize, top: frame.top + bounds.top * frameSize, width: bounds.width * frameSize, height: bounds.height * frameSize };
  if (![groundY, ...Object.values(frame), ...Object.values(painted)].every(Number.isFinite)) return;
  return { source: `/assets/light-anime/map-settlement-v1/${asset.file}`, name: asset.name, frame, painted, groundY };
}
