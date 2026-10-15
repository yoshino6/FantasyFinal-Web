import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';

export function useExplorationViewport(shell: Ref<HTMLElement | null>, active: Ref<boolean>) {
  const style = ref<Record<string, string>>({});
  let observer: ResizeObserver | undefined;
  let childrenObserver: MutationObserver | undefined;
  const measure = () => {
    if (!active.value || !shell.value) return;
    const elements = shell.value.querySelectorAll('.topbar, .anime-status-ribbon');
    elements.forEach(element => observer?.observe(element));
    const bottom = Math.max(0, ...Array.from(elements, element => element.getBoundingClientRect().bottom));
    style.value = { '--exploration-controls-top': `${Math.ceil(bottom) + 8}px` };
  };
  watch([shell, active], async () => {
    observer?.disconnect();
    childrenObserver?.disconnect();
    await nextTick();
    if (!shell.value || !active.value) return;
    observer = new ResizeObserver(measure);
    shell.value.querySelectorAll('.topbar, .anime-status-ribbon').forEach(element => observer!.observe(element));
    observer.observe(shell.value);
    // The resource ribbon is inserted after the first authenticated panel read.
    childrenObserver = new MutationObserver(measure);
    childrenObserver.observe(shell.value, { childList: true });
    measure();
  }, { flush: 'post' });
  window.addEventListener('resize', measure);
  onBeforeUnmount(() => { observer?.disconnect(); childrenObserver?.disconnect(); window.removeEventListener('resize', measure); });
  return style;
}
