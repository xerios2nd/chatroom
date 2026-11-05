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
  // Voice
  voiceLang: '', // '' = browser language
  sttEngine: 'browser', // 'browser' (Web Speech API) | 'server' (OpenAI-compatible /audio/transcriptions)
  sttModel: 'whisper-1',
  voiceAutoSend: true, // hands-free: send after a pause
  voiceSilenceMs: 2200,
  vadThreshold: 0.02, // mic level that counts as speech (server STT)
  voiceAutoListen: true, // re-open the mic after the interviewer finishes speaking
  ttsEngine: 'browser', // 'browser' | 'server' (OpenAI-compatible /audio/speech) | 'off'
  ttsVoice: '', // browser voiceURI ('' = best match for the language)
  ttsRate: 1,
  ttsPitch: 1,
  ttsModel: 'tts-1',
  ttsServerVoice: 'alloy',
  voiceBaseUrl: '', // '' = same server as chat
  voiceApiKey: '', // '' = same key as chat
});

const ENUMS = {
  theme: ['system', 'light', 'dark'],
  sttEngine: ['browser', 'server'],
  ttsEngine: ['browser', 'server', 'off'],
};

function sanitize(values) {
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (values?.[k] === undefined) continue;
    const v = values[k];
    const type = typeof DEFAULT_SETTINGS[k];
    if (type === 'number') {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    } else if (type === 'boolean') out[k] = !!v;
    else if (!ENUMS[k] || ENUMS[k].includes(v)) out[k] = String(v);
  }
  out.maxRetries = Math.max(0, Math.min(10, Math.round(out.maxRetries)));
  out.timeoutMs = Math.max(2000, out.timeoutMs);
  out.idleTimeoutMs = Math.max(2000, out.idleTimeoutMs);
  out.healthIntervalMs = Math.max(0, out.healthIntervalMs);
  out.voiceSilenceMs = Math.min(10_000, Math.max(500, out.voiceSilenceMs));
  out.ttsRate = Math.min(3, Math.max(0.25, out.ttsRate));
  out.ttsPitch = Math.min(2, Math.max(0, out.ttsPitch));
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
