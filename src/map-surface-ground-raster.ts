import { sampleSurfaceEcology } from './map-surface-ecology';
import { MATERIAL_SIDE, MATERIAL_SCALE, MATERIAL_BROAD_SCALE, MATERIAL_GAIN, MATERIAL_BROAD_GAIN, MATERIAL_TINT_LIMIT, MATERIAL_MEAN_GAIN } from './map-surface-quality';
import { isPavedSurfaceRegion, sampleSurfaceColor, surfaceNoise, surfaceMaterialIndex, surfaceMaterialWeights, surfaceTransitionPoint, type SurfaceTerrainField } from './map-surface';

export type GroundMaterial = { pixels: Uint8ClampedArray; mean: number[] };
type GroundRasterBase = { key: string; generation: number; scope: string; ecologySeed: number; cx: number; cy: number; density: number; chunkSide: number; gutter: number };
export type GroundRasterJob = GroundRasterBase & { kind: 'chunk'; field: SurfaceTerrainField };
export type GroundTransitionJob = GroundRasterBase & { kind: 'transition'; x: number; y: number; fields: SurfaceTerrainField[]; mask: number[] };
export type GroundRasterTask = GroundRasterJob | GroundTransitionJob;
export type GroundWorkerInput = { kind: 'init'; materials: GroundMaterial[] } | { kind: 'raster'; job: GroundRasterTask };
export type GroundWorkerOutput = { kind: 'ready' } | { kind: 'raster'; job: GroundRasterTask; side: number; pixels: Uint8ClampedArray } | { kind: 'failed'; message: string };
const repeat = (value: number) => ((value % 1) + 1) % 1;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function materialColor(material: GroundMaterial, u: number, v: number, output: Float32Array, offset: number) {
  const px = repeat(u) * MATERIAL_SIDE - .5, py = repeat(v) * MATERIAL_SIDE - .5, bx = Math.floor(px), by = Math.floor(py), tx = px - bx, ty = py - by;
  const ix = (bx + MATERIAL_SIDE) % MATERIAL_SIDE, iy = (by + MATERIAL_SIDE) % MATERIAL_SIDE;
  const nx = (ix + 1) % MATERIAL_SIDE, ny = (iy + 1) % MATERIAL_SIDE, pixels = material.pixels;
  const a = (iy * MATERIAL_SIDE + ix) * 4, b = (iy * MATERIAL_SIDE + nx) * 4, c = (ny * MATERIAL_SIDE + ix) * 4, d = (ny * MATERIAL_SIDE + nx) * 4;
  const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
  for (let channel = 0; channel < 3; channel++) output[offset + channel] = pixels[a + channel] * wa + pixels[b + channel] * wb + pixels[c + channel] * wc + pixels[d + channel] * wd;
}

/** The former synchronous Canvas source raster, with identical float and byte
 * operations. Neither worker nor fallback changes the 128px authored detail. */
export function rasterGroundTile(field: SurfaceTerrainField, cx: number, cy: number, ecologySeed: number, materials: readonly GroundMaterial[], density = 128, chunkSide = 1, gutter = 4) {
  const size = chunkSide * density + gutter * 2, pixels = new Uint8ClampedArray(size * size * 4);
  const step = density / 8, side = chunkSide * 8 + 3, stride = 10, fieldPixels = new Float32Array(side * side * stride), primary = surfaceMaterialIndex(field.regionCode), paved = isPavedSurfaceRegion(field.regionCode);
  for (let gy = 0; gy < side; gy++) for (let gx = 0; gx < side; gx++) {
    const x = cx * chunkSide - .5 + (gx - 1) / 8, y = cy * chunkSide - .5 + chunkSide - (gy - 1) / 8;
    const habitat = sampleSurfaceEcology(x, y, ecologySeed), color = sampleSurfaceColor(x, y, field, habitat), index = (gy * side + gx) * stride;
    fieldPixels[index] = color[0]; fieldPixels[index + 1] = color[1]; fieldPixels[index + 2] = color[2];
    fieldPixels[index + 3] = (surfaceNoise(x / 8, y / 8, field.seed ^ 8783) - .5) * .28;
    fieldPixels.set(surfaceMaterialWeights(primary, habitat, paved), index + 4);
  }
  const material = materials[primary], detail = new Float32Array(6), sampled = new Float32Array(3), mean = new Float32Array(3);
  for (let py = 0; py < size; py++) {
    const y = cy * chunkSide - .5 + chunkSide - (py - gutter + .5) / density;
    const gy = 1 + (py - gutter + .5) / step, iy = Math.floor(gy), ty = gy - iy;
    for (let px = 0; px < size; px++) {
      const x = cx * chunkSide - .5 + (px - gutter + .5) / density;
      const gx = 1 + (px - gutter + .5) / step, ix = Math.floor(gx), tx = gx - ix, a = (iy * side + ix) * stride, b = a + side * stride;
      const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
      const warp = fieldPixels[a + 3] * wa + fieldPixels[a + stride + 3] * wb + fieldPixels[b + 3] * wc + fieldPixels[b + stride + 3] * wd;
      if (material) {
        detail.fill(0); mean.fill(0);
        for (let layer = 0; layer < 6; layer++) {
          const offset = layer + 4, weight = fieldPixels[a + offset] * wa + fieldPixels[a + stride + offset] * wb + fieldPixels[b + offset] * wc + fieldPixels[b + stride + offset] * wd;
          if (weight <= 0 || !materials[layer]) continue;
          materialColor(materials[layer], x / MATERIAL_SCALE + warp, y / MATERIAL_SCALE - warp, sampled, 0);
          for (let channel = 0; channel < 3; channel++) { detail[channel] += sampled[channel] * weight; mean[channel] += materials[layer].mean[channel] * weight; }
        }
        materialColor(material, x / MATERIAL_BROAD_SCALE + .37, y / MATERIAL_BROAD_SCALE + .71, detail, 3);
      }
      const index = (py * size + px) * 4;
      for (let channel = 0; channel < 3; channel++) {
        // Keep authored stone joints and brushwork without importing its moss hue.
        const fine = paved ? (detail[0] - mean[0]) * .2126 + (detail[1] - mean[1]) * .7152 + (detail[2] - mean[2]) * .0722 : detail[channel] - mean[channel];
        const broad = paved && material ? (detail[3] - material.mean[0]) * .2126 + (detail[4] - material.mean[1]) * .7152 + (detail[5] - material.mean[2]) * .0722 : material ? detail[channel + 3] - material.mean[channel] : 0;
        const tint = material ? clamp(fine * MATERIAL_GAIN + broad * MATERIAL_BROAD_GAIN, -MATERIAL_TINT_LIMIT, MATERIAL_TINT_LIMIT) + (mean[channel] - material.mean[channel]) * MATERIAL_MEAN_GAIN : 0;
        pixels[index + channel] = fieldPixels[a + channel] * wa + fieldPixels[a + stride + channel] * wb + fieldPixels[b + channel] * wc + fieldPixels[b + stride + channel] * wd + tint;
      }
      pixels[index + 3] = 255;
    }
  }
  return { side: size, pixels };
}

/** Exact former 3x3 ecotone mix. Sources come from final rasters, never from a
 * main-thread placeholder; neighbors and unknown-cell omissions stay intact. */
export function rasterGroundTransition(job: GroundTransitionJob, sourceTile: (field: SurfaceTerrainField) => { side: number; pixels: Uint8ClampedArray }) {
  const size = job.density, pixels = new Uint8ClampedArray(size * size * 4), sources = new Map(job.fields.map(field => [field.regionId, sourceTile(field)]));
  const sourceX = (job.x - job.cx * job.chunkSide) * size + job.gutter, sourceY = ((job.cy + 1) * job.chunkSide - job.y - 1) * size + job.gutter;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const wx = job.x - .5 + (px + .5) / size, wy = job.y + .5 - (py + .5) / size, index = (py * size + px) * 4;
    const blend = surfaceTransitionPoint(wx, wy, job.ecologySeed), weights = new Map<number, number>();
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      const nx = job.x + x, ny = job.y + y, id = job.mask[(y + 1) * 3 + x + 1]; if (!id) continue;
      const distance = Math.hypot(Math.max(Math.abs(blend.x - nx) - .5, 0), Math.max(Math.abs(blend.y - ny) - .5, 0));
      const t = clamp(distance / .48, 0, 1), weight = 1 - t * t * (3 - 2 * t);
      if (weight > 0) weights.set(id, Math.max(weights.get(id) ?? 0, weight));
    }
    const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
    for (let channel = 0; channel < 3; channel++) {
      let value = 0; for (const [id, weight] of weights) { const source = sources.get(id)!; value += source.pixels[((sourceY + py) * source.side + sourceX + px) * 4 + channel] * weight; }
      pixels[index + channel] = value / total;
    }
    pixels[index + 3] = 255;
  }
  return { side: size, pixels };
}
