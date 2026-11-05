import { START_MESSAGE } from '../core/presets.js';
import { normalizeError } from '../api/errors.js';
import { createSentenceChunker, splitForSpeech } from '../voice/speechText.js';
import { createBrowserTTS, createServerTTS, createSpeechQueue } from '../voice/tts.js';
import { createBrowserSTT, createRecorder, openMic, SpeechRecognitionCtor } from '../voice/stt.js';

/**
 * Hands-free voice conversation for one conversation at a time.
 *
 *   listening ──(pause / Send now)──▶ [transcribing] ──▶ waiting ──(first sentence)──▶ speaking
 *       ▲                                                                                 │
 *       └───────────────────────(reply spoken; auto-listen)───────────────────────────────┘
 *
 * Also: 'starting' (opening the mic), 'paused' (mic muted), 'error'.
 *
 * Speech is streamed: each completed sentence of the reply is spoken while
 * the rest is still being generated.
 */
export function createVoiceController({ settings, chat, conversations, toasts, voiceClient }) {
  let status = $state('off');
  let convId = $state(null);
  let transcript = $state('');
  let transcriptFinal = $state(true);
  let level = $state(0);
  let heard = $state(false);
  let error = $state(null);
  let errorMsgId = $state(null);
  /** Message being read aloud by the standalone read-aloud button. */
  let readingMsgId = $state(null);
  let ttsFallback = $state(false);

  const s = () => settings.values;
  const lang = () => s().voiceLang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';

  // ---------- capabilities ----------
  const support = {
    get browserSTT() {
      return !!SpeechRecognitionCtor();
    },
    get serverSTT() {
      return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
    },
    get browserTTS() {
      return typeof window !== 'undefined' && 'speechSynthesis' in window;
    },
  };
  function sttEngine() {
    const want = s().sttEngine;
    if (want === 'server' && support.serverSTT) return 'server';
    if (support.browserSTT) return 'browser';
    if (support.serverSTT && want === 'server') return 'server';
    return null;
  }
  const canStart = () => !!sttEngine();

  // ---------- TTS ----------
  const engines = {
    browser: createBrowserTTS(() => ({ voice: s().ttsVoice, lang: lang(), rate: s().ttsRate, pitch: s().ttsPitch })),
    server: createServerTTS(voiceClient, () => ({ model: s().ttsModel, voice: s().ttsServerVoice, rate: s().ttsRate })),
  };
  function ttsEngine() {
    const want = s().ttsEngine;
    if (want === 'off') return null;
    if (want === 'server' && !ttsFallback) return engines.server;
    return engines.browser.supported ? engines.browser : null;
  }

  const queue = createSpeechQueue(ttsEngine, {
    onStart() {
      if (status === 'waiting') status = 'speaking';
    },
    onIdle() {
      if (readingMsgId && status === 'off') {
        readingMsgId = null;
        return;
      }
      readingMsgId = null;
      if (status === 'off') return;
      if (streamEnded) afterReply();
      else if (status === 'speaking') status = 'waiting'; // caught up with the stream, more is coming
    },
    onError(err) {
      readingMsgId = null;
      if (s().ttsEngine === 'server' && engines.browser.supported && !ttsFallback) {
        ttsFallback = true;
        toasts.warning('Server text-to-speech failed. Using the browser voice for now.', { detail: err.message });
      } else {
        toasts.error('Text-to-speech failed', { detail: err.message });
      }
      if (status !== 'off' && streamEnded) afterReply();
      else if (status === 'speaking') status = 'waiting';
    },
  });

  // ---------- mic + level meter ----------
  let mic = null;
  let meterTimer = 0;
  let lastActivity = 0;

  function startMeter() {
    clearInterval(meterTimer);
    // setInterval rather than rAF, so auto-send still works while the tab is in the background.
    meterTimer = setInterval(() => {
      const raw = mic?.level() ?? 0;
      level = level * 0.6 + Math.min(1, raw * 6) * 0.4;
      if (status !== 'listening') return;
      if (sttMode === 'server' && raw > s().vadThreshold) {
        heard = true;
        lastActivity = Date.now();
      }
      if (s().voiceAutoSend && heard && Date.now() - lastActivity > s().voiceSilenceMs) submit({ manual: false });
    }, 50);
  }

  // ---------- STT ----------
  let stt = null;
  let recorder = null;
  let sttMode = null;

  function stopRecognition({ discard = true } = {}) {
    if (stt) discard ? stt.abort() : stt.stop();
    stt = null;
    if (recorder && discard) recorder.cancel();
    if (discard) recorder = null;
  }

  function listen() {
    if (!convId) return;
    stopRecognition();
    transcript = '';
    transcriptFinal = true;
    heard = false;
    error = null;
    errorMsgId = null;
    lastActivity = Date.now();
    sttMode = sttEngine();
    status = 'listening';
    try {
      if (sttMode === 'browser') {
        stt = createBrowserSTT({
          lang: lang(),
          onText(text, finalOnly) {
            if (status !== 'listening') return;
            transcript = text;
            transcriptFinal = finalOnly;
            heard = !!text.trim();
            lastActivity = Date.now();
          },
          onError(err) {
            fail(err.message);
          },
        });
        stt.start();
      } else if (sttMode === 'server') {
        recorder = createRecorder(mic.stream);
      } else {
        throw new Error('No speech recognition available. Use Chrome, Edge or Safari, or configure a server engine in Settings → Voice.');
      }
    } catch (err) {
      fail(err.message);
    }
  }

  /** Finish the current utterance and send it. `manual` = the user pressed Send. */
  async function submit({ manual = true } = {}) {
    if (status !== 'listening') return;
    const id = convId;
    if (sttMode === 'browser') {
      const text = transcript.trim();
      stopRecognition({ discard: false });
      if (!text) return listen();
      return send(id, text);
    }
    // server
    const rec = recorder;
    recorder = null;
    if (!rec) return listen();
    status = 'transcribing';
    try {
      const blob = await rec.stop();
      if (status !== 'transcribing' || convId !== id) return; // cancelled meanwhile
      // The level detector didn't hear speech (auto) or the clip is basically empty: don't bother the server.
      if ((!manual && !heard) || blob.size < 2000) {
        if (manual) toasts.info("Didn't hear anything. Try again, or raise mic sensitivity in Settings → Voice.");
        return listen();
      }
      const text = await voiceClient.transcribe(blob, { model: s().sttModel, language: lang().split('-')[0] });
      if (status !== 'transcribing' || convId !== id) return;
      transcript = text;
      if (!text) {
        toasts.info("Didn't catch that. Try again.");
        return listen();
      }
      send(id, text);
    } catch (err) {
      if (convId !== id) return;
      const e = normalizeError(err);
      toasts.error('Transcription failed', { detail: `${e.message}. ${e.hint}` });
      listen();
    }
  }

  function send(id, text) {
    status = 'waiting';
    chat.send(id, text, { kind: 'voice' });
  }

  // ---------- reply tracking ----------
  let trackingMsgId = null;
  let chunker = null;
  let streamEnded = false;

  function speak(chunks) {
    for (const c of chunks) queue.enqueue(c);
  }

  function track(msgId, existing = '') {
    queue.stop();
    trackingMsgId = msgId;
    chunker = createSentenceChunker();
    streamEnded = false;
    if (existing) speak(chunker.feed(existing));
  }

  chat.subscribe((evt) => {
    if (status === 'off' || evt.convId !== convId) return;
    if (evt.type === 'start') {
      // Any generation in this conversation (our send, a quick action, a regenerate) takes over.
      stopRecognition();
      transcript = '';
      status = 'waiting';
      track(evt.msgId);
      return;
    }
    if (evt.msgId !== trackingMsgId) return;
    if (evt.type === 'delta') {
      speak(chunker.feed(evt.content));
    } else if (evt.type === 'end') {
      streamEnded = true;
      if (evt.status === 'done' || evt.status === 'stopped') speak(chunker.flush());
      if (evt.status === 'error') {
        queue.stop();
        trackingMsgId = null;
        error = evt.error?.message ?? 'The reply failed.';
        errorMsgId = evt.msgId;
        status = 'error';
        return;
      }
      if (!queue.speaking) afterReply();
    }
  });

  function afterReply() {
    trackingMsgId = null;
    chunker = null;
    if (status === 'off') return;
    if (s().voiceAutoListen) listen();
    else status = 'paused';
  }

  function fail(message) {
    stopRecognition();
    error = message;
    errorMsgId = null;
    status = 'error';
  }

  // ---------- public controls ----------
  async function start(id) {
    if (status !== 'off') stop();
    stopReading();
    if (!canStart()) {
      toasts.error('Voice mode is not available in this browser', {
        detail: 'Speech recognition needs Chrome, Edge or Safari, or a server engine (Settings → Voice).',
      });
      return false;
    }
    convId = id;
    status = 'starting';
    error = null;
    ttsFallback = false;
    try {
      mic = await openMic();
    } catch (err) {
      convId = null;
      status = 'off';
      toasts.error('Microphone unavailable', { detail: err.message });
      return false;
    }
    if (convId !== id) return false; // stopped while waiting for permission
    // Speech must be unlocked by a user gesture in some browsers; this call happens inside one.
    if (engines.browser.supported) globalThis.speechSynthesis.cancel();
    startMeter();

    const conv = conversations.get(id);
    const run = chat.run(id);
    if (run) {
      status = 'waiting';
      track(run.msgId, conversations.getMessage(id, run.msgId)?.content ?? '');
    } else if (!conv?.messages.length) {
      status = 'waiting';
      chat.send(id, START_MESSAGE, { kind: 'start' });
    } else {
      listen();
    }
    return true;
  }

  function stop() {
    stopRecognition();
    queue.stop();
    clearInterval(meterTimer);
    mic?.close();
    mic = null;
    trackingMsgId = null;
    chunker = null;
    convId = null;
    transcript = '';
    level = 0;
    heard = false;
    error = null;
    status = 'off';
  }

  /** Cut the interviewer off and start answering. */
  function interrupt() {
    if (status !== 'speaking' && status !== 'waiting') return;
    queue.stop();
    trackingMsgId = null;
    if (chat.isBusy(convId)) chat.stop(convId);
    listen();
  }

  function pause() {
    if (status !== 'listening') return;
    stopRecognition();
    status = 'paused';
  }

  function resume() {
    if (status === 'paused' || status === 'error') listen();
  }

  /** Retry the failed reply that put us in the error state. */
  function retry() {
    if (status !== 'error' || !errorMsgId) return resume();
    const msgId = errorMsgId;
    errorMsgId = null;
    error = null;
    status = 'waiting';
    chat.regenerate(convId, msgId);
  }

  // ---------- read aloud (outside voice mode) ----------
  function readAloud(msg) {
    if (status !== 'off') return;
    if (readingMsgId === msg.id) return stopReading();
    queue.stop();
    if (!ttsEngine()) {
      toasts.warning('Text-to-speech is turned off in Settings → Voice.');
      return;
    }
    readingMsgId = msg.id;
    speak(splitForSpeech(msg.content));
  }

  function stopReading() {
    if (!readingMsgId) return;
    queue.stop();
    readingMsgId = null;
  }

  chat.setVoiceModeResolver((id) => status !== 'off' && id === convId);

  return {
    get status() {
      return status;
    },
    get active() {
      return status !== 'off';
    },
    get convId() {
      return convId;
    },
    get transcript() {
      return transcript;
    },
    get transcriptFinal() {
      return transcriptFinal;
    },
    get level() {
      return level;
    },
    get heard() {
      return heard;
    },
    get error() {
      return error;
    },
    get readingMsgId() {
      return readingMsgId;
    },
    get sttMode() {
      return sttEngine();
    },
    get ttsAvailable() {
      return !!ttsEngine();
    },
    support,
    canStart,
    start,
    stop,
    submit,
    interrupt,
    pause,
    resume,
    retry,
    readAloud,
    stopReading,
    engines,
  };
}
