import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import groundAnchors from './character-ground-anchors.json';
import { gameAssetUrl } from './game-assets';

type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };
export type CharacterScene = 'profile' | 'equipment' | 'evolution';
type Scene = {
  path: string;
  selector: string;
  width: number;
  height: number;
  core: Rect;
  ground?: Point;
  panorama?: boolean;
};

/** The inset is the unchanged original regional illustration, in full-image pixels. */
export const CHARACTER_SCENE_FRAMES: Record<CharacterScene, Scene> = {
  profile: {
    path: '/assets/light-anime/main-scenes-v3/profile-panorama.webp',
    selector: '.profile-viewport-hero',
    width: 1672, height: 941,
    core: { left: 0, top: 0, width: 1672, height: 941 },
    ground: { x: 502, y: 630 },
    panorama: true,
  },
  equipment: {
    path: '/assets/light-anime/main-scenes-v4/equipment-courtyard.webp',
    selector: '.equipment-layout',
    width: 1254, height: 1254,
    core: { left: 0, top: 0, width: 1254, height: 1254 },
    ground: { x: 619, y: 552 },
    panorama: true,
  },
  evolution: {
    path: '/assets/light-anime/main-scenes-v2/evolution-expanded.webp',
    selector: '.evolution-stage',
    width: 4857, height: 4855,
    core: { left: 1619, top: 1457, width: 1619, height: 971 },
  },
};

/** Keep the old center/cover crop exactly; only the generated outer pixels extend it. */
export function frameRegionalScene(region: Rect, scene: Scene) {
  const scale = Math.max(region.width / scene.core.width, region.height / scene.core.height);
  const coreLeft = region.left + (region.width - scene.core.width * scale) / 2;
  const coreTop = region.top + (region.height - scene.core.height * scale) / 2;
  return {
    scale, coreLeft, coreTop,
    left: coreLeft - scene.core.left * scale,
    top: coreTop - scene.core.top * scale,
    width: scene.width * scale,
    height: scene.height * scale,
  };
}

/** A single image covers the viewport while its road point stays beneath the portrait's foot. */
export function framePanoramicScene(viewport: Rect, scene: Scene, target: Point) {
  const source = { x: scene.core.left + (scene.ground?.x ?? scene.core.width / 2), y: scene.core.top + (scene.ground?.y ?? scene.core.height / 2) };
  const scale = Math.max(
    (target.x - viewport.left) / Math.max(1, source.x),
    (viewport.left + viewport.width - target.x) / Math.max(1, scene.width - source.x),
    (target.y - viewport.top) / Math.max(1, source.y),
    (viewport.top + viewport.height - target.y) / Math.max(1, scene.height - source.y),
  );
  const left = target.x - source.x * scale, top = target.y - source.y * scale;
  return { scale, left, top, width: scene.width * scale, height: scene.height * scale, coreLeft: left + scene.core.left * scale, coreTop: top + scene.core.top * scale };
}

type GroundAnchor = {
  width: number; height: number; footX: number; footY: number;
  visibleBounds: number[];
};
const anchors = groundAnchors as Record<string, GroundAnchor>;
const portraitVariables = ['--scene-portrait-left', '--scene-portrait-top', '--scene-portrait-width', '--scene-portrait-height'];

/** Measurements follow layout and scrolling, while the original scene remains the coordinate system. */
export function useCharacterSceneFraming(root: Ref<HTMLElement | null>, active: Ref<CharacterScene | undefined>) {
  const style = ref<Record<string, string>>({});
  const ready = ref(false);
  let resizeObserver: ResizeObserver | undefined;
  let mutationObserver: MutationObserver | undefined;
  let observedRegion: HTMLElement | null = null;
  const layoutElements = new Set<HTMLElement>();
  let framedPortrait: HTMLImageElement | null = null;
  let animationFrame = 0;
  let mounted = false;

  const clearPortrait = () => {
    framedPortrait?.classList.remove('scene-framed-portrait');
    portraitVariables.forEach(name => framedPortrait?.style.removeProperty(name));
    framedPortrait = null;
  };
  const measure = () => {
    animationFrame = 0;
    const shell = root.value;
    const scene = active.value && CHARACTER_SCENE_FRAMES[active.value];
    const region = shell && scene ? shell.querySelector<HTMLElement>(scene.selector) : null;
    const nextLayout = new Set(shell?.querySelectorAll<HTMLElement>('.topbar, .character-tabs, .bottom-nav, .page-content') ?? []);
    for (const element of layoutElements) {
      if (!nextLayout.has(element)) {
        resizeObserver?.unobserve(element);
        layoutElements.delete(element);
      }
    }
    for (const element of nextLayout) {
      if (!layoutElements.has(element)) {
        resizeObserver?.observe(element);
        layoutElements.add(element);
      }
    }
    if (region !== observedRegion) {
      if (observedRegion) resizeObserver?.unobserve(observedRegion);
      observedRegion = region;
      if (region) resizeObserver?.observe(region);
    }
    if (!shell || !scene || !region) {
      ready.value = false;
      style.value = {};
      clearPortrait();
      return;
    }
    const rect = region.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const image = region.querySelector<HTMLImageElement>('.character-portrait-base');
    const anchor = image?.complete && image.naturalWidth ? anchors[new URL(image.currentSrc || image.src, window.location.href).pathname] : undefined;
    const isPanorama = Boolean(scene.panorama);
    const portraitBounds = isPanorama
      ? image?.closest<HTMLElement>('.character-portrait-stage')?.getBoundingClientRect() ?? rect
      : rect;
    const footInset = active.value === 'equipment'
      ? Math.max(20, portraitBounds.height * .06)
      : Math.max(5, portraitBounds.height * .04);
    const targetFoot = { x: portraitBounds.left + portraitBounds.width / 2, y: portraitBounds.bottom - footInset };
    let panoramaPortraitScale: number | undefined;
    if (isPanorama && active.value === 'profile' && anchor && image?.naturalWidth === anchor.width && image.naturalHeight === anchor.height) {
      const [minX, minY, maxX] = anchor.visibleBounds;
      panoramaPortraitScale = Math.min(
        Math.max(1, targetFoot.y - portraitBounds.top - 5) / Math.max(1, anchor.footY - minY),
        Math.max(1, portraitBounds.width - 10) / Math.max(1, maxX - minX),
      );
      const minimumX = portraitBounds.left + 5 + (anchor.footX - minX) * panoramaPortraitScale;
      const maximumX = portraitBounds.right - 5 - (maxX - anchor.footX) * panoramaPortraitScale;
      targetFoot.x = Math.max(minimumX, Math.min(maximumX, targetFoot.x));
    }
    const frame = isPanorama
      ? framePanoramicScene({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }, scene, targetFoot)
      : frameRegionalScene(rect, scene);
    const keepCovered = (offset: number, size: number, viewport: number) => size >= viewport
      ? Math.max(viewport - size, Math.min(0, offset)) : (viewport - size) / 2;
    const { left, top } = frame;
    const needsSurroundings = left > 0 || top > 0
      || left + frame.width < window.innerWidth || top + frame.height < window.innerHeight;
    const outerScale = Math.max(frame.scale, window.innerWidth / scene.width, window.innerHeight / scene.height);
    const outerWidth = scene.width * outerScale;
    const outerHeight = scene.height * outerScale;
    style.value = {
      '--anime-framed-scene': `url("${gameAssetUrl(scene.path)}")`,
      '--anime-framed-size': `${frame.width}px ${frame.height}px`,
      '--anime-framed-position': `${left}px ${top}px`,
      '--anime-framed-outer-size': `${outerWidth}px ${outerHeight}px`,
      '--anime-framed-outer-position': `${keepCovered(frame.left, outerWidth, window.innerWidth)}px ${keepCovered(frame.top, outerHeight, window.innerHeight)}px`,
      '--anime-framed-outer-opacity': !isPanorama && needsSurroundings ? '1' : '0',
    };
    ready.value = true;

    if (framedPortrait !== image) clearPortrait();
    if (!image?.complete || !image.naturalWidth || !scene.ground) {
      clearPortrait();
      return;
    }
    if (!anchor || image.naturalWidth !== anchor.width || image.naturalHeight !== anchor.height) {
      clearPortrait();
      return;
    }
    const portraitStage = image.closest<HTMLElement>('.character-portrait-stage');
    if (!portraitStage) return;
    const stageRect = portraitStage.getBoundingClientRect();
    const center = active.value === 'equipment'
      ? shell.querySelector<HTMLElement>('.equipment-summary')?.getBoundingClientRect() ?? stageRect
      : stageRect;
    const target = { x: frame.coreLeft + scene.ground.x * frame.scale, y: frame.coreTop + scene.ground.y * frame.scale };
    const tabs = shell.querySelector<HTMLElement>('.character-tabs')?.getBoundingClientRect();
    const topInset = Math.max(8, (tabs?.bottom ?? rect.top) - rect.top + 8);
    const [minX, minY, maxX] = anchor.visibleBounds;
    const visibleHeight = Math.max(1, anchor.footY - minY);
    const heightBudget = Math.max(1, target.y - rect.top - topInset);
    const scale = panoramaPortraitScale ?? Math.max(0.001, Math.min(
      heightBudget / visibleHeight,
      Math.max(1, target.x - center.left - 2) / Math.max(1, anchor.footX - minX),
      Math.max(1, center.right - target.x - 2) / Math.max(1, maxX - anchor.footX),
    ));
    framedPortrait = image;
    const values = [
      target.x - stageRect.left - anchor.footX * scale,
      target.y - stageRect.top - anchor.footY * scale,
      anchor.width * scale,
      anchor.height * scale,
    ];
    portraitVariables.forEach((name, index) => image.style.setProperty(name, `${values[index]}px`));
    image.classList.add('scene-framed-portrait');
  };
  const schedule = () => {
    if (mounted && !animationFrame) animationFrame = window.requestAnimationFrame(measure);
  };
  watch([root, active], schedule, { flush: 'post' });
  onMounted(() => {
    mounted = true;
    resizeObserver = new ResizeObserver(schedule);
    if (root.value) {
      resizeObserver.observe(root.value);
      mutationObserver = new MutationObserver(schedule);
      mutationObserver.observe(root.value, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['src'] });
      root.value.addEventListener('load', schedule, true);
    }
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.visualViewport?.addEventListener('resize', schedule, { passive: true });
    void document.fonts.ready.then(schedule);
    schedule();
  });
  onBeforeUnmount(() => {
    mounted = false;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    layoutElements.clear();
    mutationObserver?.disconnect();
    root.value?.removeEventListener('load', schedule, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    window.visualViewport?.removeEventListener('resize', schedule);
    clearPortrait();
  });
  return { sceneFramingStyle: style, sceneFramed: ready };
}
