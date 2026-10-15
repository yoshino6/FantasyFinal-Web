import { onBeforeUnmount, ref } from 'vue';
import type { ExploreCommittedMovement, ExploreTravelVisual } from './api';
import { localRouteDuration } from './exploration-route';
import { sampleTravelMotion, type TravelMotionFrame } from './exploration-travel-motion';

export function committedMovementTimeline(movement: ExploreCommittedMovement, now: number, fallbackMovementSpeed = 1): ExploreTravelVisual {
  const points = movement.waypoints;
  const same = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x === b.x && a.y === b.y && a.z === b.z;
  if (!Number.isFinite(movement.totalDistance) || movement.totalDistance <= 0 || points.length < 2 || !same(points[0]!, movement.origin) || !same(points.at(-1)!, movement.target) || points[0]!.distance !== 0 || points.at(-1)!.distance !== movement.totalDistance) throw new Error('移动轨迹已变化，请刷新地图。');
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!, to = points[index]!;
    if (![to.x, to.y, to.z, to.distance].every(Number.isFinite) || to.z !== from.z || (to.x !== from.x && to.y !== from.y) || to.distance - from.distance !== Math.abs(to.x - from.x) + Math.abs(to.y - from.y)) throw new Error('移动轨迹不可显示，请刷新地图。');
  }
  const movementSpeed = [movement.movementSpeed, fallbackMovementSpeed].find(value => typeof value === 'number' && Number.isFinite(value) && value > 0) ?? 1;
  const arrivalAt = now + localRouteDuration(movement.totalDistance, movementSpeed);
  return { id: movement.id, serverNow: now, startAt: now, arrivalAt, start: movement.origin, target: movement.target, totalDistance: movement.totalDistance, segments: [{ kind: 'walk', instant: false, from: movement.origin, to: movement.target, distance: movement.totalDistance, startAt: now, arrivalAt, waypoints: points.map(point => ({ ...point, at: now + point.distance / movement.totalDistance * (arrivalAt - now) })) }] };
}

/** Display an already committed command without sending another movement. */
export function useCommittedExplorationMotion() {
  const pending = ref(false);
  const frame = ref<TravelMotionFrame>();
  const target = ref<ExploreCommittedMovement['target']>();
  const distance = ref(0);
  let animation = 0;
  let complete: (() => void) | undefined;
  const cancel = () => complete?.();
  const reset = () => { cancel(); pending.value = false; frame.value = target.value = undefined; };
  const run = async (movement: ExploreCommittedMovement, fallbackMovementSpeed = 1) => {
    if (pending.value) return;
    const visual = committedMovementTimeline(movement, 0, fallbackMovementSpeed);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    pending.value = true;
    target.value = movement.target;
    distance.value = movement.totalDistance;
    frame.value = sampleTravelMotion(visual, 0);
    await new Promise<void>(resolve => {
      const finish = () => { cancelAnimationFrame(animation); complete = undefined; pending.value = false; frame.value = target.value = undefined; resolve(); };
      complete = finish;
      const start = performance.now();
      const tick = (time: number) => {
        frame.value = sampleTravelMotion(visual, Math.max(0, time - start));
        if (time - start >= visual.arrivalAt) finish();
        else animation = requestAnimationFrame(tick);
      };
      animation = requestAnimationFrame(tick);
    });
  };
  onBeforeUnmount(reset);
  return { pending, frame, target, distance, run, cancel, reset };
}
