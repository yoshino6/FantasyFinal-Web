import { surfaceHash, surfaceRandom, type MapSurfaceScene, type SurfaceCell, type SurfaceScenery } from './map-surface';
import { sampleSurfaceEcology, surfaceEcologySeed, type SurfaceEcologySample } from './map-surface-ecology';

type Candidate = { id: string; x: number; y: number; scale: number; priority: number; patch: boolean; clusterX: number; clusterY: number; family: number };
const pitch = 1.85;
const key = (cell: { x: number; y: number; z?: number }) => `${cell.x}:${cell.y}:${cell.z ?? 0}`;
const random = (seed: string) => surfaceRandom(surfaceHash(seed))();
const pools = {
  meadow: [0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 15, 35],
  forest: [0, 1, 2, 8, 9, 10, 11, 12, 13, 14, 15, 24, 28],
  shore: [0, 2, 16, 17, 19, 20, 21, 22, 23, 32, 34],
  swamp: [16, 17, 19, 20, 21, 24, 25, 26, 27, 28, 29, 31],
  mountain: [0, 3, 15, 22, 32, 33, 34, 35, 46],
  snow: [32, 36, 37, 38, 39, 40, 41],
  ruins: [2, 12, 14, 24, 32, 33, 42, 43, 44, 45, 46, 47],
};
export const fallbackSceneryPool = (code: string): readonly number[] => /frost|snow|ice/.test(code) ? pools.snow
  : /swamp|marsh/.test(code) ? pools.swamp : /dungeon|ruin|arena/.test(code) ? pools.ruins
    : /forest/.test(code) ? pools.forest : /river|shore/.test(code) ? pools.shore
      : /ridge|pass|cliff|mountain/.test(code) ? pools.mountain : pools.meadow;
const groundAssets = new Set([11, 12, 13, 14, 15, 19, 20, 22, 23, 24, 26, 29, 31, 32, 33, 34, 37, 39, 40, 42, 43, 44, 46, 47]);
type Habitat = { patch: number; companions: readonly number[] };
const habitats = {
  grass: { patch: 0, companions: [0, 1, 2, 3] }, whiteFlowers: { patch: 1, companions: [0, 2, 4, 4, 7] },
  yellowFlowers: { patch: 2, companions: [0, 2, 5, 5, 7] }, violetFlowers: { patch: 3, companions: [0, 1, 6, 6] },
  leafGrass: { patch: 4, companions: [0, 1, 2, 12, 13] }, poorGrass: { patch: 5, companions: [0, 3, 15, 32, 34, 35] },
  shrub: { patch: 6, companions: [1, 2, 8, 12, 13] }, fern: { patch: 7, companions: [8, 8, 9, 10, 14, 28] },
  litter: { patch: 8, companions: [11, 12, 13, 14, 15, 24] }, edge: { patch: 9, companions: [0, 1, 2, 4, 8, 12] },
  reeds: { patch: 10, companions: [16, 17, 19, 21, 25, 27] }, damp: { patch: 11, companions: [19, 24, 26, 28, 29, 31] },
  dry: { patch: 12, companions: [0, 3, 15, 22, 32, 34, 35] }, snow: { patch: 13, companions: [32, 36, 37, 38, 39, 40, 41] },
  ruins: { patch: 14, companions: [2, 12, 24, 32, 42, 43, 44, 45, 47] }, rock: { patch: 15, companions: [0, 3, 22, 32, 33, 34, 35, 46] }
} satisfies Record<string, Habitat>;
const regionProfiles: Record<string, 'meadow' | 'forest' | 'shore' | 'swamp' | 'mountain' | 'snow' | 'ruins' | 'town'> = {
  world_tree: 'town', baina_town: 'town', floating_leaf_town: 'town', frost_dragon_inn: 'snow',
  worldtree_meadow: 'meadow', morningdew_riverbank: 'shore', gravelwind_shore: 'mountain', dark_forest: 'forest', dark_forest_deep: 'forest',
  ridge_foothills: 'mountain', rediron_pass: 'mountain', mistalgae_marsh: 'swamp', fallenstar_swamp: 'swamp',
  frostcrown_plateau: 'snow', thundercliff: 'mountain', eclipse_ruins: 'ruins', dark_forest_dungeon: 'ruins', eternal_arena: 'ruins'
};
const ecologyProfileFor = (code: string) => regionProfiles[code] ?? (/frost|snow/.test(code) ? 'snow'
  : /dungeon|ruins|arena/.test(code) ? 'ruins' : /marsh|swamp/.test(code) ? 'swamp' : /river/.test(code) ? 'shore'
    : /ridge|shore|cliff|rediron/.test(code) ? 'mountain' : /town|inn/.test(code) ? 'town' : /forest/.test(code) ? 'forest' : 'meadow');
const habitatAt = (code: string, sample: SurfaceEcologySample, family: number): Habitat => {
  const profile = ecologyProfileFor(code);
  if (profile === 'snow') return habitats.snow;
  if (profile === 'ruins') return sample.cover > .57 ? habitats.litter : habitats.ruins;
  if (profile === 'mountain') return sample.rock > .47 ? habitats.rock : habitats.dry;
  if (profile === 'swamp') return sample.moisture > .5 ? habitats.damp : habitats.reeds;
  if (profile === 'shore') return sample.moisture > .55 ? habitats.reeds : sample.rock > .61 ? habitats.rock : habitats.leafGrass;
  if (sample.fertility < .29 || sample.rock > .76) return habitats.poorGrass;
  if (profile === 'forest' && sample.shade > .36) return sample.moisture > .52
    ? family < .40 ? habitats.fern : family < .68 ? habitats.litter : family < .83 ? habitats.damp : habitats.edge
    : family < .46 ? habitats.shrub : family < .75 ? habitats.litter : habitats.edge;
  if (sample.flowers > .57 && sample.fertility > .37 && profile !== 'town') return family < .42 ? habitats.whiteFlowers : family < .77 ? habitats.yellowFlowers : habitats.violetFlowers;
  return family < .55 ? habitats.grass : habitats.leafGrass;
};
const habitatPatchScale = (patch: number, unit: number) => [1, 2, 3].includes(patch) ? .88 + unit * .55 : [6, 7, 9].includes(patch) ? .95 + unit * .65 : 1.05 + unit * .70;
const vegetationWeight = (cover: number) => { const n = Math.max(0, Math.min(1, (cover - .22) / .42)); return n * n * (3 - 2 * n); };

/** Cosmetic compatibility only. Never invent collision, harvestables or player history. */
export function fallbackSurfaceScene(cells: readonly SurfaceCell[], options: { scopeToken: string; z: number }): MapSurfaceScene | undefined {
  const z = options.z;
  if (!Number.isSafeInteger(z)) return;
  const eligible = cells.filter(cell => [cell.x, cell.y, cell.z ?? z, cell.regionId].every(Number.isSafeInteger)
    && (cell.z ?? z) === z && cell.regionId! > 0 && typeof cell.regionCode === 'string' && !!cell.regionCode);
  // Conflicting metadata is not permission to choose whichever arrived last.
  const codes = new Map<number, Set<string>>();
  for (const cell of eligible) codes.set(cell.regionId!, new Set([...(codes.get(cell.regionId!) ?? []), cell.regionCode!]));
  const byCell = new Map<string, SurfaceCell>();
  for (const cell of eligible) {
    if (codes.get(cell.regionId!)!.size !== 1) continue;
    const old = byCell.get(key({ ...cell, z }));
    if (old && (old.regionId !== cell.regionId || old.passable === false || cell.passable === false)) {
      // Duplicate blocked claims remain blocked; conflicting cell identities
      // are removed below rather than inferred from the current region.
      byCell.set(key({ ...cell, z }), { ...old, regionId: old.regionId === cell.regionId ? old.regionId : undefined, passable: false });
    } else byCell.set(key({ ...cell, z }), { ...cell, z });
  }
  const known = [...byCell.values()].filter(cell => cell.regionId !== undefined).sort((a, b) => a.y - b.y || a.x - b.x || a.regionId! - b.regionId!);
  if (!known.length) return;
  const terrainFields = [...new Map(known.map(cell => [cell.regionId!, { regionId: cell.regionId!, regionCode: cell.regionCode!,
    seed: surfaceHash(`fallback-ground-v1:${cell.regionId}:${cell.regionCode}`) }])).values()].sort((a, b) => a.regionId - b.regionId);
  const allowed = new Map(known.filter(cell => cell.passable === true).map(cell => [key(cell), cell]));
  const scenery: SurfaceScenery[] = [], cache = new Map<string, Candidate[]>();
  // Candidate anchors live in continuous world space, independent of game
  // cells, camera, player identity, viewport, visit order and private scope.
  const cosmeticEcologySeed = surfaceEcologySeed(`fallback-world:${z}`);
  const candidatesAt = (gx: number, gy: number): Candidate[] => {
    const cacheKey = `${gx}:${gy}`, cached = cache.get(cacheKey); if (cached) return cached;
    const base = `fallback-scenery-v2:${z}:${gx}:${gy}`;
    const cx = (gx + random(`${base}:x`)) * pitch, cy = (gy + random(`${base}:y`)) * pitch;
    const candidates: Candidate[] = [], sample = sampleSurfaceEcology(cx, cy, cosmeticEcologySeed), family = random(`${base}:family`);
    if (random(`${base}:open`) <= .045 + vegetationWeight(sample.cover) * .70) {
      const patch = random(`${base}:patch`) > .12, count = 1 + Math.floor(random(`${base}:count`) * 2) + Number(patch);
      for (let slot = 0; slot < count; slot++) {
        const id = `${base}:${slot}`, isPatch = patch && slot === 0, angle = random(`${id}:angle`) * Math.PI * 2;
        const radius = isPatch ? .08 : .4 + random(`${id}:radius`) * .72;
        candidates.push({ id, x: Math.round((cx + Math.cos(angle) * radius) * 256) / 256,
          y: Math.round((cy + Math.sin(angle) * radius) * 256) / 256, patch: isPatch, clusterX: cx, clusterY: cy, family,
          scale: isPatch ? 1.25 + random(`${id}:scale`) * .85 : .25 + random(`${id}:scale`) * .5,
          priority: (surfaceHash(`${id}:priority`) >>> 1) + (isPatch ? 0 : 0x80000000) });
      }
    }
    cache.set(cacheKey, candidates); return candidates;
  };
  // Enumerate only candidate chunks touching authorized cells, with a halo
  // sufficient for cluster offsets. Very distant disjoint cells cost no bbox.
  const chunks = new Map<string, { gx: number; gy: number }>();
  for (const cell of allowed.values()) for (let gy = Math.floor((cell.y - 1.625) / pitch); gy <= Math.floor((cell.y + 1.625) / pitch); gy++)
    for (let gx = Math.floor((cell.x - 1.625) / pitch); gx <= Math.floor((cell.x + 1.625) / pitch); gx++) chunks.set(`${gx}:${gy}`, { gx, gy });
  for (const { gx, gy } of chunks.values()) for (const candidate of candidatesAt(gx, gy)) {
    const { id, x, y, priority } = candidate;
    const cell = allowed.get(key({ x: Math.floor(x + .5), y: Math.floor(y + .5), z }));
    if (!cell) continue;
    const habitat = habitatAt(cell.regionCode!, sampleSurfaceEcology(candidate.clusterX, candidate.clusterY, cosmeticEcologySeed), candidate.family);
    const scale = candidate.patch ? habitatPatchScale(habitat.patch, random(`${id}:scale`)) : candidate.scale;
    let crowded = false;
    for (let ny = gy - 2; ny <= gy + 2 && !crowded; ny++) for (let nx = gx - 2; nx <= gx + 2 && !crowded; nx++) for (const other of candidatesAt(nx, ny)) {
      if (other.id === id || other.priority > priority || other.priority === priority && other.id > id) continue;
      if (Math.hypot(x - other.x, y - other.y) < .16 + (candidate.scale + other.scale) * .15) { crowded = true; break; }
    }
    if (crowded) continue;
    const asset = habitat.companions[surfaceHash(`${id}:${cell.regionId}:${cell.regionCode}:asset`) % habitat.companions.length];
    scenery.push({ id, regionId: cell.regionId!, assetKey: candidate.patch ? `scenery_patch_${habitat.patch}` : `scenery_${asset}`, x, y, z, scale,
      rotation: (random(`${id}:rotation`) - .5) * (candidate.patch ? 16 : groundAssets.has(asset) ? 140 : 18), flip: random(`${id}:flip`) > .5 });
  }
  scenery.sort((a, b) => surfaceHash(a.id) - surfaceHash(b.id) || a.id.localeCompare(b.id));
  return { schemaVersion: 1, sceneryVersion: 1, scopeToken: options.scopeToken,
    snapshotId: `visual-only:${surfaceHash(known.map(cell => `${key(cell)}:${cell.regionId}:${cell.regionCode}:${cell.passable}`).join(';'))}`,
    serverNowMs: 0, cosmeticEcologySeed, terrainFields, scenery: scenery.slice(0, 1024), roads: [], recentWalks: [], combatMarks: [] };
}
