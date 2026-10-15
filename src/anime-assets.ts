import { gameAssetUrl } from './game-assets';

export type AnimeNavName = 'character' | 'inventory' | 'explore' | 'social' | 'world';
const asset = (name: string) => gameAssetUrl(`/assets/light-anime/${name}`);

/** Independent artwork; never use full-page design mockups as CSS backgrounds. */
export const ANIME_NAV_ART: Record<AnimeNavName, string> = {
  character: asset('nav-character.webp'),
  inventory: asset('nav-inventory.webp'),
  explore: asset('nav-explore.webp'),
  social: asset('nav-social.webp'),
  world: asset('nav-world.webp'),
};

export const ANIME_SCENES = {
  forest: asset('forest-world.webp'),
  city: asset('city-scene.webp'),
  auth: asset('auth-adventure.webp'),
} as const;

/** Full viewport environments. Live portraits, panels and tabs render in front. */
export const ANIME_MAIN_SCENES: Record<AnimeNavName, string> = {
  character: asset('main-scenes-v1/character-wide.webp'),
  inventory: asset('main-scenes-v1/inventory-wide.webp'),
  explore: ANIME_SCENES.city,
  social: asset('main-scenes-v1/social-wide.webp'),
  world: asset('main-scenes-v1/world-wide.webp'),
};

/** Wide environment illustrations; forms, panels and the original logo remain separate DOM. */
export const ANIME_AUTH_ART = {
  login: asset('auth-v4/login-scene-wide-v1.webp'),
  register: asset('auth-v4/register-scene-wide-v1.webp'),
} as const;
export const ANIME_LOGO = asset('auth-v4/fantasy-logo.webp');

export const ANIME_FRAMES = {
  paper: asset('paper-frame.svg'),
  tab: asset('tab-frame.svg'),
  teal: asset('button-teal.svg'),
  coral: asset('button-coral.svg'),
  neutral: asset('button-paper.svg'),
  wood: asset('wood-sign.svg'),
} as const;
