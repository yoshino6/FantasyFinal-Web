export type MapSpriteBox = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  silhouette?: {
    path: string;
    frame: { left: number; top: number; width: number; height: number };
    flip?: boolean;
  };
};

export type MapSpriteOverlapMask = {
  maskImage?: string;
  maskMode?: 'luminance';
  maskSize?: string;
  maskPosition?: string;
  maskRepeat?: string;
  maskClip?: 'no-clip';
};

const validMapSpriteBox = (box: MapSpriteBox) => Number.isFinite(box.left) && Number.isFinite(box.right)
  && Number.isFinite(box.top) && Number.isFinite(box.bottom)
  && box.left < box.right && box.top < box.bottom;

// The foot and painted dimensions are screen pixels after the map zoom and
// artwork bounds have been applied, so targets and moving actors share a frame.
export function mapActorSpriteBox(
  id: string,
  foot: { x: number; y: number },
  size: number,
  painted?: { width: number; height: number; groundBase?: boolean },
): MapSpriteBox {
  const width = painted?.width ?? size;
  const height = painted?.height ?? size * 1.25;
  const bottom = foot.y + (painted?.groundBase ? height * .125 : 0);
  return { id, left: foot.x - width / 2, right: foot.x + width / 2, top: bottom - height, bottom };
}

export function overlappingMapSprites(boxes: readonly MapSpriteBox[]): Set<string> {
  const ordered = boxes.filter(validMapSpriteBox).sort((a, b) => a.left - b.left);
  const overlapping = new Set<string>();
  const active: MapSpriteBox[] = [];
  for (const box of ordered) {
    let retained = 0;
    for (const other of active) {
      // Once its right edge passes the sweep, this sprite cannot overlap any
      // later sprite. Edge contact alone never makes either picture translucent.
      if (other.right <= box.left) continue;
      active[retained++] = other;
      if (other.top < box.bottom && box.top < other.bottom) {
        overlapping.add(other.id);
        overlapping.add(box.id);
      }
    }
    active.length = retained;
    active.push(box);
  }
  return overlapping;
}

// The mask covers the full artwork, including children painted outside their
// actor root. Each intersection is opaque grey over white, so overlapping three
// pictures still gives each mask 60% luminance instead of multiplying masks.
export function mapSpriteOverlapMask(
  box: MapSpriteBox,
  others: readonly MapSpriteBox[],
  frame: { left: number; top: number; width: number; height: number },
): MapSpriteOverlapMask {
  if (!validMapSpriteBox(box) || !Number.isFinite(frame.left) || !Number.isFinite(frame.top)
    || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)
    || frame.width <= 0 || frame.height <= 0) return {};
  const intersections: { left: number; top: number; width: number; height: number; silhouette?: MapSpriteBox['silhouette'] }[] = [];
  for (const other of others) {
    if (other.id === box.id || !validMapSpriteBox(other)) continue;
    const left = Math.max(box.left, other.left), top = Math.max(box.top, other.top);
    const right = Math.min(box.right, other.right), bottom = Math.min(box.bottom, other.bottom);
    if (left < right && top < bottom) intersections.push({ left, top, width: right - left, height: bottom - top, silhouette: other.silhouette });
  }
  if (!intersections.length) return {};

  const left = Math.min(frame.left, box.left) - 2, top = Math.min(frame.top, box.top) - 2;
  const width = Math.max(frame.left + frame.width, box.right) + 2 - left;
  const height = Math.max(frame.top + frame.height, box.bottom) + 2 - top;
  if (![left, top, width, height].every(Number.isFinite)) return {};
  const definitions: string[] = [];
  const rectangles = intersections.map((area, index) => {
    const rect = `<rect x="${area.left - left}" y="${area.top - top}" width="${area.width}" height="${area.height}"/>`;
    const silhouette = area.silhouette, sourceFrame = silhouette?.frame;
    if (!silhouette?.path || !sourceFrame || ![sourceFrame.left, sourceFrame.top, sourceFrame.width, sourceFrame.height].every(Number.isFinite)
      || sourceFrame.width <= 0 || sourceFrame.height <= 0) return rect;
    const clipId = `overlap-${index}`;
    definitions.push(`<clipPath id="${clipId}">${rect}</clipPath>`);
    const tx = sourceFrame.left + (silhouette.flip ? sourceFrame.width : 0) - left;
    const transform = `matrix(${silhouette.flip ? -sourceFrame.width : sourceFrame.width} 0 0 ${sourceFrame.height} ${tx} ${sourceFrame.top - top})`;
    const path = silhouette.path.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return `<g clip-path="url(#${clipId})"><path d="${path}" transform="${transform}" fill-rule="evenodd"/></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${definitions.join('')}</defs><rect width="100%" height="100%" fill="#fff"/><g fill="#999">${rectangles}</g></svg>`;
  return {
    maskImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    maskMode: 'luminance',
    maskSize: `${width}px ${height}px`,
    maskPosition: `${left - frame.left}px ${top - frame.top}px`,
    maskRepeat: 'no-repeat',
    maskClip: 'no-clip',
  };
}
