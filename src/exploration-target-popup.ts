type Position = { x: number; y: number; z?: number; regionId?: number };
type TargetReference = { type: string; id: string };
type ObservedPoint = Position & {
  id: string; type?: string; regionCode?: string; discovered?: boolean; interactable?: boolean;
  interaction?: TargetReference;
};
export type MovementStopResult = {
  kind?: string; text?: string; message?: string; position?: Position; moved?: boolean;
  presentation?: string; interactionTargets?: unknown; regionCode?: string;
};
export type MapTargetPopupRequest = {
  id: number; pointIds: string[]; playerKey: string; regionCode: string; position: Position;
};
const samePosition = (a: Position, b: Position) => a.x === b.x && a.y === b.y && (a.z ?? 0) === (b.z ?? 0)
  && (a.regionId === undefined || b.regionId === undefined || a.regionId === b.regionId);

// These are the existing server's explicit encounter guards. Arbitrary errors,
// terrain walls and a resource merely sharing the starting cell do not qualify.
export const isCurrentEncounterBlock = (value: unknown) => {
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
  return message.trim() === '当前格子存在敌对生物，请先选择战斗、交涉或躲避。'
    || message.trim() === '出发点出现敌对生物，本次前往已停止，请先处理当前遭遇。';
};
const stopTypes: Record<string, readonly string[]> = {
  encounter: ['怪物'], resource: ['资源', '矿脉', '植被'], npc: ['NPC', '域民', '建筑'],
  dungeon_entrance: ['地下入口'], object: ['地标']
};
export const isTargetMovementStop = (result: MovementStopResult) => result.presentation !== 'story'
  && (isCurrentEncounterBlock(result.message ?? result.text)
    || result.moved !== false && (Object.hasOwn(stopTypes, result.kind ?? '') || result.kind === 'interaction'));

/** Select identities only from the current authorized map, never from result prose. */
export function stoppedMovementPointIds(result: MovementStopResult | undefined, current: Position & { regionCode?: string }, points: readonly ObservedPoint[]): string[] {
  if (!result || !isTargetMovementStop(result) || !result.position || !samePosition(result.position, current)) return [];
  if (result.position.regionId !== undefined && result.position.regionId !== current.regionId
    || result.regionCode !== undefined && result.regionCode !== current.regionCode) return [];
  const encounterBlock = isCurrentEncounterBlock(result.message ?? result.text);
  const allowedTypes = encounterBlock ? ['怪物'] : stopTypes[result.kind ?? ''];
  const targets = Array.isArray(result.interactionTargets) ? result.interactionTargets.filter((target): target is TargetReference =>
    !!target && typeof target === 'object' && typeof target.type === 'string' && typeof target.id === 'string') : undefined;
  // The route endpoint returns all coordinate interactions even for encounters;
  // only an interaction result uses those references to select its popup.
  return points.filter(point => point.discovered !== false && point.interactable !== false && samePosition(point, current)
    && (!point.regionCode || !current.regionCode || point.regionCode === current.regionCode)
    && (allowedTypes ? allowedTypes.includes(point.type ?? '') : targets?.some(target =>
      point.interaction?.type === target.type && point.interaction.id === target.id)))
    .map(point => point.id);
}

/** A request is consumed once, and must still refer to the same player and cell. */
export const currentTargetPopupRequest = (request: MapTargetPopupRequest, current: Position, playerKey: string | undefined, regionCode: string) =>
  request.playerKey === playerKey && request.regionCode === regionCode && samePosition(request.position, current);
