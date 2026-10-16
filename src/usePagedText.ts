import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

/** Fit complete text into fixed-height pages; render each returned line with the measured line height. */
export function usePagedText(paragraphs: () => readonly string[], container: Ref<HTMLElement | null>) {
  const page = ref(1);
  const lines = ref<string[]>([]);
  const linesPerPage = ref(1);
  const totalPages = computed(() => Math.max(1, Math.ceil(lines.value.length / linesPerPage.value)));
  const visibleLines = computed(() => lines.value.slice((page.value - 1) * linesPerPage.value, page.value * linesPerPage.value));
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let context: CanvasRenderingContext2D | null = null;
  let observer: ResizeObserver | undefined;
  let frame = 0;
  let mounted = false;
  let stopped = false;

  function changePage(next: number) {
    page.value = Number.isFinite(next) ? Math.max(1, Math.min(totalPages.value, Math.floor(next))) : 1;
  }

  function measure() {
    const element = container.value;
    if (!element || !element.clientWidth || !element.clientHeight) return;
    const style = getComputedStyle(element);
    const number = (value: string) => parseFloat(value) || 0;
    const width = Math.max(1, element.clientWidth - number(style.paddingLeft) - number(style.paddingRight));
    const height = Math.max(1, element.clientHeight - number(style.paddingTop) - number(style.paddingBottom));
    const lineHeight = number(style.lineHeight) || number(style.fontSize) * 1.2 || 20;
    context ??= document.createElement('canvas').getContext('2d');
    if (!context) return;
    context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const letterSpacing = number(style.letterSpacing);
    const tabSize = Math.max(1, number(style.tabSize) || 8);
    const tabWidth = Math.max(1, context.measureText(' ').width * tabSize);
    const textWidth = (value: string, count: number) => {
      let result = 0;
      const parts = value.split('\t');
      for (let index = 0; index < parts.length; index++) {
        if (index) result = (Math.floor(result / tabWidth) + 1) * tabWidth;
        result += context!.measureText(parts[index]).width;
      }
      return result + Math.max(0, count - 1) * letterSpacing;
    };
    const nextLines: string[] = [];
    for (const paragraph of paragraphs()) {
      // Keep explicit empty lines and hard breaks, including a paragraph's trailing newline.
      for (const hardLine of paragraph.replace(/\r\n?/g, '\n').split('\n')) {
        let line = '';
        let count = 0;
        for (const { segment } of segmenter.segment(hardLine)) {
          const candidate = line + segment;
          if (count && textWidth(candidate, count + 1) > width) {
            nextLines.push(line);
            line = segment;
            count = 1;
          } else {
            line = candidate;
            count++;
          }
        }
        nextLines.push(line);
      }
    }
    lines.value = nextLines;
    linesPerPage.value = Math.max(1, Math.floor(height / lineHeight));
    changePage(page.value);
  }

  function schedule() {
    if (!mounted || stopped) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  }

  watch(() => paragraphs().slice(), () => { page.value = 1; schedule(); }, { deep: true, flush: 'post' });
  watch(container, element => {
    observer?.disconnect();
    if (element && !stopped) observer?.observe(element);
    schedule();
  }, { flush: 'post' });
  onMounted(() => {
    mounted = true;
    observer = new ResizeObserver(schedule);
    if (container.value) observer.observe(container.value);
    window.addEventListener('resize', schedule, { passive: true });
    document.fonts?.addEventListener('loadingdone', schedule);
    void document.fonts?.ready.then(schedule);
    schedule();
  });
  onBeforeUnmount(() => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', schedule);
    document.fonts?.removeEventListener('loadingdone', schedule);
  });
  return { visibleLines, page, totalPages, changePage };
}
