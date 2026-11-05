<script>
  import { fly } from 'svelte/transition';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import { getPreset, DIFFICULTY } from '../../core/presets.js';
  import { conversationToMarkdown, conversationsToJSON } from '../../core/exporters.js';
  import { copyText, downloadFile, slugify } from '../../utils/clipboard.js';
  import Icon from '../ui/Icon.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';

  /**
   * @type {{ conversation: import('../../state/conversations.svelte.js').Conversation,
   *   ontogglesidebar: () => void, onopenconfig: () => void, onopensettings: () => void }}
   */
  let { conversation, ontogglesidebar, onopenconfig, onopensettings } = $props();

  const { conversations, chat, toasts, dialogs, presets } = getAppState();

  const preset = $derived(getPreset(conversation.config.presetId, presets));
  const difficulty = $derived(DIFFICULTY.find((d) => d.id === conversation.config.difficulty)?.label);
  const ctxCount = $derived(conversation.config.contexts.filter((c) => c.enabled && c.content.trim()).length);

  let editing = $state(false);
  let title = $state('');
  let menu = $state(false);

  function startEdit() {
    title = conversation.title;
    editing = true;
  }
  function commit() {
    if (editing) conversations.rename(conversation.id, title);
    editing = false;
  }

  function exportMd() {
    downloadFile(`${slugify(conversation.title)}.md`, conversationToMarkdown($state.snapshot(conversation)), 'text/markdown');
    menu = false;
  }
  function exportJson() {
    downloadFile(`${slugify(conversation.title)}.json`, conversationsToJSON([$state.snapshot(conversation)]), 'application/json');
    menu = false;
  }
  async function copyTranscript() {
    menu = false;
    if (await copyText(conversationToMarkdown($state.snapshot(conversation)))) toasts.success('Transcript copied.');
  }
  async function clear() {
    menu = false;
    const ok = await dialogs.confirm({
      title: 'Clear this conversation?',
      message: 'All messages are removed. The interview setup and context documents are kept, so you can practice again from scratch.',
      confirmLabel: 'Clear messages',
      danger: true,
    });
    if (!ok) return;
    chat.stop(conversation.id);
    conversations.clearMessages(conversation.id);
  }

  function focusSelect(node) {
    node.focus();
    node.select();
  }
</script>

<svelte:window onclick={(e) => menu && !e.target.closest?.('.hmenu') && (menu = false)} />

<header class="header">
  <button class="btn ghost icon sm" onclick={ontogglesidebar} aria-label="Toggle sidebar" title="Toggle sidebar (Ctrl+B)">
    <Icon name="panel-left" size={17} />
  </button>

  <div class="titlebox">
    {#if editing}
      <input
        class="input title-input"
        bind:value={title}
        use:focusSelect
        onblur={commit}
        onkeydown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') editing = false;
        }}
        aria-label="Conversation title"
      />
    {:else}
      <button class="title" onclick={startEdit} title="Rename">{conversation.title}</button>
    {/if}
    <div class="chips">
      <span class="chip"><Icon name={preset.icon} size={11} />{preset.label}</span>
      {#if difficulty}<span class="chip">{difficulty}</span>{/if}
      {#if ctxCount}<span class="chip"><Icon name="file-text" size={11} />{ctxCount} doc{ctxCount > 1 ? 's' : ''}</span>{/if}
    </div>
  </div>

  <div class="right">
    <span class="status-full"><StatusBadge onclick={undefined} /></span>
    <span class="status-compact"><StatusBadge compact /></span>
    <button class="btn sm" onclick={onopenconfig} title="Interview setup (Ctrl+.)">
      <Icon name="sliders-horizontal" size={14} /><span class="lbl">Setup</span>
    </button>
    <div class="hmenu">
      <button class="btn ghost icon sm" onclick={() => (menu = !menu)} aria-label="More actions" aria-expanded={menu}>
        <Icon name="ellipsis" size={16} />
      </button>
      {#if menu}
        <div class="menu" role="menu" transition:motion={{ fn: fly, y: -4, duration: 140 }}>
          <button role="menuitem" onclick={copyTranscript} disabled={!conversation.messages.length}><Icon name="clipboard" size={14} /> Copy transcript</button>
          <button role="menuitem" onclick={exportMd} disabled={!conversation.messages.length}><Icon name="file-text" size={14} /> Export Markdown</button>
          <button role="menuitem" onclick={exportJson}><Icon name="download" size={14} /> Export JSON</button>
          <button role="menuitem" onclick={() => { menu = false; onopensettings(); }}><Icon name="settings" size={14} /> Settings</button>
          <button role="menuitem" class="danger" onclick={clear} disabled={!conversation.messages.length}><Icon name="eraser" size={14} /> Clear messages</button>
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--ic-border);
    background: color-mix(in srgb, var(--ic-surface) 85%, transparent);
    backdrop-filter: blur(8px);
    min-height: 58px;
  }
  .titlebox {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    align-self: flex-start;
    max-width: 100%;
    padding: 0 4px;
    margin-left: -4px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--ic-text);
    font: inherit;
    font-weight: 650;
    font-size: 15px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: text;
  }
  .title:hover {
    background: var(--ic-surface-2);
  }
  .title-input {
    height: 28px;
    padding: 2px 6px;
    font-weight: 600;
  }
  .chips {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .chips .chip {
    padding: 0 6px;
    font-size: 10.5px;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .status-compact {
    display: none;
  }
  .hmenu {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    min-width: 200px;
    padding: 4px;
    background: var(--ic-surface);
    border: 1px solid var(--ic-border);
    border-radius: var(--ic-radius);
    box-shadow: var(--ic-shadow);
    display: flex;
    flex-direction: column;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: 0;
    background: none;
    color: var(--ic-text);
    font: inherit;
    font-size: 13px;
    border-radius: var(--ic-radius-sm);
    cursor: pointer;
    text-align: left;
  }
  .menu button:hover:not(:disabled) {
    background: var(--ic-surface-2);
  }
  .menu button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .menu .danger {
    color: var(--ic-danger);
  }
  @media (max-width: 720px) {
    .status-full,
    .lbl {
      display: none;
    }
    .status-compact {
      display: inline-flex;
    }
  }
</style>
