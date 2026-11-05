/**
 * Text-to-speech engines and a sequential playback queue.
 *
 * Every engine has the same interface:
 *   prepare(text) → { play(): Promise<void>, stop(): void }
 * `prepare` may start work early (server engines prefetch audio while the
 * previous chunk is still playing). `play` resolves when playback finishes or is stopped.
 */

const synth = () => globalThis.speechSynthesis;

export function browserVoices() {
  try {
    return synth()?.getVoices?.() ?? [];
  } catch {
    return [];
  }
}

/** Resolves once the browser has loaded its voice list (Chrome loads it asynchronously). */
export function loadBrowserVoices(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = synth();
    if (!s) return resolve([]);
    const now = browserVoices();
    if (now.length) return resolve(now);
    const done = () => {
      s.removeEventListener?.('voiceschanged', done);
      resolve(browserVoices());
    };
    s.addEventListener?.('voiceschanged', done);
    setTimeout(done, timeoutMs);
  });
}

function pickVoice(voiceURI, lang) {
  const voices = browserVoices();
  if (voiceURI) {
    const v = voices.find((x) => x.voiceURI === voiceURI);
    if (v) return v;
  }
  if (!lang) return null;
  const prefix = lang.toLowerCase().split('-')[0];
  const matches = voices.filter((v) => v.lang?.toLowerCase().startsWith(prefix));
  // Prefer an exact locale match, then the "natural"/online voices, which sound far better.
  return (
    matches.find((v) => v.lang?.toLowerCase() === lang.toLowerCase() && /natural|google|neural/i.test(v.name)) ??
    matches.find((v) => v.lang?.toLowerCase() === lang.toLowerCase()) ??
    matches[0] ??
    null
  );
}

/**
 * Web Speech API speechSynthesis.
 * @param {() => {voice?: string, lang?: string, rate?: number, pitch?: number}} getOptions
 */
export function createBrowserTTS(getOptions) {
  // Chrome garbage-collects utterances mid-speech (so `end` never fires) unless we keep a reference.
  const live = new Set();

  return {
    id: 'browser',
    get supported() {
      return !!synth() && typeof SpeechSynthesisUtterance !== 'undefined';
    },
    prepare(text) {
      let finish = () => {};
      let utter;
      return {
        play: () =>
          new Promise((resolve, reject) => {
            const s = synth();
            if (!s) return reject(new Error('Speech synthesis is not available in this browser.'));
            const o = getOptions();
            utter = new SpeechSynthesisUtterance(text);
            const voice = pickVoice(o.voice, o.lang);
            if (voice) {
              utter.voice = voice;
              utter.lang = voice.lang;
            } else if (o.lang) utter.lang = o.lang;
            utter.rate = o.rate ?? 1;
            utter.pitch = o.pitch ?? 1;

            // Safety net: some engines never fire `end`. Give up after ~3x the expected duration.
            const expectedMs = (text.length / 14) * 1000 / (utter.rate || 1);
            const watchdog = setTimeout(() => finish(), expectedMs * 3 + 4000);

            finish = (err) => {
              clearTimeout(watchdog);
              live.delete(utter);
              finish = () => {};
              err ? reject(err) : resolve();
            };
            utter.onend = () => finish();
            utter.onerror = (e) => {
              if (e.error === 'interrupted' || e.error === 'canceled') finish();
              else finish(new Error(`Speech synthesis failed (${e.error})`));
            };
            live.add(utter);
            s.speak(utter);
            // Chrome sometimes starts in a paused state after a cancel().
            if (s.paused) s.resume();
          }),
        stop: () => {
          synth()?.cancel();
          finish();
        },
      };
    },
    stopAll() {
      synth()?.cancel();
    },
  };
}

/**
 * Server TTS through an OpenAI-compatible /audio/speech endpoint.
 * @param {{ synthesize: (text: string, opts: any) => Promise<Blob> }} client
 * @param {() => {model: string, voice: string, rate?: number}} getOptions
 */
export function createServerTTS(client, getOptions) {
  return {
    id: 'server',
    supported: typeof Audio !== 'undefined',
    prepare(text) {
      const controller = new AbortController();
      const o = getOptions();
      // Start fetching right away, so the next chunk is ready by the time the current one ends.
      const blobPromise = client.synthesize(text, { model: o.model, voice: o.voice, speed: o.rate, signal: controller.signal });
      blobPromise.catch(() => {}); // the error surfaces from play()
      let audio;
      let url;
      let finish = () => {};
      let stopped = false;

      return {
        play: async () => {
          const blob = await blobPromise;
          if (stopped) return;
          url = URL.createObjectURL(blob);
          audio = new Audio(url);
          try {
            await new Promise((resolve, reject) => {
              finish = resolve;
              audio.onended = () => resolve();
              audio.onerror = () => reject(new Error('The browser could not play the returned audio.'));
              audio.play().catch(reject);
            });
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        stop: () => {
          stopped = true;
          controller.abort();
          audio?.pause();
          finish();
        },
      };
    },
    stopAll() {},
  };
}

/**
 * Plays prepared chunks one after another.
 * @param {() => ReturnType<typeof createBrowserTTS> | null} getEngine
 * @param {{ onStart?: () => void, onIdle?: () => void, onError?: (err: Error) => void }} [hooks]
 */
export function createSpeechQueue(getEngine, { onStart, onIdle, onError } = {}) {
  let items = [];
  let current = null;
  let running = false;
  let generation = 0;

  async function run() {
    const gen = generation;
    running = true;
    onStart?.();
    while (items.length && gen === generation) {
      current = items.shift();
      try {
        await current.play();
      } catch (err) {
        if (gen !== generation) break;
        onError?.(err);
        stop();
        return;
      }
    }
    if (gen !== generation) return;
    current = null;
    running = false;
    onIdle?.();
  }

  function enqueue(text) {
    const engine = getEngine();
    if (!engine || !text?.trim()) return false;
    items.push(engine.prepare(text));
    if (!running) run();
    return true;
  }

  /** Stop playback and drop everything queued. Does not fire onIdle. */
  function stop() {
    generation++;
    current?.stop();
    for (const it of items) it.stop();
    items = [];
    current = null;
    running = false;
  }

  return {
    enqueue,
    stop,
    get speaking() {
      return running;
    },
    get pending() {
      return items.length;
    },
  };
}
