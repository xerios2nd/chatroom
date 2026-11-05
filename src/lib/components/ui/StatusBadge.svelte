<script>
  import { getAppState } from '../../state/index.js';
  import { formatRelativeTime } from '../../utils/format.js';

  /** @type {{ compact?: boolean, onclick?: () => void }} */
  let { compact = false, onclick } = $props();
  const { connection } = getAppState();

  const LABELS = {
    idle: 'Not checked',
    checking: 'Checking…',
    online: 'Connected',
    offline: 'Offline',
    unauthorized: 'Bad API key',
    error: 'Server error',
  };

  const label = $derived(LABELS[connection.status] ?? connection.status);
  const title = $derived(
    [
      label,
      connection.latencyMs != null && connection.status === 'online' ? `${connection.latencyMs}ms` : null,
      connection.models.length ? `Models: ${connection.models.map((m) => m.id).join(', ')}` : null,
      connection.error?.message,
      connection.lastCheckedAt ? `Checked ${formatRelativeTime(connection.lastCheckedAt)}` : null,
      'Click to re-check',
    ]
      .filter(Boolean)
      .join('\n'),
  );
</script>

<button class="badge {connection.status}" class:compact {title} onclick={() => (onclick ? onclick() : connection.check())} aria-label="Connection status: {label}">
  <span class="dot"></span>
  {#if !compact}
    <span class="label">{label}</span>
    {#if connection.status === 'online' && connection.latencyMs != null}
      <span class="latency">{connection.latencyMs}ms</span>
    {/if}
  {/if}
</button>

<style>
  .badge {
    --c: var(--ic-text-3);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--ic-border);
    background: var(--ic-surface);
    color: var(--ic-text-2);
    font: inherit;
    font-size: 12px;
    font-weight: 550;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
  }
  .badge:hover {
    border-color: var(--ic-border-strong);
  }
  .badge.compact {
    padding: 0;
    width: 28px;
    justify-content: center;
  }
  .online { --c: var(--ic-success); }
  .checking { --c: var(--ic-accent); }
  .offline, .error { --c: var(--ic-danger); }
  .unauthorized { --c: var(--ic-warning); }
  .dot {
    position: relative;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
    transition: background 0.3s;
  }
  .online .dot::after,
  .checking .dot::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--c);
    animation: pulse 2s var(--ic-ease) infinite;
  }
  .checking .dot::after {
    animation-duration: 0.9s;
  }
  .latency {
    color: var(--ic-text-3);
    font-variant-numeric: tabular-nums;
  }
  @keyframes pulse {
    0% { transform: scale(1); opacity: 0.7; }
    100% { transform: scale(2.8); opacity: 0; }
  }
</style>
