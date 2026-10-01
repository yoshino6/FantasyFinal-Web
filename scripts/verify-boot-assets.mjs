import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const origin = 'https://game.test';
const data = new Map(Array.from({ length: 9 }, (_, index) => [
  `/assets/items/fixture-${index}.png`, new Uint8Array(512 + index * 128).fill(index + 1)
]));
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

const source = readFileSync(new URL('../src/boot-assets.ts', import.meta.url), 'utf8')
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
        await new Promise(resolve => setTimeout(resolve, 8));
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
interrupted.stats.failPath = manifest[5].path;
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
console.log('Boot asset checks passed: cold/warm/missing/release/retry/HTTP/quota/hash/abort, cached audio ranges.');
