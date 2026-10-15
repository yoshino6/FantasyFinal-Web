import { request } from './api';

export type EvolutionAction = 'pause' | 'resume';
export type EvolutionMutationState = 'stable' | 'deviation' | 'rare' | 'paused' | 'archived';
export type EvolutionBodyPart = 'eye' | 'nerve' | 'skin' | 'chest' | 'bone' | 'organ';
export type EvolutionLabTarget = {
  id: 'evolution_lab'; name: string; regionId: number; regionCode: string;
  regionName: string; x: number; y: number; z: number; locationRequired: true;
};
export type EvolutionLab =
  | { unlocked: false; atSite: false; target: null }
  | { unlocked: true; atSite: boolean; target: EvolutionLabTarget };
export type EvolutionProfile = {
  unlockedLevel: number;
  injectionCount: number;
  evolutionScale: number;
  adaptationPressure: number;
  stability: number;
  symbiosisTraitCode: string | null;
  lineageMarks: unknown;
  finalTraitIds: unknown;
};
export type EvolutionMutation = {
  id: number;
  name: string;
  bodyPart: EvolutionBodyPart;
  bodyPartName: string;
  state: EvolutionMutationState;
  tier: number;
  sourceInjection: string;
  effect?: unknown;
  description?: string;
  availableActions: EvolutionAction[];
};
export type EvolutionHistory = { eventType: string; payload: unknown; createdAt: string };
export type EvolutionStatus = {
  ok: true;
  profileOpened: boolean;
  lab: EvolutionLab;
  character: { level: number; experience: number; realmStage: number; experienceRequired: number } | null;
  profile: EvolutionProfile | null;
  materials: { code: string; quantity: number }[];
  injections: { code: string; quantity: number; name: string }[];
  mutations: EvolutionMutation[];
  history: EvolutionHistory[];
  availableInjections?: { code: EvolutionInjection; name: string; parts: EvolutionBodyPart[] }[];
  observations?: { claimed: number; remaining: number;
    active: null | { id: number; status: string; progress: number; target_count: number; objective_text: string; rewards: string; definition: { name: string } };
    available: { type: string; name: string; objective: string; rewards: string }[] };
  shaping?: { required: number; selectedIds: number[]; traits: { id: number; name: string; bodyPartName: string }[] } | null;
  symbiosisChoices?: { code: string; name: string; partyText: string; soloText: string }[];
  serverTime: string;
};
export type EvolutionMutationDetail = {
  ok: true;
  target: { id: 'evolution_lab'; name: string; locationRequired: true };
  mutation: EvolutionMutation & { effect: unknown; description: string };
  serverTime: string;
};
export type EvolutionMutationQuote = {
  mutationId: number;
  name: string;
  bodyPart: EvolutionBodyPart;
  stateBefore: EvolutionMutationState;
  stateAfter: EvolutionMutationState;
  paused: boolean;
  effectEnabledBefore: boolean;
  effectEnabledAfter: boolean;
};
export type EvolutionMutationPreview = {
  ok: true;
  token: string;
  idempotencyKey: string;
  expiresAt: string;
  target: { id: 'evolution_lab'; name: string; locationRequired: true };
  quote: EvolutionMutationQuote;
  serverTime: string;
};
export type EvolutionMutationConfirm = {
  ok: true;
  result: EvolutionMutationQuote;
  refresh: string[];
  serverTime: string;
};

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const evolutionStatus = () => request<EvolutionStatus>('/evolution');
export const evolutionMutation = (id: number) => request<EvolutionMutationDetail>(`/evolution/mutations/${id}`);
export const previewEvolutionMutation = (id: number, action: EvolutionAction) =>
  post<EvolutionMutationPreview>(`/evolution/mutations/${id}/preview`, { action });
export const confirmEvolutionMutation = (token: string, idempotencyKey: string) =>
  post<EvolutionMutationConfirm>('/evolution/mutations/confirm', { token, idempotencyKey });

export type EvolutionInjection = 'conservative' | 'aggressive' | 'harmonic' | 'perception' | 'symbiosis' | 'metamorphosis' | 'shaping';
export type EvolutionProgressionAction =
  | { kind: 'inject'; code: EvolutionInjection; part?: EvolutionBodyPart; symbiosisTrait?: string }
  | { kind: 'accept_observation'; type: string }
  | { kind: 'claim_observation' }
  | { kind: 'select_trait'; mutationId: number };
export type EvolutionProgressionQuote = {
  kind: EvolutionProgressionAction['kind']; name: string;
  fromLevel?: number; toLevel?: number; costs?: Record<string, number>; fixedBonus?: Record<string, number>;
  mutationChance?: number; stableChance?: number; pressureBefore?: number; pressureAfter?: number;
  stabilityBefore?: number; stabilityAfter?: number; symbiosisTrait?: string | null;
  part?: EvolutionBodyPart | null;
  finalTraits?: { id: number; name: string }[]; objective?: string; rewards?: string; items?: Record<string, number>;
  selectedIds?: number[]; required?: number;
};
export type EvolutionProgressionPreview = { token: string; idempotencyKey: string; expiresAt: string; quote: EvolutionProgressionQuote };
export const previewEvolutionProgression = (action: EvolutionProgressionAction) => post<EvolutionProgressionPreview>('/evolution/progression/preview', action);
export const confirmEvolutionProgression = (token: string, idempotencyKey: string) => post<{
  result: { kind: EvolutionProgressionAction['kind']; toLevel?: number }; refresh: string[]
}>('/evolution/progression/confirm', { token, idempotencyKey });
