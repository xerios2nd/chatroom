<script>
  import { fade } from 'svelte/transition';
  import Icon from '../ui/Icon.svelte';

  /** @type {{ run: {phase: string, attempt: number, maxRetries: number, retryAt: number|null, lastError: string|null, startedAt: number} }} */
  let { run } = $props();

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });

  const elapsed = $derived(Math.max(0, Math.floor((now - run.startedAt) / 1000)));
  const retryIn = $derived(run.retryAt ? Math.max(0, Math.ceil((run.retryAt - now) / 1000)) : 0);
</script>

<div class="status" aria-live="polite">
  {#key run.phase}
    <span class="row" in:fade={{ duration: 150 }}>
      {#if run.phase === 'retrying'}
        <Icon name="refresh-cw" size={13} spin />
        <span>
          Retrying in <b>{retryIn}s</b> (retry {run.attempt} of {run.maxRetries})
          {#if run.lastError}<span class="err" title={run.lastError}>· {run.lastError}</span>{/if}
        </span>
      {:else if run.phase === 'connecting'}
        <Icon name="loader-circle" size={13} spin />
        <span>{run.attempt ? `Reconnecting (attempt ${run.attempt + 1})…` : 'Connecting to model…'}</span>
      {:else if run.phase === 'waiting'}
        <span class="dots"><span></span><span></span><span></span></span>
        <span>Interviewer is thinking… {#if elapsed > 2}<span class="muted">{elapsed}s</span>{/if}</span>
        {#if elapsed > 20}<span class="muted">· Large prompts can take a while to process</span>{/if}
      {/if}
    </span>
  {/key}
</div>

<style>
  .status {
    font-size: 12.5px;
    color: var(--ic-text-2);
    min-height: 22px;
    display: flex;
    align-items: center;
  }
  .row {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }
  .muted {
    color: var(--ic-text-3);
  }
  .err {
    color: var(--ic-danger);
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
    vertical-align: bottom;
  }
  .dots {
    display: inline-flex;
    gap: 3px;
  }
  .dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ic-accent);
    animation: wave 1.2s infinite ease-in-out;
  }
  .dots span:nth-child(2) { animation-delay: 0.15s; }
  .dots span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes wave {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
    30% { transform: translateY(-4px); opacity: 1; }
  }
</style>
