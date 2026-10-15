import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { ExploreLocalMap, ExploreTravelVisual } from './api';
import type { TravelMotionFrame } from './exploration-travel-motion';
import { adjacentVision } from './exploration-vision';

type Session = { generation: number; token: string };
/** Read the server-clock window once per completed travel cell. Never send a
 * client position or use a predicted position to authorize terrain/entities. */
export function useExplorationTravelVision(options: {
  visual: Ref<ExploreTravelVisual | undefined>;
  frame: Ref<TravelMotionFrame | undefined>;
  enabled: Ref<boolean>;
  session: () => Session;
  isCurrentSession: (session: Session) => boolean;
  load: (signal: AbortSignal) => Promise<ExploreLocalMap>;
}) {
  const snapshot = ref<ExploreLocalMap>();
  let lastRawSnapshot: ExploreLocalMap | undefined;
  let generation = 0, travelId = '', sessionKey = '', queued = false;
  let request: AbortController | undefined;
  const reset = () => {
    generation++; request?.abort(); request = undefined;
    queued = false; travelId = sessionKey = ''; snapshot.value = lastRawSnapshot = undefined;
  };
  const pump = async () => {
    if (request || !queued || !options.enabled.value || !options.visual.value) return;
    const version = generation, id = options.visual.value.id, session = options.session();
    const controller = new AbortController(); request = controller; queued = false;
    try {
      const result = await options.load(controller.signal), view = result.travelView;
      if (version !== generation || !options.isCurrentSession(session) || !options.enabled.value
        || options.visual.value?.id !== id) return;
      if (!view) { snapshot.value = lastRawSnapshot = undefined; return; }
      if (view.id !== id || !Number.isFinite(view.serverNow) || view.serverNow < options.visual.value.serverNow
        || !['x', 'y', 'z', 'regionId'].every(key => result.origin[key as keyof typeof result.origin] === view.position[key as keyof typeof result.origin])
        || snapshot.value?.travelView && view.serverNow < snapshot.value.travelView.serverNow) return;
      const combined = lastRawSnapshot ? adjacentVision(lastRawSnapshot, result, performance.now()) : result;
      lastRawSnapshot = result;
      snapshot.value = { ok: true, ...combined, travelView: view, nearby: result.nearby };
    } catch { /* Keep the last authorized window; a failed read grants no new cells. */ }
    finally {
      if (request === controller) {
        request = undefined;
        if (queued && version === generation) void pump();
      }
    }
  };
  watch(() => {
    const visual = options.visual.value, frame = options.frame.value;
    if (!options.enabled.value || !visual || !frame || !Number.isFinite(frame.progress)
      || !Number.isFinite(visual.totalDistance)) return '';
    const session = options.session();
    return JSON.stringify([session.generation, session.token, visual.id,
      Math.floor(Math.max(0, Math.min(1, frame.progress)) * visual.totalDistance + 1e-7), frame.position.z]);
  }, key => {
    if (!key) { reset(); return; }
    const id = options.visual.value!.id;
    const session = options.session(), nextSessionKey = JSON.stringify([session.generation, session.token]);
    if (travelId !== id || sessionKey !== nextSessionKey) { reset(); travelId = id; sessionKey = nextSessionKey; }
    queued = true; void pump();
  }, { immediate: true });
  onBeforeUnmount(reset);
  return { snapshot, reset };
}
