import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { ExploreTravelVisual, ExploreTravelVisualPoint } from './api';

type Heading = 'up' | 'down' | 'left' | 'right';
export type TravelMotionFrame = {
  position: ExploreTravelVisualPoint;
  heading: Heading;
  moving: boolean;
  speed: number;
  progress: number;
};
const headingFor = (from: ExploreTravelVisualPoint, to: ExploreTravelVisualPoint): Heading => Math.abs(to.x - from.x) > Math.abs(to.y - from.y) ? to.x >= from.x ? 'right' : 'left' : to.y > from.y ? 'up' : 'down';

/** Interpolate only the server's saved route; never invent a straight shortcut. */
export function sampleTravelMotion(visual: ExploreTravelVisual, serverTime: number): TravelMotionFrame {
  const restingHeading = (): Heading => {
    for (let segmentIndex = visual.segments.length - 1; segmentIndex >= 0; segmentIndex--) {
      const segment = visual.segments[segmentIndex]!;
      if (segment.instant || segment.kind !== 'walk') continue;
      for (let index = segment.waypoints.length - 1; index > 0; index--) {
        const from = segment.waypoints[index - 1]!, to = segment.waypoints[index]!;
        if (serverTime > from.at && to.distance > from.distance) return headingFor(from, to);
      }
    }
    return 'down';
  };
  const still = (position: ExploreTravelVisualPoint, progress = 0): TravelMotionFrame => ({ position: { ...position }, heading: restingHeading(), moving: false, speed: 0, progress });
  if (serverTime < visual.startAt) return still(visual.start);
  if (serverTime >= visual.arrivalAt) return still(visual.target, 1);
  const segment = visual.segments.find(item => serverTime < item.arrivalAt);
  if (!segment) return still(visual.start);
  const travelled = segment.waypoints[0]?.distance ?? 0;
  if (segment.instant || segment.kind !== 'walk') return still(segment.from, visual.totalDistance > 0 ? travelled / visual.totalDistance : 0);
  const points = segment.waypoints;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!, to = points[index]!;
    if (serverTime > to.at || to.at <= from.at) continue;
    const ratio = Math.max(0, Math.min(1, (serverTime - from.at) / (to.at - from.at)));
    const distance = from.distance + (to.distance - from.distance) * ratio;
    return { position: { ...(ratio >= 1 ? to : from), x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }, heading: headingFor(from, to), moving: to.distance > from.distance, speed: (to.distance - from.distance) / ((to.at - from.at) / 1000), progress: visual.totalDistance > 0 ? distance / visual.totalDistance : 0 };
  }
  return still(segment.to, visual.totalDistance > 0 ? (points.at(-1)?.distance ?? travelled) / visual.totalDistance : 0);
}

export function useExplorationTravelMotion(visual: Ref<ExploreTravelVisual | undefined>, enabled: Ref<boolean>) {
  const frame = ref<TravelMotionFrame>();
  let animation = 0;
  let route: ExploreTravelVisual | undefined;
  let serverAnchor = 0, clockAnchor = 0;
  const serverTime = () => serverAnchor + performance.now() - clockAnchor;
  const stop = () => { cancelAnimationFrame(animation); animation = 0; frame.value = undefined; };
  const tick = () => {
    if (!enabled.value || !route) { stop(); return; }
    frame.value = sampleTravelMotion(route, serverTime());
    animation = requestAnimationFrame(tick);
  };
  const sync = () => {
    cancelAnimationFrame(animation);
    if (!enabled.value || !route) { stop(); return; }
    tick();
  };
  watch(visual, value => {
    if (!value || !Number.isFinite(value.serverNow) || !Number.isFinite(value.arrivalAt) || !Number.isFinite(value.startAt) || !Array.isArray(value.segments)) { route = undefined; stop(); return; }
    const now = performance.now();
    // Polling may replace the panel, but cannot restart the route or move its
    // displayed clock backwards. This clock also survives leaving the tab.
    serverAnchor = route?.id === value.id ? Math.max(value.serverNow, serverTime()) : value.serverNow;
    clockAnchor = now;
    route = value;
    sync();
  }, { immediate: true });
  watch(enabled, sync);
  onBeforeUnmount(stop);
  return frame;
}
