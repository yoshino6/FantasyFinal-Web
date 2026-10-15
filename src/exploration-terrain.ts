import { gameAssetUrl } from './game-assets';
import { isPavedSurfaceRegion, SURFACE_ATLASES, SURFACE_GROUND_MATERIAL, surfaceMaterialIndex } from './map-surface';

export type TerrainRegion = { id?: number; code: string; name?: string };
export type TerrainCell = { x: number; y: number; z?: number; regionId?: number; regionCode?: string; regionName?: string };
export type TerrainContext = {
  /** The complete server region list, before the sidebar filters it. */
  regions?: readonly TerrainRegion[];
  fallbackRegion?: TerrainRegion;
  /** Accepted for callers; occupation never changes the coordinate's scenery. */
  occupied?: boolean;
};

/** Row-major cells in the transparent 4-by-4 decoration atlas. */
export const EXPLORATION_DECORATION_SPRITES = [
  'bush', 'fallen_leaves', 'grass', 'flowers',
  'fern', 'mushrooms', 'moss_rocks', 'dry_grass',
  'pebbles', 'red_gravel', 'reeds', 'water_grass',
  'snow_rocks', 'frost_bush', 'bricks', 'crystals'
] as const;
export type TerrainDecorationKind = typeof EXPLORATION_DECORATION_SPRITES[number];
export type TerrainDecoration = {
  key: string;
  kind: TerrainDecorationKind;
  atlasIndex: number;
  sourceIndex: number;
  large: boolean;
  style: { position: 'absolute'; left: string; top: string; width: string; height: string;
    transform: string; backgroundImage: string; backgroundSize: string; backgroundPosition: string;
    backgroundRepeat: 'no-repeat'; pointerEvents: 'none' };
};

type TerrainProfile = { color: string; density: number; decorations: readonly TerrainDecorationKind[] };
const unknownProfile: TerrainProfile = { color: '#9bb37a', density: 34, decorations: ['fallen_leaves', 'grass', 'bush', 'flowers', 'fern'] };
const profiles: Record<string, TerrainProfile> = {
  world_tree: { color: '#c8d7da', density: 0, decorations: [] },
  worldtree_meadow: { color: '#a1bc77', density: 36, decorations: ['grass', 'grass', 'flowers', 'bush', 'fallen_leaves'] },
  dark_forest: { color: '#687e5c', density: 38, decorations: ['fallen_leaves', 'bush', 'fern', 'dry_grass', 'mushrooms', 'moss_rocks'] },
  dark_forest_deep: { color: '#536553', density: 38, decorations: ['fern', 'moss_rocks', 'dry_grass', 'mushrooms', 'bush'] },
  dark_forest_dungeon: { color: '#77756b', density: 26, decorations: ['moss_rocks', 'pebbles', 'mushrooms', 'bricks', 'crystals'] },
  baina_town: { color: '#d5cfc0', density: 0, decorations: [] },
  floating_leaf_town: { color: '#a9b184', density: 30, decorations: ['fallen_leaves', 'bush', 'flowers', 'grass'] },
  frost_dragon_inn: { color: '#b7b5a6', density: 24, decorations: ['snow_rocks', 'frost_bush', 'pebbles', 'dry_grass'] },
  boss_test_arena: { color: '#aaa18c', density: 20, decorations: ['pebbles', 'red_gravel', 'bricks'] },
  eternal_arena: { color: '#b5ad98', density: 20, decorations: ['pebbles', 'bricks', 'moss_rocks'] },
  morningdew_riverbank: { color: '#91b2a0', density: 34, decorations: ['reeds', 'water_grass', 'pebbles', 'grass', 'flowers'] },
  gravelwind_shore: { color: '#b0b8ae', density: 30, decorations: ['pebbles', 'pebbles', 'moss_rocks', 'water_grass', 'dry_grass'] },
  ridge_foothills: { color: '#aaa38a', density: 30, decorations: ['moss_rocks', 'pebbles', 'pebbles', 'grass', 'dry_grass'] },
  rediron_pass: { color: '#b79172', density: 28, decorations: ['red_gravel', 'red_gravel', 'pebbles', 'dry_grass'] },
  mistalgae_marsh: { color: '#879e7c', density: 38, decorations: ['reeds', 'water_grass', 'fern', 'bush', 'moss_rocks'] },
  fallenstar_swamp: { color: '#777e87', density: 34, decorations: ['reeds', 'moss_rocks', 'dry_grass', 'water_grass', 'crystals'] },
  frostcrown_plateau: { color: '#c3d3d4', density: 32, decorations: ['snow_rocks', 'snow_rocks', 'frost_bush', 'pebbles', 'dry_grass'] },
  thundercliff: { color: '#87939e', density: 28, decorations: ['moss_rocks', 'pebbles', 'dry_grass', 'grass'] },
  eclipse_ruins: { color: '#aaa6b3', density: 34, decorations: ['bricks', 'bricks', 'moss_rocks', 'fern', 'crystals'] }
};
const names: Record<string, string> = {
  世界树: 'world_tree', 世界树草原环带: 'worldtree_meadow', 幽暗密林: 'dark_forest', 幽暗密林深处: 'dark_forest_deep',
  地下迷宫: 'dark_forest_dungeon', 百纳镇: 'baina_town', 浮叶镇: 'floating_leaf_town', 霜龙客舍: 'frost_dragon_inn',
  首领测试场: 'boss_test_arena', 永恒竞技场: 'eternal_arena', 晨露河岸: 'morningdew_riverbank', 砾风石滩: 'gravelwind_shore',
  岩脊山麓: 'ridge_foothills', 赤铁山道: 'rediron_pass', 雾藻湿地: 'mistalgae_marsh', 沉星沼泽: 'fallenstar_swamp',
  霜冠高原: 'frostcrown_plateau', 雷鸣断崖: 'thundercliff', 月蚀遗迹: 'eclipse_ruins'
};
const largeKinds = new Set<TerrainDecorationKind>(['bush', 'fern', 'reeds', 'snow_rocks', 'frost_bush']);
// Legacy payloads and private/underground scenes share the authored bright
// artwork. Their existing deterministic cell layout remains a compatibility
// fallback; no public movement or combat history is invented here.
const decorationSourceIndices = [8, 14, 0, 4, 8, 9, 24, 35, 34, 32, 16, 18, 40, 41, 42, 46] as const;

function regionForCell(cell: TerrainCell, context: TerrainContext): TerrainRegion {
  if (cell.regionCode) return { id: cell.regionId, code: cell.regionCode, name: cell.regionName };
  const match = cell.regionId === undefined ? undefined : context.regions?.find(region => region.id === cell.regionId);
  if (match) return match;
  if (cell.regionCode || cell.regionName) return { id: cell.regionId, code: cell.regionCode ?? '', name: cell.regionName };
  return context.fallbackRegion ?? { code: 'world_tree' };
}
function profileForRegion(region: TerrainRegion): TerrainProfile {
  return profiles[region.code] ?? profiles[names[region.name ?? '']] ?? unknownProfile;
}

/** Legacy ground uses the same six authored materials as the natural surface. */
export function cellGroundStyle(cell: TerrainCell, context: TerrainContext = {}) {
  const region = regionForCell(cell, context);
  const code = region.code || names[region.name ?? ''] || 'world_tree', material = surfaceMaterialIndex(code);
  return { backgroundImage: `url("${gameAssetUrl(SURFACE_GROUND_MATERIAL)}")`, backgroundSize: '300% 200%',
    backgroundPosition: `${material % 3 / 2 * 100}% ${Math.floor(material / 3) * 100}%`,
    backgroundRepeat: 'no-repeat', backgroundColor: profileForRegion(region).color,
    ...(isPavedSurfaceRegion(code) ? { backgroundBlendMode: 'luminosity' as const } : {}) };
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  // Avalanche neighbouring coordinate seeds before selecting a sparse placement.
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  return (value ^ value >>> 16) >>> 0;
}
const percent = (value: number) => `${Number((value * 100).toFixed(3))}%`;

/** Static scenery is independent of the camera, zoom, current player and visit order. */
export function decorationsForCell(cell: TerrainCell, context: TerrainContext = {}): TerrainDecoration[] {
  if (![cell.x, cell.y, cell.z ?? 0].every(Number.isSafeInteger)) return [];
  const region = regionForCell(cell, context), profile = profileForRegion(region);
  const regionId = cell.regionId ?? region.id;
  const regionSeed = regionId === undefined ? region.code || region.name || 'world_tree' : `id:${regionId}`;
  const seed = `${regionSeed}\0${cell.z ?? 0}\0${cell.x}\0${cell.y}`;
  if (hash(seed + ':presence') % 100 >= profile.density) return [];
  // Keep the original first sprite's seed so revisiting a coordinate retains
  // its scenery. A coordinate now has at most one full-cell decoration.
  const slotSeed = `${seed}:0`;
  const kind = profile.decorations[hash(slotSeed + ':kind') % profile.decorations.length];
  const index = EXPLORATION_DECORATION_SPRITES.indexOf(kind);
  const sourceIndex = decorationSourceIndices[index], localIndex = sourceIndex % 16;
  const image = `url("${gameAssetUrl(SURFACE_ATLASES[Math.floor(sourceIndex / 16)])}")`;
  return [{ key: `${regionSeed}:${cell.z ?? 0}:${cell.x}:${cell.y}:0`, kind, atlasIndex: index, sourceIndex, large: largeKinds.has(kind), style: {
    position: 'absolute', left: '0%', top: '0%', width: '100%', height: '100%',
    transform: `scaleX(${hash(slotSeed + ':mirror') % 2 ? -1 : 1})`,
    backgroundImage: image, backgroundSize: '400% 400%',
    backgroundPosition: `${percent(localIndex % 4 / 3)} ${percent(Math.floor(localIndex / 4) / 3)}`,
    backgroundRepeat: 'no-repeat', pointerEvents: 'none'
  } }];
}
