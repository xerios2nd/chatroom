<script>
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { motion } from '../../utils/motion.js';
  import Icon from './Icon.svelte';

  /**
   * @type {{ open: boolean, title?: string, width?: string, onclose?: () => void,
   *   children?: import('svelte').Snippet, footer?: import('svelte').Snippet }}
   */
  let { open = $bindable(false), title = '', width = '520px', onclose, children, footer } = $props();

  let dialogEl = $state();
  let previouslyFocused;

  function close() {
    open = false;
    onclose?.();
  }

  function onkeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
    // Basic focus trap
    if (e.key === 'Tab' && dialogEl) {
      const focusables = dialogEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  }

  $effect(() => {
    if (open) {
      previouslyFocused = document.activeElement;
      queueMicrotask(() => {
        const target = dialogEl?.querySelector('[data-autofocus]') ?? dialogEl?.querySelector('.body input, .body select, .body textarea') ?? dialogEl;
        target?.focus();
      });
      return () => previouslyFocused?.focus?.();
    }
  });
</script>

{#if open}
  <div class="backdrop" transition:motion={{ fn: fade, duration: 150 }} onclick={close} role="presentation"></div>
  <div class="wrap" role="presentation">
    <div
      class="dialog"
      style:max-width={width}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      bind:this={dialogEl}
      {onkeydown}
      transition:motion={{ fn: scale, start: 0.95, duration: 200, easing: cubicOut }}
    >
      <header>
        <h2>{title}</h2>
        <button class="btn ghost icon sm" onclick={close} aria-label="Close"><Icon name="x" /></button>
      </header>
      <div class="body scroll">
        {@render children?.()}
      </div>
      {#if footer}
        <footer>{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--ic-overlay);
    backdrop-filter: blur(3px);
    z-index: 100;
  }
  .wrap {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 16px;
    z-index: 101;
    pointer-events: none;
  }
  .dialog {
    pointer-events: auto;
    width: 100%;
    max-height: min(86vh, 900px);
    display: flex;
    flex-direction: column;
    background: var(--ic-surface);
    border: 1px solid var(--ic-border);
    border-radius: var(--ic-radius-lg);
    box-shadow: var(--ic-shadow-lg);
    outline: none;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px 20px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
  }
  .body {
    padding: 4px 20px 16px;
    flex: 1;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--ic-border);
  }
</style>
