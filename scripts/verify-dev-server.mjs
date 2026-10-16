import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, relative } from 'node:path';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const cacheParent = join(root, 'node_modules');
const cacheDir = await mkdtemp(join(cacheParent, '.vite-dev-server-verify-'));
const started = performance.now();
let vite;
let http;

try {
  // A real OS-assigned port avoids changing or restarting the user's server.
  // Vite 6 treats its own port: 0 as the default port, so host its middleware.
  vite = await createServer({
    root,
    configFile: join(root, 'vite.config.ts'),
    cacheDir,
    server: { middlewareMode: true, hmr: false }
  });
  assert.deepEqual(vite.config.optimizeDeps.entries, ['index.html']);
  assert.ok(vite.config.optimizeDeps.include.includes('vue'));
  // The development manifest is intentionally small, but must still resolve
  // distinct profile/equipment portraits instead of silently using defaults.
  const developmentAssets = JSON.parse(vite.config.define.__FF_BOOT_ASSETS__);
  const commonRegistry = {};
  runInNewContext(ts.transpileModule(await readFile(join(root, 'src/common-asset-paths.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports: commonRegistry });
  const commonPaths = commonRegistry.COMMON_ASSET_PATHS;
  assert.equal(commonPaths.length, 11, 'Development retains only the shared public resource selection');
  const gameRegistry = {};
  runInNewContext(ts.transpileModule(await readFile(join(root, 'src/game-assets.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports: gameRegistry, __FF_BOOT_ASSETS__: developmentAssets });
  const assetsByPath = new Map(developmentAssets.map(asset => [asset.path, asset]));
  for (const path of commonPaths) {
    const asset = assetsByPath.get(path);
    assert.ok(asset, `Development preloading must share the rendered resource URL: ${path}`);
    assert.match(asset.hash, /^[a-f0-9]{16}$/, `Development preloading needs the current hash: ${path}`);
    assert.ok(asset.bytes > 0, `Development preload progress needs the resource size: ${path}`);
    assert.equal(gameRegistry.gameAssetUrl(path), `${path}?ffv=${asset.hash}`,
      `Development rendering and preloading share the current version URL: ${path}`);
  }
  const portraitRegistry = {};
  runInNewContext(ts.transpileModule(await readFile(join(root, 'src/character-assets.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports: portraitRegistry, require: id => {
    assert.equal(id, './game-assets');
    return { GAME_ASSETS: developmentAssets, gameAssetUrl: path => path };
  } });
  const released = new Set(developmentAssets.map(asset => asset.path));
  let portraitVariants = 0;
  for (const variant of ['profile', 'equipment']) {
    for (const [key, path] of Object.entries(portraitRegistry.CHARACTER_VARIANT_ASSETS[variant])) {
      assert.ok(released.has(path), `Development must release ${variant} ${key}`);
      assert.equal(portraitRegistry.portraitAssetCandidates({ baseKey: key }, variant)[0], path);
      portraitVariants++;
    }
  }
  assert.equal(portraitVariants, 124);

  http = createHttpServer(vite.middlewares);
  await new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', resolve);
  });
  const listenMs = Math.round(performance.now() - started);
  const address = http.address();
  assert.ok(address && typeof address !== 'string');

  // Chokidar's ready event can precede the completed directory bookkeeping on
  // Windows. Check its actual watch inventory, without traversing design.
  const watchDeadline = performance.now() + 10000;
  let watched;
  let directories;
  do {
    watched = vite.watcher.getWatched();
    directories = Object.keys(watched).map(path => path.replaceAll('\\', '/'));
    if (directories.some(path => path.endsWith('/web/src'))
      && directories.some(path => path.endsWith('/web/public'))) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (performance.now() < watchDeadline);
  assert.ok(directories.some(path => path.endsWith('/web/src')), 'Application source must stay watched');
  assert.ok(directories.some(path => path.endsWith('/web/public')), 'Public assets must stay watched');
  assert.ok(!directories.some(path => /\/design(?:\/|$)/.test(path)), 'Generated design previews must stay unwatched');

  const requestStarted = performance.now();
  const response = await fetch(`http://127.0.0.1:${address.port}/`, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="ff-boot"/);
  assert.match(html, /id="ff-boot-status"/);
  assert.match(html, /type="module" src="\/src\/main\.ts"/);
  assert.match(html, /loading-scene-wide-v1\.webp\?ffv=[a-f0-9]{16}/);
  assert.match(html, /fantasy-logo\.webp\?ffv=[a-f0-9]{16}/);
  const htmlMs = Math.round(performance.now() - requestStarted);
  const envResponse = await fetch(`http://127.0.0.1:${address.port}/node_modules/vite/dist/client/env.mjs`, {
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(envResponse.status, 200);
  const envSource = await envResponse.text();
  assert.ok(!envSource.includes('skills-imagegen-v2'), 'Development client must not inject the full gameplay manifest');
  assert.ok(envSource.includes('/assets/light-anime/auth-v4/fantasy-logo.webp'));
  const assetsResponse = await fetch(`http://127.0.0.1:${address.port}/src/game-assets.ts`, {
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(assetsResponse.status, 200);
  const assetsSource = await assetsResponse.text();
  assert.ok(!assetsSource.includes('skills-imagegen-v2'), 'Development game-assets module must not inline the full gameplay manifest');
  // Let Vite finish the scan before shutdown, otherwise esbuild reports many
  // cancelled resolver requests despite successful HTTP/watch checks.
  await vite.environments.client.depsOptimizer?.scanProcessing;
  await vite.waitForRequestsIdle();
  watched = vite.watcher.getWatched();
  directories = Object.keys(watched).map(path => path.replaceAll('\\', '/'));
  assert.ok(!directories.some(path => /\/design(?:\/|$)/.test(path)));
  const report = {
    listenMs,
    htmlMs,
    devEnvBytes: Buffer.byteLength(envSource),
    devAssetsModuleBytes: Buffer.byteLength(assetsSource),
    portraitVariants,
    commonPreloadAssets: commonPaths.length,
    watchDirectories: directories.length,
    watchEntries: Object.values(watched).reduce((sum, children) => sum + children.length, 0),
    designDirectories: 0,
    sourceWatched: true,
    publicWatched: true,
    rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024)
  };
  console.info(`Development startup checks passed: ${JSON.stringify(report)}`);
} finally {
  if (http) await new Promise(resolve => http.close(resolve));
  await vite?.close();
  const cacheRelative = relative(cacheParent, cacheDir);
  assert.ok(cacheRelative && !cacheRelative.startsWith('..') && !isAbsolute(cacheRelative));
  await rm(cacheDir, { recursive: true, force: true });
}
