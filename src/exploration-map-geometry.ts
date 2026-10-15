export type MapVector = { x: number; y: number };
export type MapViewport = { width: number; height: number };
export const MAP_ZOOM_MIN = 0.5;
export const MAP_ZOOM_MAX = 3;
export const clampMapZoom = (zoom: number) => Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, Number.isFinite(zoom) ? zoom : 1));

// World Y grows northward, opposite to the browser's Y axis. Terrain, cells,
// targets and the animated player all use this conversion.
export function worldToViewport(point: MapVector, camera: MapVector, cellSize: number, viewport: MapViewport): MapVector {
  return { x: viewport.width / 2 + (point.x - camera.x) * cellSize, y: viewport.height / 2 - (point.y - camera.y) * cellSize };
}
export function viewportToWorld(point: MapVector, camera: MapVector, cellSize: number, viewport: MapViewport): MapVector {
  return { x: camera.x + (point.x - viewport.width / 2) / cellSize, y: camera.y - (point.y - viewport.height / 2) / cellSize };
}
export function cameraForZoom(anchor: MapVector, worldAnchor: MapVector, cellSize: number, viewport: MapViewport): MapVector {
  return { x: worldAnchor.x - (anchor.x - viewport.width / 2) / cellSize, y: worldAnchor.y + (anchor.y - viewport.height / 2) / cellSize };
}
export function inPerception(point: MapVector & { z?: number }, current: MapVector & { z?: number }, radius: number): boolean {
  return (point.z === undefined || current.z === undefined || point.z === current.z)
    && Math.abs(point.x - current.x) + Math.abs(point.y - current.y) <= radius;
}
export function withinMovement(point: MapVector & { z?: number }, current: MapVector & { z?: number }, range: number): boolean {
  return (point.z === undefined || current.z === undefined || point.z === current.z)
    && Math.abs(point.x - current.x) + Math.abs(point.y - current.y) <= range;
}
