import { surfaceHash, surfaceNoise } from './map-surface';

/** Public cosmetic seed only. It never determines obstacle or resource positions. */
export const surfaceEcologySeed = (scopeToken: string): number => surfaceHash(`surface-ecology2:${scopeToken}`);
export type SurfaceEcologySample = { cover: number; moisture: number; fertility: number; shade: number; rock: number; flowers: number };

/** Same continuous world field as the server scenery generator, including negative coordinates. */
export function sampleSurfaceEcology(x: number, y: number, seed: number): SurfaceEcologySample {
  const wx = x + (surfaceNoise(x / 11, y / 11, seed ^ 97) - .5) * 3.4;
  const wy = y + (surfaceNoise(x / 11, y / 11, seed ^ 193) - .5) * 3.4;
  return {
    cover: surfaceNoise(wx / 8.5, wy / 8.5, seed ^ 7349) * .72 + surfaceNoise(wx / 3.1, wy / 3.1, seed ^ 7919) * .28,
    moisture: surfaceNoise(wx / 15, wy / 15, seed ^ 15823),
    fertility: surfaceNoise(wx / 12, wy / 12, seed ^ 3217),
    shade: surfaceNoise(wx / 13, wy / 13, seed ^ 7253),
    rock: surfaceNoise(wx / 10, wy / 10, seed ^ 8783),
    flowers: surfaceNoise(wx / 6.5, wy / 6.5, seed ^ 6353)
  };
}
