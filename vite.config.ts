import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { CHARACTER_ADVANCED_ASSETS, CHARACTER_BASE_ASSETS, CHARACTER_VARIANT_ASSETS } from './src/character-assets';
import { COMMON_ASSET_PATHS } from './src/common-asset-paths';
import storyManifest from './src/story-illustrations-manifest.json';

const startupStartedAt = performance.now();
let startupStep = 0;
let stepStartedAt = startupStartedAt;

function startupLog(message: string) {
  console.info(`[Web 启动 +${((performance.now() - startupStartedAt) / 1000).toFixed(1)}秒] ${message}`);
}

function startStep(step: number, message: string) {
  startupStep = step;
  stepStartedAt = performance.now();
  startupLog(`[${step}/6] ${message}…`);
}

function finishStep(message: string) {
  startupLog(`[${startupStep}/6] ${message}（本阶段 ${((performance.now() - stepStartedAt) / 1000).toFixed(1)}秒）`);
}

startupLog('开始读取 Web 配置并准备资源清单');

const webRoot = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(webRoot, 'public');
const imageExtensions = /\.(?:png|svg|webp|jpe?g|gif|avif|mp3|ogg|wav|woff2?)$/i;
const paths = new Set<string>();
const commonAssetPaths = new Set<string>(COMMON_ASSET_PATHS);
// Only the public entry artwork/frames block boot; gameplay assets stay demand-loaded.
const criticalPaths = [
  '/assets/light-anime/auth-v4/fantasy-logo.webp',
  '/assets/light-anime/auth-v4/loading-scene-wide-v1.webp',
  '/assets/light-anime/auth-v4/login-scene-wide-v1.webp',
  '/assets/light-anime/auth-v4/register-scene-wide-v1.webp',
  '/assets/light-anime/auth-v4/login-button.png',
  '/assets/light-anime/auth-v4/paper-panel-v1.webp'
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
startStep(1, '扫描页面与组件的资源引用');
let sourceCount = 0;
for (const source of [join(webRoot, 'index.html'), ...filesIn(join(webRoot, 'src'))]) {
  if (!/\.(?:vue|ts|css|html)$/.test(source) || source.endsWith('character-assets.ts')) continue;
  sourceCount++;
  const text = readFileSync(source, 'utf8');
  for (const match of text.matchAll(/\/assets\/[a-zA-Z0-9_./-]+\.(?:png|svg|webp|jpe?g|gif|avif|mp3|ogg|wav|woff2?)/g)) addAsset(match[0]);
}
finishStep(`页面扫描完成：${sourceCount} 个源码文件，累计 ${paths.size} 项资源`);

// Keep all released resources versioned; this registry does not preload them.
startStep(2, '检查角色立绘与职业资源');
for (const path of Object.values(CHARACTER_BASE_ASSETS)) addAsset(path);
for (const path of Object.values(CHARACTER_ADVANCED_ASSETS)) addAsset(path);
// Variants are released incrementally and remain demand-loaded gameplay assets.
for (const registry of Object.values(CHARACTER_VARIANT_ASSETS)) {
  for (const path of Object.values(registry)) {
    if (existsSync(join(publicRoot, path.slice(1)))) addAsset(path);
  }
}
finishStep(`角色资源检查完成，累计 ${paths.size} 项资源`);

// Story illustrations receive content versions and load when displayed.
startStep(3, '检查剧情插画资源');
for (const scene of storyManifest.scenes as { file: string }[]) {
  if (!/^[a-zA-Z0-9_-]+\.(?:png|webp|jpe?g)$/.test(scene.file)) throw new Error(`剧情资源文件名无效：${scene.file}`);
  addAsset(`/assets/story/${scene.file}`);
}
finishStep(`剧情插画检查完成：${storyManifest.scenes.length} 个场景，累计 ${paths.size} 项资源`);

// Inventory art includes semantic families plus a code-addressed catalogue.
// Monster materials already resolve to their final purified material families.
startStep(4, '扫描物品、音频与界面资源');
const itemSource = readFileSync(join(webRoot, 'src/item-assets.ts'), 'utf8');
for (const match of itemSource.matchAll(/['"]([a-zA-Z0-9_/-]+)['"]/g)) {
  const path = `/assets/items/${match[1]}.png`;
  if (existsSync(join(publicRoot, path.slice(1)))) addAsset(path);
}
for (const directory of ['assets/items/catalog', 'assets/audio', 'assets/light-anime']) {
  startupLog(`[4/6] 正在扫描 /${directory}`);
  const files = filesIn(join(publicRoot, directory));
  for (const file of files) {
    if (imageExtensions.test(file)) addAsset(`/${relative(publicRoot, file).replaceAll('\\', '/')}`);
  }
  startupLog(`[4/6] /${directory} 扫描完成：${files.length} 个文件，累计 ${paths.size} 项资源`);
}
finishStep(`资源扫描完成，共 ${paths.size} 项资源`);

startStep(5, `读取 ${paths.size} 项资源并计算内容版本`);
let hashedBytes = 0;
let lastHashLogAt = performance.now();
const bootAssets = [...paths].sort((a, b) => {
  const aCritical = criticalPaths.indexOf(a);
  const bCritical = criticalPaths.indexOf(b);
  return (aCritical < 0 ? 99 : aCritical) - (bCritical < 0 ? 99 : bCritical) || a.localeCompare(b);
}).map((path, index) => {
  const contents = readFileSync(join(publicRoot, path.slice(1)));
  const asset = { path, hash: createHash('sha256').update(contents).digest('hex').slice(0, 16), bytes: contents.byteLength };
  hashedBytes += asset.bytes;
  const now = performance.now();
  if (now - lastHashLogAt >= 1000 || index + 1 === paths.size) {
    startupLog(`[5/6] 版本计算进度：${index + 1}/${paths.size}（${((index + 1) / paths.size * 100).toFixed(1)}%），已读取 ${(hashedBytes / 1024 / 1024).toFixed(1)} MiB，当前 ${path}`);
    lastHashLogAt = now;
  }
  return asset;
});
const bootAssetRevision = createHash('sha256').update(JSON.stringify(bootAssets.filter(asset => criticalPaths.includes(asset.path)))).digest('hex').slice(0, 12);
const assetHashes = new Map(bootAssets.map(asset => [asset.path, asset.hash]));
const sourceRoot = join(webRoot, 'src').replaceAll('\\', '/');
finishStep(`资源清单准备完成：${bootAssets.length} 项，共 ${(hashedBytes / 1024 / 1024).toFixed(1)} MiB`);

function versionStaticUrls(source: string): string {
  return source.replace(/\/assets\/[a-zA-Z0-9_./-]+\.(?:png|svg|webp|jpe?g|gif|avif|mp3|ogg|wav|woff2?)(?![a-zA-Z0-9_?])/g,
    path => assetHashes.has(path) ? `${path}?ffv=${assetHashes.get(path)}` : path);
}

export default defineConfig(({ command }) => ({
  // Keep the startup stages visible after Vite prints its ready banner.
  clearScreen: false,
  plugins: [{
    name: 'ff-game-asset-manifest',
    enforce: 'pre',
    configureServer(server) {
      startStep(6, '初始化 Web 开发服务器与接口代理');
      server.httpServer?.once('listening', () => finishStep('Web 开发服务器已开始监听，可以打开下方访问地址'));
    },
    transform(source, id) {
      const path = id.split('?')[0].replaceAll('\\', '/');
      // Dynamic registries apply gameAssetUrl after selecting a complete path.
      if (!path.startsWith(`${sourceRoot}/`) || !/\.(?:vue|ts|css)$/.test(path)
        || /(?:character-assets|item-assets|bgm|game-assets|boot-assets|common-asset-paths)\.ts$/.test(path)) return null;
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
    // Vite injects defines into its development client. Keep that client small;
    // portrait availability and public preloading also use this manifest.
    // Boot preloading independently filters only the login artwork.
    __FF_BOOT_ASSETS__: JSON.stringify(command === 'serve'
      ? bootAssets.filter(asset => criticalPaths.includes(asset.path)
        || commonAssetPaths.has(asset.path)
        || Object.values(CHARACTER_VARIANT_ASSETS).some(registry => Object.values(registry).includes(asset.path))) : bootAssets)
  },
  // Only the application is an entry. Historical previews under design contain
  // hundreds of HTML files and must not become dependency-scanning roots.
  optimizeDeps: {
    entries: ['index.html'],
    include: ['vue']
  },
  server: {
    port: 4173,
    watch: {
      // Keep generated previews, galleries and audit reports out of the source
      // watcher. Public artwork and application files still update normally.
      ignored: ['**/design/**']
    },
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
}));
