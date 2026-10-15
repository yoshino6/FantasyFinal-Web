import type { BootProgress } from './boot-assets';

const splash = document.getElementById('ff-boot');
const track = document.getElementById('ff-boot-track');
const fill = document.getElementById('ff-boot-fill');
const chase = document.getElementById('ff-boot-chase');
const status = document.getElementById('ff-boot-status');
const percent = document.getElementById('ff-boot-percent');
const count = document.getElementById('ff-boot-count');
const retry = document.getElementById('ff-boot-retry') as HTMLButtonElement | null;
const BOOT_READY_KEY = 'fantasy-final.boot-assets.v1';
const readyVersion = `v1:${__FF_BOOT_ASSET_REVISION__}`;
let running = false;
let mounted = false;
let progressFraction = 0;
let appEntry: Promise<{ mountApp(): void }> | undefined;
let entryModuleFailed = false;

function storedReadyVersion(): string {
  try { return localStorage.getItem(BOOT_READY_KEY) ?? ''; } catch { return ''; }
}

function showSplash(): void {
  splash?.classList.remove('is-hidden');
}

function positionChase(): void {
  if (!track || !chase) return;
  chase.style.left = `${Math.round(Math.max(0, track.clientWidth - chase.offsetWidth) * progressFraction)}px`;
}

function updateProgress(progress: BootProgress): void {
  progressFraction = Math.min(1, Math.max(0, progress.fraction));
  if (fill) fill.style.width = `${(progressFraction * 100).toFixed(1)}%`;
  const percentage = Math.floor(progressFraction * 100);
  if (track) {
    track.setAttribute('aria-valuenow', String(percentage));
    track.setAttribute('aria-valuetext', `${percentage}% · ${progress.completed} / ${progress.total} 项`);
  }
  if (percent) percent.textContent = `${percentage}%`;
  if (count) count.textContent = `${progress.completed} / ${progress.total} 项`;
  if (status) status.textContent = progressFraction === 1 ? '必要资源已就绪，正在准备游戏界面…' : '正在准备登录画面资源…';
  positionChase();
}

async function start(): Promise<void> {
  if (running || mounted) return;
  running = true;
  splash?.classList.remove('has-load-error');
  retry?.setAttribute('hidden', '');
  const previousReadyVersion = storedReadyVersion();
  // A saved asset version does not mean this visit's JS/CSS has loaded.
  showSplash();
  if (status) status.textContent = '正在加载游戏界面…';
  const controller = new AbortController();
  try {
    appEntry ??= import('./app-entry').catch(error => {
      entryModuleFailed = true;
      throw error;
    });
    // Start both downloads together. The HTML splash already exists, and this
    // entry has no static dependency on Vue, App or the full asset manifest.
    const assets = import('./boot-assets').catch(error => {
      entryModuleFailed = true;
      throw error;
    }).then(({ prepareBootAssets }) =>
      prepareBootAssets(updateProgress, controller.signal, readyVersion, Boolean(previousReadyVersion && previousReadyVersion !== readyVersion)));
    const [app] = await Promise.all([appEntry, assets]);
    if (status) status.textContent = '正在打开游戏界面…';
    app.mountApp();
    mounted = true;
    try { localStorage.setItem(BOOT_READY_KEY, readyVersion); } catch { /* Private browsing may disable storage. */ }
    // Let the mounted screen paint before removing its cover.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    splash?.classList.add('is-exiting');
    window.setTimeout(() => splash?.remove(), 260);
  } catch (error) {
    controller.abort();
    splash?.classList.add('has-load-error');
    showSplash();
    if (status) status.textContent = entryModuleFailed ? '界面组件加载中断，请检查网络后重新加载。' : '游戏资源加载中断，请检查网络后重试。';
    retry?.removeAttribute('hidden');
  } finally {
    running = false;
  }
}

window.addEventListener('resize', positionChase, { passive: true });
retry?.addEventListener('click', () => {
  // Browsers retain failed ES-module imports for this document. Reloading the
  // document is required for a fresh module attempt; verified images stay cached.
  if (entryModuleFailed) window.location.reload();
  else void start();
});
void start();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
