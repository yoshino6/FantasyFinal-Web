import { toRaw } from 'vue';
import type { ExploreCommittedMovement, ExploreLocalMap } from './api';
import { surfaceSnapshotClock, validSurfaceScene, type MapSurfaceScene } from './map-surface';
type Snapshot = Omit<ExploreLocalMap, 'ok'>;
const unique = <T extends { id: string }>(items: T[]) => [...new Map(items.map(item => [item.id, item])).values()];
const age = (scene: MapSurfaceScene, now: number) => {
  const elapsed = surfaceSnapshotClock(toRaw(scene), now).elapsed(now);
  const traces = <T extends { ageMs: number; remainingMs: number }>(items: T[]) => items.map(item => ({ ...item, ageMs: item.ageMs + elapsed, remainingMs: Math.max(0, item.remainingMs - elapsed) })).filter(item => item.remainingMs > 0);
  return { ...scene, recentWalks: traces(scene.recentWalks), combatMarks: traces(scene.combatMarks) };
};

/** Two adjacent committed windows, never an accumulated route or arbitrary origin. */
export function adjacentVision(previous: Snapshot | undefined, next: Snapshot, now: number): Snapshot {
  const a = previous?.surfaceScene, b = next.surfaceScene;
  if (!previous || !validSurfaceScene(a) || !validSurfaceScene(b) || a.scopeToken !== b.scopeToken
    || previous.origin.z !== next.origin.z || Math.abs(previous.origin.x - next.origin.x) + Math.abs(previous.origin.y - next.origin.y) !== 1) return next;
  if (a.terrainFields.some(field => b.terrainFields.some(other => field.regionId === other.regionId && field.seed !== other.seed))) return next;
  return mergeObservedVision(previous, next, now);
}

/** Two already authorized endpoints of one completed command. This does not
 * synthesize intermediate cells or accept an arbitrary camera position. */
export function committedReplayVision(previous: Snapshot | undefined, next: Snapshot, movement: ExploreCommittedMovement, now: number): Snapshot | undefined {
  const a = previous?.surfaceScene, b = next.surfaceScene;
  const same = (left: typeof next.origin, right: typeof next.origin) => ['x', 'y', 'z', 'regionId'].every(key => left[key as keyof typeof left] === right[key as keyof typeof right]);
  if (!previous || !validSurfaceScene(a) || !validSurfaceScene(b) || a.scopeToken !== b.scopeToken
    || !same(previous.origin, movement.origin) || !same(next.origin, movement.target)
    || previous.origin.z !== next.origin.z || !Number.isFinite(movement.totalDistance) || movement.totalDistance <= 0
    || movement.waypoints.length < 2 || !same(movement.waypoints[0]!, movement.origin)
    || !same(movement.waypoints.at(-1)!, movement.target)
    || movement.waypoints[0]!.distance !== 0 || movement.waypoints.at(-1)!.distance !== movement.totalDistance
    || movement.waypoints.some((point, index) => {
      if (![point.x, point.y, point.z, point.regionId].every(Number.isSafeInteger) || point.regionId <= 0 || point.z !== movement.origin.z) return true;
      if (!index) return false;
      const before = movement.waypoints[index - 1]!;
      return point.x !== before.x && point.y !== before.y
        || point.distance - before.distance !== Math.abs(point.x - before.x) + Math.abs(point.y - before.y);
    }) || a.terrainFields.some(field => b.terrainFields.some(other => field.regionId === other.regionId && field.seed !== other.seed))) return;
  return mergeObservedVision(previous, next, now);
}

function mergeObservedVision(previous: Snapshot, next: Snapshot, now: number): Snapshot {
  const a = previous.surfaceScene!, b = next.surfaceScene!;
  const before = age(a, now), after = age(b, now);
  const cells = [...new Map([...previous.cells, ...next.cells].filter(cell => cell.z === next.origin.z).map(cell => [`${cell.x}:${cell.y}:${cell.z}`, cell])).values()];
  const marks = new Map(before.combatMarks.map(mark => [mark.id, mark]));
  for (const mark of after.combatMarks) {
    const old = marks.get(mark.id);
    marks.set(mark.id, old?.fragments && mark.fragments ? { ...mark, fragments: [...new Map([...mark.fragments, ...old.fragments].map(fragment => [JSON.stringify(fragment), fragment])).values()] } : mark);
  }
  let fragmentsLeft = 768;
  const combatMarks = [...marks.values()].sort((left, right) => left.ageMs - right.ageMs).slice(0, 48).flatMap(mark => {
    if (!mark.fragments) return [mark];
    const fragments = mark.fragments.slice(0, Math.min(64, fragmentsLeft)); fragmentsLeft -= fragments.length;
    return fragments.length ? [{ ...mark, fragments }] : [];
  });
  const surfaceScene: MapSurfaceScene = { ...after, serverNowMs: surfaceSnapshotClock(toRaw(b), now).serverNow(now), snapshotId: `adjacent:${a.snapshotId}:${b.snapshotId}`,
    terrainFields: [...new Map([...before.terrainFields, ...after.terrainFields].map(field => [field.regionId, field])).values()],
    scenery: unique([...before.scenery, ...after.scenery]).slice(0, 600),
    // Retain the two independently clipped portions; the raster union is still
    // clipped again to this limited authorized cell union and continuous fog.
    roads: [...after.roads, ...before.roads.map(road => ({ ...road, id: `previous:${road.id}` }))].slice(0, 64),
    recentWalks: unique([...before.recentWalks, ...after.recentWalks]).sort((left, right) => left.ageMs - right.ageMs).slice(0, 192), combatMarks };
  surfaceSnapshotClock(surfaceScene, now);
  return { ...next, cells, environment: unique([...(previous.environment ?? []), ...(next.environment ?? [])]), surfaceScene };
}
