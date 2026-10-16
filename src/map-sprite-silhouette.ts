import { surfaceCellUnionContours } from './map-surface';

type SpriteCrop = { column: number; row: number; columns: number; rows: number };
const cached = new Map<string, Promise<string | undefined>>();
const CACHE_LIMIT = 512;

async function traceSprite(source: string, crop?: SpriteCrop): Promise<string | undefined> {
  try {
    const image = await new Promise<HTMLImageElement | undefined>(resolve => {
      const sprite = new Image();
      sprite.crossOrigin = 'anonymous';
      sprite.onload = () => resolve(sprite);
      sprite.onerror = () => resolve(undefined);
      sprite.src = source;
    });
    if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    const sourceWidth = image.naturalWidth / (crop?.columns ?? 1), sourceHeight = image.naturalHeight / (crop?.rows ?? 1);
    const scale = Math.min(1, 128 / sourceWidth, 128 / sourceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, (crop?.column ?? 0) * sourceWidth, (crop?.row ?? 0) * sourceHeight,
      sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const opaque: { x: number; y: number }[] = [];
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (rgba[(y * canvas.width + x) * 4 + 3] >= 16) opaque.push({ x, y });
    }
    const coordinate = (value: number, extent: number) => Number(((value + .5) / extent).toFixed(6));
    const paths = surfaceCellUnionContours(opaque).map(contour => {
      const vertices = contour.slice(0, -1);
      // Keep corners only; a solid rectangle does not need one path segment per
      // sampled pixel. Separate contours preserve transparent holes and islands.
      const corners = vertices.filter((point, index) => {
        const previous = vertices[(index + vertices.length - 1) % vertices.length], next = vertices[(index + 1) % vertices.length];
        return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
      });
      return corners.map((point, index) => `${index ? 'L' : 'M'}${coordinate(point.x, canvas.width)} ${coordinate(point.y, canvas.height)}`).join('') + 'Z';
    });
    return paths.length ? paths.join('') : undefined;
  } catch {
    // Decode failures, a tainted canvas or an unavailable canvas leave the
    // existing rectangle-based fallback available to the caller.
    return undefined;
  }
}

/** A mask outline sampled from the existing raster; this never replaces its art. */
export async function loadMapSpriteSilhouette(source: string, crop?: SpriteCrop): Promise<string | undefined> {
  if (typeof Image === 'undefined' || typeof document === 'undefined' || typeof source !== 'string' || !source) return;
  if (crop && (![crop.column, crop.row, crop.columns, crop.rows].every(Number.isSafeInteger)
    || crop.columns <= 0 || crop.rows <= 0 || crop.column < 0 || crop.row < 0
    || crop.column >= crop.columns || crop.row >= crop.rows)) return;
  const key = JSON.stringify([source, crop?.column, crop?.row, crop?.columns, crop?.rows]);
  const existing = cached.get(key);
  if (existing) {
    cached.delete(key);
    cached.set(key, existing);
    return existing;
  }
  const pending = traceSprite(source, crop);
  cached.set(key, pending);
  if (cached.size > CACHE_LIMIT) cached.delete(cached.keys().next().value!);
  return pending;
}
