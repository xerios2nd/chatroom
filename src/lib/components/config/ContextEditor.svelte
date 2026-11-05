<script>
  import { slide, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import { CONTEXT_TYPES } from '../../core/presets.js';
  import { estimateTokens } from '../../core/tokens.js';
  import { uid } from '../../utils/id.js';
  import Icon from '../ui/Icon.svelte';

  /** @type {{ conversation: import('../../state/conversations.svelte.js').Conversation }} */
  let { conversation } = $props();

  const { conversations, toasts, dialogs } = getAppState();
  const docs = $derived(conversation.config.contexts);
  const MAX_FILE = 1024 * 1024; // 1MB of text is far beyond any local model's context anyway
  const ACCEPT = '.txt,.md,.markdown,.json,.csv,.yaml,.yml,.html,.xml,text/*';

  let fileInput = $state();
  let dragging = $state(false);
  let expanded = $state(null);

  function save(next) {
    conversations.updateConfig(conversation.id, { contexts: next });
  }

  function add(doc = {}) {
    const d = { id: uid('ctx_'), type: 'notes', title: '', content: '', enabled: true, ...doc };
    save([...$state.snapshot(docs), d]);
    expanded = d.id;
  }

  function patch(id, p) {
    save($state.snapshot(docs).map((d) => (d.id === id ? { ...d, ...p } : d)));
  }

  async function remove(doc) {
    if (doc.content.trim().length > 200) {
      const ok = await dialogs.confirm({ title: 'Remove this document?', message: `"${doc.title || 'Untitled'}" will be removed from this conversation.`, confirmLabel: 'Remove', danger: true });
      if (!ok) return;
    }
    save($state.snapshot(docs).filter((d) => d.id !== doc.id));
  }

  function guessType(name) {
    const n = name.toLowerCase();
    if (/(cv|resume|résumé)/.test(n)) return 'resume';
    if (/(job|jd|posting|description|role)/.test(n)) return 'job';
    if (/(company|about)/.test(n)) return 'company';
    return 'other';
  }

  async function addFiles(files) {
    for (const file of files) {
      if (/\.(pdf|docx?|pages|rtf)$/i.test(file.name)) {
        toasts.warning(`${file.name}: binary documents aren't supported`, { detail: 'Open it and paste the text into a new document instead.' });
        continue;
      }
      if (file.size > MAX_FILE) {
        toasts.error(`${file.name} is too large`, { detail: 'Limit is 1MB of text.' });
        continue;
      }
      try {
        const content = await file.text();
        if (content.includes('\u0000')) throw new Error('Looks like a binary file.');
        add({ title: file.name.replace(/\.[^.]+$/, ''), content, type: guessType(file.name) });
        toasts.success(`Added ${file.name} (~${estimateTokens(content)} tokens)`);
      } catch (err) {
        toasts.error(`Could not read ${file.name}`, { detail: err.message });
      }
    }
    expanded = null;
  }

  function ondrop(e) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files?.length) addFiles([...e.dataTransfer.files]);
  }
</script>

<div
  class="ctx"
  class:dragging
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={(e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) dragging = false;
  }}
  {ondrop}
  role="region"
  aria-label="Context documents"
>
  {#each docs as doc (doc.id)}
    {@const open = expanded === doc.id}
    <div class="doc" class:disabled={!doc.enabled} animate:flip={{ duration: 200 }} transition:motion={{ fn: slide, duration: 200 }}>
      <div class="head">
        <label class="toggle" title={doc.enabled ? 'Included in prompt' : 'Excluded from prompt'}>
          <input type="checkbox" checked={doc.enabled} onchange={(e) => patch(doc.id, { enabled: e.currentTarget.checked })} />
          <span class="track"><span class="thumb"></span></span>
        </label>
        <button class="title" onclick={() => (expanded = open ? null : doc.id)} aria-expanded={open}>
          <span class="name">{doc.title || 'Untitled'}</span>
          <span class="chip">{CONTEXT_TYPES.find((t) => t.id === doc.type)?.label ?? 'Other'}</span>
          <span class="tok">~{estimateTokens(doc.content)} tok</span>
          <span class="chev" class:open><Icon name="chevron-down" size={14} /></span>
        </button>
        <button class="btn ghost icon sm" onclick={() => remove(doc)} aria-label="Remove document"><Icon name="trash" size={14} /></button>
      </div>
      {#if open}
        <div class="edit" transition:motion={{ fn: slide, duration: 180 }}>
          <div class="two">
            <input class="input" placeholder="Title" value={doc.title} oninput={(e) => patch(doc.id, { title: e.currentTarget.value })} />
            <select class="select" value={doc.type} onchange={(e) => patch(doc.id, { type: e.currentTarget.value })}>
              {#each CONTEXT_TYPES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
            </select>
          </div>
          <textarea
            class="textarea"
            rows="8"
            placeholder="Paste your resume, the job description, STAR stories, notes about the company…"
            value={doc.content}
            oninput={(e) => patch(doc.id, { content: e.currentTarget.value })}
          ></textarea>
        </div>
      {/if}
    </div>
  {/each}

  {#if !docs.length}
    <div class="empty" in:fade>
      <Icon name="file-text" size={20} />
      <div>Add your resume, the job description or your notes, and the interviewer will tailor its questions. Drop text files here.</div>
    </div>
  {/if}

  <div class="add">
    <button class="btn sm" onclick={() => add({ type: 'resume', title: 'Resume' })}><Icon name="plus" size={13} /> Resume</button>
    <button class="btn sm" onclick={() => add({ type: 'job', title: 'Job description' })}><Icon name="plus" size={13} /> Job description</button>
    <button class="btn sm" onclick={() => add()}><Icon name="plus" size={13} /> Note</button>
    <button class="btn sm" onclick={() => fileInput.click()}><Icon name="upload" size={13} /> Upload</button>
    <input type="file" multiple accept={ACCEPT} hidden bind:this={fileInput} onchange={(e) => { addFiles([...e.currentTarget.files]); e.currentTarget.value = ''; }} />
  </div>

  {#if dragging}
    <div class="drop" transition:fade={{ duration: 120 }}><Icon name="upload" size={22} /> Drop text files to add them as context</div>
  {/if}
</div>

<style>
  .ctx {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .doc {
    border: 1px solid var(--ic-border);
    border-radius: var(--ic-radius);
    background: var(--ic-surface);
    transition: opacity 0.2s;
  }
  .doc.disabled .title {
    opacity: 0.55;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 10px;
  }
  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .name {
    font-weight: 560;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tok {
    margin-left: auto;
    font-size: 11px;
    color: var(--ic-text-3);
    white-space: nowrap;
  }
  .chev {
    display: inline-flex;
    color: var(--ic-text-3);
    transition: transform 0.2s var(--ic-ease);
  }
  .chev.open {
    transform: rotate(180deg);
  }
  .edit {
    padding: 0 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 150px;
    gap: 8px;
  }
  .toggle {
    position: relative;
    display: inline-flex;
    cursor: pointer;
  }
  .toggle input {
    position: absolute;
    opacity: 0;
    inset: 0;
    margin: 0;
    cursor: pointer;
  }
  .track {
    width: 28px;
    height: 16px;
    border-radius: 999px;
    background: var(--ic-border-strong);
    position: relative;
    transition: background 0.2s;
  }
  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
    transition: transform 0.2s var(--ic-ease-spring);
  }
  .toggle input:checked + .track {
    background: var(--ic-accent);
  }
  .toggle input:checked + .track .thumb {
    transform: translateX(12px);
  }
  .toggle input:focus-visible + .track {
    outline: 2px solid var(--ic-accent);
    outline-offset: 2px;
  }
  .empty {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 14px;
    border: 1px dashed var(--ic-border-strong);
    border-radius: var(--ic-radius);
    color: var(--ic-text-2);
    font-size: 12.5px;
  }
  .empty :global(.ic-icon) {
    color: var(--ic-accent);
  }
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .drop {
    position: absolute;
    inset: -6px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 2px dashed var(--ic-accent);
    border-radius: var(--ic-radius);
    background: color-mix(in srgb, var(--ic-accent-soft) 92%, transparent);
    color: var(--ic-accent);
    font-weight: 600;
    pointer-events: none;
  }
</style>
