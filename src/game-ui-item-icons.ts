import { gameAssetUrl } from './game-assets';

type SpriteFrame = { readonly x: number; readonly y: number; readonly size: number };
type AtlasSize = { readonly width: number; readonly height: number };

/** Generic category artwork, never a substitute identity for a named item. */
export const GAME_UI_ITEM_ATLAS = '/assets/light-anime/game-ui-v1/item-fallbacks.webp';
export const GAME_UI_ITEM_ATLAS_SIZE = { width: 1024, height: 1536 } as const;
export const GAME_UI_ITEM_FRAMES = {
  all: { x: 16, y: 23, size: 231 },
  weapon: { x: 272, y: 17, size: 243 },
  armor: { x: 519, y: 34, size: 227 },
  accessory: { x: 798, y: 50, size: 193 },
  helmet: { x: 9, y: 276, size: 232 },
  boots: { x: 257, y: 274, size: 242 },
  map: { x: 520, y: 262, size: 255 },
  card: { x: 780, y: 266, size: 238 },
  quest: { x: 16, y: 523, size: 239 },
  potion: { x: 262, y: 524, size: 237 },
  food: { x: 517, y: 538, size: 244 },
  crystal: { x: 777, y: 521, size: 239 },
  wood: { x: 18, y: 774, size: 232 },
  herb: { x: 269, y: 760, size: 239 },
  hide: { x: 516, y: 765, size: 245 },
  material: { x: 771, y: 772, size: 236 },
  book: { x: 15, y: 1003, size: 241 },
  injection: { x: 257, y: 995, size: 243 },
  'furniture-bed': { x: 521, y: 992, size: 247 },
  'furniture-desk': { x: 783, y: 1011, size: 225 },
  'furniture-chest': { x: 16, y: 1252, size: 233 },
  'injection-coral': { x: 258, y: 1237, size: 248 },
  'injection-purple': { x: 508, y: 1239, size: 251 },
  unknown: { x: 778, y: 1258, size: 229 },
} as const satisfies Record<string, SpriteFrame>;

/** Painted neutral equipment silhouettes for empty slots. */
export const GAME_UI_GEAR_ATLAS = '/assets/light-anime/game-ui-v1/gear-slots.webp';
export const GAME_UI_GEAR_ATLAS_SIZE = { width: 1448, height: 1086 } as const;
export const GAME_UI_GEAR_FRAMES = {
  weapon: { x: 35, y: 24, size: 333 },
  offhand: { x: 397, y: 35, size: 321 },
  shoulder: { x: 719, y: 22, size: 358 },
  upper: { x: 1098, y: 58, size: 309 },
  waist: { x: 38, y: 371, size: 337 },
  lower: { x: 393, y: 369, size: 329 },
  feet: { x: 729, y: 390, size: 318 },
  necklace: { x: 1107, y: 386, size: 320 },
  bracelet: { x: 42, y: 728, size: 318 },
  ring: { x: 427, y: 760, size: 242 },
  helmet: { x: 731, y: 716, size: 330 },
  gloves: { x: 1089, y: 723, size: 329 },
} as const satisfies Record<string, SpriteFrame>;

export type GameUiItemIconName = keyof typeof GAME_UI_ITEM_FRAMES;
export type GameUiGearIconName = keyof typeof GAME_UI_GEAR_FRAMES;

function atlasStyle(path: string, atlas: AtlasSize, frame: SpriteFrame) {
  return {
    backgroundImage: `url("${gameAssetUrl(path)}")`,
    backgroundSize: `${atlas.width / frame.size * 100}% ${atlas.height / frame.size * 100}%`,
    backgroundPosition: `${frame.x / (atlas.width - frame.size) * 100}% ${frame.y / (atlas.height - frame.size) * 100}%`,
  };
}

export function gameUiItemIconStyle(name: GameUiItemIconName) {
  const frame = Object.prototype.hasOwnProperty.call(GAME_UI_ITEM_FRAMES, name)
    ? GAME_UI_ITEM_FRAMES[name] : GAME_UI_ITEM_FRAMES.unknown;
  return atlasStyle(GAME_UI_ITEM_ATLAS, GAME_UI_ITEM_ATLAS_SIZE, frame);
}

export function gameUiGearIconStyle(name: string) {
  const frame = Object.prototype.hasOwnProperty.call(GAME_UI_GEAR_FRAMES, name)
    ? GAME_UI_GEAR_FRAMES[name as GameUiGearIconName] : GAME_UI_GEAR_FRAMES.ring;
  return atlasStyle(GAME_UI_GEAR_ATLAS, GAME_UI_GEAR_ATLAS_SIZE, frame);
}
