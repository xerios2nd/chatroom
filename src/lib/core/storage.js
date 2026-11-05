/**
 * Namespaced, versioned localStorage wrapper.
 * Every key is prefixed so this module can live inside a larger app without
 * collisions. Every read and write is guarded, so a full or blocked storage
 * degrades to in-memory instead of crashing.
 */
export function createStorage(namespace = 'interview-coach', { backend } = {}) {
  const memory = new Map();
  let store = backend;
  if (!store) {
    try {
      store = globalThis.localStorage;
      const probe = `${namespace}:__probe__`;
      store.setItem(probe, '1');
      store.removeItem(probe);
    } catch {
      store = null;
    }
  }

  const key = (k) => `${namespace}:${k}`;

  return {
    get available() {
      return !!store;
    },
    /** @returns {any} */
    get(k, fallback = null) {
      try {
        const raw = store ? store.getItem(key(k)) : memory.get(key(k));
        if (raw == null) return fallback;
        const parsed = JSON.parse(raw);
        return parsed?.v !== undefined ? parsed.v : fallback;
      } catch {
        return fallback;
      }
    },
    /** @returns {{ok: true} | {ok: false, error: unknown, quota: boolean}} */
    set(k, value) {
      const raw = JSON.stringify({ v: value, t: Date.now() });
      try {
        if (store) store.setItem(key(k), raw);
        else memory.set(key(k), raw);
        return { ok: true };
      } catch (error) {
        const quota = error?.name === 'QuotaExceededError' || error?.code === 22;
        memory.set(key(k), raw);
        return { ok: false, error, quota };
      }
    },
    remove(k) {
      try {
        store?.removeItem(key(k));
      } catch {
        /* ignore */
      }
      memory.delete(key(k));
    },
  };
}
