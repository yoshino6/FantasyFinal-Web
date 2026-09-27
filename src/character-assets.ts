import type { PanelPortrait } from './api';

/**
 * 角色立绘资源注册表。
 *
 * 服务端只返回语义键，浏览器在这里解析为 1080×1920（9:16）的透明 PNG。
 */
export const CHARACTER_BASE_ASSETS: Record<string, string> = {
  player_male_initial: '/assets/character/player-male-initial.png',
  player_female_initial: '/assets/character/player-female-initial.png',
  profession_warrior_male: '/assets/character/profession-warrior-male.png',
  profession_warrior_female: '/assets/character/profession-warrior-female.png',
  profession_mage_male: '/assets/character/profession-mage-male.png',
  profession_mage_female: '/assets/character/profession-mage-female.png',
  profession_rogue_male: '/assets/character/profession-rogue-male.png',
  profession_rogue_female: '/assets/character/profession-rogue-female.png',
  profession_priest_male: '/assets/character/profession-priest-male.png',
  profession_priest_female: '/assets/character/profession-priest-female.png',
  profession_archer_male: '/assets/character/profession-archer-male.png',
  profession_archer_female: '/assets/character/profession-archer-female.png'
};

export const portraitBaseAsset = (portrait?: PanelPortrait): string =>
  CHARACTER_BASE_ASSETS[portrait?.baseKey ?? 'player_male_initial'] ?? CHARACTER_BASE_ASSETS.player_male_initial!;
