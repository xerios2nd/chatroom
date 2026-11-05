export const DEFAULT_SETTINGS = Object.freeze({
  // Connection
  baseUrl: '/unsloth/v1', // proxied by Vite to UNSLOTH_TARGET (default http://localhost:8888)
  apiKey: '',
  model: 'default',
  timeoutMs: 60_000, // time allowed to receive response headers (model warm-up can be slow)
  idleTimeoutMs: 60_000, // max silence between stream chunks
  maxRetries: 3,
  healthIntervalMs: 30_000,
  // Generation
  stream: true,
  includeUsage: true,
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 1024,
  maxContextTokens: 8192,
  // UX
  theme: 'system', // 'system' | 'light' | 'dark'
  sendOnEnter: true,
  showReasoning: true,
});

const NUMERIC = ['timeoutMs', 'idleTimeoutMs', 'maxRetries', 'healthIntervalMs', 'temperature', 'topP', 'maxTokens', 'maxContextTokens'];

function sanitize(values) {
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (values?.[k] === undefined) continue;
    const v = values[k];
    if (NUMERIC.includes(k)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    } else if (typeof DEFAULT_SETTINGS[k] === 'boolean') out[k] = !!v;
    else out[k] = String(v);
  }
  out.maxRetries = Math.max(0, Math.min(10, Math.round(out.maxRetries)));
  out.timeoutMs = Math.max(2000, out.timeoutMs);
  out.idleTimeoutMs = Math.max(2000, out.idleTimeoutMs);
  out.healthIntervalMs = Math.max(0, out.healthIntervalMs);
  return out;
}

/**
 * @param {ReturnType<typeof import('../core/storage.js').createStorage>} storage
 * @param {Partial<typeof DEFAULT_SETTINGS>} [overrides] host-app defaults
 */
export function createSettings(storage, overrides = {}) {
  let values = $state(sanitize({ ...overrides, ...storage.get('settings', {}) }));

  return {
    get values() {
      return values;
    },
    update(patch) {
      values = sanitize({ ...values, ...patch });
      storage.set('settings', values);
    },
    reset() {
      values = sanitize(overrides);
      storage.set('settings', values);
    },
  };
}
