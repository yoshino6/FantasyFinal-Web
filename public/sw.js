const VERSION = 'ff-web-v11-light-anime';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const RESOURCE_CACHE = 'ff-game-assets-v2';
const APP_SHELL = ['/index.html'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  // Full resource downloads survive SW updates and resume from their hash URLs.
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ff-web-')
    && ![STATIC_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

async function rangeResponse(request, response) {
  const range = request.headers.get('Range');
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return fetch(request);
  const data = await response.arrayBuffer();
  const total = data.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
  const end = match[1] ? Math.min(total - 1, match[2] ? Number(match[2]) : total - 1) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= total || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(data.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get('Content-Type')?.includes('text/html')) {
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch { return (await cache.match('/index.html')) || Response.error(); }
    })());
    return;
  }
  if (/^\/assets\/[^/]+-[\w-]{8}\.(?:js|css)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }
  // A content-hash URL is immutable. Prefer the completed boot download for
  // every UI/item/portrait/audio file, including media byte-range requests.
  if (url.pathname.startsWith('/assets/') && url.searchParams.has('ffv')) {
    event.respondWith((async () => {
      const resourceCache = await caches.open(RESOURCE_CACHE);
      if (request.cache !== 'reload' && request.cache !== 'no-cache') {
        const cached = await resourceCache.match(request.url);
        if (cached) return rangeResponse(request, cached);
      }
      const response = await fetch(request);
      if (response.ok && response.status === 200
        && !response.headers.get('Content-Type')?.includes('text/html')) {
        await resourceCache.put(request.url, response.clone()).catch(() => undefined);
      }
      return response;
    })());
    return;
  }
  // Optional archived/fallback artwork keeps a small runtime cache. Game state
  // and dynamic server-generated messages are never treated as static assets.
  if (/^\/assets\/(?:hero|ui|loading|social|character|items)\//.test(url.pathname)) {
    const cachePromise = caches.open(RUNTIME_CACHE);
    const update = fetch(request).then(async response => {
      if (response.ok && response.status === 200 && response.headers.get('Content-Type')?.startsWith('image/')) {
        await (await cachePromise).put(request, response.clone()).catch(() => undefined);
      }
      return response;
    });
    event.waitUntil(update.then(() => undefined, () => undefined));
    event.respondWith(request.cache === 'reload' ? update :
      cachePromise.then(cache => cache.match(request)).then(cached => cached || update));
  }
});
