<script>
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import { createClient } from '../../api/client.js';
  import { createBrowserTTS, createServerTTS, loadBrowserVoices } from '../../voice/tts.js';
  import Icon from '../ui/Icon.svelte';

  /** Edits a settings draft in place. @type {{ draft: Record<string, any> }} */
  let { draft = $bindable() } = $props();

  const { voice, toasts } = getAppState();
  const support = voice.support;

  /** @type {SpeechSynthesisVoice[]} */
  let voices = $state([]);
  let previewing = $state(false);
  let previewStop = null;

  onMount(async () => {
    voices = await loadBrowserVoices();
  });

  const effectiveLang = $derived(draft.voiceLang || navigator.language || 'en-US');
  // Voices for the chosen language first, then the rest.
  const sortedVoices = $derived.by(() => {
    const prefix = effectiveLang.toLowerCase().split('-')[0];
    const match = (v) => v.lang?.toLowerCase().startsWith(prefix);
    return [...voices].sort((a, b) => Number(match(b)) - Number(match(a)) || a.name.localeCompare(b.name));
  });

  async function preview() {
    if (previewing) {
      previewStop?.();
      return;
    }
    const text = "Thanks for joining. Let's start with a question about a project you're proud of.";
    let engine;
    if (draft.ttsEngine === 'server') {
      const client = createClient(() => ({
        baseUrl: draft.voiceBaseUrl || draft.baseUrl,
        apiKey: draft.voiceApiKey || draft.apiKey,
        timeoutMs: draft.timeoutMs,
      }));
      engine = createServerTTS(client, () => ({ model: draft.ttsModel, voice: draft.ttsServerVoice, rate: draft.ttsRate }));
    } else {
      engine = createBrowserTTS(() => ({ voice: draft.ttsVoice, lang: effectiveLang, rate: draft.ttsRate, pitch: draft.ttsPitch }));
    }
    const p = engine.prepare(text);
    previewStop = p.stop;
    previewing = true;
    try {
      await p.play();
    } catch (err) {
      toasts.error('Preview failed', { detail: err.message });
    } finally {
      previewing = false;
      previewStop = null;
    }
  }

  $effect(() => () => previewStop?.());
</script>

<div class="stack">
  <div class="support">
    <span class="chip" class:ok={support.browserSTT}><Icon name={support.browserSTT ? 'check' : 'x'} size={11} /> Browser speech recognition</span>
    <span class="chip" class:ok={support.browserTTS}><Icon name={support.browserTTS ? 'check' : 'x'} size={11} /> Browser speech synthesis</span>
    <span class="chip" class:ok={support.serverSTT}><Icon name={support.serverSTT ? 'check' : 'x'} size={11} /> Mic recording</span>
  </div>

  <label class="field">
    <span class="label">Language</span>
    <input class="input" bind:value={draft.voiceLang} placeholder={`${navigator.language || 'en-US'} (browser default)`} />
    <span class="help">A BCP-47 tag such as <code>en-US</code>, <code>en-GB</code> or <code>de-DE</code>. It's used for recognition and to pick a voice.</span>
  </label>

  <h4>Listening (speech → text)</h4>
  <div class="field">
    <span class="label">Recognition engine</span>
    <div class="seg">
      <button class:on={draft.sttEngine === 'browser'} onclick={() => (draft.sttEngine = 'browser')} disabled={!support.browserSTT}>Browser</button>
      <button class:on={draft.sttEngine === 'server'} onclick={() => (draft.sttEngine = 'server')} disabled={!support.serverSTT}>Server (Whisper API)</button>
    </div>
    <span class="help">
      {#if draft.sttEngine === 'browser'}
        Live transcript, no setup. Chrome and Edge send the audio to their cloud recognizer; Safari can run on-device.
      {:else}
        Records your answer and posts it to <code>/audio/transcriptions</code> on the speech server below (whisper.cpp server, Speaches, faster-whisper-server…). Fully local, with no live transcript.
      {/if}
    </span>
  </div>
  {#if draft.sttEngine === 'server'}
    <div class="grid2" transition:motion={{ fn: slide, duration: 180 }}>
      <label class="field">
        <span class="label">Transcription model</span>
        <input class="input mono" bind:value={draft.sttModel} placeholder="whisper-1" />
      </label>
      <label class="field">
        <span class="label">Mic sensitivity <span class="val">{draft.vadThreshold}</span></span>
        <input type="range" min="0.005" max="0.1" step="0.005" bind:value={draft.vadThreshold} />
        <span class="help">The level that counts as speech. Raise it in a noisy room.</span>
      </label>
    </div>
  {/if}

  <label class="check">
    <input type="checkbox" bind:checked={draft.voiceAutoSend} />
    <span><b>Hands-free</b>: send your answer automatically when you pause.</span>
  </label>
  {#if draft.voiceAutoSend}
    <label class="field" transition:motion={{ fn: slide, duration: 180 }}>
      <span class="label">Pause before sending <span class="val">{(draft.voiceSilenceMs / 1000).toFixed(1)}s</span></span>
      <input type="range" min="800" max="6000" step="100" bind:value={draft.voiceSilenceMs} />
      <span class="help">Longer gives you room to think mid-answer. Shorter feels snappier.</span>
    </label>
  {/if}
  <label class="check">
    <input type="checkbox" bind:checked={draft.voiceAutoListen} />
    <span><b>Auto-listen</b>: open the mic again as soon as the interviewer finishes speaking.</span>
  </label>

  <h4>Speaking (text → speech)</h4>
  <div class="field">
    <span class="label">Speech engine</span>
    <div class="seg">
      <button class:on={draft.ttsEngine === 'browser'} onclick={() => (draft.ttsEngine = 'browser')} disabled={!support.browserTTS}>Browser</button>
      <button class:on={draft.ttsEngine === 'server'} onclick={() => (draft.ttsEngine = 'server')}>Server</button>
      <button class:on={draft.ttsEngine === 'off'} onclick={() => (draft.ttsEngine = 'off')}>Off</button>
    </div>
    <span class="help">
      {#if draft.ttsEngine === 'server'}
        Posts each sentence to <code>/audio/speech</code> (Kokoro-FastAPI, Speaches, openedai-speech…). The next sentence is fetched while the current one plays. If it fails, the browser voice takes over.
      {:else if draft.ttsEngine === 'off'}
        Replies are shown but not spoken.
      {:else}
        Uses the voices installed in your OS or browser. Voices named "Natural", "Neural" or "Google" usually sound best.
      {/if}
    </span>
  </div>

  {#if draft.ttsEngine === 'browser'}
    <label class="field" transition:motion={{ fn: slide, duration: 180 }}>
      <span class="label">Voice</span>
      <select class="select" bind:value={draft.ttsVoice}>
        <option value="">Automatic (best match for {effectiveLang})</option>
        {#each sortedVoices as v (v.voiceURI)}
          <option value={v.voiceURI}>{v.name} · {v.lang}{v.localService ? '' : ' · online'}</option>
        {/each}
      </select>
    </label>
  {:else if draft.ttsEngine === 'server'}
    <div class="grid2" transition:motion={{ fn: slide, duration: 180 }}>
      <label class="field">
        <span class="label">TTS model</span>
        <input class="input mono" bind:value={draft.ttsModel} placeholder="tts-1" />
      </label>
      <label class="field">
        <span class="label">Voice</span>
        <input class="input mono" bind:value={draft.ttsServerVoice} placeholder="alloy" />
      </label>
    </div>
  {/if}

  {#if draft.ttsEngine !== 'off'}
    <div class="grid2">
      <label class="field">
        <span class="label">Speed <span class="val">{draft.ttsRate}×</span></span>
        <input type="range" min="0.5" max="2" step="0.05" bind:value={draft.ttsRate} />
      </label>
      {#if draft.ttsEngine === 'browser'}
        <label class="field">
          <span class="label">Pitch <span class="val">{draft.ttsPitch}</span></span>
          <input type="range" min="0" max="2" step="0.05" bind:value={draft.ttsPitch} />
        </label>
      {/if}
    </div>
    <button class="btn sm preview" onclick={preview}>
      <Icon name={previewing ? 'square' : 'volume-2'} size={14} />
      {previewing ? 'Stop' : 'Preview voice'}
    </button>
  {/if}

  {#if draft.sttEngine === 'server' || draft.ttsEngine === 'server'}
    <h4 transition:motion={{ fn: slide, duration: 180 }}>Speech server</h4>
    <div class="grid2" transition:motion={{ fn: slide, duration: 180 }}>
      <label class="field">
        <span class="label">Base URL</span>
        <input class="input mono" bind:value={draft.voiceBaseUrl} placeholder={draft.baseUrl} />
        <span class="help">Leave blank to use the chat server. <code>/speech/v1</code> is proxied to <code>SPEECH_TARGET</code> in dev.</span>
      </label>
      <label class="field">
        <span class="label">API key</span>
        <input class="input mono" type="password" bind:value={draft.voiceApiKey} placeholder="same as chat" autocomplete="off" />
      </label>
    </div>
  {/if}
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  h4 {
    margin: 6px 0 -4px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ic-text-3);
  }
  .support {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .support .chip {
    color: var(--ic-danger);
  }
  .support .chip.ok {
    color: var(--ic-success);
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .mono {
    font-family: var(--ic-mono);
    font-size: 13px;
  }
  code {
    font-family: var(--ic-mono);
    font-size: 0.92em;
    padding: 0 3px;
    border-radius: 3px;
    background: var(--ic-surface-2);
  }
  .val {
    font-family: var(--ic-mono);
    color: var(--ic-accent);
  }
  input[type='range'] {
    accent-color: var(--ic-accent);
    width: 100%;
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 13px;
    color: var(--ic-text-2);
    cursor: pointer;
  }
  .check input {
    margin-top: 3px;
    accent-color: var(--ic-accent);
  }
  .check b {
    color: var(--ic-text);
  }
  .seg {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: var(--ic-radius-sm);
    background: var(--ic-surface-2);
    border: 1px solid var(--ic-border);
    align-self: flex-start;
  }
  .seg button {
    padding: 5px 12px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--ic-text-2);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  .seg button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .seg button.on {
    background: var(--ic-surface);
    color: var(--ic-text);
    box-shadow: var(--ic-shadow-sm);
    font-weight: 600;
  }
  .preview {
    align-self: flex-start;
  }
  @media (max-width: 560px) {
    .grid2 {
      grid-template-columns: 1fr;
    }
  }
</style>
