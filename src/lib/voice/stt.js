/**
 * Speech-to-text building blocks: browser recognition, a microphone level
 * meter, and a recorder for server-side transcription.
 */

export const SpeechRecognitionCtor = () => (typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null);

const SR_ERRORS = {
  'not-allowed': 'Microphone permission was denied.',
  'service-not-allowed': 'Speech recognition is blocked in this browser. Try the server engine in Settings → Voice.',
  'audio-capture': 'No microphone was found.',
  network: "The browser's speech recognition service couldn't be reached. Chrome uses an online service, so try the server engine if you're offline.",
  'language-not-supported': 'This language is not supported by the browser recognizer.',
};

/**
 * Continuous browser speech recognition. Chrome ends sessions on its own every
 * so often, so this restarts transparently until stop() is called.
 *
 * @param {{ lang: string, onText: (text: string, isFinalOnly: boolean) => void, onError: (err: Error) => void }} opts
 */
export function createBrowserSTT({ lang, onText, onError }) {
  const SR = SpeechRecognitionCtor();
  let rec = null;
  let active = false;
  let finals = '';
  let restarts = [];

  function spawn() {
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 1;
    let sessionFinal = '';

    rec.onresult = (e) => {
      let interim = '';
      let fin = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else interim += r[0].transcript;
      }
      sessionFinal = fin;
      onText(join(finals, fin, interim), !interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      active = false;
      onError(new Error(SR_ERRORS[e.error] ?? `Speech recognition error: ${e.error}`));
    };
    rec.onend = () => {
      finals = join(finals, sessionFinal);
      if (!active) return;
      // Restart, unless it keeps dying immediately (which means something is broken).
      const now = Date.now();
      restarts = restarts.filter((t) => now - t < 5000);
      restarts.push(now);
      if (restarts.length > 4) {
        active = false;
        onError(new Error('Speech recognition keeps stopping. Check your microphone.'));
        return;
      }
      try {
        spawn();
      } catch (err) {
        active = false;
        onError(err);
      }
    };
    rec.start();
  }

  return {
    get supported() {
      return !!SR;
    },
    start() {
      if (!SR) throw new Error('Speech recognition is not supported in this browser.');
      active = true;
      finals = '';
      restarts = [];
      spawn();
    },
    /** Stop and keep the results delivered so far. */
    stop() {
      active = false;
      try {
        rec?.stop();
      } catch {
        /* already stopped */
      }
    },
    /** Stop immediately and discard pending results. */
    abort() {
      active = false;
      if (rec) {
        rec.onresult = null;
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

function join(...parts) {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
}

/** Map getUserMedia errors to something a person can act on. */
export function micErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone permission was denied. Allow it from the address bar and try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found.';
    case 'NotReadableError':
      return 'The microphone is in use by another app.';
    default:
      return err?.message || 'Could not access the microphone.';
  }
}

/**
 * Open the microphone with echo cancellation and expose an RMS level (0..~1).
 */
export async function openMic() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access needs a secure context (https or localhost).');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    throw new Error(micErrorMessage(err));
  }

  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = Ctx ? new Ctx() : null;
  let analyser = null;
  let buf = null;
  if (ctx) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    buf = new Float32Array(analyser.fftSize);
  }

  return {
    stream,
    level() {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    },
    close() {
      stream.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    },
  };
}

/** Records one utterance from a stream, for server-side transcription. */
export function createRecorder(stream) {
  if (typeof MediaRecorder === 'undefined') throw new Error('Recording is not supported in this browser.');
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(250);
  const startedAt = Date.now();

  return {
    get durationMs() {
      return Date.now() - startedAt;
    },
    /** @returns {Promise<Blob>} */
    stop() {
      return new Promise((resolve) => {
        if (recorder.state === 'inactive') return resolve(new Blob(chunks, { type: recorder.mimeType }));
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        recorder.stop();
      });
    },
    cancel() {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}
