/** Short, sortable-ish unique id. Uses crypto.randomUUID when available. */
export function uid(prefix = '') {
  const rand =
    globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12) ??
    Math.random().toString(36).slice(2, 14);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}
