import type { ObjectDirective } from 'vue';
import { normalizeItemRarity, type ItemRarity } from './item-rarity';

type PulseName = 'item-rarity-twinkle-a' | 'item-rarity-twinkle-b';
type AlphaPoint = { x: number; y: number };
type SparkleState = {
  rarity: ItemRarity; version: number; animationName?: PulseName;
  image?: HTMLImageElement; source?: string; pool?: readonly AlphaPoint[] | null;
  pending?: boolean; active?: boolean;
  resizeObserver?: ResizeObserver; observedImage?: HTMLImageElement; geometrySignature?: string;
  listener?: EventListener; loadListener?: EventListener; errorListener?: EventListener;
};
const states = new WeakMap<HTMLElement, SparkleState>();
const alphaPools = new Map<string, readonly AlphaPoint[] | null>();
const properties = [
  '--item-sparkle-radius', '--item-sparkle-x', '--item-sparkle-y',
  '--item-sparkle-duration', '--item-sparkle-delay', '--item-sparkle-name',
  '--item-sparkle-source', '--item-sparkle-image-left', '--item-sparkle-image-top',
  '--item-sparkle-image-width', '--item-sparkle-image-height', '--item-sparkle-ready'
];
const randomBetween = (minimum: number, maximum: number) => minimum + Math.random() * (maximum - minimum);
const imageSource = (image?: HTMLImageElement) => image?.currentSrc || image?.src || '';
const clearPulse = (element: HTMLElement, waiting = false) => {
  properties.forEach(property => element.style.removeProperty(property));
  if (waiting) {
    element.style.setProperty('--item-sparkle-ready', '0');
    element.style.setProperty('--item-sparkle-name', 'none');
  }
};

/** Cache at most 4096 real native-alpha pixel centers, retaining holes in thin artwork. */
const alphaPoolFor = (image: HTMLImageElement, source: string): readonly AlphaPoint[] | null => {
  if (alphaPools.has(source)) return alphaPools.get(source)!;
  let points: AlphaPoint[] | null = null;
  try {
    const view = image.ownerDocument.defaultView;
    if (!view || new URL(source, image.ownerDocument.baseURI).origin !== view.location.origin) return null;
    const canvas = image.ownerDocument.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context) {
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      points = [];
      let visiblePixels = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (data[(y * canvas.width + x) * 4 + 3]! <= 64) continue;
          visiblePixels += 1;
          const index = points.length < 4096 ? points.length : Math.floor(Math.random() * visiblePixels);
          if (index < 4096) points[index] = { x: (x + .5) / canvas.width, y: (y + .5) / canvas.height };
        }
      }
      if (!points.length) points = null;
    }
  } catch { /* A tainted or undecodable image has no eligible sparkle pixels. */ }
  if (alphaPools.size >= 128) alphaPools.delete(alphaPools.keys().next().value!);
  alphaPools.set(source, points);
  return points;
};

/** Both the sampling point and CSS mask use this actual object-fit:contain rectangle. */
const imageGeometry = (element: HTMLElement, image: HTMLImageElement) => {
  const slot = element.getBoundingClientRect();
  const box = image.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0 || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
  const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  return {
    left: box.left - slot.left - element.clientLeft + (box.width - width) / 2,
    top: box.top - slot.top - element.clientTop + (box.height - height) / 2,
    width, height
  };
};

const geometrySignature = (element: HTMLElement, image?: HTMLImageElement) => {
  const geometry = image && imageGeometry(element, image);
  return [element.clientWidth, element.clientHeight, geometry?.left, geometry?.top, geometry?.width, geometry?.height].join(':');
};

const observeImage = (element: HTMLElement, state: SparkleState, image?: HTMLImageElement) => {
  if (state.observedImage === image) return;
  if (state.observedImage) state.resizeObserver?.unobserve(state.observedImage);
  state.observedImage = image;
  if (image) state.resizeObserver?.observe(image);
  state.geometrySignature = geometrySignature(element, image);
};

const startPulse = (element: HTMLElement, state: SparkleState, initial: boolean) => {
  const geometry = state.image && imageGeometry(element, state.image);
  state.geometrySignature = geometrySignature(element, state.image);
  if (!geometry || !state.pool?.length) { state.active = false; clearPulse(element, true); return; }
  const maximumRadius = Math.min(8, element.clientWidth * .18, element.clientHeight * .18);
  const baseRadius = randomBetween(Math.min(3, maximumRadius), maximumRadius);
  const radius = baseRadius * 1.5;
  // The image mask clips the enlarged rays; keep the existing eligible centers.
  const margin = baseRadius + 2;
  const eligible = state.pool.map(point => ({
    x: geometry.left + point.x * geometry.width,
    y: geometry.top + point.y * geometry.height
  })).filter(point => point.x >= margin && point.x <= element.clientWidth - margin && point.y >= margin && point.y <= element.clientHeight - margin);
  if (!eligible.length) { state.active = false; clearPulse(element, true); return; }
  const point = eligible[Math.floor(Math.random() * eligible.length)]!;
  const duration = Math.round(randomBetween(650, 1250));
  const delay = Math.round(randomBetween(initial ? 0 : 125, 700)) / 2;
  const nextName: PulseName = state.animationName
    ? state.animationName === 'item-rarity-twinkle-a' ? 'item-rarity-twinkle-b' : 'item-rarity-twinkle-a'
    : Math.random() < .5 ? 'item-rarity-twinkle-a' : 'item-rarity-twinkle-b';
  element.style.setProperty('--item-sparkle-radius', `${radius}px`);
  element.style.setProperty('--item-sparkle-x', `${point.x}px`);
  element.style.setProperty('--item-sparkle-y', `${point.y}px`);
  element.style.setProperty('--item-sparkle-duration', `${duration}ms`);
  element.style.setProperty('--item-sparkle-delay', `${delay}ms`);
  element.style.setProperty('--item-sparkle-source', `url(${JSON.stringify(state.source)})`);
  element.style.setProperty('--item-sparkle-image-left', `${geometry.left}px`);
  element.style.setProperty('--item-sparkle-image-top', `${geometry.top}px`);
  element.style.setProperty('--item-sparkle-image-width', `${geometry.width}px`);
  element.style.setProperty('--item-sparkle-image-height', `${geometry.height}px`);
  element.style.setProperty('--item-sparkle-ready', '1');
  // Alternating identical keyframes starts the next finite pulse without a timer or layout flush.
  state.active = true;
  state.animationName = nextName;
  element.style.setProperty('--item-sparkle-name', nextName);
};

const prepareImage = async (element: HTMLElement, state: SparkleState) => {
  if (states.get(element) !== state) return;
  const image = element.querySelector<HTMLImageElement>('img.inventory-item-image') ?? undefined;
  const source = imageSource(image);
  observeImage(element, state, image);
  if (state.image !== image || state.source !== source) {
    state.version += 1;
    state.image = image;
    state.source = source;
    state.pool = undefined;
    state.pending = false;
    state.active = false;
    clearPulse(element, true);
  }
  if (!image || !source || !image.complete || !image.naturalWidth || !image.naturalHeight) {
    if (state.active || state.pending || state.pool !== undefined) {
      state.version += 1;
      state.pool = undefined;
      state.pending = false;
      state.active = false;
      clearPulse(element, true);
    }
    return;
  }
  if (state.pending) return;
  if (state.pool !== undefined) { if (state.pool && !state.active) startPulse(element, state, true); return; }
  const version = ++state.version;
  state.pending = true;
  try { if (typeof image.decode === 'function') await image.decode(); } catch {
    if (states.get(element) === state && state.version === version) { state.pending = false; state.pool = null; }
    return;
  }
  if (states.get(element) !== state || state.version !== version || element.querySelector('img.inventory-item-image') !== image || imageSource(image) !== source) return;
  state.pending = false;
  state.pool = alphaPoolFor(image, source);
  if (state.pool) startPulse(element, state, true);
};

const dispose = (element: HTMLElement, state?: SparkleState) => {
  if (state) {
    state.version += 1;
    if (state.listener) element.removeEventListener('animationend', state.listener);
    if (state.loadListener) element.removeEventListener('load', state.loadListener, true);
    if (state.errorListener) element.removeEventListener('error', state.errorListener, true);
    state.resizeObserver?.disconnect();
  }
  clearPulse(element);
};

const updateSparkles = (element: HTMLElement, value: unknown) => {
  const rarity = normalizeItemRarity(value);
  const previous = states.get(element);
  if (previous?.rarity === rarity) {
    if (rarity === 'epic' || rarity === 'artifact') void prepareImage(element, previous);
    return;
  }
  dispose(element, previous);
  const state: SparkleState = { rarity, version: 0, animationName: previous?.animationName };
  states.set(element, state);
  if (rarity !== 'epic' && rarity !== 'artifact') return;
  state.listener = event => {
    const animation = event as AnimationEvent;
    if (states.get(element) !== state || event.target !== element || animation.animationName !== state.animationName || animation.pseudoElement !== '::after') return;
    if (element.querySelector('img.inventory-item-image') !== state.image || imageSource(state.image) !== state.source || !state.image?.complete) { void prepareImage(element, state); return; }
    startPulse(element, state, false);
  };
  state.loadListener = event => {
    if (states.get(element) !== state || event.target !== element.querySelector('img.inventory-item-image')) return;
    state.version += 1;
    state.pool = undefined;
    state.pending = false;
    state.active = false;
    clearPulse(element, true);
    void prepareImage(element, state);
  };
  state.errorListener = event => {
    if (states.get(element) !== state || event.target !== state.image) return;
    state.version += 1;
    state.pending = false;
    state.pool = undefined;
    state.active = false;
    clearPulse(element, true);
  };
  element.addEventListener('animationend', state.listener);
  element.addEventListener('load', state.loadListener, true);
  element.addEventListener('error', state.errorListener, true);
  const ResizeObserverConstructor = element.ownerDocument.defaultView?.ResizeObserver;
  if (ResizeObserverConstructor) {
    state.geometrySignature = geometrySignature(element);
    state.resizeObserver = new ResizeObserverConstructor(() => {
      if (states.get(element) !== state) return;
      const image = element.querySelector<HTMLImageElement>('img.inventory-item-image') ?? undefined;
      if (image !== state.image || imageSource(image) !== state.source) { void prepareImage(element, state); return; }
      const signature = geometrySignature(element, image);
      if (signature === state.geometrySignature) return;
      state.geometrySignature = signature;
      state.active = false;
      clearPulse(element, true);
      void prepareImage(element, state);
    });
    state.resizeObserver.observe(element);
  }
  clearPulse(element, true);
  void prepareImage(element, state);
};

/** Only loaded, visible alpha pixels of epic/artifact artwork can host a single star. */
export const vItemRaritySparkle: ObjectDirective<HTMLElement, unknown> = {
  mounted(element, binding) { updateSparkles(element, binding.value); },
  updated(element, binding) { updateSparkles(element, binding.value); },
  beforeUnmount(element) { dispose(element, states.get(element)); states.delete(element); }
};
