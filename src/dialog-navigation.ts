import { onBeforeUnmount, onMounted } from 'vue';

/** Keep keyboard interaction inside the foremost blocking dialog. */
export function useDialogNavigation(): void {
  let observer: MutationObserver | undefined;
  let current: HTMLElement | null = null;
  const triggers = new Map<HTMLElement, HTMLElement | null>();
  const visible = (element: HTMLElement) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const focusable = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
  )).filter(element => visible(element) && !element.closest('[inert]'));
  const layer = (element: HTMLElement) => {
    let result = 0;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      result = Math.max(result, Number.parseInt(getComputedStyle(ancestor).zIndex, 10) || 0);
    }
    return result;
  };
  const update = () => {
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')).filter(visible);
    const next = dialogs.sort((left, right) => layer(left) - layer(right)).at(-1) ?? null;
    if (next === current) return;
    if (current && (!current.isConnected || !visible(current))) {
      const trigger = triggers.get(current);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      triggers.delete(current);
    }
    for (const dialog of triggers.keys()) {
      if (!dialog.isConnected || !visible(dialog)) triggers.delete(dialog);
    }
    current = next;
    if (!next) return;
    if (!triggers.has(next)) {
      triggers.set(next, document.activeElement instanceof HTMLElement ? document.activeElement : null);
      if (!next.hasAttribute('tabindex')) next.tabIndex = -1;
      (focusable(next)[0] ?? next).focus({ preventScroll: true });
    } else if (!next.contains(document.activeElement)) {
      (focusable(next)[0] ?? next).focus({ preventScroll: true });
    }
  };
  const keydown = (event: KeyboardEvent) => {
    if (!current) return;
    if (event.key === 'Escape') {
      const close = current.querySelector<HTMLButtonElement>('button[aria-label*="关闭"]');
      if (close && !close.disabled && visible(close)) {
        event.preventDefault();
        close.click();
      }
    } else if (event.key === 'Tab') {
      const controls = focusable(current);
      const first = controls[0] ?? current;
      const last = controls.at(-1) ?? current;
      if (!current.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  };
  onMounted(() => {
    observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-modal', 'style', 'class', 'inert'] });
    document.addEventListener('keydown', keydown);
    update();
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    document.removeEventListener('keydown', keydown);
    triggers.clear();
  });
}
