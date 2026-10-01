import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { CHARACTER_ADVANCED_ASSETS, CHARACTER_BASE_ASSETS } from './src/character-assets';
import storyManifest from '../server/src/assets/game/story/illustrations/manifest.json';

const webRoot = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(webRoot, 'public');
const imageExtensions = /\.(?:png|webp|jpe?g|gif|avif|mp3|ogg|wav|woff2?)$/i;
const paths = new Set<string>();
const criticalPaths = [
  '/assets/loading/forest.webp', '/assets/loading/pear.png',
  '/assets/loading/ball-rabbit.png', '/assets/loading/fantasy-logo.webp',
  '/assets/loading/login-hero.webp'
];

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

function addAsset(path: string) {
  if (!existsSync(join(publicRoot, path.slice(1)))) throw new Error(`游戏资源不存在：${path}`);
  paths.add(path);
}

// Include literal UI references as they are added, rather than maintaining a
// second, easily outdated list of screen/navigation artwork.
for (const source of [join(webRoot, 'index.html'), ...filesIn(join(webRoot, 'src'))]) {
  if (!/\.(?:vue|ts|css|html)$/.test(source) || source.endsWith('character-assets.ts')) continue;
  const text = readFileSync(source, 'utf8');
  for (const match of text.matchAll(/\/assets\/[a-zA-Z0-9_./-]+\.(?:png|webp|jpe?g|gif|avif|mp3|ogg|wav|woff2?)/g)) addAsset(match[0]);
}

// All current portraits, including first-profession fallbacks, are required at boot.
for (const path of Object.values(CHARACTER_BASE_ASSETS)) addAsset(path);
for (const path of Object.values(CHARACTER_ADVANCED_ASSETS)) addAsset(path);

// Every released story illustration is required at boot and receives the same
// content version and local cache guarantees as portraits and inventory art.
for (const scene of storyManifest.scenes as { file: string }[]) {
  if (!/^[a-zA-Z0-9_-]+\.(?:png|webp|jpe?g)$/.test(scene.file)) throw new Error(`剧情资源文件名无效：${scene.file}`);
  addAsset(`/assets/story/${scene.file}`);
}

// Inventory art includes semantic families plus a code-addressed catalogue.
// Monster materials already resolve to their final purified material families.
const itemSource = readFileSync(join(webRoot, 'src/item-assets.ts'), 'utf8');
for (const match of itemSource.matchAll(/['"]([a-zA-Z0-9_/-]+)['"]/g)) {
  const path = `/assets/items/${match[1]}.png`;
  if (existsSync(join(publicRoot, path.slice(1)))) addAsset(path);
}
for (const directory of ['assets/items/catalog', 'assets/audio']) {
  for (const file of filesIn(join(publicRoot, directory))) {
    if (imageExtensions.test(file)) addAsset(`/${relative(publicRoot, file).replaceAll('\\', '/')}`);
  }
}

const bootAssets = [...paths].sort((a, b) => {
  const aCritical = criticalPaths.indexOf(a);
  const bCritical = criticalPaths.indexOf(b);
  return (aCritical < 0 ? 99 : aCritical) - (bCritical < 0 ? 99 : bCritical) || a.localeCompare(b);
}).map(path => {
  const contents = readFileSync(join(publicRoot, path.slice(1)));
  return { path, hash: createHash('sha256').update(contents).digest('hex').slice(0, 16), bytes: contents.byteLength };
});
const bootAssetRevision = createHash('sha256').update(JSON.stringify(bootAssets)).digest('hex').slice(0, 12);
const assetHashes = new Map(bootAssets.map(asset => [asset.path, asset.hash]));
const sourceRoot = join(webRoot, 'src').replaceAll('\\', '/');

function versionStaticUrls(source: string): string {
  return source.replace(/\/assets\/[a-zA-Z0-9_./-]+\.(?:png|webp|jpe?g|gif|avif|mp3|ogg|wav|woff2?)(?![a-zA-Z0-9_?])/g,
    path => assetHashes.has(path) ? `${path}?ffv=${assetHashes.get(path)}` : path);
}

export default defineConfig({
  plugins: [{
    name: 'ff-game-asset-manifest',
    enforce: 'pre',
    transform(source, id) {
      const path = id.split('?')[0].replaceAll('\\', '/');
      // Dynamic registries apply gameAssetUrl after selecting a complete path.
      if (!path.startsWith(`${sourceRoot}/`) || !/\.(?:vue|ts|css)$/.test(path)
        || /(?:character-assets|item-assets|bgm|game-assets|boot-assets)\.ts$/.test(path)) return null;
      const transformed = versionStaticUrls(source);
      return transformed === source ? null : { code: transformed, map: null };
    },
    transformIndexHtml(html) {
      return versionStaticUrls(html.replace('__FF_BOOT_ASSET_REVISION__', bootAssetRevision));
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'game-assets.json', source: JSON.stringify({ revision: bootAssetRevision, assets: bootAssets }) });
    }
  }, vue()],
  define: {
    __FF_BOOT_ASSET_REVISION__: JSON.stringify(bootAssetRevision),
    __FF_BOOT_ASSETS__: JSON.stringify(bootAssets)
  },
  server: {
    port: 4173,
    proxy: {
      '/api': { target: process.env.FF_APP_API_TARGET || 'http://127.0.0.1:17117', ws: true }
    }
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: { manualChunks: { vue: ['vue'] } }
    }
  }
});
