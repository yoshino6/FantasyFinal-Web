/** A replaced file gets a new URL; unchanged files keep their browser cache. */
// Vite reads the portrait registry while constructing this compile-time value.
export const GAME_ASSETS = typeof __FF_BOOT_ASSETS__ === 'undefined' ? [] : __FF_BOOT_ASSETS__;
let assetHashes: Map<string, string> | undefined;

export function gameAssetUrl(path: string): string {
  assetHashes ??= new Map(GAME_ASSETS.map(asset => [asset.path, asset.hash]));
  const pathname = path.split('?')[0];
  const hash = assetHashes.get(pathname);
  return hash ? `${pathname}?ffv=${hash}` : pathname;
}
