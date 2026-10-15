import type { ExploreRouteStep, Panel } from './api';

/** A compact ordinary step updates authority immediately; unrelated panel data
 * is retained until the one full refresh at the end of this route. */
export function compactStepPanel(panel: Panel | null | undefined, result: ExploreRouteStep): Panel | undefined {
  const state = result.stepState, summary = panel?.summary;
  if (!panel || !summary || !state || result.panel || !result.moved || result.kind !== 'event' || result.presentation === 'story'
    || !result.localMap?.origin || !state.position || !state.movement || !state.nearby || !result.position
    || !['x', 'y', 'z', 'regionId'].every(key => Number.isSafeInteger(state.position[key as keyof typeof state.position])
      && state.position[key as keyof typeof state.position] === result.position[key as keyof typeof result.position]
      && state.position[key as keyof typeof state.position] === result.localMap!.origin[key as keyof typeof result.position])
    || ![state.hp, state.mp, state.stamina, state.movement.step, state.movement.maximum, state.nearby.range, state.nearby.actionRange].every(value => Number.isFinite(value) && value >= 0)
    || state.hp <= 0 || typeof state.region !== 'string' || !Array.isArray(state.nearby.points)) return;
  return { ...panel, summary: { ...summary, position: { ...state.position }, region: state.region,
    hp: { ...summary.hp, current: state.hp }, mp: { ...summary.mp, current: state.mp }, stamina: { ...summary.stamina, current: state.stamina },
    movementStep: state.movement.step, movementMaximum: state.movement.maximum, movement: { ...summary.movement, ...state.movement } },
    movement: { ...panel.movement, ...state.movement }, nearby: { ...panel.nearby, ...state.nearby },
    mapData: panel.mapData ? { ...panel.mapData, current: { ...state.position, name: state.region } } : undefined };
}
