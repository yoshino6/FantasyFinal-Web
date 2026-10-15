/** Server-owned surface snapshots. World integer coordinates are cell centres; Y points north. */
export type SurfacePoint = { x: number; y: number };
export type SurfaceTerrainField = { regionId: number; regionCode: string; seed: number };
export type SurfaceScenery = SurfacePoint & { id: string; regionId: number; z: number; assetKey: string; scale: number; rotation: number; flip: boolean };
export type SurfaceRoad = { id: string; regionId: number; points: SurfacePoint[]; width: number };
export type SurfaceWalk = SurfaceRoad & { ageMs: number; remainingMs: number; initialOpacity: number };
export type SurfaceCombatMark = SurfacePoint & { id: string; regionId: number; z: number; kind: 'blood' | 'slime' | 'debris' | 'magic'; seed: number; intensity: number; ageMs: number; remainingMs: number; fragments?: { points: SurfacePoint[]; opacity: number }[] };
export type MapSurfaceScene = { schemaVersion: 1; sceneryVersion: 1; scopeToken: string; snapshotId: string; serverNowMs: number; cosmeticEcologySeed?: number; terrainFields: SurfaceTerrainField[]; scenery: SurfaceScenery[]; roads: SurfaceRoad[]; recentWalks: SurfaceWalk[]; combatMarks: SurfaceCombatMark[] };
export type SurfaceCell = SurfacePoint & { z?: number; regionId?: number; regionCode?: string; passable?: boolean };
export type SurfaceRect = { left: number; right: number; south: number; north: number };
export type SurfaceSpriteBounds = { anchorX: number; anchorY: number; extent: number; left: number; top: number; width: number; height: number };

/** Raster work is bounded by the screen; authorization remains a separate full set. */
export function surfaceViewportRect(camera: SurfacePoint, viewport: { width: number; height: number }, cellSize: number, paddingPixels = 1): SurfaceRect {
  if (![camera.x, camera.y, viewport.width, viewport.height, cellSize, paddingPixels].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0 || cellSize <= 0 || paddingPixels < 0) return { left: 0, right: 0, south: 0, north: 0 };
  const width = (viewport.width / 2 + paddingPixels) / cellSize, height = (viewport.height / 2 + paddingPixels) / cellSize;
  return { left: camera.x - width, right: camera.x + width, south: camera.y - height, north: camera.y + height };
}
export function surfaceCellVisible(cell: SurfacePoint, viewport: SurfaceRect, perceptionCenter?: SurfacePoint, perceptionRange?: number): boolean {
  if (!surfaceRectsOverlap({ left: cell.x - .5, right: cell.x + .5, south: cell.y - .5, north: cell.y + .5 }, viewport)) return false;
  if (!perceptionCenter || ![perceptionCenter.x, perceptionCenter.y, perceptionRange].every(Number.isFinite) || perceptionRange! < 0) return true;
  // The same outer support as the continuous fog mask. Whole crossing cells
  // are retained; the mask decides their actual per-pixel visibility.
  return Math.max(Math.abs(cell.x - perceptionCenter.x) - .5, 0) + Math.max(Math.abs(cell.y - perceptionCenter.y) - .5, 0) < perceptionRange! + .75;
}

/** Exact grid union contours, omitting shared edges that Canvas can antialias. */
export function surfaceCellUnionContours(cells: readonly SurfacePoint[]): SurfacePoint[][] {
  const known = new Map(cells.filter(cell => Number.isSafeInteger(cell.x) && Number.isSafeInteger(cell.y)).map(cell => [`${cell.x}:${cell.y}`, cell]));
  const edges = new Map<string, SurfacePoint[]>();
  for (const cell of known.values()) for (const [dx, dy, ax, ay, bx, by] of [[0, 1, -1, 1, 1, 1], [1, 0, 1, 1, 1, -1], [0, -1, 1, -1, -1, -1], [-1, 0, -1, -1, -1, 1]]) {
    if (known.has(`${cell.x + dx}:${cell.y + dy}`)) continue;
    const key = `${cell.x * 2 + ax}:${cell.y * 2 + ay}`, list = edges.get(key) ?? [];
    list.push({ x: cell.x * 2 + bx, y: cell.y * 2 + by }); edges.set(key, list);
  }
  const contours: SurfacePoint[][] = [];
  while (edges.size) {
    const start = edges.keys().next().value!, [x, y] = start.split(':').map(Number), contour = [{ x: x / 2, y: y / 2 }];
    let key = start;
    do {
      const list = edges.get(key), next = list?.pop(); if (!next) break;
      if (!list!.length) edges.delete(key);
      contour.push({ x: next.x / 2, y: next.y / 2 }); key = `${next.x}:${next.y}`;
    } while (key !== start);
    if (key === start) contours.push(contour);
  }
  return contours;
}

/** Both renderers paint only exact, authorized region/cell identities. */
export function authorizedSurfaceCells(scene: MapSurfaceScene, cells: readonly SurfaceCell[], z: number): SurfaceCell[] {
  const fields = new Map(scene.terrainFields.filter(field => Number.isSafeInteger(field.regionId) && field.regionId > 0 && typeof field.regionCode === 'string' && Number.isFinite(field.seed)).map(field => [field.regionId, field]));
  const known = new Map<string, SurfaceCell>(), conflicts = new Set<string>();
  for (const cell of cells) {
    const field = fields.get(cell.regionId!);
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) || (cell.z ?? z) !== z || !field || cell.regionCode !== field.regionCode) continue;
    const key = `${cell.x}:${cell.y}`, previous = known.get(key);
    if (previous && previous.regionId !== cell.regionId) conflicts.add(key);
    else known.set(key, previous?.passable === false ? { ...cell, passable: false } : cell);
  }
  return [...known].filter(([key]) => !conflicts.has(key)).map(([, cell]) => cell);
}

export const SURFACE_ATLASES = ['/assets/light-anime/map-surface-v2/scenery-meadow.webp', '/assets/light-anime/map-surface-v2/scenery-wetland.webp', '/assets/light-anime/map-surface-v2/scenery-wilds.webp', '/assets/light-anime/map-surface-v2/scenery-meadow-b.webp', '/assets/light-anime/map-surface-v2/scenery-wetland-b.webp', '/assets/light-anime/map-surface-v2/scenery-wilds-b.webp', '/assets/light-anime/map-surface-v3/scenery-patches.webp', '/assets/light-anime/map-settlement-v1/settlement-scenery.webp'] as const;
export const SURFACE_GROUND_MATERIAL = '/assets/light-anime/map-surface-v3/ground-materials-v4.webp';
export const SURFACE_SCENERY_NAMES = ['细叶草', '宽叶草', '三叶草', '籽穗草', '雏菊', '野黄花', '小紫花', '蒲公英', '蕨叶', '棕蘑菇', '红蘑菇', '松果', '单片落叶', '卷叶', '叶堆', '细枝', '短芦苇', '灯心草', '水草', '湿叶', '漂木碎片', '岸边草', '砂砾群', '贝壳', '苔毯', '短苇丛', '腐叶', '沼泽小花', '湿菌', '细小枯枝', '浮叶', '泥面根纹', '石屑', '碎岩片', '卵石群', '干草结', '小冰晶', '冰屑', '冻草', '覆雪细枝', '碎雪团', '薄霜草', '破砖', '断瓦', '雕纹碎片', '攀地藤', '碎晶', '灰泥碎片'] as const;
export const SURFACE_SCENERY_DENSITY = .5;
/** Thin cosmetic brushwork by world identity, never by a changing view/window index. */
export function surfaceSceneryRetained(id: string, assetKey?: string): boolean { return /^settlement_[0-4]$/.test(assetKey ?? '') || surfaceHash(`surface-density:${id}`) / 0x100000000 < SURFACE_SCENERY_DENSITY; }
export function surfaceSceneryVariant(id: string): 0 | 1 { return (surfaceHash(`surface-variant:${id}`) & 1) as 0 | 1; }
export function surfaceSprite(assetKey: string, variant: 0 | 1 = 0) {
  const settlement = /^settlement_([0-4])$/.exec(assetKey);
  if (settlement) return { atlas: 7, baseAtlas: 7, variantAtlases: [7], column: Number(settlement[1]) % 4, row: Math.floor(Number(settlement[1]) / 4) };
  const patch = /^scenery_patch_(\d+)$/.exec(assetKey), patchIndex = patch ? Number(patch[1]) : -1;
  if (patchIndex >= 0 && patchIndex < 16) return { atlas: 6, baseAtlas: 6, variantAtlases: [6], column: patchIndex % 4, row: Math.floor(patchIndex / 4) };
  const match = /^scenery_(\d+)$/.exec(assetKey), index = match ? Number(match[1]) : -1;
  const baseAtlas = Math.floor(index / 16);
  return index >= 0 && index < SURFACE_SCENERY_NAMES.length ? { atlas: baseAtlas + variant * 3, baseAtlas, variantAtlases: [baseAtlas, baseAtlas + 3], column: index % 4, row: Math.floor(index % 16 / 4) } : undefined;
}
export const surfaceSceneryScaleLimit = (assetKey?: string) => /^scenery_patch_(?:[0-9]|1[0-5])$/.test(assetKey ?? '') ? 2.8 : 1.4;

/** The painted alpha envelope uses exactly the drawImage transform, in world units. */
export function surfaceSceneryGeometry(scenery: Pick<SurfaceScenery, 'x' | 'y' | 'scale' | 'rotation' | 'flip'> & { assetKey?: string }, bounds: SurfaceSpriteBounds, baseExtent: number) {
  const size = clamp(scenery.scale, .15, surfaceSceneryScaleLimit(scenery.assetKey)) * clamp(baseExtent / bounds.extent, .75, 1.6);
  const angle = scenery.rotation * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle), flip = scenery.flip ? -1 : 1;
  const corners = [bounds.left, bounds.left + bounds.width].flatMap(u => [bounds.top, bounds.top + bounds.height].map(v => {
    const x = (u - bounds.anchorX) * size * flip, y = (v - bounds.anchorY) * size;
    return { x: scenery.x + x * cosine - y * sine, y: scenery.y - x * sine - y * cosine };
  }));
  return { size, bounds: { left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)),
    south: Math.min(...corners.map(point => point.y)), north: Math.max(...corners.map(point => point.y)) } };
}
export function surfaceRectsOverlap(a: SurfaceRect, b: SurfaceRect): boolean {
  return [a.left, a.right, a.south, a.north, b.left, b.right, b.south, b.north].every(Number.isFinite)
    && a.left < a.right && a.south < a.north && b.left < b.right && b.south < b.north
    && a.left < b.right && b.left < a.right && a.south < b.north && b.south < a.north;
}

export function surfaceHash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}
export function surfaceRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
const smooth = (value: number) => value * value * (3 - 2 * value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function lattice(x: number, y: number, seed: number) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967295;
}
/** Continuous even at negative coordinates and chunk boundaries. */
export function surfaceNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), u = smooth(x - ix), v = smooth(y - iy);
  return lerp(lerp(lattice(ix, iy, seed), lattice(ix + 1, iy, seed), u), lerp(lattice(ix, iy + 1, seed), lattice(ix + 1, iy + 1, seed), u), v);
}
/** Cosmetic ecotone only: never moves a cell, entity or permission boundary. */
export function surfaceTransitionPoint(x: number, y: number, seed: number): SurfacePoint {
  return { x: x + (surfaceNoise(x / 3.1, y / 3.1, seed ^ 59393) - .5) * .28,
    y: y + (surfaceNoise(x / 3.1, y / 3.1, seed ^ 91193) - .5) * .28 };
}
type Color = readonly [number, number, number];
type Palette = readonly [Color, Color, Color, Color];
const meadow: Palette = [[171, 216, 83], [203, 232, 124], [112, 183, 91], [220, 205, 142]];
const palettes: Record<string, Palette> = {
  pavedTown: [[213, 207, 192], [238, 231, 214], [183, 181, 174], [219, 213, 202]],
  pavedTree: [[200, 215, 218], [226, 238, 237], [174, 192, 199], [214, 225, 226]],
  forest: [[127, 190, 83], [180, 218, 111], [80, 152, 64], [198, 183, 120]],
  wetland: [[119, 190, 146], [170, 220, 158], [104, 172, 165], [199, 185, 134]],
  mountain: [[185, 196, 177], [219, 221, 196], [151, 179, 180], [204, 190, 154]],
  red: [[216, 169, 112], [236, 195, 137], [181, 170, 135], [226, 181, 125]],
  snow: [[218, 235, 239], [245, 248, 232], [186, 217, 234], [221, 220, 188]],
  ruins: [[193, 201, 199], [229, 225, 207], [153, 188, 176], [212, 197, 175]],
  town: [[190, 200, 136], [218, 220, 173], [150, 190, 139], [219, 197, 151]],
};
/** Only these two central settlements use uninterrupted authored paving. */
export const isPavedSurfaceRegion = (regionCode: string): boolean => regionCode === 'baina_town' || regionCode === 'world_tree';
export function surfacePalette(regionCode: string): Palette {
  if (isPavedSurfaceRegion(regionCode)) return regionCode === 'baina_town' ? palettes.pavedTown : palettes.pavedTree;
  return /frost|snow/.test(regionCode) ? palettes.snow : /rediron/.test(regionCode) ? palettes.red
    : /dungeon|ruins|arena/.test(regionCode) ? palettes.ruins : /river|marsh|swamp/.test(regionCode) ? palettes.wetland
      : /ridge|shore|cliff/.test(regionCode) ? palettes.mountain : /town|inn/.test(regionCode) ? palettes.town
        : /forest/.test(regionCode) ? palettes.forest : meadow;
}
export function surfaceMaterialIndex(regionCode: string) {
  if (isPavedSurfaceRegion(regionCode)) return 5;
  return /frost|snow/.test(regionCode) ? 4 : /dungeon|ruins|arena/.test(regionCode) ? 5
    : /river|marsh|swamp/.test(regionCode) ? 2 : /ridge|shore|cliff|rediron/.test(regionCode) ? 3
      : /forest/.test(regionCode) ? 1 : 0;
}
/** Blend actual painted substrates, not just a recolour of one repeated tile. */
export function surfaceMaterialWeights(layer: number, habitat: { cover: number; fertility: number; shade: number; rock: number; moisture: number }, paved = false): number[] {
  const weights = [0, 0, 0, 0, 0, 0], ease = (value: number) => smooth(clamp(value, 0, 1));
  if (paved) { weights[5] = 1; return weights; }
  const soil = Math.max(ease((.48 - habitat.cover) / .3) * .8, ease((habitat.rock - .62) / .28) * .55, ease((.3 - habitat.fertility) / .25) * .4);
  if (layer === 4) weights[4] = 1;
  else if (layer === 1) {
    const undergrowth = .18 + ease((habitat.shade - .28) / .45) * .82;
    weights[0] = (1 - soil) * (1 - undergrowth); weights[1] = (1 - soil) * undergrowth; weights[3] = soil;
  } else if (layer === 2) {
    const wet = .18 + ease((habitat.moisture - .28) / .5) * .82, bare = soil * .65;
    weights[0] = (1 - bare) * (1 - wet); weights[2] = (1 - bare) * wet; weights[3] = bare;
  } else if (layer === 3 || layer === 5) {
    const grass = ease((habitat.cover - .48) / .3) * ease((habitat.fertility - .3) / .4) * (layer === 3 ? .4 : .32);
    weights[0] = grass; weights[layer] = 1 - grass;
  } else { weights[0] = 1 - soil; weights[3] = soil; }
  return weights;
}
/** Multi-scale, domain-warped colour fields; never keyed to the camera or game-cell index. */
export function sampleSurfaceColor(x: number, y: number, field: SurfaceTerrainField, habitat?: { cover: number; fertility: number; shade: number; rock: number }): [number, number, number] {
  const seed = Number.isFinite(field.seed) ? field.seed : surfaceHash(String(field.seed));
  const wx = x + (surfaceNoise(x / 7, y / 7, seed ^ 97) - .5) * 2.8;
  const wy = y + (surfaceNoise(x / 7, y / 7, seed ^ 193) - .5) * 2.8;
  const large = surfaceNoise(wx / 19, wy / 19, seed), medium = surfaceNoise(wx / 5.6, wy / 5.6, seed ^ 7349);
  const small = surfaceNoise(wx / 1.7, wy / 1.7, seed ^ 7919);
  const shade = habitat ? smooth(clamp((habitat.cover * .65 + habitat.fertility * .25 + (1 - habitat.shade) * .1 - .18) / .64, 0, 1))
    : smooth(clamp((large * .25 + medium * .55 + small * .2 - .22) / .56, 0, 1));
  const dry = habitat ? Math.max(smooth(clamp((.43 - habitat.cover) / .28, 0, 1)) * .36, smooth(clamp((habitat.rock - .61) / .28, 0, 1)) * .28)
    : smooth(clamp((surfaceNoise(wx / 7.4, wy / 7.4, seed ^ 15823) - .62) / .28, 0, 1)) * .24;
  const palette = surfacePalette(field.regionCode), low = shade < .5 ? palette[2] : palette[0], high = shade < .5 ? palette[0] : palette[1];
  // Clean animated backgrounds have broad colour masses and restrained small texture.
  const grain = (surfaceNoise(x * 13.5, y * 13.5, seed ^ 3217) - .5) * .8
    + (surfaceNoise(x * 2.7, y * 2.7, seed ^ 7253) - .5) * 1.4;
  return [0, 1, 2].map(channel => Math.round(clamp(lerp(lerp(low[channel], high[channel], shade < .5 ? shade * 2 : (shade - .5) * 2), palette[3][channel], dry) + grain, 0, 255))) as [number, number, number];
}

/** Visual centreline only. Broader bends require a wholly known, passable verge. */
export function roundedSurfaceRoad(points: readonly SurfacePoint[], cells?: readonly SurfaceCell[], width = .65): SurfacePoint[] {
  const compact: SurfacePoint[] = [];
  for (const point of points) {
    const last = compact[compact.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    while (compact.length > 1) {
      const a = compact[compact.length - 2], b = compact[compact.length - 1];
      const ax = b.x - a.x, ay = b.y - a.y, bx = point.x - b.x, by = point.y - b.y;
      if (Math.abs(ax * by - ay * bx) > .00001 || ax * bx + ay * by <= 0) break;
      compact.pop();
    }
    compact.push({ ...point });
  }
  if (compact.length < 3) return compact;
  const allowed = new Map<string, boolean>();
  for (const cell of cells || []) if (Number.isSafeInteger(cell.x) && Number.isSafeInteger(cell.y)) {
    const key = `${cell.x}:${cell.y}`;
    allowed.set(key, cell.passable === true && allowed.get(key) !== false);
  }
  // Cover the widest irregular verge, subpixel jitter and inter-sample gap.
  const clearance = clamp((Number.isFinite(width) ? width : .65) * .88, .15, 1.1) * .5 + .18;
  const corridorClear = (entry: SurfacePoint, turn: SurfacePoint, exit: SurfacePoint) => {
    for (let step = 0; step <= 72; step++) {
      const t = step / 72, u = 1 - t;
      const px = u * u * entry.x + 2 * u * t * turn.x + t * t * exit.x;
      const py = u * u * entry.y + 2 * u * t * turn.y + t * t * exit.y;
      for (let y = Math.floor(py - clearance + .5); y <= Math.floor(py + clearance + .5); y++) {
        for (let x = Math.floor(px - clearance + .5); x <= Math.floor(px + clearance + .5); x++) {
          const dx = Math.max(Math.abs(px - x) - .5, 0), dy = Math.max(Math.abs(py - y) - .5, 0);
          if (dx * dx + dy * dy <= clearance * clearance && allowed.get(`${x}:${y}`) !== true) return false;
        }
      }
    }
    return true;
  };
  if (cells) {
    const simplified: SurfacePoint[] = []; let start = 0;
    while (start < compact.length - 1) {
      simplified.push(compact[start]); let selected = start + 1, distance = 0;
      for (let end = start + 1; end < compact.length; end++) {
        const prior = compact[end - 1], point = compact[end]; distance += Math.hypot(point.x - prior.x, point.y - prior.y);
        if (distance > 4) break;
        if (end < start + 2) continue;
        const a = compact[start], dx = point.x - a.x, dy = point.y - a.y, length2 = dx * dx + dy * dy;
        let safe = length2 > 0;
        for (let index = start + 1; safe && index <= end; index++) {
          const p = compact[index], previous = compact[index - 1], sx = p.x - previous.x, sy = p.y - previous.y;
          if (Math.abs(sx * sy) > .00001 || sx * dx + sy * dy <= 0) { safe = false; break; }
          const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / length2, 0, 1);
          if (Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) > .45) safe = false;
        }
        if (safe && corridorClear(a, { x: (a.x + point.x) / 2, y: (a.y + point.y) / 2 }, point)) selected = end;
      }
      start = selected;
    }
    simplified.push(compact[compact.length - 1]); compact.splice(0, compact.length, ...simplified);
  }
  const result = [{ ...compact[0] }];
  for (let index = 1; index < compact.length - 1; index++) {
    const before = compact[index - 1], turn = compact[index], after = compact[index + 1];
    const ax = turn.x - before.x, ay = turn.y - before.y, bx = after.x - turn.x, by = after.y - turn.y;
    const aLength = Math.hypot(ax, ay), bLength = Math.hypot(bx, by);
    if (!aLength || !bLength) continue;
    const cross = ax * by - ay * bx, dot = ax * bx + ay * by;
    if (Math.abs(cross) < .00001) { if (dot < 0) result.push({ ...turn }); continue; }
    const conservative = Math.min(.46, aLength / 2, bLength / 2);
    let radius = cells ? Math.min(1.65, aLength * .45, bLength * .45) : conservative;
    const endpoints = (r: number) => [{ x: turn.x - ax / aLength * r, y: turn.y - ay / aLength * r }, { x: turn.x + bx / bLength * r, y: turn.y + by / bLength * r }];
    while (radius > conservative) {
      const [entry, exit] = endpoints(radius);
      if (corridorClear(entry, turn, exit)) break;
      radius = Math.max(conservative, radius * .75);
    }
    // The conservative curve stays within its committed corner cell. Final
    // authorized-passable union clipping still constrains every painted pixel.
    const [entry, exit] = endpoints(radius);
    result.push(entry);
    const steps = Math.max(6, Math.ceil(radius * 14));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps, u = 1 - t;
      result.push({ x: u * u * entry.x + 2 * u * t * turn.x + t * t * exit.x, y: u * u * entry.y + 2 * u * t * turn.y + t * t * exit.y });
    }
  }
  result.push({ ...compact[compact.length - 1] }); return result;
}

/** A continuously feathered, uneven soil edge; independent of screen resolution. */
export function sampleSurfaceRoad(x: number, y: number, points: readonly SurfacePoint[], width: number, seed: number, regionCode = ''): [number, number, number, number] {
  if (points.length < 2 || !Number.isFinite(width)) return [0, 0, 0, 0];
  const px = x + (surfaceNoise(x * 6.8, y * 6.8, seed ^ 739) - .5) * .07;
  const py = y + (surfaceNoise(x * 6.8, y * 6.8, seed ^ 997) - .5) * .07;
  let distance = Infinity;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index], dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const ox = px - a.x - t * dx, oy = py - a.y - t * dy;
    distance = Math.min(distance, ox * ox + oy * oy);
  }
  const radius = clamp(width * .88, .15, 1.1) * .5 + (surfaceNoise(x * 2.8, y * 2.8, seed ^ 1733) - .5) * .09;
  const feather = .025 + surfaceNoise(x * 9.2, y * 9.2, seed ^ 3571) * .02;
  const coverage = smooth(clamp((radius + feather - Math.sqrt(distance)) / (feather * 2), 0, 1));
  if (!coverage) return [0, 0, 0, 0];
  const detail = (surfaceNoise(x * 4.4, y * 4.4, seed ^ 6353) - .5) * 9 + (surfaceNoise(x * 11, y * 11, seed ^ 2131) - .5) * 3;
  const soil = regionCode === 'baina_town' ? [237, 230, 212] : regionCode === 'world_tree' ? [224, 235, 233]
    : /frost|snow/.test(regionCode) ? [217, 216, 192] : /ruin|dungeon/.test(regionCode) ? [210, 204, 179] : [226, 197, 142];
  return [soil[0] + detail, soil[1] + detail, soil[2] + detail, Math.round(coverage * 245)];
}

/** Half-cell bounds match the existing integer-centred movement lattice. */
export function surfaceCellContains(point: SurfacePoint, cell: SurfaceCell): boolean {
  return point.x >= cell.x - .5 && point.x < cell.x + .5 && point.y >= cell.y - .5 && point.y < cell.y + .5;
}
export function surfaceChunkCoordinate(world: number, side = 16) { return Math.floor((world + .5) / side); }
export function surfaceTraceOpacity(trace: { ageMs: number; remainingMs: number }, elapsedMs: number, initial: number, halfLifeMs: number): number {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  if (!(trace.remainingMs > elapsed) || trace.ageMs < 0 || !Number.isFinite(trace.ageMs)) return 0;
  return clamp(initial, 0, 1) * Math.pow(.5, (trace.ageMs + elapsed) / halfLifeMs);
}
export const SURFACE_WALK_TTL_MS = 10 * 60_000;
export const SURFACE_FOOTPRINT_ASSET = '/assets/light-anime/map-surface-v3/footprint-sole-v1.png';
/** Old servers published .08 road wear and a fifteen-minute remaining lifetime.
 * Footprints always start at one; neither old payloads nor remounts extend ten minutes. */
export function walkOpacity(walk: SurfaceWalk, elapsedMs: number) {
  if (![walk.ageMs, walk.remainingMs, elapsedMs].every(Number.isFinite) || walk.ageMs < 0) return 0;
  const elapsed = Math.max(0, elapsedMs), age = walk.ageMs + elapsed;
  return walk.remainingMs <= elapsed || age >= SURFACE_WALK_TTL_MS ? 0 : Math.max(0, 1 - age / SURFACE_WALK_TTL_MS);
}
export type SurfaceFootstep = SurfacePoint & { angle: number; flip: boolean; width: number; height: number };
/** Two distinct sole stamps per real cardinal segment. No interpolated routes,
 * randomness, viewport-dependent resampling or continuous path paint. */
export function surfaceWalkFootsteps(walk: Pick<SurfaceWalk, 'points'>): SurfaceFootstep[] {
  if (!Array.isArray(walk.points) || walk.points.length > 512 || walk.points.some(point => !point || ![point.x, point.y].every(Number.isSafeInteger))) return [];
  const points = walk.points, stamps: SurfaceFootstep[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index], dx = to.x - from.x, dy = to.y - from.y;
    if (![from.x, from.y, to.x, to.y].every(Number.isSafeInteger) || Math.abs(dx) + Math.abs(dy) !== 1) continue;
    for (const [position, side] of [[.25, -1], [.75, 1]]) stamps.push({
      x: from.x + dx * position - dy * .11 * side, y: from.y + dy * position + dx * .11 * side,
      angle: Math.atan2(dx, dy), flip: side === 1, width: .15, height: .28,
    });
  }
  return stamps;
}
export function markOpacity(mark: SurfaceCombatMark, elapsedMs: number) {
  const intensity = clamp(mark.intensity, .35, 1);
  // Quantity already changes the server silhouette. Keep fresh blood legible
  // over green grass rather than turning ordinary .72 intensity into brown.
  const initial = mark.kind === 'blood' ? .9 * Math.sqrt(intensity) : .42 * intensity;
  return surfaceTraceOpacity(mark, elapsedMs, initial, 3 * 60 * 60_000);
}

/** Elapsed time starts at receipt and uses performance.now, independent of the device wall clock. */
export class SurfaceSnapshotClock {
  readonly receivedAt: number;
  constructor(readonly serverNowMs: number, monotonicNow: number) { this.receivedAt = monotonicNow; }
  elapsed(monotonicNow: number) { return Math.max(0, monotonicNow - this.receivedAt); }
  serverNow(monotonicNow: number) { return this.serverNowMs + this.elapsed(monotonicNow); }
}

// A cached payload may outlive its map component. Retain its original receipt
// time so changing tabs or returning from combat cannot revive expired traces.
const receiptClocks = new WeakMap<MapSurfaceScene, SurfaceSnapshotClock>();
export function surfaceSnapshotClock(scene: MapSurfaceScene, monotonicNow: number): SurfaceSnapshotClock {
  let clock = receiptClocks.get(scene);
  if (!clock) {
    clock = new SurfaceSnapshotClock(scene.serverNowMs, monotonicNow);
    receiptClocks.set(scene, clock);
  }
  return clock;
}

const finitePoint = (point: SurfacePoint) => Number.isFinite(point?.x) && Number.isFinite(point?.y);
/** Ignore malformed/future schema payloads rather than leaving an unclickable blank scene. */
export function validSurfaceScene(scene: MapSurfaceScene | undefined): scene is MapSurfaceScene {
  return !!scene && scene.schemaVersion === 1 && scene.sceneryVersion === 1 && typeof scene.scopeToken === 'string'
    && typeof scene.snapshotId === 'string' && Number.isFinite(scene.serverNowMs) && Array.isArray(scene.terrainFields)
    && scene.terrainFields.length > 0 && scene.terrainFields.every(field => Number.isFinite(field.regionId) && typeof field.regionCode === 'string')
    && [scene.scenery, scene.roads, scene.recentWalks, scene.combatMarks].every(Array.isArray);
}
export function safeSurfacePoints(points: SurfacePoint[]): SurfacePoint[] { return Array.isArray(points) ? points.filter(finitePoint).slice(0, 512) : []; }

export type SurfaceSplat = { outline: SurfacePoint[]; droplets: { x: number; y: number; radius: number; stretch: number; angle: number }[] };
/** One stable asymmetric silhouette, with a directional fan of irregular satellite drops. */
export function surfaceSplat(seed: number): SurfaceSplat {
  const random = surfaceRandom(seed), angle = random() * Math.PI * 2, count = 15 + Math.floor(random() * 8);
  const outline = Array.from({ length: count }, (_, index) => {
    const theta = angle + index / count * Math.PI * 2, radial = .2 + random() * .28;
    return { x: Math.cos(theta) * radial * 1.15 + .07, y: Math.sin(theta) * radial * .75 - .04 };
  });
  const direction = random() * Math.PI * 2;
  const droplets = Array.from({ length: 17 + Math.floor(random() * 9) }, () => {
    const theta = direction + (random() - .5) * Math.PI * 1.65, distance = .3 + random() * .7;
    return { x: Math.cos(theta) * distance, y: Math.sin(theta) * distance * .8,
      radius: .013 + random() * .035, stretch: 1 + random() * 1.4, angle: theta };
  });
  return { outline, droplets };
}
