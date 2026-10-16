<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ source: string; busy?: boolean; error?: string }>(), {
  busy: false,
  error: '',
});
const emit = defineEmits<{ cancel: []; confirm: [imageData: string] }>();

const dialog = ref<HTMLElement | null>(null);
const viewport = ref<HTMLElement | null>(null);
const loading = ref(true);
const loadError = ref('');
const cropError = ref('');
const submitting = ref(false);
const imageWidth = ref(0);
const imageHeight = ref(0);
const viewportSize = ref(1);
const centerX = ref(0);
const centerY = ref(0);
const zoom = ref(1);
const preview = ref('');
const dragging = ref(false);
const blocked = computed(() => props.busy || submitting.value);
const errorMessage = computed(() => loadError.value || cropError.value || props.error);
const imageScale = computed(() => Math.max(viewportSize.value / imageWidth.value, viewportSize.value / imageHeight.value) * zoom.value);
const imageStyle = computed(() => ({
  width: `${imageWidth.value * imageScale.value}px`,
  height: `${imageHeight.value * imageScale.value}px`,
  left: `${viewportSize.value / 2 - centerX.value * imageScale.value}px`,
  top: `${viewportSize.value / 2 - centerY.value * imageScale.value}px`,
}));

let cropImage: HTMLImageElement | null = null;
let decodeRevision = 0;
let previewFrame = 0;
let resizeObserver: ResizeObserver | null = null;
let previousFocus: HTMLElement | null = null;
let disposed = false;
const pointers = new Map<number, { x: number; y: number }>();
let gesture: { x: number; y: number; distance: number; centerX: number; centerY: number; zoom: number } | null = null;

function clampCenter(x: number, y: number, nextZoom = zoom.value) {
  const half = Math.min(imageWidth.value, imageHeight.value) / (2 * nextZoom);
  centerX.value = Math.max(half, Math.min(imageWidth.value - half, x));
  centerY.value = Math.max(half, Math.min(imageHeight.value - half, y));
}

function renderCrop() {
  if (!cropImage || !imageWidth.value || !imageHeight.value) throw new Error('图片尚未加载，请稍候。');
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理图片，请更换浏览器后重试。');
  context.fillStyle = '#fffaf3';
  context.fillRect(0, 0, 256, 256);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const edge = Math.min(imageWidth.value, imageHeight.value) / zoom.value;
  context.drawImage(cropImage, centerX.value - edge / 2, centerY.value - edge / 2, edge, edge, 0, 0, 256, 256);
  return canvas.toDataURL('image/jpeg', .9);
}

function updatePreview() {
  if (previewFrame || !cropImage || loading.value) return;
  previewFrame = requestAnimationFrame(() => {
    previewFrame = 0;
    try {
      preview.value = renderCrop();
      cropError.value = '';
    } catch {
      cropError.value = '无法裁剪这张图片，请取消并选择另一张 JPG、PNG 或 WebP 图片。';
    }
  });
}

function measureViewport() {
  viewportSize.value = Math.max(1, viewport.value?.getBoundingClientRect().width ?? 1);
}

watch(() => props.source, async source => {
  const revision = ++decodeRevision;
  loading.value = true;
  loadError.value = '';
  cropError.value = '';
  preview.value = '';
  cropImage = null;
  submitting.value = false;
  pointers.clear();
  dragging.value = false;
  gesture = null;
  zoom.value = 1;
  imageWidth.value = 0;
  imageHeight.value = 0;
  const decoded = new Image();
  decoded.decoding = 'async';
  try {
    decoded.src = source;
    await decoded.decode();
    if (disposed || revision !== decodeRevision) return;
    if (!decoded.naturalWidth || !decoded.naturalHeight) throw new Error('empty image');
    if (Math.max(decoded.naturalWidth, decoded.naturalHeight) > 16000 || decoded.naturalWidth * decoded.naturalHeight > 40_000_000) {
      loadError.value = '图片尺寸过大，请选择不超过 4000 万像素、长边不超过 16000 像素的图片。';
      return;
    }
    // Browser decoding and drawImage both honor the source image's EXIF orientation.
    cropImage = decoded;
    imageWidth.value = decoded.naturalWidth;
    imageHeight.value = decoded.naturalHeight;
    centerX.value = decoded.naturalWidth / 2;
    centerY.value = decoded.naturalHeight / 2;
    await nextTick();
    measureViewport();
  } catch {
    if (!disposed && revision === decodeRevision) loadError.value = '图片无法打开，请取消并选择一张 JPG、PNG 或 WebP 图片。';
  } finally {
    if (!disposed && revision === decodeRevision) {
      loading.value = false;
      updatePreview();
    }
  }
}, { immediate: true });

watch(() => props.busy, busy => {
  if (!busy) submitting.value = false;
  if (busy) {
    pointers.clear();
    gesture = null;
    dragging.value = false;
  }
});
watch([centerX, centerY, zoom], updatePreview);

function pointAt(event: PointerEvent) {
  const bounds = viewport.value!.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function beginGesture() {
  const points = [...pointers.values()];
  const first = points[0];
  if (!first) { gesture = null; return; }
  const second = points[1];
  gesture = {
    x: second ? (first.x + second.x) / 2 : first.x,
    y: second ? (first.y + second.y) / 2 : first.y,
    distance: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
    centerX: centerX.value,
    centerY: centerY.value,
    zoom: zoom.value,
  };
}

function onPointerDown(event: PointerEvent) {
  if (blocked.value || loading.value || !cropImage || (event.pointerType === 'mouse' && event.button !== 0) || pointers.size >= 2) return;
  event.preventDefault();
  viewport.value?.focus();
  viewport.value?.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, pointAt(event));
  dragging.value = true;
  beginGesture();
}

function onPointerMove(event: PointerEvent) {
  if (blocked.value || !pointers.has(event.pointerId) || !gesture) return;
  event.preventDefault();
  pointers.set(event.pointerId, pointAt(event));
  const points = [...pointers.values()];
  const first = points[0]!;
  const second = points[1];
  const x = second ? (first.x + second.x) / 2 : first.x;
  const y = second ? (first.y + second.y) / 2 : first.y;
  const baseScale = viewportSize.value / Math.min(imageWidth.value, imageHeight.value);
  const initialScale = baseScale * gesture.zoom;
  if (second && gesture.distance > 0) {
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    zoom.value = Math.max(1, Math.min(4, gesture.zoom * distance / gesture.distance));
    const nextScale = baseScale * zoom.value;
    const anchorX = gesture.centerX + (gesture.x - viewportSize.value / 2) / initialScale;
    const anchorY = gesture.centerY + (gesture.y - viewportSize.value / 2) / initialScale;
    clampCenter(anchorX - (x - viewportSize.value / 2) / nextScale, anchorY - (y - viewportSize.value / 2) / nextScale);
  } else {
    clampCenter(gesture.centerX - (x - gesture.x) / initialScale, gesture.centerY - (y - gesture.y) / initialScale);
  }
}

function onPointerEnd(event: PointerEvent) {
  if (!pointers.delete(event.pointerId)) return;
  if (viewport.value?.hasPointerCapture(event.pointerId)) viewport.value.releasePointerCapture(event.pointerId);
  dragging.value = pointers.size > 0;
  beginGesture();
}

function setZoom(value: number) {
  if (blocked.value || loading.value || !cropImage) return;
  zoom.value = Math.max(1, Math.min(4, value));
  clampCenter(centerX.value, centerY.value);
  beginGesture();
}

function resetCrop() {
  if (blocked.value || loading.value || !cropImage) return;
  zoom.value = 1;
  clampCenter(imageWidth.value / 2, imageHeight.value / 2);
}

function onViewportKey(event: KeyboardEvent) {
  if (blocked.value || loading.value || !cropImage) return;
  const movement = (event.shiftKey ? 24 : 8) / imageScale.value;
  const offsets: Record<string, [number, number]> = {
    ArrowLeft: [movement, 0], ArrowRight: [-movement, 0],
    ArrowUp: [0, movement], ArrowDown: [0, -movement],
  };
  if (offsets[event.key]) {
    event.preventDefault();
    const [x, y] = offsets[event.key]!;
    clampCenter(centerX.value + x, centerY.value + y);
  } else if (['+', '=', '-', '_'].includes(event.key)) {
    event.preventDefault();
    setZoom(zoom.value + (event.key === '+' || event.key === '=' ? .1 : -.1));
  }
}

function cancel() {
  if (!blocked.value) emit('cancel');
}

async function confirm() {
  if (blocked.value || loading.value || !cropImage || loadError.value) return;
  try {
    const imageData = renderCrop();
    cropError.value = '';
    submitting.value = true;
    emit('confirm', imageData);
    await nextTick();
    if (!props.busy) submitting.value = false;
  } catch {
    cropError.value = '图片处理失败，请取消并重新选择图片。';
    submitting.value = false;
  }
}

function onDialogKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel();
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])]
    .filter(element => element.getClientRects().length > 0);
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!controls.length) { dialog.value?.focus(); return; }
  const current = controls.indexOf(document.activeElement as HTMLElement);
  const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current + 1) % controls.length;
  controls[next]?.focus();
}

onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value?.focus();
  resizeObserver = new ResizeObserver(measureViewport);
  if (viewport.value) resizeObserver.observe(viewport.value);
  measureViewport();
  window.addEventListener('keydown', onDialogKey, true);
});

onBeforeUnmount(() => {
  disposed = true;
  decodeRevision += 1;
  if (previewFrame) cancelAnimationFrame(previewFrame);
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', onDialogKey, true);
  cropImage = null;
  if (previousFocus?.isConnected) previousFocus.focus();
});
</script>

<template>
  <Teleport to="body">
    <div class="avatar-crop-backdrop" @click.self="cancel">
      <section ref="dialog" class="avatar-crop-dialog" :class="{ 'has-error': errorMessage }" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title" aria-describedby="avatar-crop-instruction" :aria-busy="busy" tabindex="-1">
        <header class="avatar-crop-header">
          <h2 id="avatar-crop-title">裁剪头像</h2>
          <button type="button" class="avatar-crop-close" aria-label="关闭头像裁剪" :disabled="blocked" @click="cancel">×</button>
        </header>
        <div class="avatar-crop-content">
          <div ref="viewport" class="avatar-crop-viewport" :class="{ 'is-dragging': dragging, 'is-unavailable': blocked || loading || loadError }" role="group" aria-label="头像裁剪区域，可拖动图片或使用方向键调整位置" :tabindex="loading || loadError || blocked ? -1 : 0" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerEnd" @pointercancel="onPointerEnd" @lostpointercapture="onPointerEnd" @keydown="onViewportKey">
            <img v-if="imageWidth && !loadError" class="avatar-crop-source" :src="source" alt="" :style="imageStyle" draggable="false" />
            <span v-if="loading" class="avatar-crop-placeholder" role="status">正在读取图片…</span>
            <span v-else-if="loadError" class="avatar-crop-placeholder">请重新选择图片</span>
            <div v-else class="avatar-crop-guides" aria-hidden="true"><span /><span /><span /><span /></div>
          </div>
          <div class="avatar-crop-tools">
            <div class="avatar-crop-preview">
              <img v-if="preview" :src="preview" alt="裁剪后的头像预览" width="64" height="64" />
              <span v-else class="avatar-crop-preview-empty" aria-hidden="true" />
              <span>头像预览</span>
            </div>
            <div class="avatar-crop-adjustments">
              <label class="avatar-crop-zoom" for="avatar-crop-zoom"><span>缩放</span><output>{{ zoom.toFixed(1) }} 倍</output></label>
              <input id="avatar-crop-zoom" type="range" min="1" max="4" step="0.02" :value="zoom" :disabled="blocked || loading || !!loadError" aria-label="头像缩放" @input="setZoom(Number(($event.target as HTMLInputElement).value))" />
              <button type="button" class="avatar-crop-button avatar-crop-reset" :disabled="blocked || loading || !!loadError" @click="resetCrop">重新居中</button>
            </div>
          </div>
        </div>
        <p id="avatar-crop-instruction" class="avatar-crop-instruction">拖动调整位置，滑动调节大小；双指可缩放。</p>
        <p class="avatar-crop-status" :class="{ 'has-error': errorMessage }" :role="errorMessage ? 'alert' : 'status'">{{ errorMessage || (busy ? '正在上传头像，请稍候…' : '确认后上传当前裁剪结果') }}</p>
        <footer class="avatar-crop-footer">
          <button type="button" class="avatar-crop-button" :disabled="blocked" @click="cancel">取消</button>
          <button type="button" class="avatar-crop-button avatar-crop-confirm" :disabled="blocked || loading || !!loadError || !preview" @click="confirm">{{ busy ? '上传中…' : '确认并上传' }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.avatar-crop-backdrop { position: fixed; z-index: 240; inset: 0; display: grid; place-items: center; padding: 10px; background: rgba(29, 37, 52, .68); backdrop-filter: blur(4px); }
.avatar-crop-dialog { box-sizing: border-box; width: min(540px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 12px; overflow: hidden; border: 2px solid #a1bacd; border-radius: 16px; background: linear-gradient(145deg, #fffcf5, #f0f8fa); color: #405369; box-shadow: 0 15px 60px #13283b70, inset 0 0 0 3px #fff8; outline: none; }
.avatar-crop-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }
.avatar-crop-header h2 { margin: 0; color: #42627b; font-size: 17px; line-height: 30px; }
.avatar-crop-close { display: grid; place-items: center; width: 30px; min-width: 30px; height: 30px; min-height: 30px; padding: 0; border: 0; border-radius: 6px; background: #d95f68; color: #fff; font: 700 30px/1 sans-serif; box-shadow: 0 2px 0 #a83c49; cursor: pointer; }
.avatar-crop-content { display: grid; grid-template-columns: minmax(0, 1fr) 140px; align-items: center; gap: 14px; min-height: 0; }
.avatar-crop-viewport { position: relative; box-sizing: border-box; width: min(100%, 312px, calc(100dvh - 190px)); aspect-ratio: 1; justify-self: center; flex-shrink: 0; overflow: hidden; border-radius: 10px; background: #dbe5e9; outline: 2px solid #789caf; outline-offset: 1px; cursor: grab; touch-action: none; user-select: none; }
.avatar-crop-viewport:focus-visible { outline: 3px solid #3186a6; }
.avatar-crop-viewport.is-dragging { cursor: grabbing; }
.avatar-crop-viewport.is-unavailable { cursor: default; }
.avatar-crop-source { position: absolute; max-width: none; max-height: none; pointer-events: none; user-select: none; }
.avatar-crop-placeholder { position: absolute; inset: 0; display: grid; place-items: center; padding: 12px; color: #567184; text-align: center; font-size: 12px; }
.avatar-crop-guides { position: absolute; inset: 0; border: 1px solid #fff9; pointer-events: none; }
.avatar-crop-guides span { position: absolute; background: #fff6; }
.avatar-crop-guides span:nth-child(1), .avatar-crop-guides span:nth-child(2) { inset: 0 auto 0 33.333%; width: 1px; }
.avatar-crop-guides span:nth-child(2) { left: 66.666%; }
.avatar-crop-guides span:nth-child(3), .avatar-crop-guides span:nth-child(4) { inset: 33.333% 0 auto; height: 1px; }
.avatar-crop-guides span:nth-child(4) { top: 66.666%; }
.avatar-crop-tools { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.avatar-crop-preview { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11px; color: #6b8192; }
.avatar-crop-preview img, .avatar-crop-preview-empty { box-sizing: border-box; display: block; width: 64px; height: 64px; border: 2px solid #b8c9d1; border-radius: 50%; background: #e4ebee; box-shadow: 0 2px 6px #425e7020; }
.avatar-crop-adjustments { display: grid; gap: 8px; min-width: 0; }
.avatar-crop-zoom { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; }
.avatar-crop-zoom output { color: #7290a1; font-size: 11px; }
.avatar-crop-adjustments input[type="range"] { box-sizing: border-box; display: block; width: 100%; min-width: 0; height: 23px; margin: 0; accent-color: #5d91ae; cursor: pointer; }
.avatar-crop-button { box-sizing: border-box; min-height: 34px; padding: 4px 11px; border: 3px solid transparent; border-image: url('/assets/light-anime/drawer-button-ornaments-v1/settings-frame.png') 320 / 8px stretch; background: #e9f2f8; color: #42647b; font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; }
.avatar-crop-reset { min-height: 30px; padding: 4px 10px; font-size: 11px; }
.avatar-crop-confirm { background: #d9ebf7; color: #315c78; font-weight: 700; }
.avatar-crop-button:focus-visible, .avatar-crop-close:focus-visible { outline: 3px solid #3688a9; outline-offset: 3px; }
.avatar-crop-dialog button:disabled, .avatar-crop-dialog input:disabled { opacity: .55; cursor: default; }
.avatar-crop-instruction { flex-shrink: 0; margin: 1px 0 0; text-align: center; color: #6b8192; font-size: 11px; line-height: 16px; }
.avatar-crop-status { flex-shrink: 0; margin: 0; min-height: 16px; color: #6b8192; text-align: center; font-size: 11px; line-height: 16px; overflow-wrap: anywhere; }
.avatar-crop-status.has-error { color: #b74653; }
.avatar-crop-footer { display: flex; flex-shrink: 0; justify-content: flex-end; gap: 10px; }
.avatar-crop-dialog.has-error .avatar-crop-viewport { width: min(100%, 312px, calc(100dvh - 222px)); }
@media (max-width: 480px) {
  .avatar-crop-dialog { width: min(360px, 100%); gap: 7px; padding: 10px; }
  .avatar-crop-content { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .avatar-crop-viewport { width: min(100%, 300px, calc(100dvh - 262px)); }
  .avatar-crop-dialog.has-error .avatar-crop-viewport { width: min(100%, 300px, calc(100dvh - 294px)); }
  .avatar-crop-tools { flex-direction: row; align-items: center; gap: 14px; }
  .avatar-crop-preview { gap: 3px; flex-shrink: 0; font-size: 10px; }
  .avatar-crop-preview img, .avatar-crop-preview-empty { width: 52px; height: 52px; }
  .avatar-crop-adjustments { flex: 1; grid-template-columns: minmax(0, 1fr) auto; gap: 1px 7px; align-items: center; }
  .avatar-crop-zoom { grid-column: 1 / -1; }
  .avatar-crop-reset { padding: 4px 8px; min-width: 66px; }
  .avatar-crop-instruction { font-size: 10px; }
  .avatar-crop-footer .avatar-crop-button { flex: 1; }
}
@media (max-height: 380px) and (min-width: 481px) {
  .avatar-crop-dialog { gap: 5px; padding: 9px 12px; }
  .avatar-crop-viewport { width: min(100%, calc(100dvh - 178px)); }
  .avatar-crop-dialog.has-error .avatar-crop-viewport { width: min(100%, calc(100dvh - 210px)); }
  .avatar-crop-tools { gap: 9px; }
}
</style>
