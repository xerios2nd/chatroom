<script>
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import { DIFFICULTY, START_MESSAGE } from '../../core/presets.js';
  import Icon from '../ui/Icon.svelte';

  /** @type {{ conversation: import('../../state/conversations.svelte.js').Conversation, onopenconfig: (section?: string) => void, onopensettings: () => void }} */
  let { conversation, onopenconfig, onopensettings } = $props();

  const { conversations, chat, connection, presets } = getAppState();
  const cfg = $derived(conversation.config);
  const contextCount = $derived(cfg.contexts.filter((c) => c.enabled && c.content.trim()).length);

  const set = (patch) => conversations.updateConfig(conversation.id, patch);

  function start() {
    chat.send(conversation.id, START_MESSAGE, { kind: 'start' });
  }
</script>

<div class="empty scroll">
  <div class="inner">
    <div class="hero" in:motion={{ fn: fly, y: 16, duration: 400, easing: cubicOut }}>
      <div class="glow"><Icon name="sparkles" size={22} /></div>
      <h1>Set up your mock interview</h1>
      <p>Pick a format, describe the role, add your resume or the job description, then start. You can tweak everything in the config panel later.</p>
    </div>

    {#if connection.status === 'offline' || connection.status === 'unauthorized' || connection.status === 'error'}
      <div class="warn" in:motion={{ fn: fly, y: 8, duration: 300 }}>
        <Icon name="wifi-off" size={16} />
        <div>
          <strong>{connection.status === 'unauthorized' ? 'API key rejected' : "Can't reach the model server"}</strong>
          <div class="sub">{connection.error?.hint ?? connection.error?.message ?? 'Check your connection settings.'}</div>
        </div>
        <button class="btn sm" onclick={() => connection.check()}>Retry</button>
        <button class="btn sm" onclick={onopensettings}>Settings</button>
      </div>
    {/if}

    <div class="grid" role="radiogroup" aria-label="Interview type">
      {#each presets as p, i (p.id)}
        <button
          class="preset"
          class:selected={cfg.presetId === p.id}
          role="radio"
          aria-checked={cfg.presetId === p.id}
          onclick={() => set({ presetId: p.id })}
          in:motion={{ fn: fly, y: 12, duration: 300, delay: 60 + i * 35, easing: cubicOut }}
        >
          <span class="pi"><Icon name={p.icon} size={16} /></span>
          <span class="pl">{p.label}</span>
          <span class="pd">{p.description}</span>
        </button>
      {/each}
    </div>

    <div class="row" in:motion={{ fn: fly, y: 12, duration: 300, delay: 300 }}>
      <label class="field">
        <span class="label">Target role</span>
        <input class="input" placeholder="e.g. Senior Frontend Engineer" value={cfg.role} oninput={(e) => set({ role: e.currentTarget.value })} />
      </label>
      <label class="field">
        <span class="label">Company <span class="opt">optional</span></span>
        <input class="input" placeholder="e.g. Acme Corp" value={cfg.company} oninput={(e) => set({ company: e.currentTarget.value })} />
      </label>
      <div class="field">
        <span class="label">Difficulty</span>
        <div class="seg">
          {#each DIFFICULTY as d (d.id)}
            <button class:on={cfg.difficulty === d.id} onclick={() => set({ difficulty: d.id })}>{d.label}</button>
          {/each}
        </div>
      </div>
    </div>

    <div class="actions" in:motion={{ fn: fly, y: 12, duration: 300, delay: 360 }}>
      <button class="btn" onclick={() => onopenconfig('context')}>
        <Icon name="file-text" size={15} />
        {contextCount ? `${contextCount} context doc${contextCount > 1 ? 's' : ''}` : 'Add resume / job description'}
      </button>
      <button class="btn" onclick={() => onopenconfig()}>
        <Icon name="sliders-horizontal" size={15} /> More options
      </button>
      <button class="btn primary start" onclick={start} disabled={chat.isBusy(conversation.id)}>
        <Icon name="play" size={15} /> Start interview
      </button>
    </div>
    <p class="tip">Or just type your own opening message below.</p>
  </div>
</div>

<style>
  .empty {
    flex: 1;
    min-height: 0;
    padding: 32px 20px;
  }
  .inner {
    max-width: 820px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .hero {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .glow {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    color: white;
    background: var(--ic-user-bubble);
    box-shadow: 0 10px 30px color-mix(in srgb, var(--ic-accent) 45%, transparent);
    animation: float 4s ease-in-out infinite;
    margin-bottom: 6px;
  }
  @keyframes float {
    50% { transform: translateY(-4px) rotate(-3deg); }
  }
  h1 {
    margin: 0;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  .hero p {
    margin: 0;
    color: var(--ic-text-2);
    max-width: 540px;
  }
  .warn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--ic-radius);
    background: var(--ic-warning-soft);
    border: 1px solid color-mix(in srgb, var(--ic-warning) 40%, transparent);
    color: var(--ic-text);
  }
  .warn > :global(.ic-icon) {
    color: var(--ic-warning);
  }
  .warn > div {
    flex: 1;
  }
  .warn .sub {
    font-size: 12.5px;
    color: var(--ic-text-2);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
  .preset {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 12px;
    text-align: left;
    border-radius: var(--ic-radius);
    border: 1px solid var(--ic-border);
    background: var(--ic-surface);
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.2s, transform 0.2s var(--ic-ease);
  }
  .preset:hover {
    transform: translateY(-2px);
    box-shadow: var(--ic-shadow);
  }
  .preset.selected {
    border-color: var(--ic-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--ic-accent) 18%, transparent);
  }
  .pi {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: var(--ic-accent-soft);
    color: var(--ic-accent);
    transition: background 0.2s, color 0.2s;
  }
  .selected .pi {
    background: var(--ic-accent);
    color: white;
  }
  .pl {
    font-weight: 600;
  }
  .pd {
    font-size: 12px;
    color: var(--ic-text-3);
    line-height: 1.4;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 12px;
    align-items: end;
  }
  .opt {
    font-weight: 400;
    color: var(--ic-text-3);
  }
  .seg {
    display: inline-flex;
    padding: 3px;
    border-radius: var(--ic-radius-sm);
    background: var(--ic-surface-2);
    border: 1px solid var(--ic-border);
  }
  .seg button {
    padding: 5px 10px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--ic-text-2);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .seg button.on {
    background: var(--ic-surface);
    color: var(--ic-text);
    box-shadow: var(--ic-shadow-sm);
    font-weight: 600;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .start {
    margin-left: auto;
    padding: 0 18px;
  }
  .tip {
    margin: -10px 0 0;
    text-align: right;
    font-size: 12px;
    color: var(--ic-text-3);
  }
  @media (max-width: 720px) {
    .row {
      grid-template-columns: 1fr;
    }
    .start {
      margin-left: 0;
      width: 100%;
    }
    .tip {
      text-align: center;
    }
  }
</style>
