import type { PanelPortrait } from './api';
import { GAME_ASSETS, gameAssetUrl } from './game-assets';

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

export type CharacterPortraitVariant = 'default' | 'profile' | 'equipment';
type DrawnPortraitVariant = Exclude<CharacterPortraitVariant, 'default'>;

/** 新图按既有语义键注册；未发布的变体不会触发图片请求。 */
export const CHARACTER_VARIANT_ASSETS = Object.fromEntries(
  (['profile', 'equipment'] as const).map(variant => [variant, Object.fromEntries(
    Object.entries({ ...CHARACTER_BASE_ASSETS, ...CHARACTER_ADVANCED_ASSETS }).map(([key, path]) => [
      key, `/assets/character/light-anime-v1/${path.split('/').pop()!.replace(/\.png$/, '')}-${variant}.webp`
    ])
  )])
) as Record<DrawnPortraitVariant, Record<string, string>>;

/** 林巡三异兽立绘使用独立修订目录；其它职业与默认回退图保持原路径。 */
for (const gender of ['male', 'female'] as const) {
  for (const variant of ['profile', 'equipment'] as const) {
    CHARACTER_VARIANT_ASSETS[variant][`advanced_ranger_warden_${gender}`]
      = `/assets/character/ranger-three-beasts-v2/advanced-ranger_warden-${gender}-${variant}.webp`;
  }
}

const releasedCharacterPaths = new Set(GAME_ASSETS.map(asset => asset.path));

/** 仅使用当前立绘；二转资源不可用时回退到当前一转立绘。 */
export const portraitAssetCandidates = (portrait?: PanelPortrait, variant: CharacterPortraitVariant = 'default'): string[] => {
  const key = portrait?.baseKey ?? 'player_male_initial';
  if (variant !== 'default') {
    const path = CHARACTER_VARIANT_ASSETS[variant][key];
    const current = portraitAssetCandidates(portrait);
    return path && releasedCharacterPaths.has(path) ? [gameAssetUrl(path), ...current] : current;
  }
  const fallbackKey = portrait?.fallbackKey && CHARACTER_BASE_ASSETS[portrait.fallbackKey]
    ? portrait.fallbackKey : 'player_male_initial';
  if (CHARACTER_BASE_ASSETS[key]) return [gameAssetUrl(CHARACTER_BASE_ASSETS[key])];
  const candidates = [CHARACTER_ADVANCED_ASSETS[key], CHARACTER_BASE_ASSETS[fallbackKey]]
    .filter((path): path is string => Boolean(path));
  return candidates.map(gameAssetUrl);
};

export const portraitBaseAsset = (portrait?: PanelPortrait): string =>
  portraitAssetCandidates(portrait)[0]!;
