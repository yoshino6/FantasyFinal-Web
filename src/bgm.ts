import { gameAssetUrl } from './game-assets';

export type BgmScene = 'homecoming' | 'worldtree' | 'battle' | 'boss';

const FADE_MS = 700;
const bgmUrl = (scene: BgmScene) => gameAssetUrl(`/assets/audio/bgm/${scene}.mp3`);

/** Reuse one unlocked media element so later scene changes can play on mobile Safari. */
export class BgmPlayer {
  private scene: BgmScene = 'homecoming';
  private activeScene: BgmScene | null = null;
  private enabled = true;
  private volume = 0.7;
  private gain = 0;
  private unlocked = false;
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private frame: number | null = null;
  private fadeTarget: number | null = null;
  private requestId = 0;
  private starting = false;
  private destroyed = false;

  update(scene: BgmScene, enabled: boolean, volumePercent: number) {
    this.scene = scene;
    this.enabled = enabled;
    this.volume = Number.isFinite(volumePercent) ? Math.min(1, Math.max(0, volumePercent / 100)) : 0;
    this.applyVolume();
    if (this.unlocked) this.sync();
  }

  /** Call synchronously from pointer or keyboard events so mobile browsers allow play(). */
  unlock() {
    if (this.destroyed) return;
    this.unlocked = true;
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.loop = true;
      this.audio.preload = 'none';
      this.initVolumeControl(this.audio);
    }
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
    this.sync();
  }

  destroy() {
    this.destroyed = true;
    this.requestId += 1;
    this.cancelFade();
    this.audio?.pause();
    if (this.context) void this.context.close().catch(() => undefined);
    this.audio = null;
    this.context = null;
    this.gainNode = null;
    this.activeScene = null;
  }

  private sync() {
    const audio = this.audio;
    if (this.destroyed || !audio) return;
    if (!this.enabled || this.activeScene !== this.scene) {
      if (this.fadeTarget === 0) return;
      if (audio.paused || this.gain === 0) {
        this.cancelFade();
        this.gain = 0;
        this.applyVolume();
        if (this.enabled) this.switchScene(this.scene);
        else {
          this.requestId += 1;
          this.starting = false;
          audio.pause();
        }
      } else {
        this.fadeTo(0, this.enabled ? FADE_MS / 2 : FADE_MS, () => {
          if (!this.enabled) audio.pause();
          else if (this.activeScene !== this.scene) this.switchScene(this.scene);
          else this.sync();
        });
      }
      return;
    }
    if (this.fadeTarget === 0) this.cancelFade();
    if (this.starting) return;
    if (audio.paused) this.play();
    else if (this.fadeTarget !== 1 && this.gain < 1) this.fadeTo(1, FADE_MS / 2);
  }

  private switchScene(scene: BgmScene) {
    const audio = this.audio;
    if (!audio || this.destroyed) return;
    this.cancelFade();
    this.requestId += 1;
    this.starting = false;
    audio.pause();
    audio.src = bgmUrl(scene);
    this.activeScene = scene;
    this.gain = 0;
    this.applyVolume();
    this.play();
  }

  private play() {
    const audio = this.audio;
    if (!audio || !this.enabled || this.destroyed) return;
    this.starting = true;
    const requestId = ++this.requestId;
    try {
      void Promise.resolve(audio.play()).then(() => {
        if (this.destroyed || requestId !== this.requestId) return;
        this.starting = false;
        if (this.enabled && this.activeScene === this.scene) this.fadeTo(1, FADE_MS / 2);
        else this.sync();
      }).catch(() => {
        if (requestId === this.requestId) this.starting = false;
      });
    } catch {
      if (requestId === this.requestId) this.starting = false;
    }
  }

  private fadeTo(target: number, duration: number, onComplete?: () => void) {
    this.cancelFade();
    this.fadeTarget = target;
    const started = performance.now();
    const from = this.gain;
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      this.gain = from + (target - from) * progress;
      this.applyVolume();
      if (progress < 1) this.frame = requestAnimationFrame(step);
      else {
        this.frame = null;
        this.fadeTarget = null;
        onComplete?.();
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  private initVolumeControl(audio: HTMLAudioElement) {
    // iOS ignores HTMLMediaElement.volume; route that element through Web Audio instead.
    audio.volume = 0.5;
    if (audio.volume !== 0.5 && typeof AudioContext !== 'undefined') {
      let context: AudioContext | null = null;
      try {
        context = new AudioContext();
        const gainNode = context.createGain();
        context.createMediaElementSource(audio).connect(gainNode).connect(context.destination);
        this.context = context;
        this.gainNode = gainNode;
      } catch {
        if (context) void context.close().catch(() => undefined);
      }
    }
    this.applyVolume();
  }

  private applyVolume() {
    const volume = Math.min(1, Math.max(0, this.gain * this.volume));
    if (this.gainNode) this.gainNode.gain.value = volume;
    else if (this.audio) this.audio.volume = volume;
  }

  private cancelFade() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.fadeTarget = null;
  }
}
