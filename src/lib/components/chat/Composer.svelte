<script>
  import { fly, scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import { QUICK_ACTIONS } from '../../core/presets.js';
  import { estimateTokens } from '../../core/tokens.js';
  import { debounce } from '../../utils/format.js';
  import Icon from '../ui/Icon.svelte';

  /** @type {{ conversation: import('../../state/conversations.svelte.js').Conversation }} */
  let { conversation } = $props();

  const { chat, settings, toasts, storage } = getAppState();

  // ---- drafts (per conversation, survive reloads) ----
  /** @type {Record<string, string>} */
  const drafts = $state(storage.get('drafts', {}));
  const saveDrafts = debounce(() => storage.set('drafts', $state.snapshot(drafts)), 500);
  const draft = $derived(drafts[conversation.id] ?? '');
  function setDraft(v) {
    if (v) drafts[conversation.id] = v;
    else delete drafts[conversation.id];
    saveDrafts();
  }

  let textarea = $state();
  const busy = $derived(chat.isBusy(conversation.id));
  const hasMessages = $derived(conversation.messages.length > 0);
  const tokens = $derived(estimateTokens(draft));

  // ---- autosize ----
  $effect(() => {
    draft;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 260)}px`;
  });

  // Focus the box when switching conversations or after a reply finishes.
  $effect(() => {
    conversation.id;
    if (!busy) textarea?.focus({ preventScroll: true });
  });

  function submit() {
    if (busy || !draft.trim()) return;
    const text = draft;
    setDraft('');
    stopListening();
    chat.send(conversation.id, text);
  }

  function onkeydown(e) {
    if (e.isComposing) return;
    const send = settings.values.sendOnEnter ? e.key === 'Enter' && !e.shiftKey : e.key === 'Enter' && (e.metaKey || e.ctrlKey);
    if (send) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && busy) {
      chat.stop(conversation.id);
    }
  }

  function quick(action) {
    if (busy) return;
    chat.send(conversation.id, action.text, { kind: action.id });
  }

  // ---- answer timer: how long you've been answering the current question ----
  const last = $derived(conversation.messages.at(-1));
  const waitingForAnswer = $derived(last?.role === 'assistant' && last.status === 'done');
  // Approximate completion time of the interviewer's last turn.
  const answerStart = $derived(waitingForAnswer ? last.createdAt + (last.meta?.durationMs ?? 0) : null);
  let now = $state(Date.now());
  $effect(() => {
    if (!waitingForAnswer) return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  const answerSecs = $derived(answerStart ? Math.max(0, Math.floor((now - answerStart) / 1000)) : 0);
  // Don't show a stale timer for conversations left open for ages.
  const showTimer = $derived(waitingForAnswer && answerSecs < 30 * 60);
  const timerText = $derived(`${Math.floor(answerSecs / 60)}:${String(answerSecs % 60).padStart(2, '0')}`);

  // ---- voice input (Web Speech API, where supported) ----
  const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  let recognition = null;
  let listening = $state(false);
  let baseDraft = '';

  function toggleListening() {
    if (listening) return stopListening();
    if (!SpeechRecognition) return;
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';
      baseDraft = draft ? `${draft.trimEnd()} ` : '';
      recognition.onresult = (e) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        setDraft(baseDraft + text);
      };
      recognition.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          toasts.error('Voice input failed', { detail: e.error === 'not-allowed' ? 'Microphone permission was denied.' : e.error });
        }
        listening = false;
      };
      recognition.onend = () => (listening = false);
      recognition.start();
      listening = true;
    } catch (err) {
      toasts.error('Voice input unavailable', { detail: err.message });
      listening = false;
    }
  }

  function stopListening() {
    recognition?.stop();
    listening = false;
  }

  $effect(() => () => recognition?.abort());
</script>

<div class="composer">
  {#if hasMessages}
    <div class="quick" in:motion={{ fn: fly, y: 8, duration: 250 }}>
      {#each QUICK_ACTIONS as a (a.id)}
        <button class="qa" onclick={() => quick(a)} disabled={busy} title={a.text}>
          <Icon name={a.icon} size={13} />{a.label}
        </button>
      {/each}
    </div>
  {/if}

  <div class="box" class:listening class:busy>
    <textarea
      bind:this={textarea}
      value={draft}
      oninput={(e) => setDraft(e.currentTarget.value)}
      {onkeydown}
      rows="1"
      placeholder={busy ? 'Waiting for the interviewer…' : hasMessages ? 'Type your answer…' : 'Type an opening message, or use "Start interview" above…'}
      aria-label="Your answer"
    ></textarea>

    <div class="bar">
      <div class="left">
        {#if showTimer}
          <span class="chip timer" class:long={answerSecs >= 120} title="Time on this answer. Aim for about 1–2 minutes for most spoken answers." transition:motion={{ fn: scale, start: 0.8, duration: 200 }}>
            <Icon name="timer" size={12} />{timerText}
          </span>
        {/if}
        {#if draft}
          <span class="count">{draft.trim().split(/\s+/).filter(Boolean).length} words · ~{tokens} tokens</span>
        {:else}
          <span class="count hint">
            {#if settings.values.sendOnEnter}<span class="kbd">Enter</span> send · <span class="kbd">Shift+Enter</span> newline{:else}<span class="kbd">Ctrl+Enter</span> send{/if}
            {#if busy}· <span class="kbd">Esc</span> stop{/if}
          </span>
        {/if}
      </div>

      {#if SpeechRecognition}
        <button class="btn ghost icon mic" class:on={listening} onclick={toggleListening} title={listening ? 'Stop dictation' : 'Dictate your answer'} aria-pressed={listening} aria-label="Voice input">
          <Icon name={listening ? 'mic-off' : 'mic'} size={16} />
        </button>
      {/if}

      {#if busy}
        <button class="btn send stop" onclick={() => chat.stop(conversation.id)} aria-label="Stop generating" in:motion={{ fn: scale, start: 0.6, duration: 220, easing: backOut }}>
          <Icon name="square" size={14} /> Stop
        </button>
      {:else}
        <button class="btn primary send" onclick={submit} disabled={!draft.trim()} aria-label="Send" in:motion={{ fn: scale, start: 0.6, duration: 220, easing: backOut }}>
          <Icon name="send-horizontal" size={15} /> Send
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .composer {
    padding: 8px 20px 16px;
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .quick {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 2px;
  }
  .qa {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--ic-border);
    background: var(--ic-surface);
    color: var(--ic-text-2);
    font: inherit;
    font-size: 12.5px;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s var(--ic-ease);
  }
  .qa:hover:not(:disabled) {
    border-color: var(--ic-accent);
    color: var(--ic-accent);
    background: var(--ic-accent-soft);
    transform: translateY(-1px);
  }
  .qa:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .box {
    border: 1px solid var(--ic-border);
    background: var(--ic-surface);
    border-radius: var(--ic-radius-lg);
    box-shadow: var(--ic-shadow);
    padding: 10px 10px 8px 14px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .box:focus-within {
    border-color: var(--ic-accent);
    box-shadow: var(--ic-shadow), 0 0 0 3px color-mix(in srgb, var(--ic-accent) 15%, transparent);
  }
  .box.listening {
    border-color: var(--ic-danger);
    animation: listen 1.6s ease-in-out infinite;
  }
  @keyframes listen {
    50% { box-shadow: var(--ic-shadow), 0 0 0 5px color-mix(in srgb, var(--ic-danger) 18%, transparent); }
  }
  textarea {
    width: 100%;
    border: 0;
    outline: none;
    resize: none;
    background: transparent;
    color: var(--ic-text);
    font: inherit;
    font-size: 14.5px;
    line-height: 1.5;
    max-height: 260px;
    padding: 2px 0;
  }
  textarea:focus-visible {
    outline: none;
  }
  textarea::placeholder {
    color: var(--ic-text-3);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }
  .left {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .count {
    font-size: 11.5px;
    color: var(--ic-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .timer {
    font-variant-numeric: tabular-nums;
    transition: color 0.3s, background 0.3s;
  }
  .timer.long {
    color: var(--ic-warning);
    background: var(--ic-warning-soft);
  }
  .mic.on {
    color: var(--ic-danger);
  }
  .send {
    border-radius: 10px;
    min-width: 84px;
  }
  .stop {
    color: var(--ic-danger);
    border-color: color-mix(in srgb, var(--ic-danger) 40%, transparent);
  }
  @media (max-width: 640px) {
    .composer {
      padding: 6px 10px 10px;
    }
    .hint {
      display: none;
    }
  }
</style>
