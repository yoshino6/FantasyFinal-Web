import { ref } from 'vue';
import type { ExploreLocalMap, ExploreRoutePosition, ExploreRoutePreview, ExploreRouteStep, PanelNearbyPoint } from './api';
import { mappedSettlementRouteCells, prepareMappedSettlementGround } from './map-mapped-settlement-ground';

type Position = { x: number; y: number; z?: number };
type Session = { generation: number; token: string };
type LocalRouteHint = ExploreRoutePreview & { serverPreviewFirst?: boolean };
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y && (a.z ?? 0) === (b.z ?? 0);
export const localRouteDuration = (distance: number, movementSpeed = 1) => Math.max(0, distance) * 1000 / movementSpeed;

/** A plan over already authorized cells is a hint; each step still commits on the server. */
export function knownExplorationRoute(snapshot: ExploreLocalMap | undefined, from: Position & { regionId?: number }, to: Position, knownTargets: readonly PanelNearbyPoint[] = snapshot?.nearby?.points ?? []): LocalRouteHint | undefined {
  if (!snapshot || snapshot.environmentJob || snapshot.travelView || !same(snapshot.origin, from)
    || from.regionId !== undefined && snapshot.origin.regionId !== from.regionId
    || ![snapshot.origin.x, snapshot.origin.y, snapshot.origin.z, snapshot.origin.regionId].every(Number.isSafeInteger)
    || snapshot.origin.regionId <= 0 || ![to.x, to.y, to.z ?? from.z ?? 0].every(Number.isSafeInteger)
    || !Array.isArray(snapshot.cells) || snapshot.cells.length > 16384
    || (to.z ?? from.z ?? 0) !== snapshot.origin.z
    || ![snapshot.range, snapshot.actionRange, snapshot.movement.step].every(value => Number.isSafeInteger(value) && value >= 0)
    || snapshot.pathBudget !== undefined && (!Number.isSafeInteger(snapshot.pathBudget) || snapshot.pathBudget < 0)
    || !Number.isFinite(snapshot.movement.speed) || Number(snapshot.movement.speed) <= 0) return;
  // Every real observed cell can be a walking destination. Older snapshots
  // still ask for server planning first, independently of QQ's selected step.
  const legacy = snapshot.pathBudget === undefined;
  let radius = snapshot.range;
  const originCell = snapshot.cells.find(cell => same(cell, snapshot.origin));
  const prepared = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) > radius
    ? prepareMappedSettlementGround(snapshot.surfaceScene, snapshot.mappedSettlement, { current: snapshot.origin, regionCode: originCell?.regionCode ?? '', originCell }) : undefined;
  const mappedCells = mappedSettlementRouteCells(prepared, snapshot.cells);
  const sourceCells = mappedCells ?? snapshot.cells;
  if (mappedCells) radius = Math.max(snapshot.range, ...mappedCells.map(cell => Math.abs(cell.x - from.x) + Math.abs(cell.y - from.y)));
  const key = (position: Position) => `${position.x}:${position.y}`;
  const allowed = new Map(sourceCells.filter(cell => cell.passable && (!('reachable' in cell) || cell.reachable !== false)
    && [cell.x, cell.y, cell.z, cell.regionId].every(Number.isSafeInteger) && Number(cell.regionId) > 0
    && cell.z === snapshot.origin.z && Math.abs(cell.x - from.x) + Math.abs(cell.y - from.y) <= radius).map(cell => [key(cell), cell]));
  const budget = mappedCells || legacy ? Math.max(0, allowed.size - 1) : Math.min(snapshot.pathBudget!, Math.max(0, allowed.size - 1));
  const start = key(snapshot.origin), destination = key(to);
  if (destination === start || !allowed.has(destination)) return;
  const interactiveTypes = new Set(['NPC', '域民', '怪物', '建筑', '资源', '矿脉', '植被', '地标', '地下入口', '入口', '玩家', '地点']);
  const avoid = new Set(knownTargets.filter(point => (interactiveTypes.has(point.type) || point.interaction)
    && point.interactable !== false && [point.x, point.y, point.z ?? snapshot.origin.z].every(Number.isSafeInteger)
    && (point.z ?? snapshot.origin.z) === snapshot.origin.z
    && allowed.has(key(point)) && (point.regionId === undefined || point.regionId === allowed.get(key(point))!.regionId))
    .map(key).filter(value => value !== start && value !== destination));
  const walk = (avoidTargets: boolean) => {
    const queue = [{ ...snapshot.origin, depth: 0 }], previous = new Map<string, string>(), visited = new Set([start]);
    for (let head = 0; head < queue.length && !visited.has(destination); head++) {
      const current = queue[head]!;
      if (current.depth >= budget) continue;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nextKey = `${current.x + dx!}:${current.y + dy!}`, cell = allowed.get(nextKey);
        if (!cell || visited.has(nextKey) || avoidTargets && avoid.has(nextKey)) continue;
        visited.add(nextKey); previous.set(nextKey, key(current));
        queue.push({ x: cell.x, y: cell.y, z: cell.z, regionId: cell.regionId!, depth: current.depth + 1 });
      }
    }
    return visited.has(destination) ? previous : undefined;
  };
  // Targets are route preferences, not new terrain walls. Keep a reachable
  // destination usable when every detour exceeds the authorized path budget.
  const previous = (avoid.size ? walk(true) : undefined) ?? walk(false);
  if (!previous) return;
  const path: ExploreRoutePosition[] = [];
  for (let cursor = destination; cursor !== start; cursor = previous.get(cursor)!) {
    const cell = allowed.get(cursor)!;
    path.unshift({ x: cell.x, y: cell.y, z: cell.z, regionId: cell.regionId! });
  }
  const legacyBudget = Math.min(snapshot.range, snapshot.actionRange, snapshot.movement.step);
  const serverPreviewFirst = !!mappedCells || legacy && (path.length > legacyBudget
    || path.some(cell => Math.abs(cell.x - from.x) + Math.abs(cell.y - from.y) > legacyBudget));
  const plan: LocalRouteHint = { ok: true, origin: { ...snapshot.origin }, sightRange: mappedCells ? radius : snapshot.range, actionRange: snapshot.actionRange, moveRange: radius,
    pathBudget: budget, ...(serverPreviewFirst ? { serverPreviewFirst: true } : {}), path, stepMilliseconds: 1000 / Number(snapshot.movement.speed) };
  try { validateExplorationRoute(plan, from, to); return plan; } catch { return; }
}

// A preview is authoritative, but never execute malformed/non-adjacent instructions.
export function validateExplorationRoute(preview: ExploreRoutePreview, from: Position, to: Position) {
  const origin = preview.origin;
  // Extra sight can extend movement through real observed cells without
  // extending mining, combat, or other target interaction distances.
  const radius = preview.pathBudget === undefined ? Math.min(preview.moveRange, preview.actionRange, preview.sightRange) : Math.min(preview.moveRange, preview.sightRange);
  const budget = preview.pathBudget ?? radius;
  if (!Number.isFinite(preview.stepMilliseconds) || preview.stepMilliseconds <= 0) throw new Error('当前移动速度已变化，请刷新地图。');
  if (!same(origin, from) || !Number.isSafeInteger(origin.regionId) || origin.regionId <= 0 || ![preview.moveRange, preview.actionRange, preview.sightRange, budget].every(value => Number.isSafeInteger(value) && value >= 0)
    || preview.pathBudget !== undefined && budget > 2 * radius * (radius + 1)
    || !preview.path.length || preview.path.length > budget) throw new Error('当前位置或路线已变化，请重新选择目标。');
  const visited = new Set([`${origin.x}:${origin.y}:${origin.z}`]);
  let previous: Position = origin;
  for (const node of preview.path) {
    const key = `${node.x}:${node.y}:${node.z}`;
    if (![node.x, node.y, node.z, node.regionId].every(Number.isSafeInteger) || node.regionId <= 0 || node.z !== origin.z || visited.has(key)
      || Math.abs(node.x - previous.x) + Math.abs(node.y - previous.y) !== 1 || Math.abs(node.x - origin.x) + Math.abs(node.y - origin.y) > radius) throw new Error('服务器路线不可通行，请重新选择目标。');
    visited.add(key);
    previous = node;
  }
  if (!same(previous, to)) throw new Error('路线终点发生变化，请重新选择目标。');
}

export function useExplorationRoute(options: {
  current: () => Position;
  session: () => Session;
  isCurrentSession: (session: Session) => boolean;
  active: () => boolean;
  /** Optional current authorized window; this replaces only the redundant plan read. */
  localPreview?: (to: { x: number; y: number; z: number }) => LocalRouteHint | undefined;
  preview: (to: { x: number; y: number; z: number }, signal: AbortSignal) => Promise<ExploreRoutePreview>;
  step: (to: ExploreRoutePosition, from: ExploreRoutePosition, signal: AbortSignal) => Promise<ExploreRouteStep>;
  apply: (result: ExploreRouteStep, show: boolean) => Promise<void>;
  /** Observe only the adjacent committed leg, never all future route windows. */
  vision?: (result?: ExploreRouteStep, previous?: ExploreRouteStep) => void;
  failed: (error: unknown) => Promise<void>;
}) {
  const pending = ref(false);
  const animating = ref(false);
  const replaying = ref(false);
  const speed = ref(0);
  const cancelling = ref(false);
  const completed = ref(0);
  const total = ref(0);
  const target = ref<Position>();
  const displayPosition = ref<Position>();
  let generation = 0;
  let abort: AbortController | undefined;
  let finishAnimation: (() => void) | undefined;
  const cancel = () => { cancelling.value = true; finishAnimation?.(); };
  const reset = () => {
    generation++;
    abort?.abort();
    finishAnimation?.();
    pending.value = animating.value = replaying.value = cancelling.value = false;
    options.vision?.();
    speed.value = 0;
    target.value = displayPosition.value = undefined;
  };
  const run = async (destination: Position) => {
    if (pending.value || !options.active()) return;
    const session = options.session();
    const version = ++generation;
    const valid = () => version === generation && options.isCurrentSession(session);
    abort = new AbortController();
    pending.value = true;
    cancelling.value = false;
    completed.value = total.value = 0;
    const from = { ...options.current() };
    displayPosition.value = from;
    const results: ExploreRouteStep[] = [];
    let applied = 0;
    let failure: unknown;
    const applyThrough = (count: number, showLast: boolean) => {
      const work: Promise<void>[] = [];
      while (applied < count) {
        const index = applied++;
        work.push(options.apply(results[index]!, showLast && index === results.length - 1 && options.active()));
      }
      return Promise.all(work);
    };
    try {
      const to = { ...destination, z: destination.z ?? from.z ?? 0 };
      const localPreview = options.localPreview?.(to);
      let preview: ExploreRoutePreview;
      if (localPreview && !localPreview.serverPreviewFirst) preview = localPreview;
      else {
        try { preview = await options.preview(to, abort.signal); }
        catch (error) {
          // Older previews may cap an observed destination by the selected
          // step, or cap mapped public ground by perception. Adjacent writes
          // retain real position, collision, permission and action authority.
          if (!localPreview?.serverPreviewFirst || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'OUT_OF_RANGE'
            || 'status' in error && error.status !== 400) throw error;
          preview = localPreview;
        }
      }
      if (!valid() || cancelling.value || !options.active()) return;
      validateExplorationRoute(preview, options.current(), to);
      displayPosition.value = { ...preview.origin };
      total.value = preview.path.length;
      target.value = preview.path.at(-1);
      let confirmed = preview.origin;
      const path: Position[] = [preview.origin];
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const predicting = !!localPreview && !localPreview.serverPreviewFirst && !reduced;
      const predictedPath: Position[] = [preview.origin, ...preview.path];
      const applications: Promise<unknown>[] = [];
      let producerDone = false, playbackDone = reduced, wakePlayback = () => {}, finishPlayback = () => {};
      // A current authorized plan can play continuously before network replies.
      // This changes only the display position: perception/entity snapshots and
      // interactions still follow real commits, never the predicted position.
      const playback = reduced ? Promise.resolve() : new Promise<void>(resolve => {
        let frame = 0, lastTime = performance.now(), wantedMilliseconds = 0, visualProgress = 0, visionSegment = -1;
        const finish = () => {
          if (playbackDone) return;
          playbackDone = true; if (frame) cancelAnimationFrame(frame); frame = 0;
          if (valid() && (cancelling.value || !options.active())) {
            displayPosition.value = { ...(results.at(-1)?.position ?? preview.origin) };
            completed.value = path.length - 1;
          }
          animating.value = false; finishAnimation = undefined; resolve();
        };
        finishPlayback = finish;
        finishAnimation = finish;
        const tick = (time: number) => {
          frame = 0;
          if (!valid() || cancelling.value || !options.active()) { finish(); return; }
          const distance = path.length - 1;
          if (producerDone && !distance) { displayPosition.value = { ...preview.origin }; finish(); return; }
          const canPredict = predicting && (!producerDone || distance === preview.path.length);
          const visualPath = canPredict ? predictedPath : path, limit = visualPath.length - 1;
          // A rejected/blocked route retracts any unconfirmed visual suffix.
          // The real landing is applied separately; no rollback writes exist.
          if (visualProgress > limit) visualProgress = limit;
          wantedMilliseconds = Math.min(limit * preview.stepMilliseconds, wantedMilliseconds + Math.max(0, time - lastTime));
          lastTime = time;
          // Cold terrain or a suspended tab cannot skip a complete cell. Keep
          // recovery bounded while discarding time spent waiting for authority.
          const rawProgress = Math.min(wantedMilliseconds / preview.stepMilliseconds, visualProgress + .45);
          const progress = Math.abs(rawProgress - Math.round(rawProgress)) < 1e-9 ? Math.round(rawProgress) : rawProgress;
          visualProgress = progress;
          const segment = Math.min(Math.max(0, limit - 1), Math.floor(progress));
          const visionLimit = Math.min(distance, Math.floor(progress) + 1);
          // At most one committed window per frame, including delayed replies
          // after the visual walk has already reached its known destination.
          if (visionSegment + 1 < visionLimit) {
            visionSegment++;
            options.vision?.(results[visionSegment], results[visionSegment - 1]);
            applications.push(applyThrough(visionSegment, false).catch(error => { failure = error; finish(); }));
          }
          const previous = visualPath[segment]!, next = visualPath[segment + 1] ?? previous;
          const ratio = progress - segment;
          displayPosition.value = { x: previous.x + (next.x - previous.x) * ratio, y: previous.y + (next.y - previous.y) * ratio, z: next.z };
          completed.value = Math.floor(progress);
          animating.value = progress < limit;
          applications.push(applyThrough(Math.min(completed.value, distance, visionSegment + 1), producerDone && progress === limit).catch(error => { failure = error; finish(); }));
          if (producerDone && progress >= limit && visionSegment + 1 >= distance) { finish(); return; }
          if (progress < limit || visionSegment + 1 < visionLimit) frame = requestAnimationFrame(tick);
        };
        wakePlayback = () => {
          if (playbackDone) return;
          if (producerDone && path.length === 1) { displayPosition.value = { ...preview.origin }; finish(); return; }
          if (frame) return;
          lastTime = performance.now();
          frame = requestAnimationFrame(tick);
        };
        if (predicting) { replaying.value = animating.value = true; speed.value = 1000 / preview.stepMilliseconds; wakePlayback(); }
      });
      // There is still exactly one in-flight write and every request carries
      // the last actual committed position. Predictions never enter these writes.
      for (const next of preview.path) {
        if (!valid() || cancelling.value || !options.active() || failure) break;
        let result: ExploreRouteStep;
        try { result = await options.step(next, confirmed, abort.signal); }
        catch (error) { failure = error; break; }
        if (!valid()) { finishPlayback(); return; }
        results.push(result);
        if (!result.moved || !same(result.position, next)) break;
        confirmed = result.position; path.push(result.position);
        if (!reduced && !cancelling.value && options.active()) {
          replaying.value = true; animating.value = !predicting || completed.value < preview.path.length;
          speed.value = 1000 / preview.stepMilliseconds; wakePlayback();
        }
        if (result.kind !== 'event' || result.presentation === 'story' || result.panel?.inBattle || result.panel?.mining || result.panel?.summary?.travel || result.panel?.pendingStory) break;
      }
      producerDone = true;
      total.value = path.length - 1;
      target.value = path.at(-1);
      if (cancelling.value || !options.active()) finishPlayback(); else wakePlayback();
      await playback;
      await Promise.all(applications);
      if (!valid()) return;
      // Cancellation or leaving the page synchronizes to the last real commit,
      // including a story relocation; it never invents an intermediate landing.
      await applyThrough(results.length, true);
      if (!valid()) return;
      if (failure) await options.failed(failure);
    } catch (error) {
      if (valid()) await options.failed(error);
    } finally {
      if (version === generation) {
        options.vision?.();
        pending.value = animating.value = replaying.value = cancelling.value = false;
        speed.value = 0;
        target.value = displayPosition.value = undefined;
      }
    }
  };
  return { pending, animating, replaying, speed, cancelling, completed, total, target, displayPosition, run, cancel, reset };
}
