import { gameAssetUrl } from './game-assets';

/** Original imagegen atlas. Pixel windows preserve proportions without editing the PNG. */
export const GAME_UI_ICON_ATLAS = '/assets/light-anime/game-ui-v2/icons.webp';
export const GAME_UI_ICON_ATLAS_SIZE = { width: 1024, height: 1536 } as const;

// Artwork centers vary slightly from the nominal 4 × 6 grid; each square includes
// its complete icon and a transparent gutter, keeping adjacent sprites outside it.
export const GAME_UI_ICON_FRAMES = {
  heart: { x: 37, y: 55, size: 212 },
  mana: { x: 269, y: 40, size: 236 },
  stamina: { x: 512, y: 36, size: 232 },
  mail: { x: 774, y: 50, size: 216 },
  settings: { x: 35, y: 286, size: 216 },
  search: { x: 292, y: 288, size: 218 },
  close: { x: 549, y: 302, size: 188 },
  sword: { x: 778, y: 282, size: 220 },
  shield: { x: 25, y: 518, size: 234 },
  star: { x: 281, y: 530, size: 212 },
  coin: { x: 529, y: 531, size: 216 },
  party: { x: 759, y: 510, size: 256 },
  map: { x: 21, y: 761, size: 232 },
  book: { x: 259, y: 760, size: 256 },
  scroll: { x: 521, y: 768, size: 234 },
  home: { x: 756, y: 751, size: 252 },
  paw: { x: 36, y: 1021, size: 208 },
  arrow: { x: 278, y: 1017, size: 218 },
  check: { x: 531, y: 1022, size: 218 },
  flame: { x: 763, y: 1003, size: 250 },
  leaf: { x: 37, y: 1254, size: 228 },
  moon: { x: 286, y: 1266, size: 214 },
  plus: { x: 531, y: 1269, size: 210 },
  minus: { x: 777, y: 1270, size: 212 },
} as const;

export type GameUiIconName = keyof typeof GAME_UI_ICON_FRAMES;

export function gameUiIconStyle(name: GameUiIconName) {
  const frame = GAME_UI_ICON_FRAMES[name];
  return {
    backgroundImage: `url("${gameAssetUrl(GAME_UI_ICON_ATLAS)}")`,
    backgroundSize: `${GAME_UI_ICON_ATLAS_SIZE.width / frame.size * 100}% ${GAME_UI_ICON_ATLAS_SIZE.height / frame.size * 100}%`,
    backgroundPosition: `${frame.x / (GAME_UI_ICON_ATLAS_SIZE.width - frame.size) * 100}% ${frame.y / (GAME_UI_ICON_ATLAS_SIZE.height - frame.size) * 100}%`,
  };
}
