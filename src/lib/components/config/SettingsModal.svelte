<script>
  import { slide } from 'svelte/transition';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import { DEFAULT_SETTINGS } from '../../state/settings.svelte.js';
  import { createClient } from '../../api/client.js';
  import Modal from '../ui/Modal.svelte';
  import Icon from '../ui/Icon.svelte';
  import VoiceSettings from '../voice/VoiceSettings.svelte';

  /** @type {{ open: boolean, tab?: string }} */
  let { open = $bindable(false), tab = $bindable('connection') } = $props();

  const { settings, connection, toasts, dialogs } = getAppState();

  let draft = $state({ ...settings.values });
  let showKey = $state(false);
  let testing = $state(false);
  /** @type {null | {ok: boolean, latencyMs: number, models?: {id: string}[], error?: any}} */
  let testResult = $state(null);

  // Re-sync the draft every time the modal opens.
  $effect(() => {
    if (open) {
      draft = { ...settings.values };
      testResult = null;
    }
  });

  const dirty = $derived(Object.keys(DEFAULT_SETTINGS).some((k) => draft[k] !== settings.values[k]));

  async function test() {
    testing = true;
    testResult = null;
    const tmp = createClient(() => draft);
    testResult = await tmp.ping({ timeoutMs: Math.min(draft.timeoutMs, 10_000) });
    testing = false;
  }

  function save() {
    settings.update($state.snapshot(draft));
    open = false;
    toasts.success('Settings saved.');
    connection.check();
  }

  async function reset() {
    const ok = await dialogs.confirm({ title: 'Reset all settings?', message: 'Restores connection and generation defaults. Your conversations are not affected.', confirmLabel: 'Reset' });
    if (ok) draft = { ...DEFAULT_SETTINGS };
  }

  const TABS = [
    { id: 'connection', label: 'Connection', icon: 'server' },
    { id: 'generation', label: 'Generation', icon: 'sliders-horizontal' },
    { id: 'voice', label: 'Voice', icon: 'audio-lines' },
    { id: 'app', label: 'App', icon: 'settings' },
  ];

  const SHORTCUTS = [
    ['Ctrl/⌘ + Shift + O', 'New interview'],
    ['Ctrl/⌘ + ,', 'Settings'],
    ['Ctrl/⌘ + .', 'Interview setup panel'],
    ['Ctrl/⌘ + B', 'Toggle sidebar'],
    ['Esc', 'Stop generating / close panels'],
    ['Ctrl/⌘ + Enter', 'Save an edited message'],
    ['Space (voice mode)', 'Send answer / interrupt / resume'],
  ];
</script>

<Modal bind:open title="Settings" width="600px">
  <div class="tabs" role="tablist">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => (tab = t.id)}>
        <Icon name={t.icon} size={14} />{t.label}
      </button>
    {/each}
  </div>

  {#if tab === 'connection'}
    <div class="stack">
      <label class="field">
        <span class="label">Base URL</span>
        <input class="input mono" bind:value={draft.baseUrl} placeholder="http://localhost:8888/v1" />
        <span class="help">
          Default <code>/unsloth/v1</code> goes through the Vite proxy to <code>UNSLOTH_TARGET</code> (default <code>http://localhost:8888</code>), so CORS doesn't get in the way.
          Set a full URL like <code>http://localhost:8888/v1</code> to call the server directly.
        </span>
      </label>
      <label class="field">
        <span class="label">API key</span>
        <div class="with-btn">
          <input class="input mono" type={showKey ? 'text' : 'password'} bind:value={draft.apiKey} placeholder="sk-unsloth-…" autocomplete="off" spellcheck="false" />
          <button class="btn icon" onclick={() => (showKey = !showKey)} aria-label={showKey ? 'Hide key' : 'Show key'}><Icon name={showKey ? 'eye-off' : 'eye'} /></button>
        </div>
        <span class="help">Printed by <code>unsloth run</code>, or create one in Unsloth → Settings → API. It's stored in this browser's localStorage.</span>
      </label>
      <label class="field">
        <span class="label">Model</span>
        <input class="input mono" list="ic-settings-models" bind:value={draft.model} placeholder="default" />
        <datalist id="ic-settings-models">
          {#each testResult?.models ?? connection.models as m (m.id)}<option value={m.id}></option>{/each}
        </datalist>
        <span class="help"><code>default</code> uses whichever model is loaded in Unsloth.</span>
      </label>

      <div class="test">
        <button class="btn" onclick={test} disabled={testing || !draft.baseUrl}>
          <Icon name={testing ? 'loader-circle' : 'wifi'} spin={testing} size={15} /> Test connection
        </button>
        {#if testResult}
          <div class="result" class:ok={testResult.ok} transition:motion={{ fn: slide, duration: 180 }}>
            {#if testResult.ok}
              <Icon name="circle-check" size={15} />
              <span>Connected in {testResult.latencyMs}ms{testResult.models?.length ? ` · ${testResult.models.length} model(s): ${testResult.models.map((m) => m.id).join(', ')}` : ''}</span>
            {:else}
              <Icon name="circle-x" size={15} />
              <span><b>{testResult.error?.message}</b><br />{testResult.error?.hint}</span>
            {/if}
          </div>
        {/if}
      </div>

      <div class="grid3">
        <label class="field">
          <span class="label">Response timeout (s)</span>
          <input class="input" type="number" min="2" value={draft.timeoutMs / 1000} oninput={(e) => (draft.timeoutMs = Number(e.currentTarget.value) * 1000)} />
        </label>
        <label class="field">
          <span class="label">Stream stall timeout (s)</span>
          <input class="input" type="number" min="2" value={draft.idleTimeoutMs / 1000} oninput={(e) => (draft.idleTimeoutMs = Number(e.currentTarget.value) * 1000)} />
        </label>
        <label class="field">
          <span class="label">Max retries</span>
          <input class="input" type="number" min="0" max="10" bind:value={draft.maxRetries} />
        </label>
        <label class="field">
          <span class="label">Health check every (s)</span>
          <input class="input" type="number" min="0" value={draft.healthIntervalMs / 1000} oninput={(e) => (draft.healthIntervalMs = Number(e.currentTarget.value) * 1000)} />
          <span class="help">0 = off</span>
        </label>
      </div>
    </div>
  {:else if tab === 'generation'}
    <div class="stack">
      <label class="field">
        <span class="label">Temperature <span class="val">{draft.temperature}</span></span>
        <input type="range" min="0" max="2" step="0.05" bind:value={draft.temperature} />
        <span class="help">Lower = more predictable interviewer. Higher = more varied questions.</span>
      </label>
      <label class="field">
        <span class="label">Top P <span class="val">{draft.topP}</span></span>
        <input type="range" min="0" max="1" step="0.01" bind:value={draft.topP} />
      </label>
      <div class="grid3">
        <label class="field">
          <span class="label">Max tokens / reply</span>
          <input class="input" type="number" min="16" step="64" bind:value={draft.maxTokens} />
        </label>
        <label class="field">
          <span class="label">Max context tokens</span>
          <input class="input" type="number" min="512" step="512" bind:value={draft.maxContextTokens} />
          <span class="help">Older messages are dropped to fit.</span>
        </label>
      </div>
      <label class="check">
        <input type="checkbox" bind:checked={draft.stream} />
        <span><b>Stream responses</b>: show tokens as they're generated.</span>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={draft.includeUsage} disabled={!draft.stream} />
        <span><b>Request token usage</b> (<code>stream_options.include_usage</code>). Turn this off if your server rejects it.</span>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={draft.showReasoning} />
        <span><b>Show model reasoning</b> for thinking models that stream <code>reasoning_content</code>.</span>
      </label>
    </div>
  {:else if tab === 'voice'}
    <VoiceSettings bind:draft />
  {:else}
    <div class="stack">
      <div class="field">
        <span class="label">Theme</span>
        <div class="seg">
          {#each [['system', 'monitor', 'System'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']] as [id, icon, label] (id)}
            <button class:on={draft.theme === id} onclick={() => (draft.theme = id)}><Icon name={icon} size={14} />{label}</button>
          {/each}
        </div>
      </div>
      <label class="check">
        <input type="checkbox" bind:checked={draft.sendOnEnter} />
        <span><b>Enter sends</b>. Turn off to send with Ctrl/⌘+Enter, which makes long, multi-paragraph answers easier.</span>
      </label>
      <div class="field">
        <span class="label">Keyboard shortcuts</span>
        <div class="shortcuts">
          {#each SHORTCUTS as [k, d] (k)}
            <span class="kbd">{k}</span><span>{d}</span>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <button class="btn ghost" onclick={reset}><Icon name="rotate-ccw" size={14} /> Defaults</button>
    <span style="flex:1"></span>
    <button class="btn" onclick={() => (open = false)}>Cancel</button>
    <button class="btn primary" onclick={save} disabled={!dirty}>Save</button>
  {/snippet}
</Modal>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--ic-border);
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    background: none;
    color: var(--ic-text-2);
    font: inherit;
    font-weight: 550;
    cursor: pointer;
    transition: color 0.15s, border-color 0.2s;
  }
  .tabs button.on {
    color: var(--ic-accent);
    border-bottom-color: var(--ic-accent);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .grid3 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
  .with-btn {
    display: flex;
    gap: 6px;
  }
  .test {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .result {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 8px 10px;
    border-radius: var(--ic-radius-sm);
    font-size: 12.5px;
    background: var(--ic-danger-soft);
    color: var(--ic-text);
    width: 100%;
  }
  .result :global(.ic-icon) {
    color: var(--ic-danger);
    margin-top: 1px;
  }
  .result.ok {
    background: var(--ic-success-soft);
  }
  .result.ok :global(.ic-icon) {
    color: var(--ic-success);
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--ic-text-2);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--ic-surface);
    color: var(--ic-text);
    box-shadow: var(--ic-shadow-sm);
    font-weight: 600;
  }
  .shortcuts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    align-items: center;
    font-size: 12.5px;
    color: var(--ic-text-2);
  }
  .shortcuts .kbd {
    justify-self: start;
  }
</style>
