import { gameAssetUrl } from './game-assets';
import type { StoryIllustration } from './api';

/** Only the bundled story directory can be selected by a story-image DTO. */
export function storyImageUrl(image: StoryIllustration | undefined): string | null {
  if (!image || !/^\/assets\/story\/[a-zA-Z0-9_-]+\.(?:png|webp|jpe?g)$/.test(image.path)) return null;
  return gameAssetUrl(image.path);
}
