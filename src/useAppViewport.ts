import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

export function useAppViewport() {
  const size = ref({ width: window.innerWidth, height: window.innerHeight, top: 0, left: 0 });
  const update = () => {
    const viewport = window.visualViewport;
    size.value = { width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight,
      top: viewport?.offsetTop ?? 0, left: viewport?.offsetLeft ?? 0 };
  };
  onMounted(() => {
    update();
    window.addEventListener('resize', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update, { passive: true });
    window.visualViewport?.addEventListener('scroll', update, { passive: true });
  });
  onBeforeUnmount(() => {
    window.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('scroll', update);
  });
  return computed(() => ({ '--app-viewport-width': `${size.value.width}px`, '--app-viewport-height': `${size.value.height}px`,
    '--app-viewport-top': `${size.value.top}px`, '--app-viewport-left': `${size.value.left}px` }));
}
