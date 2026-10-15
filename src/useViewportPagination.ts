import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

type MeasuredValue = number | (() => number);
type PaginationOptions = {
  container: Ref<HTMLElement | null>;
  rowHeight: MeasuredValue;
  columns?: MeasuredValue;
  gap?: MeasuredValue;
  reserve?: MeasuredValue;
};

/** Paginate a complete local list inside the space left by the page's fixed controls. */
export function useViewportPagination<T>(items: () => readonly T[], options: PaginationOptions) {
  const page = ref(1);
  const pageSize = ref(1);
  const value = (input: MeasuredValue | undefined, fallback: number) => typeof input === 'function' ? input() : input ?? fallback;
  const totalPages = computed(() => Math.max(1, Math.ceil(items().length / pageSize.value)));
  const visibleItems = computed(() => items().slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
  let observer: ResizeObserver | undefined;
  let frame = 0;
  let stopped = false;

  function measure() {
    const element = options.container.value;
    if (!element) return;
    const style = getComputedStyle(element);
    const height = Math.max(0, element.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0') - value(options.reserve, 0));
    const gap = Math.max(0, value(options.gap, parseFloat(style.rowGap) || 0));
    const columns = Math.max(1, Math.floor(value(options.columns, 1)));
    const rows = Math.max(1, Math.floor((height + gap) / (Math.max(1, value(options.rowHeight, 64)) + gap)));
    const capacity = rows * columns;
    if (capacity !== pageSize.value) {
      const anchor = (page.value - 1) * pageSize.value;
      pageSize.value = capacity;
      page.value = Math.min(totalPages.value, Math.floor(anchor / capacity) + 1);
    }
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  }
  function setPage(next: number) { page.value = Math.max(1, Math.min(totalPages.value, Math.floor(next))); }
  function reset() { page.value = 1; schedule(); }

  watch(() => items(), () => { setPage(page.value); schedule(); });
  watch(options.container, async element => {
    observer?.disconnect();
    await nextTick();
    if (stopped) return;
    if (element) observer?.observe(element);
    schedule();
  }, { flush: 'post' });
  onMounted(() => {
    observer = new ResizeObserver(schedule);
    if (options.container.value) observer.observe(options.container.value);
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
  });
  onBeforeUnmount(() => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', schedule);
  });
  return { page, pageSize, totalPages, visibleItems, setPage, reset, measure };
}
