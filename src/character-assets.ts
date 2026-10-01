import type { PanelPortrait } from './api';
import { gameAssetUrl } from './game-assets';

/**
 * 角色立绘资源注册表。
 *
 * 服务端只返回语义键，浏览器在这里解析为 9:16 的透明 PNG。
 */
export const CHARACTER_BASE_ASSETS: Record<string, string> = {
  player_male_initial: '/assets/character/v2/player-male-initial.png',
  player_female_initial: '/assets/character/v2/player-female-initial.png',
  profession_warrior_male: '/assets/character/v2/profession-warrior-male.png',
  profession_warrior_female: '/assets/character/v2/profession-warrior-female.png',
  profession_mage_male: '/assets/character/v2/profession-mage-male.png',
  profession_mage_female: '/assets/character/v2/profession-mage-female.png',
  profession_rogue_male: '/assets/character/v2/profession-rogue-male.png',
  profession_rogue_female: '/assets/character/v2/profession-rogue-female.png',
  profession_priest_male: '/assets/character/v2/profession-priest-male.png',
  profession_priest_female: '/assets/character/v2/profession-priest-female.png',
  profession_archer_male: '/assets/character/v2/profession-archer-male.png',
  profession_archer_female: '/assets/character/v2/profession-archer-female.png'
};

/** 二转职业代码与游戏服务的已注册职业目录保持一致。 */
const ADVANCED_PROFESSION_CODES = [
  'bulwark_guard', 'war_lord', 'ironbreaker', 'elementalist', 'spellblade',
  'nightblade', 'venomancer', 'trickster_ranger', 'saint_healer', 'aegis_priest',
  'sharpshooter', 'gunner', 'ranger_warden', 'dawn_inquisitor', 'arcane_magister',
  'sword_shadow', 'titan', 'spirit_summoner', 'master_thief', 'holy_knight',
  'stringblade', 'magical_scholar', 'weapon_master', 'inventor', 'tactician'
] as const;

const REDRAWN_COMPANION_CODES = new Set(['ranger_warden', 'spirit_summoner']);

export const CHARACTER_ADVANCED_ASSETS: Record<string, string> = Object.fromEntries(
  ADVANCED_PROFESSION_CODES.flatMap(code => (['male', 'female'] as const).map(gender =>
    [`advanced_${code}_${gender}`, `/assets/character/${REDRAWN_COMPANION_CODES.has(code) ? 'v4' : 'v2'}/advanced-${code}-${gender}.png`]))
);

/** 仅使用当前立绘；二转资源不可用时回退到当前一转立绘。 */
export const portraitAssetCandidates = (portrait?: PanelPortrait): string[] => {
  const key = portrait?.baseKey ?? 'player_male_initial';
  const fallbackKey = portrait?.fallbackKey && CHARACTER_BASE_ASSETS[portrait.fallbackKey]
    ? portrait.fallbackKey : 'player_male_initial';
  if (CHARACTER_BASE_ASSETS[key]) return [gameAssetUrl(CHARACTER_BASE_ASSETS[key])];
  const candidates = [CHARACTER_ADVANCED_ASSETS[key], CHARACTER_BASE_ASSETS[fallbackKey]]
    .filter((path): path is string => Boolean(path));
  return candidates.map(gameAssetUrl);
};

export const portraitBaseAsset = (portrait?: PanelPortrait): string =>
  portraitAssetCandidates(portrait)[0]!;
