<script>
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import { copyText } from '../../utils/clipboard.js';
  import { formatDuration } from '../../utils/format.js';
  import { QUICK_ACTIONS } from '../../core/presets.js';
  import Icon from '../ui/Icon.svelte';
  import Markdown from './Markdown.svelte';
  import RunStatus from './RunStatus.svelte';

  /**
   * @type {{ message: import('../../state/conversations.svelte.js').Message, convId: string, isLastAssistant: boolean }}
   */
  let { message, convId, isLastAssistant } = $props();

  const { chat, conversations, toasts, settings, voice } = getAppState();
  const reading = $derived(voice.readingMsgId === message.id);

  const busy = $derived(chat.isBusy(convId));
  const run = $derived(chat.run(convId));
  const isRunTarget = $derived(run?.msgId === message.id);
  const isUser = $derived(message.role === 'user');
  const action = $derived(message.kind && message.kind !== 'start' ? QUICK_ACTIONS.find((a) => a.id === message.kind) : null);

  let editing = $state(false);
  let draft = $state('');
  let copied = $state(false);
  let showReasoning = $state(false);

  // Keep reasoning open while the model is "thinking" and there's no answer yet.
  const reasoningOpen = $derived(showReasoning || (message.status === 'streaming' && !message.content));

  async function copy() {
    if (await copyText(message.content)) {
      copied = true;
      setTimeout(() => (copied = false), 1400);
    } else toasts.error('Could not copy to clipboard.');
  }

  function startEdit() {
    draft = message.content;
    editing = true;
  }

  function saveEdit() {
    editing = false;
    if (draft.trim() && draft.trim() !== message.content) chat.editAndResend(convId, message.id, draft);
  }

  function editKeydown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit();
    if (e.key === 'Escape') editing = false;
  }

  function autosize(node) {
    const fit = () => {
      node.style.height = 'auto';
      node.style.height = `${Math.min(node.scrollHeight, 400)}px`;
    };
    fit();
    node.focus();
    node.addEventListener('input', fit);
    return { destroy: () => node.removeEventListener('input', fit) };
  }

  const metaBits = $derived.by(() => {
    const m = message.meta;
    if (!m || message.role !== 'assistant' || message.status === 'pending') return [];
    const bits = [];
    if (m.model && m.model !== 'default') bits.push({ icon: 'bot', text: m.model });
    if (m.firstTokenMs != null) bits.push({ icon: 'zap', text: `${formatDuration(m.firstTokenMs)} to first token`, title: 'Time to first token' });
    if (m.durationMs != null) bits.push({ icon: 'clock', text: formatDuration(m.durationMs) });
    if (m.tokensPerSec) bits.push({ icon: 'gauge', text: `${m.tokensPerSec} tok/s` });
    if (m.usage?.completion_tokens) bits.push({ text: `${m.usage.completion_tokens} tokens`, title: `Prompt ${m.usage.prompt_tokens ?? '?'} · completion ${m.usage.completion_tokens}` });
    if (m.attempts) bits.push({ icon: 'refresh-cw', text: `${m.attempts} retr${m.attempts === 1 ? 'y' : 'ies'}`, warn: true });
    if (m.trimmed) bits.push({ icon: 'triangle-alert', text: `${m.trimmed} older message(s) left out to fit context`, warn: true });
    if (m.finishReason === 'length') bits.push({ icon: 'triangle-alert', text: 'cut off (max tokens)', warn: true });
    return bits;
  });
</script>

<article
  class="msg {message.role}"
  class:action={!!action}
  in:motion={{ fn: fly, y: 12, duration: 260, easing: cubicOut }}
  aria-label={isUser ? 'You' : 'Interviewer'}
>
  {#if !isUser}
    <div class="avatar" class:pulse={isRunTarget}><Icon name="bot" size={16} /></div>
  {/if}

  <div class="body">
    {#if action}
      <div class="action-tag"><Icon name={action.icon} size={12} /> {action.label}</div>
    {:else if message.kind === 'voice'}
      <div class="action-tag spoken" title="Transcribed from speech"><Icon name="mic" size={12} /> Spoken</div>
    {/if}

    {#if editing}
      <div class="edit" transition:slide={{ duration: 150 }}>
        <textarea class="textarea" bind:value={draft} use:autosize onkeydown={editKeydown}></textarea>
        <div class="edit-actions">
          <span class="hint">Saving discards later messages and regenerates. <span class="kbd">Ctrl+Enter</span></span>
          <button class="btn sm" onclick={() => (editing = false)}>Cancel</button>
          <button class="btn sm primary" onclick={saveEdit} disabled={!draft.trim()}>Save & resend</button>
        </div>
      </div>
    {:else}
      {#if message.reasoning && settings.values.showReasoning}
        <div class="reasoning">
          <button class="reasoning-toggle" onclick={() => (showReasoning = !showReasoning)} aria-expanded={reasoningOpen}>
            <Icon name="brain" size={13} />
            {message.status === 'streaming' && !message.content ? 'Thinking…' : 'Reasoning'}
            <span class="chev" class:open={reasoningOpen}><Icon name="chevron-right" size={13} /></span>
          </button>
          {#if reasoningOpen}
            <div class="reasoning-body" transition:slide={{ duration: 180 }}>{message.reasoning}</div>
          {/if}
        </div>
      {/if}

      {#if message.content}
        <div class="bubble">
          {#if isUser}
            <div class="plain">{message.content}</div>
          {:else}
            <Markdown source={message.content} streaming={message.status === 'streaming'} />
          {/if}
        </div>
      {/if}

      {#if isRunTarget && run && run.phase !== 'streaming'}
        <RunStatus {run} />
      {/if}

      {#if message.status === 'stopped'}
        <div class="note">
          <Icon name="square" size={11} /> Stopped
          {#if isLastAssistant && !busy}
            · <button class="link" onclick={() => chat.regenerate(convId, message.id)}>Regenerate</button>
          {/if}
        </div>
      {/if}

      {#if message.status === 'error' && message.error}
        <div class="error" role="alert" transition:slide={{ duration: 200 }}>
          <div class="error-head">
            <Icon name="triangle-alert" size={15} />
            <strong>{message.content ? 'Reply interrupted' : 'Reply failed'}</strong>
            {#if message.error.status}<span class="chip">HTTP {message.error.status}</span>{/if}
          </div>
          <div class="error-msg">{message.error.message}</div>
          {#if message.error.hint}<div class="error-hint">{message.error.hint}</div>{/if}
          <div class="error-actions">
            <button class="btn sm" onclick={() => chat.regenerate(convId, message.id)} disabled={busy}>
              <Icon name="rotate-ccw" size={13} /> Retry
            </button>
            <button class="btn sm ghost" onclick={() => conversations.removeMessage(convId, message.id)} disabled={busy}>Dismiss</button>
          </div>
        </div>
      {/if}

      {#if metaBits.length}
        <div class="meta">
          {#each metaBits as b, i (i)}
            <span class:warn={b.warn} title={b.title ?? b.text}>
              {#if b.icon}<Icon name={b.icon} size={11} />{/if}{b.text}
            </span>
          {/each}
        </div>
      {/if}

      {#if message.content && !isRunTarget}
        <div class="tools">
          <button class="btn ghost icon sm" onclick={copy} title="Copy" aria-label="Copy message">
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
          {#if isUser}
            <button class="btn ghost icon sm" onclick={startEdit} disabled={busy} title="Edit & resend" aria-label="Edit message">
              <Icon name="pencil" size={14} />
            </button>
          {:else}
            {#if !voice.active && settings.values.ttsEngine !== 'off'}
              <button class="btn ghost icon sm" class:reading onclick={() => voice.readAloud(message)} title={reading ? 'Stop reading' : 'Read aloud'} aria-label={reading ? 'Stop reading' : 'Read aloud'} aria-pressed={reading}>
                <Icon name={reading ? 'volume-x' : 'volume-2'} size={14} />
              </button>
            {/if}
          {/if}
          {#if !isUser && isLastAssistant}
            <button class="btn ghost icon sm" onclick={() => chat.regenerate(convId, message.id)} disabled={busy} title="Regenerate" aria-label="Regenerate reply">
              <Icon name="refresh-cw" size={14} />
            </button>
          {/if}
          <button class="btn ghost icon sm" onclick={() => conversations.removeMessage(convId, message.id)} disabled={busy} title="Delete" aria-label="Delete message">
            <Icon name="trash" size={14} />
          </button>
        </div>
      {/if}
    {/if}
  </div>
</article>

<style>
  .msg {
    display: flex;
    gap: 12px;
    max-width: 820px;
    margin: 0 auto;
    width: 100%;
  }
  .msg.user {
    justify-content: flex-end;
  }
  .avatar {
    position: relative;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--ic-surface);
    border: 1px solid var(--ic-border);
    color: var(--ic-accent);
    box-shadow: var(--ic-shadow-sm);
  }
  .avatar.pulse::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid var(--ic-accent);
    opacity: 0;
    animation: ring 1.6s var(--ic-ease) infinite;
  }
  @keyframes ring {
    0% { transform: scale(0.9); opacity: 0.6; }
    100% { transform: scale(1.35); opacity: 0; }
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
    flex: 1;
  }
  .user .body {
    align-items: flex-end;
    flex: 0 1 auto;
    max-width: min(85%, 640px);
  }
  .bubble {
    max-width: 100%;
  }
  .assistant .bubble {
    padding-top: 4px;
  }
  .user .bubble {
    padding: 10px 14px;
    border-radius: 18px 18px 4px 18px;
    background: var(--ic-user-bubble);
    color: white;
    box-shadow: 0 4px 14px color-mix(in srgb, var(--ic-accent) 25%, transparent);
  }
  .user.action .bubble {
    background: var(--ic-surface);
    color: var(--ic-text);
    border: 1px dashed var(--ic-accent);
    box-shadow: none;
  }
  .action-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ic-accent);
  }
  .action-tag.spoken {
    color: var(--ic-text-3);
  }
  .tools .reading {
    color: var(--ic-accent);
    opacity: 1;
  }
  .msg:has(.reading) .tools {
    opacity: 1;
    transform: none;
  }
  .plain {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .reasoning {
    border: 1px solid var(--ic-border);
    border-radius: var(--ic-radius);
    background: var(--ic-surface);
    overflow: hidden;
    align-self: flex-start;
    max-width: 100%;
  }
  .reasoning-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border: 0;
    background: none;
    color: var(--ic-text-2);
    font: inherit;
    font-size: 12px;
    font-weight: 550;
    cursor: pointer;
  }
  .chev {
    display: inline-flex;
    transition: transform 0.2s var(--ic-ease);
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .reasoning-body {
    padding: 2px 12px 10px;
    font-size: 12.5px;
    color: var(--ic-text-2);
    white-space: pre-wrap;
    max-height: 260px;
    overflow-y: auto;
  }
  .note {
    font-size: 12px;
    color: var(--ic-text-3);
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--ic-accent);
    font: inherit;
    cursor: pointer;
  }
  .error {
    border: 1px solid color-mix(in srgb, var(--ic-danger) 35%, transparent);
    background: var(--ic-danger-soft);
    border-radius: var(--ic-radius);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-self: stretch;
  }
  .error-head {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--ic-danger);
  }
  .error-msg {
    font-family: var(--ic-mono);
    font-size: 12px;
    color: var(--ic-text);
    overflow-wrap: anywhere;
  }
  .error-hint {
    font-size: 12.5px;
    color: var(--ic-text-2);
  }
  .error-actions {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 11px;
    color: var(--ic-text-3);
  }
  .meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .meta .warn {
    color: var(--ic-warning);
  }
  .tools {
    display: flex;
    gap: 2px;
    opacity: 0;
    transform: translateY(-2px);
    transition: opacity 0.15s, transform 0.15s;
    color: var(--ic-text-3);
  }
  .msg:hover .tools,
  .msg:focus-within .tools {
    opacity: 1;
    transform: none;
  }
  @media (hover: none) {
    .tools {
      opacity: 1;
      transform: none;
    }
  }
  .edit {
    width: min(640px, 100%);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .edit-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .hint {
    font-size: 11.5px;
    color: var(--ic-text-3);
    margin-right: auto;
  }
</style>
