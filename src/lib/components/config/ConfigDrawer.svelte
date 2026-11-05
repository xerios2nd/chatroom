<script>
  import { fly, fade, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import { SENIORITY, DIFFICULTY, STYLES, FEEDBACK_MODES } from '../../core/presets.js';
  import { buildSystemPrompt, defaultConversationConfig } from '../../core/prompt.js';
  import { estimateTokens } from '../../core/tokens.js';
  import { copyText } from '../../utils/clipboard.js';
  import Icon from '../ui/Icon.svelte';
  import ContextEditor from './ContextEditor.svelte';

  /**
   * @type {{ open: boolean, conversation: import('../../state/conversations.svelte.js').Conversation, focusSection?: string|null, onclose: () => void }}
   */
  let { open, conversation, focusSection = null, onclose } = $props();

  const { conversations, settings, connection, toasts, dialogs, presets } = getAppState();
  const cfg = $derived(conversation.config);
  const set = (patch) => conversations.updateConfig(conversation.id, patch);
  const setParam = (patch) => set({ params: { ...cfg.params, ...patch } });

  const systemPrompt = $derived(buildSystemPrompt(cfg, presets));
  const promptTokens = $derived(estimateTokens(systemPrompt));
  const budget = $derived(settings.values.maxContextTokens);
  const budgetPct = $derived(Math.min(100, Math.round((promptTokens / budget) * 100)));
  let showPrompt = $state(false);
  let panel = $state();

  $effect(() => {
    if (open && focusSection && panel) {
      queueMicrotask(() => panel.querySelector(`[data-section="${focusSection}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  });

  /** Number input → number | null (blank = inherit global). */
  const num = (v) => (v === '' || v == null ? null : Number(v));

  async function resetConfig() {
    const ok = await dialogs.confirm({ title: 'Reset interview setup?', message: 'Restores default options. Your context documents are kept.', confirmLabel: 'Reset' });
    if (ok) set({ ...defaultConversationConfig(), contexts: $state.snapshot(cfg.contexts) });
  }

  async function copyPrompt() {
    if (await copyText(systemPrompt)) toasts.success('System prompt copied.');
  }

  function onkeydown(e) {
    if (open && e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) onclose();
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <div class="scrim" onclick={onclose} transition:motion={{ fn: fade, duration: 150 }} role="presentation"></div>
  <aside class="drawer" bind:this={panel} transition:motion={{ fn: fly, x: 380, duration: 280, easing: cubicOut, opacity: 1 }} aria-label="Interview configuration">
    <header>
      <div>
        <h2>Interview setup</h2>
        <p>Changes apply from the next message.</p>
      </div>
      <button class="btn ghost icon sm" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
    </header>

    <div class="content scroll">
      <section>
        <h3>Format</h3>
        <label class="field">
          <span class="label">Interview type</span>
          <select class="select" value={cfg.presetId} onchange={(e) => set({ presetId: e.currentTarget.value })}>
            {#each presets as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
          </select>
          <span class="help">{presets.find((p) => p.id === cfg.presetId)?.description}</span>
        </label>
        <div class="grid2">
          <label class="field">
            <span class="label">Target role</span>
            <input class="input" value={cfg.role} placeholder="Frontend Engineer" oninput={(e) => set({ role: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span class="label">Company</span>
            <input class="input" value={cfg.company} placeholder="optional" oninput={(e) => set({ company: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span class="label">Seniority</span>
            <select class="select" value={cfg.seniority} onchange={(e) => set({ seniority: e.currentTarget.value })}>
              {#each SENIORITY as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
            </select>
          </label>
          <label class="field">
            <span class="label">Language</span>
            <input class="input" value={cfg.language} oninput={(e) => set({ language: e.currentTarget.value })} />
          </label>
        </div>
      </section>

      <section>
        <h3>Interviewer</h3>
        <div class="field">
          <span class="label">Difficulty</span>
          <div class="seg">
            {#each DIFFICULTY as d (d.id)}
              <button class:on={cfg.difficulty === d.id} onclick={() => set({ difficulty: d.id })}>{d.label}</button>
            {/each}
          </div>
        </div>
        <div class="field">
          <span class="label">Style</span>
          <div class="seg">
            {#each STYLES as s (s.id)}
              <button class:on={cfg.style === s.id} onclick={() => set({ style: s.id })}>{s.label}</button>
            {/each}
          </div>
        </div>
        <div class="field">
          <span class="label">Coaching feedback</span>
          <div class="seg">
            {#each FEEDBACK_MODES as f (f.id)}
              <button class:on={cfg.feedbackMode === f.id} onclick={() => set({ feedbackMode: f.id })}>{f.label}</button>
            {/each}
          </div>
        </div>
      </section>

      <section data-section="context">
        <h3>Context documents</h3>
        <ContextEditor {conversation} />
      </section>

      <section>
        <h3>Custom instructions</h3>
        <div class="field">
          <span class="label">
            Extra instructions for the interviewer
            <span class="seg mini">
              <button class:on={cfg.promptMode === 'append'} onclick={() => set({ promptMode: 'append' })}>Append</button>
              <button class:on={cfg.promptMode === 'replace'} onclick={() => set({ promptMode: 'replace' })}>Replace prompt</button>
            </span>
          </span>
          <textarea
            class="textarea"
            rows="4"
            aria-label="Custom instructions"
            value={cfg.customInstructions}
            placeholder={'e.g. "Focus on React performance. Ask me about my migration project from the resume. Interrupt if I ramble for too long."'}
            oninput={(e) => set({ customInstructions: e.currentTarget.value })}
          ></textarea>
          <span class="help">
            {cfg.promptMode === 'replace' ? 'Your text replaces the generated system prompt entirely. Context documents are still appended.' : 'Added on top of the generated interviewer prompt.'}
          </span>
        </div>
      </section>

      <section>
        <h3>Model & generation <span class="dim">(blank = use global setting)</span></h3>
        <div class="grid2">
          <label class="field span2">
            <span class="label">Model</span>
            <input class="input" list="ic-models" value={cfg.params.model} placeholder={settings.values.model} oninput={(e) => setParam({ model: e.currentTarget.value.trim() })} />
            <datalist id="ic-models">
              {#each connection.models as m (m.id)}<option value={m.id}></option>{/each}
            </datalist>
          </label>
          <label class="field">
            <span class="label">Temperature <span class="dim">{cfg.params.temperature ?? settings.values.temperature}</span></span>
            <input class="input" type="number" min="0" max="2" step="0.05" value={cfg.params.temperature ?? ''} placeholder={String(settings.values.temperature)} oninput={(e) => setParam({ temperature: num(e.currentTarget.value) })} />
          </label>
          <label class="field">
            <span class="label">Top P</span>
            <input class="input" type="number" min="0" max="1" step="0.05" value={cfg.params.topP ?? ''} placeholder={String(settings.values.topP)} oninput={(e) => setParam({ topP: num(e.currentTarget.value) })} />
          </label>
          <label class="field span2">
            <span class="label">Max tokens per reply</span>
            <input class="input" type="number" min="16" step="64" value={cfg.params.maxTokens ?? ''} placeholder={String(settings.values.maxTokens)} oninput={(e) => setParam({ maxTokens: num(e.currentTarget.value) })} />
          </label>
        </div>
      </section>

      <section>
        <button class="prompt-toggle" onclick={() => (showPrompt = !showPrompt)} aria-expanded={showPrompt}>
          <span class="chev" class:open={showPrompt}><Icon name="chevron-right" size={14} /></span>
          System prompt preview
          <span class="dim">~{promptTokens} tokens</span>
        </button>
        <div class="meter" title="{budgetPct}% of the {budget}-token context budget used before any messages">
          <div class="fill" class:warn={budgetPct > 50} class:bad={budgetPct > 80} style:width="{budgetPct}%"></div>
        </div>
        {#if showPrompt}
          <div transition:motion={{ fn: slide, duration: 200 }}>
            <pre class="prompt">{systemPrompt}</pre>
            <button class="btn sm" onclick={copyPrompt}><Icon name="copy" size={13} /> Copy</button>
          </div>
        {/if}
      </section>
    </div>

    <footer>
      <button class="btn sm ghost" onclick={resetConfig}><Icon name="rotate-ccw" size={13} /> Reset to defaults</button>
      <button class="btn sm primary" onclick={onclose}>Done</button>
    </footer>
  </aside>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--ic-overlay);
    z-index: 40;
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(440px, 100vw);
    z-index: 41;
    display: flex;
    flex-direction: column;
    background: var(--ic-bg);
    border-left: 1px solid var(--ic-border);
    box-shadow: var(--ic-shadow-lg);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 16px 16px 12px 20px;
    border-bottom: 1px solid var(--ic-border);
    background: var(--ic-surface);
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  header p {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--ic-text-3);
  }
  .content {
    flex: 1;
    padding: 8px 20px 20px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 0;
    border-bottom: 1px solid var(--ic-border);
    scroll-margin-top: 8px;
  }
  section:last-child {
    border-bottom: 0;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ic-text-3);
  }
  .dim {
    font-weight: 400;
    color: var(--ic-text-3);
    text-transform: none;
    letter-spacing: 0;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .span2 {
    grid-column: span 2;
  }
  .seg {
    display: flex;
    padding: 3px;
    border-radius: var(--ic-radius-sm);
    background: var(--ic-surface-2);
    border: 1px solid var(--ic-border);
  }
  .seg button {
    flex: 1;
    padding: 5px 8px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--ic-text-2);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  }
  .seg button.on {
    background: var(--ic-surface);
    color: var(--ic-text);
    box-shadow: var(--ic-shadow-sm);
    font-weight: 600;
  }
  .seg.mini {
    display: inline-flex;
    padding: 2px;
  }
  .seg.mini button {
    padding: 1px 7px;
    font-size: 11px;
    white-space: nowrap;
  }
  .prompt-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    padding: 0;
    color: var(--ic-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .chev {
    display: inline-flex;
    transition: transform 0.2s var(--ic-ease);
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .meter {
    height: 4px;
    border-radius: 999px;
    background: var(--ic-surface-3);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--ic-success);
    transition: width 0.4s var(--ic-ease), background 0.3s;
  }
  .fill.warn {
    background: var(--ic-warning);
  }
  .fill.bad {
    background: var(--ic-danger);
  }
  .prompt {
    margin: 0 0 8px;
    max-height: 320px;
    overflow: auto;
    white-space: pre-wrap;
    font-family: var(--ic-mono);
    font-size: 11.5px;
    line-height: 1.5;
    padding: 10px 12px;
    border-radius: var(--ic-radius);
    background: var(--ic-code-bg);
    border: 1px solid var(--ic-border);
    color: var(--ic-text-2);
  }
  footer {
    display: flex;
    justify-content: space-between;
    padding: 12px 20px;
    border-top: 1px solid var(--ic-border);
    background: var(--ic-surface);
  }
</style>
