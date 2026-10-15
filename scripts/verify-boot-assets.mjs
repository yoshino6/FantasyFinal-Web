import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const origin = 'https://game.test';
const bootSource = readFileSync(new URL('../src/boot-assets.ts', import.meta.url), 'utf8');
const bootPathSource = bootSource.match(/const bootPaths = new Set\(\[([\s\S]*?)\]\);/)?.[1];
assert.ok(bootPathSource, 'bootPaths must be available to derive all critical test fixtures');
const fixturePaths = [...bootPathSource.matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
assert.ok(fixturePaths.length >= 4, 'critical fixtures include every current boot path');
assert.equal(new Set(fixturePaths).size, fixturePaths.length, 'critical paths must be unique');
const data = new Map(fixturePaths.map((path, index) => [path, new Uint8Array(512 + index * 128).fill(index + 1)]));
const manifest = [...data].map(([path, bytes]) => ({ path, bytes: bytes.length,
  hash: createHash('sha256').update(bytes).digest('hex').slice(0, 16) }));
const assetUrl = path => `${path}?ffv=${manifest.find(asset => asset.path === path).hash}`;
const keyOf = request => new URL(typeof request === 'string' ? request : request.url, origin).href;

class MemoryCache {
  entries = new Map();
  quota = false;
  async match(request) { return this.entries.get(keyOf(request))?.clone(); }
  async put(request, response) {
    if (this.quota) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.entries.set(keyOf(request), response.clone());
  }
  async delete(request) { return this.entries.delete(keyOf(request)); }
  async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
}

const source = bootSource
  .replace("import { GAME_ASSETS, gameAssetUrl } from './game-assets';", '')
  .replaceAll('import.meta.env.DEV', 'false');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS
} }).outputText;

function setup({ http = false, quota = false, assets = manifest, existingCache } = {}) {
  const cache = existingCache ?? new MemoryCache();
  cache.quota = quota;
  const stats = { requests: [], cacheModes: [], active: 0, maximum: 0, failPath: '', corruptPath: '' };
  const exports = {};
  const storage = { open: async () => cache, keys: async () => ['ff-game-assets-v2'], delete: async () => true };
  const context = vm.createContext({ exports, GAME_ASSETS: assets,
    gameAssetUrl: path => `${path}?ffv=${assets.find(asset => asset.path === path).hash}`,
    window: http ? {} : { caches: storage }, caches: storage, location: { href: `${origin}/` },
    Response, Request, Blob, DOMException, AbortController, URL, crypto: webcrypto, performance,
    fetch: async (url, options) => {
      const path = new URL(url, origin).pathname;
      stats.requests.push(path);
      stats.cacheModes.push(options.cache);
      stats.active++;
      stats.maximum = Math.max(stats.maximum, stats.active);
      try {
        // Let other downloads finish before simulating a later connection failure.
        await new Promise(resolve => setTimeout(resolve, stats.failPath === path ? 60 : 8));
        options.signal.throwIfAborted();
        if (stats.failPath === path) throw new Error('Simulated interrupted download');
        const bytes = data.get(path).slice();
        if (stats.corruptPath === path) bytes[0]++;
        return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
      } finally { stats.active--; }
    }
  });
  vm.runInContext(compiled, context);
  const progress = [];
  const load = signal => exports.prepareBootAssets(value => progress.push(value),
    signal ?? new AbortController().signal, 'fixture-revision', false);
  return { cache, stats, progress, load };
}

const optional = ['/assets/story/unneeded.png', '/assets/light-anime/auth-v4/register-scene-wide-v1.webp',
  '/assets/light-anime/auth-v4/loading-scene-wide-v1.webp',
  '/assets/character/light-anime-v1/advanced-sharpshooter-female-profile.webp',
  '/assets/character/light-anime-v1/advanced-sharpshooter-female-equipment.webp'].map(path => ({ path, bytes: 100, hash: 'optional' }));
const selective = setup({ assets: [...manifest, ...optional] });
await selective.load();
assert.equal(selective.stats.requests.length, manifest.length, 'boot must not request optional game artwork');
assert.equal(selective.progress.at(-1).total, manifest.length);
const cold = setup();
await cold.load();
assert.equal(cold.stats.requests.length, manifest.length);
assert.ok(cold.stats.maximum <= 4, 'download concurrency must stay bounded');
assert.equal(cold.progress.at(-1).fraction, 1);
assert.equal(cold.progress.at(-1).completed, manifest.length);
assert.equal(cold.progress.at(-1).totalBytes, manifest.reduce((sum, asset) => sum + asset.bytes, 0));
assert.ok(cold.progress.every((value, index, all) => !index || value.fraction >= all[index - 1].fraction));
cold.stats.requests.length = 0;
await cold.load();
assert.equal(cold.stats.requests.length, 0, 'warm loading must reuse every cached file');
await cold.cache.delete(assetUrl(manifest[3].path));
await cold.load();
assert.deepEqual(cold.stats.requests, [manifest[3].path], 'only missing files are downloaded again');

const changedPath = manifest[1].path;
const originalData = data.get(changedPath);
data.set(changedPath, originalData.map(value => value + 7));
const releaseAssets = manifest.map(asset => asset.path === changedPath ? { ...asset,
  hash: createHash('sha256').update(data.get(changedPath)).digest('hex').slice(0, 16) } : asset);
const updatedRelease = setup({ assets: releaseAssets, existingCache: cold.cache });
await updatedRelease.load();
assert.deepEqual(updatedRelease.stats.requests, [changedPath], 'a release downloads only changed content hashes');
data.set(changedPath, originalData);

const interrupted = setup();
interrupted.stats.failPath = manifest.at(-1).path;
await assert.rejects(interrupted.load(), /interrupted/);
const completedUrls = new Set(interrupted.cache.entries.keys());
assert.ok(completedUrls.size > 0 && completedUrls.size < manifest.length);
interrupted.stats.failPath = '';
interrupted.stats.requests.length = 0;
await interrupted.load();
assert.ok(interrupted.stats.requests.every(path => !completedUrls.has(keyOf(assetUrl(path)))),
  'retry must preserve completed downloads');

for (const options of [{ http: true }, { quota: true }]) {
  const fallback = setup(options);
  await fallback.load();
  assert.equal(fallback.stats.requests.length, manifest.length);
  assert.equal(fallback.progress.at(-1).completed, manifest.length);
}
const damaged = setup();
damaged.stats.corruptPath = manifest[2].path;
await assert.rejects(damaged.load(), /版本不匹配/);
assert.equal(await damaged.cache.match(assetUrl(manifest[2].path)), undefined);
damaged.stats.corruptPath = '';
damaged.stats.requests.length = 0;
damaged.stats.cacheModes.length = 0;
await damaged.load();
assert.equal(damaged.stats.cacheModes[damaged.stats.requests.indexOf(manifest[2].path)], 'reload',
  'a failed file must bypass any damaged HTTP cache when retried');
const aborted = setup();
const abort = new AbortController();
abort.abort();
await assert.rejects(aborted.load(abort.signal), { name: 'AbortError' });
assert.equal(aborted.stats.requests.length, 0);

const listeners = {};
let networkRequests = 0;
const swCache = new MemoryCache();
const audioUrl = `${origin}/assets/audio/bgm/homecoming.mp3?ffv=fixture`;
await swCache.put(audioUrl, new Response(new Uint8Array([0, 1, 2, 3, 4, 5]),
  { headers: { 'Content-Type': 'audio/mpeg' } }));
vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
  self: { location: { origin }, addEventListener: (name, handler) => { listeners[name] = handler; } },
  caches: { open: async () => swCache }, URL, Headers, Response,
  fetch: async () => { networkRequests++; return new Response('network'); }
});
async function media(range) {
  let result;
  listeners.fetch({ request: new Request(audioUrl, { headers: range ? { Range: range } : {} }),
    respondWith: response => { result = response; } });
  return result;
}
const middle = await media('bytes=1-3');
assert.equal(middle.status, 206);
assert.equal(middle.headers.get('Content-Range'), 'bytes 1-3/6');
assert.deepEqual([...new Uint8Array(await middle.arrayBuffer())], [1, 2, 3]);
assert.deepEqual([...new Uint8Array(await (await media('bytes=-2')).arrayBuffer())], [4, 5]);
assert.equal((await media('bytes=10-')).status, 416);
assert.equal((await media()).status, 200);
assert.equal(networkRequests, 0, 'cached music must support range playback without network');
// Exercise the real boot entry point with an isolated DOM and deferred downloads.
// These checks never import App.vue or contact a game account/server.
const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  .replace(/^import .+;\r?\n/gm, '')
  .replaceAll("import('./app-entry')", 'testLoadAppEntry()')
  .replaceAll("import('./boot-assets')", 'testLoadBootAssets()')
  .replaceAll('import.meta.env.PROD', 'false');
const mainCompiled = ts.transpileModule(mainSource, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS
} }).outputText;
const bootHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootElementIds = ['ff-boot', 'ff-boot-track', 'ff-boot-fill', 'ff-boot-chase',
  'ff-boot-status', 'ff-boot-percent', 'ff-boot-count', 'ff-boot-retry'];
for (const id of bootElementIds) {
  assert.equal(bootHtml.split(`id="${id}"`).length - 1, 1, `boot must retain exactly one ${id}`);
}
assert.match(bootHtml, /class="ff-boot-logo"[^>]+src="\/assets\/light-anime\/auth-v4\/fantasy-logo\.webp"/,
  'loading uses the independent light-anime game logo');
assert.match(bootHtml, /class="ff-boot-hero"[^>]+src="\/assets\/light-anime\/auth-v4\/loading-scene-wide-v1\.webp"/,
  'loading displays its complete integrated scene');
assert.doesNotMatch(bootHtml, /auth-v3\/|border-image:/, 'integrated loading uses no sliced paper assets');
assert.match(bootHtml, /id="ff-boot-track"[^>]+role="progressbar"/);
assert.doesNotMatch(bootHtml, /data-ff-boot-warm|dataset\.ffBootWarm/,
  'saved assets must never hide the HTML loading page before this visit is ready');
assert.match(bootHtml, /id="ff-boot-elapsed"/, 'elapsed time exists before App modules download');
const actualMainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
assert.doesNotMatch(actualMainSource, /^import (?!type\b)/m,
  'light boot entry must not wait for static Vue/App/CSS/full-manifest imports');
assert.match(actualMainSource, /Promise\.all\(\[appEntry, assets\]\)/,
  'App and essential resource preparation must start in parallel');

function setupBootEntry({ warm = false, deferApp = false, failBootModule = false } = {}) {
  const elements = new Map(bootElementIds.map(id => [id, {
    style: {}, textContent: '', attributes: new Map(id === 'ff-boot-retry' ? [['hidden', '']] : []),
    classes: new Set(), listeners: new Map(), clientWidth: 300, offsetWidth: 0, removed: false,
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
    addEventListener(name, handler) { this.listeners.set(name, handler); },
    remove() { this.removed = true; }
  }]));
  for (const element of elements.values()) {
    element.classList = { add: name => element.classes.add(name), remove: name => element.classes.delete(name) };
  }
  const readyKey = 'fantasy-final.boot-assets.v1';
  const readyVersion = 'v1:fixture-revision';
  const storage = new Map(warm ? [[readyKey, readyVersion]] : []);
  const timers = new Map();
  const attempts = [];
  const stats = { mounts: 0, reloads: 0, appImports: 0 };
  const appAttempts = [];
  let timerId = 0;
  const document = { documentElement: { dataset: {} },
    getElementById: id => elements.get(id) ?? null };
  const context = vm.createContext({ document, navigator: {}, AbortController,
    __FF_BOOT_ASSET_REVISION__: 'fixture-revision', BOOT_READY_KEY: readyKey, App: {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    requestAnimationFrame: callback => callback(0),
    window: { addEventListener() {}, location: { reload: () => { stats.reloads++; } },
      setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
      clearTimeout: id => timers.delete(id) },
    testLoadAppEntry: () => {
      stats.appImports++;
      const app = { mountApp: () => { stats.mounts++; } };
      return deferApp ? new Promise((resolve, reject) => appAttempts.push({ resolve: () => resolve(app), reject })) : Promise.resolve(app);
    },
    testLoadBootAssets: () => failBootModule ? Promise.reject(new Error('Simulated failed boot chunk')) : Promise.resolve({
      prepareBootAssets: (onProgress, signal, version, releaseChanged) => new Promise((resolve, reject) => {
        attempts.push({ onProgress, signal, version, releaseChanged, resolve, reject });
      })
    })
  });
  vm.runInContext(mainCompiled, context);
  const clickRetry = () => elements.get('ff-boot-retry').listeners.get('click')();
  const runTimer = delay => {
    const entry = [...timers].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `expected a ${delay}ms boot timer`);
    timers.delete(entry[0]);
    entry[1].callback();
  };
  return { elements, document, storage, timers, attempts, appAttempts, stats, readyKey, readyVersion, clickRetry, runTimer };
}
const flushBootEntry = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const progressValue = (fraction, completed = 1, total = 4) => ({ fraction, completed, total,
  loadedBytes: fraction * 1000, totalBytes: 1000 });
const entry = setupBootEntry();
await flushBootEntry();
assert.equal(entry.attempts.length, 1);
assert.equal(entry.stats.mounts, 0, 'App must wait for verified boot assets');
assert.equal(entry.attempts[0].version, entry.readyVersion);
assert.equal(entry.elements.get('ff-boot-retry').attributes.has('hidden'), true);
entry.attempts[0].onProgress(progressValue(.375));
assert.equal(entry.elements.get('ff-boot-fill').style.width, '37.5%');
assert.equal(entry.elements.get('ff-boot-percent').textContent, '37%');
assert.equal(entry.elements.get('ff-boot-count').textContent, '1 / 4 项');
assert.equal(entry.elements.get('ff-boot-track').attributes.get('aria-valuenow'), '37');
assert.equal(entry.elements.get('ff-boot-track').attributes.get('aria-valuetext'), '37% · 1 / 4 项');
entry.attempts[0].onProgress(progressValue(1.6, 4));
assert.equal(entry.elements.get('ff-boot-percent').textContent, '100%');
entry.attempts[0].onProgress(progressValue(-.1, 0));
assert.equal(entry.elements.get('ff-boot-fill').style.width, '0.0%');
entry.clickRetry();
assert.equal(entry.attempts.length, 1, 'a running boot must ignore duplicate retry activation');
entry.attempts[0].reject(new Error('Simulated loading interruption'));
await flushBootEntry();
assert.equal(entry.stats.mounts, 0, 'failed loading must not mount App');
assert.equal(entry.attempts[0].signal.aborted, true);
assert.equal(entry.elements.get('ff-boot-status').textContent, '游戏资源加载中断，请检查网络后重试。');
assert.equal(entry.elements.get('ff-boot').classes.has('has-load-error'), true,
  'failed loading exposes the compact error style inside the integrated paper');
assert.equal(entry.elements.get('ff-boot-retry').attributes.has('hidden'), false);
assert.equal(entry.storage.has(entry.readyKey), false, 'failure must not mark the version ready');
entry.clickRetry();
entry.clickRetry();
await flushBootEntry();
assert.equal(entry.attempts.length, 2, 'retry starts only one replacement attempt');
assert.equal(entry.elements.get('ff-boot-retry').attributes.has('hidden'), true);
assert.equal(entry.elements.get('ff-boot').classes.has('has-load-error'), false,
  'retry restores the normal progress label style');
entry.attempts[1].onProgress(progressValue(.6, 2));
assert.equal(entry.elements.get('ff-boot-percent').textContent, '60%');
assert.equal(entry.elements.get('ff-boot-count').textContent, '2 / 4 项');
assert.equal(entry.elements.get('ff-boot-status').textContent, '正在准备登录画面资源…');
entry.attempts[1].resolve();
await flushBootEntry();
assert.equal(entry.stats.mounts, 1);
assert.equal(entry.storage.get(entry.readyKey), entry.readyVersion);
assert.equal(entry.elements.get('ff-boot').classes.has('is-exiting'), true);
entry.runTimer(260);
assert.equal(entry.elements.get('ff-boot').removed, true);
entry.clickRetry();
assert.equal(entry.attempts.length, 2, 'a mounted App must never mount again');

const warmEntry = setupBootEntry({ warm: true });
await flushBootEntry();
assert.equal(warmEntry.attempts.length, 1, 'warm flags still verify assets');
assert.equal(warmEntry.elements.get('ff-boot').classes.has('is-hidden'), false,
  'warm loading is immediately visible while App/JS/CSS prepares');
warmEntry.attempts[0].resolve();
await flushBootEntry();
assert.equal(warmEntry.stats.mounts, 1);
const slowWarmEntry = setupBootEntry({ warm: true, deferApp: true });
await flushBootEntry();
assert.equal(slowWarmEntry.stats.appImports, 1, 'App starts loading without waiting for resource completion');
slowWarmEntry.attempts[0].onProgress(progressValue(1, 4));
slowWarmEntry.attempts[0].resolve();
await flushBootEntry();
assert.equal(slowWarmEntry.stats.mounts, 0);
assert.equal(slowWarmEntry.elements.get('ff-boot').classes.has('is-exiting'), false,
  'completed images must not remove loading cover before App code is ready');
assert.equal(slowWarmEntry.elements.get('ff-boot-status').textContent, '必要资源已就绪，正在准备游戏界面…');
slowWarmEntry.appAttempts[0].resolve();
await flushBootEntry();
assert.equal(slowWarmEntry.stats.mounts, 1);

const failedAppEntry = setupBootEntry({ warm: true, deferApp: true });
await flushBootEntry();
failedAppEntry.appAttempts[0].reject(new Error('Simulated failed App chunk'));
await flushBootEntry();
assert.equal(failedAppEntry.stats.mounts, 0);
assert.equal(failedAppEntry.attempts[0].signal.aborted, true);
assert.equal(failedAppEntry.elements.get('ff-boot-retry').attributes.has('hidden'), false);
assert.equal(failedAppEntry.elements.get('ff-boot-status').textContent, '界面组件加载中断，请检查网络后重新加载。');
failedAppEntry.clickRetry();
assert.equal(failedAppEntry.stats.reloads, 1, 'a failed cached ES module needs a document reload');
assert.equal(failedAppEntry.stats.appImports, 1, 'failed module imports must not loop within one document');
const failedBootModule = setupBootEntry({ failBootModule: true });
await flushBootEntry();
assert.equal(failedBootModule.stats.mounts, 0);
assert.equal(failedBootModule.elements.get('ff-boot-retry').attributes.has('hidden'), false);
failedBootModule.clickRetry();
assert.equal(failedBootModule.stats.reloads, 1, 'failed boot module imports also require a fresh document');
console.log('Boot asset checks passed: selective login assets, cold/warm/missing/release/retry/HTTP/quota/hash/abort, cached audio ranges; lightweight parallel entry, visible warm loading, slow App cover, real progress/count, resource/module failure/retry, one mount.');
