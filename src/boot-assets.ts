import { GAME_ASSETS, gameAssetUrl } from './game-assets';

export const BOOT_READY_KEY = 'fantasy-final.boot-assets.v1';
const RESOURCE_CACHE = 'ff-game-assets-v2';
const DOWNLOAD_WORKERS = 4;
const retryAssets = new Set<string>();

export type BootProgress = {
  fraction: number;
  completed: number;
  total: number;
  loadedBytes: number;
  totalBytes: number;
};

async function openResourceCache(): Promise<Cache | null> {
  // Development public files change without restarting Vite. HTTP revalidation
  // keeps artwork edits visible, while production uses the manifest hashes.
  if (import.meta.env.DEV || !('caches' in window)) return null;
  try { return await caches.open(RESOURCE_CACHE); }
  catch { return null; }
}

function mimeType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  return ({ png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', avif: 'image/avif', mp3: 'audio/mpeg', ogg: 'audio/ogg',
    wav: 'audio/wav', woff: 'font/woff', woff2: 'font/woff2' } as Record<string, string>)[extension ?? '']
    ?? 'application/octet-stream';
}

/**
 * All current UI, portraits, inventory art and music must finish before mount.
 * Each file has a content hash URL, so new releases reuse unchanged resources.
 * Public HTTP IPs fall back to normal browser HTTP caching without a SW/Cache API.
 */
export async function prepareBootAssets(onProgress: (progress: BootProgress) => void,
  signal: AbortSignal, _revision: string, _refresh: boolean): Promise<void> {
  const cache = await openResourceCache();
  let canWriteCache = Boolean(cache);
  const loaded = GAME_ASSETS.map(() => 0);
  const finished = GAME_ASSETS.map(() => false);
  const totalBytes = GAME_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0);
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  let lastReport = 0;
  const report = (force = false) => {
    if (signal.aborted || controller.signal.aborted) return;
    const now = performance.now();
    if (!force && now - lastReport < 50) return;
    lastReport = now;
    const loadedBytes = loaded.reduce((sum, bytes) => sum + bytes, 0);
    onProgress({ fraction: totalBytes ? loadedBytes / totalBytes : 1,
      completed: finished.filter(Boolean).length, total: GAME_ASSETS.length, loadedBytes, totalBytes });
  };
  report(true);

  async function loadAsset(index: number): Promise<void> {
    controller.signal.throwIfAborted();
    const asset = GAME_ASSETS[index];
    const url = gameAssetUrl(asset.path);
    let cached: Response | undefined;
    try { cached = await cache?.match(url); } catch { /* Private-mode storage may be disabled. */ }
    if (cached?.ok && cached.headers.get('X-FF-Asset-Hash') === asset.hash
      && Number(cached.headers.get('Content-Length')) === asset.bytes) {
      loaded[index] = asset.bytes;
      finished[index] = true;
      report(true);
      return;
    }
    if (cached) await cache?.delete(url).catch(() => undefined);

    const response = await fetch(url, { cache: retryAssets.has(asset.path) ? 'reload'
      : import.meta.env.DEV ? 'no-cache' : 'default', signal: controller.signal });
    if (!response.ok || response.headers.get('Content-Type')?.toLowerCase().includes('text/html')) {
      throw new Error(`游戏资源加载失败：${asset.path}`);
    }
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          chunks.push(new Uint8Array(value));
          // Reserve the last percent for integrity checking and storing this file.
          loaded[index] = Math.min(asset.bytes * .99, received);
          report();
        }
      } finally { reader.releaseLock(); }
    } else {
      const bytes = await response.arrayBuffer();
      received = bytes.byteLength;
      chunks.push(new Uint8Array(bytes));
    }
    if (received !== asset.bytes) throw new Error(`游戏资源不完整：${asset.path}`);
    const blob = new Blob(chunks, { type: mimeType(asset.path) });
    // Secure browsers can also reject a stale or damaged file of the same size.
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
      if (hash !== asset.hash) throw new Error(`游戏资源版本不匹配：${asset.path}`);
    }
    controller.signal.throwIfAborted();
    if (canWriteCache && cache) {
      try {
        await cache.put(url, new Response(blob, { headers: {
          'Content-Type': blob.type, 'Content-Length': String(asset.bytes),
          'X-FF-Asset-Hash': asset.hash, 'Cache-Control': 'public, max-age=31536000, immutable'
        } }));
      } catch {
        // Quota/private-mode failures must not strand players at the loading screen.
        canWriteCache = false;
      }
    }
    loaded[index] = asset.bytes;
    finished[index] = true;
    retryAssets.delete(asset.path);
    report(true);
  }

  let next = 0;
  let failure: unknown;
  const worker = async () => {
    try {
      while (next < GAME_ASSETS.length) {
        const index = next++;
        try { await loadAsset(index); }
        catch (error) {
          retryAssets.add(GAME_ASSETS[index].path);
          throw error;
        }
      }
    } catch (error) {
      failure ??= error;
      controller.abort();
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(DOWNLOAD_WORKERS, GAME_ASSETS.length) }, worker));
    if (failure) throw failure;
    controller.signal.throwIfAborted();
    report(true);
    if (cache && canWriteCache) {
      // Prune only after every resource succeeds; interrupted downloads keep their
      // completed files, and a retry resumes from them instead of starting over.
      const currentUrls = new Set(GAME_ASSETS.map(asset => new URL(gameAssetUrl(asset.path), location.href).href));
      void cache.keys().then(keys => Promise.all(keys.filter(key => !currentUrls.has(key.url)).map(key => cache.delete(key)))).catch(() => undefined);
      void caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ff-boot-v1-')).map(key => caches.delete(key)))).catch(() => undefined);
    }
  } finally { signal.removeEventListener('abort', cancel); }
}
