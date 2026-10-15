import { request } from './api';

export type SkillView = 'learned' | 'available';
export type SkillActionKind = 'learn' | 'upgrade' | 'specialization' | 'passive_link' | 'shortcut' | 'appraisal';
export type SkillSpecialization = 'overcharge' | 'instant' | 'efficient' | 'potent';
export type AppraisalDirection = 'range' | 'information';
export type SkillActionInput = {
  action: SkillActionKind; skillId: number;
  specialization?: SkillSpecialization; direction?: AppraisalDirection;
};
export type LearnedSkill = {
  id: number; code: string; name: string; category: string; tier: string;
  description?: string;
  level: number; quickSlot: number | null; passiveLinked: boolean;
};
export type AvailableSkill = {
  id: number; code: string; name: string; category: string; tier: string;
  description?: string;
  learnCost: number; canLearn: boolean; remainingSkillPoints?: number; reason?: string;
};
export type SkillPage<T extends LearnedSkill | AvailableSkill> = {
  ok: true; view: SkillView; page: number; totalPages: number; total: number;
  keyword: string; skillPoints: number; passiveLinkLimit: number;
  quickSlots: { slot: number; skillId: number; code: string; name: string }[];
  linkedPassives: { skillId: number; code: string; name: string }[];
  items: T[]; serverTime: string;
};
export type SkillEffect = {
  code: string; name: string; effect_type: string; value: number; duration: number;
  target_scope: 'enemy' | 'ally' | 'self'; trigger_timing: 'on_hit' | 'on_cast';
};
export type SkillCombatEffect = {
  text: string;
  descriptions?: { name: string; text: string }[];
};
export type SkillSpecializationDetail = {
  key: string; name: string; level: number; maxLevel: number | null;
  currentEffect: string; nextEffect: string | null; cost: number | null;
  action: 'specialization' | 'appraisal';
  specialization?: SkillSpecialization; direction?: AppraisalDirection;
};
export type SkillInfo = {
  id: number; code: string; name: string; category: string; tier: string; description: string;
  summary?: string; combatEffects?: SkillCombatEffect[];
  learned: boolean; level: number; maxLevel: number; skillPoints: number;
  learnCost: number; nextUpgradeCost: number | null; skillKind: string; element: string;
  rangeType: string; targetScope: string; requiredWeaponType: string | null;
  actualPower: number; actualManaCost: number; actualCooldown: number; actualChant: number;
  basePower?: number; baseManaCost?: number; baseCooldown?: number; baseChant?: number;
  passiveEffect?: Record<string, unknown>; weaponMastery?: boolean; characterLevel?: number;
  quickSlot: number | null; passiveLinked: boolean;
  specializations: Partial<Record<SkillSpecialization, number>>;
  specializationChoices: SkillSpecialization[];
  specializationUpgradeCosts: Partial<Record<SkillSpecialization, number | null>>;
  specializationMaxLevel: number; masteryProficiencyCost: number | null;
  masteryFocusCost: number | null; passiveSpecializable: boolean;
  appraisal: { rangeLevel: number; informationLevel: number } | null;
  specializationDetails?: SkillSpecializationDetail[];
  effectDetails: SkillEffect[];
};
export type SkillQuoteResult = {
  name?: string; cost?: number; level?: number; skillLevel?: number;
  specialization?: SkillSpecialization; direction?: AppraisalDirection;
  linked?: boolean; limit?: number; slot?: number | null;
  rangeLevel?: number; informationLevel?: number;
  [key: string]: unknown;
};
export type SkillQuote = {
  action: SkillActionKind; skillId: number;
  skillPointsBefore: number; skillPointsAfter: number; result: SkillQuoteResult;
};
export type SkillCandidateAction = SkillActionInput & { enabled: boolean; quote?: SkillQuote; reason?: string };
export type SkillDetail = { ok: true; skill: SkillInfo; actions: SkillCandidateAction[]; serverTime: string };
export type SkillPreview = {
  ok: true; token: string; idempotencyKey: string; expiresAt: string;
  quote: SkillQuote; serverTime: string;
};
export type SkillConfirm = { ok: true; result: SkillQuoteResult; refresh: string[]; serverTime: string };
const params = (query: Record<string, string | number>) => new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)])).toString();
export const skills = <T extends LearnedSkill | AvailableSkill>(view: SkillView, page = 1, keyword = '') =>
  request<SkillPage<T>>(`/skills?${params({ view, page, keyword })}`);
export const skillDetail = (skillId: number) => request<SkillDetail>(`/skills/${skillId}`);
export const previewSkillAction = (input: SkillActionInput) =>
  request<SkillPreview>('/skills/actions/preview', { method: 'POST', body: JSON.stringify(input) });
export const confirmSkillAction = (token: string, idempotencyKey: string) =>
  request<SkillConfirm>('/skills/actions/confirm', { method: 'POST', body: JSON.stringify({ token, idempotencyKey }) });
