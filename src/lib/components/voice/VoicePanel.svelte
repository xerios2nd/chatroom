<script>
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import Icon from '../ui/Icon.svelte';

  /** @type {{ timerText?: string | null, onopensettings?: () => void }} */
  let { timerText = null, onopensettings } = $props();

  const { voice, chat, settings } = getAppState();

  const LABELS = {
    starting: 'Opening microphone…',
    listening: 'Listening',
    transcribing: 'Transcribing…',
    waiting: 'Interviewer is thinking…',
    speaking: 'Interviewer is speaking',
    paused: 'Mic paused',
    error: 'Something went wrong',
  };

  const label = $derived(LABELS[voice.status] ?? '');
  const orbScale = $derived(voice.status === 'listening' ? 1 + Math.min(voice.level, 1) * 0.45 : 1);
  const hint = $derived.by(() => {
    if (voice.status === 'listening') {
      if (!settings.values.voiceAutoSend) return 'Press Space or "Send" when you finish your answer.';
      return `Sends after ${(settings.values.voiceSilenceMs / 1000).toFixed(1)}s of silence. Space sends now.`;
    }
    if (voice.status === 'speaking' || voice.status === 'waiting') return 'Space to interrupt and answer.';
    if (voice.status === 'paused') return 'Space to resume listening.';
    return '';
  });

  function onkeydown(e) {
    if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t?.closest?.('input, textarea, select, button, [contenteditable="true"], [role="dialog"]')) return;
    e.preventDefault();
    if (voice.status === 'listening') voice.submit();
    else if (voice.status === 'speaking' || voice.status === 'waiting') voice.interrupt();
    else if (voice.status === 'paused' || voice.status === 'error') voice.resume();
  }
</script>

<svelte:window {onkeydown} />

<div class="panel {voice.status}" in:motion={{ fn: fly, y: 12, duration: 260, easing: cubicOut }} role="region" aria-label="Voice mode">
  <div class="orb-wrap" aria-hidden="true">
    <div class="orb" style:transform="scale({orbScale})">
      {#if voice.status === 'speaking'}
        <div class="bars"><span></span><span></span><span></span><span></span><span></span></div>
      {:else if voice.status === 'transcribing' || voice.status === 'starting'}
        <Icon name="loader-circle" size={22} spin />
      {:else if voice.status === 'paused'}
        <Icon name="mic-off" size={22} />
      {:else if voice.status === 'error'}
        <Icon name="triangle-alert" size={22} />
      {:else if voice.status === 'waiting'}
        <Icon name="bot" size={22} />
      {:else}
        <Icon name="mic" size={22} />
      {/if}
    </div>
    {#if voice.status === 'listening'}
      <div class="ring" style:opacity={Math.min(0.9, voice.level * 2)} style:transform="scale({1.15 + voice.level * 0.8})"></div>
    {/if}
  </div>

  <div class="center">
    <div class="status-line">
      {#key voice.status}
        <span class="label" in:fade={{ duration: 150 }}>{label}</span>
      {/key}
      {#if timerText && voice.status === 'listening'}
        <span class="chip timer"><Icon name="timer" size={11} />{timerText}</span>
      {/if}
      {#if voice.sttMode === 'server'}<span class="chip">Whisper</span>{/if}
    </div>

    <div class="text" aria-live="polite">
      {#if voice.status === 'error'}
        <span class="err">{voice.error}</span>
      {:else if voice.status === 'listening' || voice.status === 'transcribing'}
        {#if voice.transcript}
          <span class:interim={!voice.transcriptFinal}>{voice.transcript}</span>
        {:else if voice.sttMode === 'server' && voice.heard}
          <span class="muted">Recording your answer…</span>
        {:else}
          <span class="muted">Start speaking…</span>
        {/if}
      {:else if hint}
        <span class="muted">{hint}</span>
      {/if}
    </div>
    {#if hint && (voice.status === 'listening' || voice.status === 'transcribing')}
      <div class="hint">{hint}</div>
    {/if}
  </div>

  <div class="actions">
    {#if voice.status === 'listening'}
      <button class="btn icon" onclick={() => voice.pause()} title="Pause microphone" aria-label="Pause microphone"><Icon name="pause" size={15} /></button>
      <button class="btn primary" onclick={() => voice.submit()} disabled={voice.sttMode === 'browser' && !voice.transcript.trim()}>
        <Icon name="send-horizontal" size={14} /> Send
      </button>
    {:else if voice.status === 'speaking' || voice.status === 'waiting'}
      <button class="btn" onclick={() => voice.interrupt()} title="Stop the interviewer and answer now">
        <Icon name="hand" size={14} /> Interrupt
      </button>
    {:else if voice.status === 'paused'}
      <button class="btn primary" onclick={() => voice.resume()}><Icon name="mic" size={14} /> Resume</button>
    {:else if voice.status === 'error'}
      <button class="btn" onclick={() => voice.retry()} disabled={chat.isBusy(voice.convId)}><Icon name="rotate-ccw" size={14} /> Retry</button>
    {/if}
    {#if onopensettings}
      <button class="btn ghost icon" onclick={onopensettings} title="Voice settings" aria-label="Voice settings"><Icon name="settings" size={15} /></button>
    {/if}
    <button class="btn ghost icon" onclick={() => voice.stop()} title="Switch to typing" aria-label="End voice mode"><Icon name="keyboard" size={16} /></button>
  </div>
</div>

<style>
  .panel {
    --c: var(--ic-accent);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 14px 14px 18px;
    border-radius: var(--ic-radius-lg);
    border: 1px solid color-mix(in srgb, var(--c) 45%, var(--ic-border));
    background:
      radial-gradient(120% 140% at 0% 50%, color-mix(in srgb, var(--c) 12%, transparent), transparent 60%),
      var(--ic-surface);
    box-shadow: var(--ic-shadow), 0 0 0 4px color-mix(in srgb, var(--c) 10%, transparent);
    transition: border-color 0.3s, box-shadow 0.3s;
  }
  .panel.speaking {
    --c: var(--ic-accent-2);
  }
  .panel.paused {
    --c: var(--ic-text-3);
  }
  .panel.error {
    --c: var(--ic-danger);
  }
  .orb-wrap {
    position: relative;
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
  }
  .orb {
    position: relative;
    z-index: 1;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: white;
    background: radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--c) 55%, white), var(--c) 70%);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--c) 45%, transparent);
    transition: transform 0.08s linear, background 0.3s;
  }
  .waiting .orb {
    animation: breathe 1.8s ease-in-out infinite;
  }
  .paused .orb {
    background: var(--ic-surface-3);
    color: var(--ic-text-2);
    box-shadow: none;
  }
  @keyframes breathe {
    50% { transform: scale(1.08); }
  }
  .ring {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    border: 2px solid var(--c);
    transition: transform 0.08s linear, opacity 0.08s linear;
  }
  .speaking .orb-wrap::before,
  .speaking .orb-wrap::after {
    content: '';
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    border: 2px solid var(--c);
    animation: ripple 1.8s var(--ic-ease) infinite;
  }
  .speaking .orb-wrap::after {
    animation-delay: 0.9s;
  }
  @keyframes ripple {
    from { transform: scale(1); opacity: 0.6; }
    to { transform: scale(1.7); opacity: 0; }
  }
  .bars {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 20px;
  }
  .bars span {
    width: 3px;
    height: 100%;
    border-radius: 2px;
    background: white;
    animation: eq 0.9s ease-in-out infinite;
  }
  .bars span:nth-child(2) { animation-delay: 0.15s; }
  .bars span:nth-child(3) { animation-delay: 0.3s; }
  .bars span:nth-child(4) { animation-delay: 0.45s; }
  .bars span:nth-child(5) { animation-delay: 0.6s; }
  @keyframes eq {
    0%, 100% { transform: scaleY(0.3); }
    50% { transform: scaleY(1); }
  }
  .center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .status-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .label {
    font-weight: 650;
    color: var(--c);
  }
  .paused .label {
    color: var(--ic-text-2);
  }
  .timer {
    font-variant-numeric: tabular-nums;
  }
  .text {
    font-size: 14px;
    line-height: 1.45;
    max-height: 4.4em;
    overflow-y: auto;
    overflow-wrap: anywhere;
  }
  .interim {
    color: var(--ic-text-2);
  }
  .muted {
    color: var(--ic-text-3);
  }
  .err {
    color: var(--ic-danger);
  }
  .hint {
    font-size: 11.5px;
    color: var(--ic-text-3);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  @media (max-width: 640px) {
    .panel {
      flex-wrap: wrap;
      gap: 10px 12px;
      padding: 12px;
    }
    .orb-wrap {
      width: 44px;
      height: 44px;
    }
    .orb {
      width: 40px;
      height: 40px;
    }
    .actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
</style>
