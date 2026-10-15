import { gameAssetUrl } from './game-assets';

/** 精确对应服务端职业代码；每个职业使用独立的生图 PNG。 */
export const PROFESSION_ICON_NAMES = {
  warrior: '战士',
  mage: '法师',
  rogue: '盗贼',
  priest: '牧师',
  archer: '射手',
  bulwark_guard: '盾卫',
  war_lord: '战旗使',
  ironbreaker: '剑豪',
  elementalist: '元素使',
  spirit_summoner: '唤灵师',
  spellblade: '战斗法师',
  nightblade: '夜刃',
  venomancer: '蚀毒师',
  trickster_ranger: '机关游侠',
  saint_healer: '圣愈者',
  aegis_priest: '圣盾使',
  sharpshooter: '神射手',
  gunner: '枪炮师',
  ranger_warden: '林巡',
  dawn_inquisitor: '晨星祷者',
  arcane_magister: '魔导',
  sword_shadow: '剑影',
  titan: '泰坦',
  master_thief: '妙手',
  holy_knight: '圣骑',
  stringblade: '弦刃使',
  magical_scholar: '魔学者',
  weapon_master: '御器师',
  inventor: '发明家',
  tactician: '执奕者'
} as const;

export type ProfessionIconCode = keyof typeof PROFESSION_ICON_NAMES | 'novice';
const professionCodesByName = new Map<string, ProfessionIconCode>(
  Object.entries(PROFESSION_ICON_NAMES).map(([code, name]) => [name, code as ProfessionIconCode])
);

export function resolveProfessionIconCode(code?: string | null, name?: string | null): ProfessionIconCode {
  if (code && Object.prototype.hasOwnProperty.call(PROFESSION_ICON_NAMES, code)) return code as ProfessionIconCode;
  return professionCodesByName.get(name ?? '') ?? 'novice';
}

export function professionIconUrl(code: ProfessionIconCode): string {
  return gameAssetUrl(`/assets/light-anime/professions-imagegen-v1/${code}.png`);
}
