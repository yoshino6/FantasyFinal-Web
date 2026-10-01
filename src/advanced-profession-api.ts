import { request, type Panel, type StoryIllustration } from './api';

export type AdvancedQuestAction = 'accept' | 'switch_quest' | 'submit_story' | 'submit_proof';

export type AdvancedMentor = {
  id: string; name: string; title: string; regionCode: 'world_tree';
  x: number; y: number; z: number; locationRequired: true; atSite: boolean;
};
export type AdvancedProfessionCandidate = {
  code: string; name: string; baseProfession: string; role: string;
  mentor: AdvancedMentor;
  route: {
    regionCode: string; name: string; x: number; y: number;
    mapCodes: string[]; materialCode: string; materialName: string;
  };
  passive: { name: string; description: string };
  trial: { name: string; description: string; ready: boolean };
  quest: {
    stage: number; storyKills: number; proofKills: number;
    first: { title: string; story: string | null; target: string; requiredKills: number };
    second: {
      title: string; story: string | null; target: string; requiredKills: number;
      materialCount: number; materialOwned: number;
    };
  } | null;
  completed: boolean;
  availableActions: AdvancedQuestAction[];
  blockedReason: string | null;
  storyImage?: StoryIllustration;
};
export type AdvancedProfessionStatus = {
  ok: true;
  character: { level: number; baseProfession: string | null };
  currentProfession: { code: string; name: string; completedAt: string } | null;
  activeQuest: {
    professionCode: string; professionName: string; stage: number;
    storyKills: number; proofKills: number;
  } | null;
  hiddenQuestActive: boolean;
  retrainRemainingSeconds: number;
  candidates: AdvancedProfessionCandidate[];
  serverTime: string;
};
export type AdvancedProfessionDetail = Omit<AdvancedProfessionStatus, 'candidates' | 'ok'> & {
  ok: true; candidate: AdvancedProfessionCandidate;
};

export type AdvancedQuestQuote = {
  action: AdvancedQuestAction;
  professionCode: string; professionName: string;
  stageBefore: number; stageAfter: number;
  mentorCode?: string;
  routeMapCodes?: string[];
  replacedQuestCode?: string | null;
  replacedQuestStage?: number | null;
  replacedStoryKills?: number | null;
  replacedProofKills?: number | null;
  currentProfessionCode?: string | null;
  currentProfessionCompletedAt?: string | null;
  characterLevel?: number;
  baseProfession?: string | null;
  storyKills?: number;
  proofKills?: number;
  requiredKills?: number;
  targetText?: string;
  routeName?: string;
  materialCode?: string;
  materialName?: string;
  materialCount?: number;
  materialOwnedBefore?: number;
  materialBindingBefore?: { unbound: number; trade: number; personal: number };
  materialBindingUsed?: { unbound: number; trade: number; personal: number };
};
export type AdvancedProfessionPreview = {
  ok: true; token: string; idempotencyKey: string; expiresAt: string;
  quote: AdvancedQuestQuote; serverTime: string;
};
export type AdvancedProfessionConfirm = {
  ok: true; result: AdvancedQuestQuote; refresh: string[]; serverTime: string;
};
export type AdvancedTrialStart = {
  ok: true; kind: 'battle_started' | 'battle_recovered'; professionCode: string; spawnId: number;
  sessionId: string; panel: Panel | null; serverTime: string;
};
export type AdvancedTrialStarted = AdvancedTrialStart & { panel: Panel };

const root = '/advanced-professions';
const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const advancedProfessionStatus = () => request<AdvancedProfessionStatus>(root);
export const advancedProfessionDetail = (code: string) =>
  request<AdvancedProfessionDetail>(`${root}/${encodeURIComponent(code)}`);
export const previewAdvancedProfessionAction = (code: string, action: AdvancedQuestAction) =>
  post<AdvancedProfessionPreview>(`${root}/${encodeURIComponent(code)}/preview`, { action });
export const confirmAdvancedProfessionAction = (token: string, idempotencyKey: string) =>
  post<AdvancedProfessionConfirm>(`${root}/confirm`, { token, idempotencyKey });
export const startAdvancedProfessionTrial = (code: string, idempotencyKey: string) =>
  post<AdvancedTrialStart>(`${root}/${encodeURIComponent(code)}/trial/start`, { idempotencyKey });
