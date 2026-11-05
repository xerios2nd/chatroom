<script>
  import { fly, fade, slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import { getPreset } from '../../core/presets.js';
  import { formatRelativeTime, truncate, stripMarkdown } from '../../utils/format.js';
  import { conversationsToJSON, parseImport } from '../../core/exporters.js';
  import { downloadFile } from '../../utils/clipboard.js';
  import Icon from '../ui/Icon.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';

  /** @type {{ onopensettings: () => void, onnavigate?: () => void }} */
  let { onopensettings, onnavigate } = $props();

  const { conversations, chat, toasts, dialogs, presets } = getAppState();

  let query = $state('');
  let editingId = $state(null);
  let editValue = $state('');
  let menuFor = $state(null);
  let fileInput = $state();
  let now = $state(Date.now());

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations.sorted;
    return conversations.sorted.filter(
      (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  });

  function preview(conv) {
    const last = conv.messages.findLast((m) => m.content);
    return last ? truncate(stripMarkdown(last.content), 70) : getPreset(conv.config.presetId, presets).description;
  }

  function open(id) {
    conversations.select(id);
    menuFor = null;
    onnavigate?.();
  }

  function newChat() {
    // Start from the active conversation's setup so repeat practice is one click.
    const base = conversations.active?.config;
    conversations.create(base ? { ...$state.snapshot(base) } : {});
    onnavigate?.();
  }

  function startRename(conv) {
    menuFor = null;
    editingId = conv.id;
    editValue = conv.title;
  }

  function commitRename() {
    if (editingId) conversations.rename(editingId, editValue);
    editingId = null;
  }

  async function remove(conv) {
    menuFor = null;
    if (chat.isBusy(conv.id)) chat.stop(conv.id);
    const removed = $state.snapshot(conv);
    conversations.remove(conv.id);
    toasts.info(`Deleted "${truncate(removed.title, 30)}"`, {
      timeout: 6000,
      action: { label: 'Undo', run: () => conversations.restore(removed) },
    });
  }

  async function exportAll() {
    if (!conversations.list.length) return toasts.info('Nothing to export yet.');
    downloadFile(`interview-coach-${new Date().toISOString().slice(0, 10)}.json`, conversationsToJSON($state.snapshot(conversations.list)), 'application/json');
    toasts.success(`Exported ${conversations.list.length} conversation(s).`);
  }

  async function onImport(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('File is larger than 20MB.');
      const convs = parseImport(await file.text());
      conversations.importMany(convs);
      toasts.success(`Imported ${convs.length} conversation(s).`);
    } catch (err) {
      toasts.error('Import failed', { detail: err.message });
    }
  }

  async function deleteAll() {
    menuFor = null;
    const ok = await dialogs.confirm({
      title: 'Delete all conversations?',
      message: `This permanently removes ${conversations.list.length} conversation(s) from this browser. Export them first if you want a backup.`,
      confirmLabel: 'Delete all',
      danger: true,
    });
    if (!ok) return;
    chat.stopAll();
    for (const c of [...conversations.list]) conversations.remove(c.id);
    toasts.success('All conversations deleted.');
  }

  function focusOnMount(node) {
    node.focus();
    node.select();
  }

  function onWindowClick(e) {
    if (menuFor && !e.target.closest?.('.menu-wrap')) menuFor = null;
  }
</script>

<svelte:window onclick={onWindowClick} />

<aside class="sidebar">
  <div class="top">
    <div class="brand">
      <div class="logo"><Icon name="message-square" size={16} /></div>
      <div>
        <div class="name">Interview Coach</div>
        <div class="sub">Practice with your local model</div>
      </div>
    </div>
    <button class="btn primary new" onclick={newChat}>
      <Icon name="plus" /> New interview
    </button>
    <label class="search">
      <Icon name="search" size={14} />
      <input class="input" type="search" placeholder="Search conversations" bind:value={query} aria-label="Search conversations" />
    </label>
  </div>

  <nav class="list scroll" aria-label="Conversations">
    {#each filtered as conv (conv.id)}
      {@const busy = chat.isBusy(conv.id)}
      {@const preset = getPreset(conv.config.presetId, presets)}
      <div
        class="item"
        class:active={conv.id === conversations.activeId}
        animate:flip={{ duration: 250, easing: cubicOut }}
        in:motion={{ fn: fly, x: -16, duration: 220 }}
        out:motion={{ fn: slide, duration: 180 }}
      >
        {#if editingId === conv.id}
          <input
            class="input rename"
            bind:value={editValue}
            use:focusOnMount
            onblur={commitRename}
            onkeydown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') editingId = null;
            }}
            aria-label="Conversation title"
          />
        {:else}
          <button class="main" onclick={() => open(conv.id)} ondblclick={() => startRename(conv)}>
            <span class="pi" title={preset.label}><Icon name={preset.icon} size={14} /></span>
            <span class="meta">
              <span class="title">
                {#if conv.pinned}<Icon name="pin" size={11} class="pin" />{/if}
                {conv.title}
              </span>
              <span class="preview">{preview(conv)}</span>
            </span>
            <span class="right">
              {#if busy}
                <span class="live" title="Generating" transition:fade><span></span><span></span><span></span></span>
              {:else}
                <span class="time">{formatRelativeTime(conv.updatedAt, now)}</span>
              {/if}
            </span>
          </button>
          <div class="menu-wrap">
            <button class="btn ghost icon sm more" onclick={() => (menuFor = menuFor === conv.id ? null : conv.id)} aria-label="Conversation actions" aria-expanded={menuFor === conv.id}>
              <Icon name="ellipsis" size={14} />
            </button>
            {#if menuFor === conv.id}
              <div class="menu" role="menu" transition:motion={{ fn: fly, y: -4, duration: 140 }}>
                <button role="menuitem" onclick={() => startRename(conv)}><Icon name="pencil" size={14} /> Rename</button>
                <button role="menuitem" onclick={() => { conversations.update(conv.id, { pinned: !conv.pinned }); menuFor = null; }}>
                  <Icon name={conv.pinned ? 'pin-off' : 'pin'} size={14} /> {conv.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button role="menuitem" onclick={() => { conversations.duplicate(conv.id); menuFor = null; onnavigate?.(); }}>
                  <Icon name="copy" size={14} /> Same setup, new chat
                </button>
                <button role="menuitem" onclick={() => { conversations.duplicate(conv.id, { withMessages: true }); menuFor = null; onnavigate?.(); }}>
                  <Icon name="file-plus" size={14} /> Duplicate with messages
                </button>
                <button role="menuitem" class="danger" onclick={() => remove(conv)}><Icon name="trash" size={14} /> Delete</button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <div class="empty" in:fade>
        {#if query}
          No conversations match "{query}".
        {:else}
          No conversations yet. Start a new interview above.
        {/if}
      </div>
    {/each}
  </nav>

  <div class="bottom">
    <StatusBadge />
    <div class="spacer"></div>
    <input type="file" accept="application/json,.json" hidden bind:this={fileInput} onchange={onImport} />
    <div class="menu-wrap">
      <button class="btn ghost icon sm" title="Import / export" aria-label="Import or export" onclick={() => (menuFor = menuFor === '__data' ? null : '__data')}>
        <Icon name="download" size={15} />
      </button>
      {#if menuFor === '__data'}
        <div class="menu up" role="menu" transition:motion={{ fn: fly, y: 4, duration: 140 }}>
          <button role="menuitem" onclick={() => { menuFor = null; exportAll(); }}><Icon name="download" size={14} /> Export all (JSON)</button>
          <button role="menuitem" onclick={() => { menuFor = null; fileInput.click(); }}><Icon name="upload" size={14} /> Import JSON</button>
          <button role="menuitem" class="danger" onclick={deleteAll}><Icon name="trash" size={14} /> Delete all</button>
        </div>
      {/if}
    </div>
    <button class="btn ghost icon sm" onclick={onopensettings} title="Settings (Ctrl+,)" aria-label="Settings">
      <Icon name="settings" size={15} />
    </button>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ic-surface);
    border-right: 1px solid var(--ic-border);
    min-width: 0;
  }
  .top {
    padding: 14px 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 4px 4px;
  }
  .logo {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    color: white;
    background: var(--ic-user-bubble);
    box-shadow: 0 4px 14px color-mix(in srgb, var(--ic-accent) 40%, transparent);
  }
  .name {
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .sub {
    font-size: 11.5px;
    color: var(--ic-text-3);
  }
  .new {
    width: 100%;
  }
  .search {
    position: relative;
    display: flex;
    align-items: center;
    color: var(--ic-text-3);
  }
  .search :global(.ic-icon) {
    position: absolute;
    left: 10px;
  }
  .search .input {
    padding-left: 30px;
    height: 32px;
    background: var(--ic-surface-2);
    border-color: transparent;
  }
  .list {
    flex: 1;
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .item {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: var(--ic-radius);
    transition: background 0.15s;
  }
  .item:hover {
    background: var(--ic-surface-2);
  }
  .item.active {
    background: var(--ic-accent-soft);
  }
  .item.active::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--ic-accent);
    animation: grow 0.25s var(--ic-ease-spring);
  }
  @keyframes grow {
    from { transform: scaleY(0); }
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 9px 4px 9px 10px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: var(--ic-radius);
  }
  .pi {
    margin-top: 2px;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--ic-surface-3);
    color: var(--ic-text-2);
  }
  .active .pi {
    background: var(--ic-accent);
    color: white;
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title {
    font-weight: 560;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .title :global(.pin) {
    color: var(--ic-accent);
  }
  .preview {
    font-size: 12px;
    color: var(--ic-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .right {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--ic-text-3);
    padding-top: 2px;
  }
  .item:hover .time,
  .item:focus-within .time {
    visibility: hidden;
  }
  .live {
    display: inline-flex;
    gap: 2px;
    padding-top: 6px;
  }
  .live span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--ic-accent);
    animation: bounce 1s infinite ease-in-out;
  }
  .live span:nth-child(2) { animation-delay: 0.15s; }
  .live span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
    40% { transform: translateY(-3px); opacity: 1; }
  }
  .menu-wrap {
    position: relative;
  }
  .item .menu-wrap {
    position: absolute;
    right: 4px;
    top: 7px;
  }
  .more {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .item:hover .more,
  .item:focus-within .more,
  .more[aria-expanded='true'] {
    opacity: 1;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    min-width: 210px;
    padding: 4px;
    background: var(--ic-surface);
    border: 1px solid var(--ic-border);
    border-radius: var(--ic-radius);
    box-shadow: var(--ic-shadow);
    display: flex;
    flex-direction: column;
  }
  .menu.up {
    top: auto;
    bottom: calc(100% + 4px);
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
  .menu button:hover {
    background: var(--ic-surface-2);
  }
  .menu .danger {
    color: var(--ic-danger);
  }
  .rename {
    margin: 4px;
  }
  .empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--ic-text-3);
    font-size: 13px;
  }
  .bottom {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 12px;
    border-top: 1px solid var(--ic-border);
  }
  .spacer {
    flex: 1;
  }
</style>
