import { gameAssetUrl } from './game-assets';

export const GAME_UI_ADVENTURE_ATLAS = '/assets/light-anime/game-ui-v1/adventure-icons-v2.webp';
export const GAME_UI_ADVENTURE_FRAMES = {
  tasks: [0, 0], footprints: [1, 0], codex: [2, 0],
  warrants: [0, 1], map: [1, 1], auto: [2, 1],
} as const;
export type GameUiAdventureArtName = keyof typeof GAME_UI_ADVENTURE_FRAMES;

export function gameUiAdventureArtStyle(name: GameUiAdventureArtName) {
  const [column, row] = GAME_UI_ADVENTURE_FRAMES[name] ?? GAME_UI_ADVENTURE_FRAMES.tasks;
  return {
    backgroundImage: `url("${gameAssetUrl(GAME_UI_ADVENTURE_ATLAS)}")`,
    backgroundSize: '300% 200%',
    backgroundPosition: `${column * 50}% ${row * 100}%`,
  };
}
