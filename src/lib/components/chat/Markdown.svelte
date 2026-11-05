<script>
  import { renderMarkdown } from '../../core/markdown.js';
  import { copyText } from '../../utils/clipboard.js';

  /** @type {{ source: string, streaming?: boolean }} */
  let { source, streaming = false } = $props();

  const html = $derived(renderMarkdown(source));
  let el = $state();

  // Add a copy button to every code block. Re-runs whenever the HTML changes.
  $effect(() => {
    html;
    if (!el) return;
    for (const pre of el.querySelectorAll('pre:not([data-enhanced])')) {
      pre.dataset.enhanced = '1';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy';
      btn.textContent = 'Copy';
      pre.appendChild(btn);
    }
  });

  async function onclick(e) {
    const btn = e.target.closest?.('.code-copy');
    if (!btn) return;
    const code = btn.parentElement.querySelector('code')?.innerText ?? '';
    const ok = await copyText(code);
    btn.textContent = ok ? 'Copied!' : 'Failed';
    setTimeout(() => (btn.textContent = 'Copy'), 1500);
  }
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised with DOMPurify -->
<div class="md" class:streaming bind:this={el} {onclick} role="presentation">{@html html}</div>

<style>
  .md {
    overflow-wrap: anywhere;
  }
  .md :global(> :first-child) {
    margin-top: 0;
  }
  .md :global(> :last-child) {
    margin-bottom: 0;
  }
  .md :global(p),
  .md :global(ul),
  .md :global(ol),
  .md :global(blockquote),
  .md :global(pre),
  .md :global(table) {
    margin: 0 0 0.75em;
  }
  .md :global(ul),
  .md :global(ol) {
    padding-left: 1.4em;
  }
  .md :global(li + li) {
    margin-top: 0.25em;
  }
  .md :global(h1),
  .md :global(h2),
  .md :global(h3),
  .md :global(h4) {
    margin: 1em 0 0.5em;
    line-height: 1.3;
  }
  .md :global(h1) { font-size: 1.3em; }
  .md :global(h2) { font-size: 1.18em; }
  .md :global(h3) { font-size: 1.06em; }
  .md :global(a) {
    color: var(--ic-accent);
  }
  .md :global(blockquote) {
    padding: 8px 12px;
    border-left: 3px solid var(--ic-accent);
    background: var(--ic-accent-soft);
    border-radius: 0 var(--ic-radius-sm) var(--ic-radius-sm) 0;
    color: var(--ic-text);
  }
  .md :global(blockquote > :last-child) {
    margin-bottom: 0;
  }
  .md :global(code) {
    font-family: var(--ic-mono);
    font-size: 0.88em;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    background: var(--ic-surface-3);
  }
  .md :global(pre) {
    position: relative;
    padding: 12px 14px;
    border-radius: var(--ic-radius);
    background: var(--ic-code-bg);
    border: 1px solid var(--ic-border);
    overflow-x: auto;
  }
  .md :global(pre code) {
    padding: 0;
    background: none;
    font-size: 12.5px;
    line-height: 1.55;
  }
  .md :global(.code-copy) {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 2px 8px;
    font: inherit;
    font-size: 11px;
    border-radius: 5px;
    border: 1px solid var(--ic-border);
    background: var(--ic-surface);
    color: var(--ic-text-2);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .md :global(pre:hover .code-copy) {
    opacity: 1;
  }
  .md :global(table) {
    border-collapse: collapse;
    display: block;
    overflow-x: auto;
  }
  .md :global(th),
  .md :global(td) {
    border: 1px solid var(--ic-border);
    padding: 5px 9px;
    text-align: left;
  }
  .md :global(th) {
    background: var(--ic-surface-2);
  }
  .md :global(hr) {
    border: 0;
    border-top: 1px solid var(--ic-border);
    margin: 1em 0;
  }
  /* blinking caret while streaming */
  .streaming > :global(:last-child)::after {
    content: '';
    display: inline-block;
    width: 7px;
    height: 1.05em;
    margin-left: 2px;
    vertical-align: text-bottom;
    background: var(--ic-accent);
    border-radius: 1px;
    animation: caret 1s steps(2) infinite;
  }
  @keyframes caret {
    50% { opacity: 0; }
  }
</style>
