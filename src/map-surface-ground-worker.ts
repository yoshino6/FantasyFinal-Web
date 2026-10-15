import { rasterGroundTile, rasterGroundTransition, type GroundMaterial, type GroundWorkerInput, type GroundWorkerOutput } from './map-surface-ground-raster';
import type { SurfaceTerrainField } from './map-surface';

const worker = globalThis as unknown as { onmessage: ((event: MessageEvent<GroundWorkerInput>) => void) | null; postMessage(message: GroundWorkerOutput, transfer?: Transferable[]): void };
let materials: GroundMaterial[] | undefined;
const sources = new Map<string, { side: number; pixels: Uint8ClampedArray }>(); let sourceBytes = 0;
worker.onmessage = event => {
  try {
    const message = event.data;
    if (message.kind === 'init') {
      materials = message.materials; sources.clear(); sourceBytes = 0; worker.postMessage({ kind: 'ready' }); return;
    }
    if (!materials || message.kind !== 'raster') throw Error('Ground worker is not initialized');
    const job = message.job;
    const tile = (field: SurfaceTerrainField) => {
      const key = `${job.scope}:${job.ecologySeed}:${field.regionId}:${field.regionCode}:${field.seed}:${job.cx}:${job.cy}:${job.density}:${job.chunkSide}:${job.gutter}`;
      const cached = sources.get(key); if (cached) { sources.delete(key); sources.set(key, cached); return cached; }
      const result = rasterGroundTile(field, job.cx, job.cy, job.ecologySeed, materials!, job.density, job.chunkSide, job.gutter); sources.set(key, result); sourceBytes += result.pixels.byteLength;
      while (sourceBytes > 32 * 1024 * 1024 && sources.size > 1) { const oldest = sources.keys().next().value!; sourceBytes -= sources.get(oldest)!.pixels.byteLength; sources.delete(oldest); }
      return result;
    };
    const raw = job.kind === 'chunk' ? tile(job.field) : rasterGroundTransition(job, tile);
    // Retain worker-local source cache for adjacent ecotones; transfer only a
    // separate result so its buffer cannot become detached inside that cache.
    const result = { side: raw.side, pixels: job.kind === 'chunk' ? new Uint8ClampedArray(raw.pixels) : raw.pixels };
    worker.postMessage({ kind: 'raster', job, ...result }, [result.pixels.buffer]);
  } catch (error) { worker.postMessage({ kind: 'failed', message: String(error) }); }
};
