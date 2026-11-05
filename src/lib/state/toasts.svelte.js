import { uid } from '../utils/id.js';

/**
 * @typedef {{id: string, type: 'info'|'success'|'warning'|'error', message: string, detail?: string,
 *   action?: {label: string, run: () => void}}} Toast
 */
export function createToasts() {
  /** @type {Toast[]} */
  let items = $state([]);
  const timers = new Map();

  function dismiss(id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    items = items.filter((t) => t.id !== id);
  }

  /** @param {Omit<Toast, 'id'> & {timeout?: number}} toast */
  function push({ timeout, ...toast }) {
    const id = uid('t_');
    items = [...items.slice(-4), { id, type: 'info', ...toast }];
    const ms = timeout ?? (toast.type === 'error' ? 8000 : 4000);
    if (ms > 0) timers.set(id, setTimeout(() => dismiss(id), ms));
    return id;
  }

  return {
    get items() {
      return items;
    },
    push,
    dismiss,
    info: (message, o) => push({ type: 'info', message, ...o }),
    success: (message, o) => push({ type: 'success', message, ...o }),
    warning: (message, o) => push({ type: 'warning', message, ...o }),
    error: (message, o) => push({ type: 'error', message, ...o }),
  };
}
