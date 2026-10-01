import { createApp } from 'vue';
import App from './App.vue';
import { BOOT_READY_KEY, prepareBootAssets, type BootProgress } from './boot-assets';
import './styles.css';

const splash = document.getElementById('ff-boot');
const track = document.getElementById('ff-boot-track');
const fill = document.getElementById('ff-boot-fill');
const chase = document.getElementById('ff-boot-chase');
const status = document.getElementById('ff-boot-status');
const retry = document.getElementById('ff-boot-retry') as HTMLButtonElement | null;
const readyVersion = `v1:${__FF_BOOT_ASSET_REVISION__}`;
let running = false;
let mounted = false;
let revealTimer: number | undefined;
let progressFraction = 0;

function storedReadyVersion(): string {
  try { return localStorage.getItem(BOOT_READY_KEY) ?? ''; } catch { return ''; }
}

function showSplash(): void {
  document.documentElement.dataset.ffBootWarm = '0';
  splash?.classList.remove('is-hidden');
}

function positionChase(): void {
  if (!track || !chase) return;
  chase.style.left = `${Math.round(Math.max(0, track.clientWidth - chase.offsetWidth) * progressFraction)}px`;
}

function updateProgress(progress: BootProgress): void {
  progressFraction = Math.min(1, Math.max(0, progress.fraction));
  if (fill) fill.style.width = `${(progressFraction * 100).toFixed(1)}%`;
  if (track) track.setAttribute('aria-valuenow', String(Math.floor(progressFraction * 100)));
  if (status) status.textContent = `正在加载游戏资源 · ${Math.floor(progressFraction * 100)}% · ${progress.completed} / ${progress.total}`;
  positionChase();
}

async function start(): Promise<void> {
  if (running || mounted) return;
  running = true;
  retry?.setAttribute('hidden', '');
  const previousReadyVersion = storedReadyVersion();
  if (previousReadyVersion !== readyVersion) showSplash();
  else revealTimer = window.setTimeout(showSplash, 220);
  const controller = new AbortController();
  try {
    await prepareBootAssets(updateProgress, controller.signal, readyVersion, Boolean(previousReadyVersion && previousReadyVersion !== readyVersion));
    if (revealTimer !== undefined) window.clearTimeout(revealTimer);
    mounted = true;
    createApp(App).mount('#app');
    try { localStorage.setItem(BOOT_READY_KEY, readyVersion); } catch { /* Private browsing may disable storage. */ }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    splash?.classList.add('is-exiting');
    window.setTimeout(() => splash?.remove(), 260);
  } catch (error) {
    controller.abort();
    if (revealTimer !== undefined) window.clearTimeout(revealTimer);
    showSplash();
    if (status) status.textContent = '游戏资源加载中断，请检查网络后重试。';
    retry?.removeAttribute('hidden');
  } finally {
    running = false;
  }
}

window.addEventListener('resize', positionChase, { passive: true });
retry?.addEventListener('click', () => { void start(); });
void start();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
