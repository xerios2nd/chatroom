<script>
  import { fly, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { backOut } from 'svelte/easing';
  import { motion } from '../../utils/motion.js';
  import { getAppState } from '../../state/index.js';
  import Icon from './Icon.svelte';

  const { toasts } = getAppState();
  const ICON = { info: 'info', success: 'circle-check', warning: 'triangle-alert', error: 'circle-x' };
</script>

<div class="toasts" aria-live="polite" aria-relevant="additions">
  {#each toasts.items as t (t.id)}
    <div
      class="toast {t.type}"
      role={t.type === 'error' ? 'alert' : 'status'}
      animate:flip={{ duration: 200 }}
      in:motion={{ fn: fly, x: 40, duration: 280, easing: backOut }}
      out:motion={{ fn: fade, duration: 150 }}
    >
      <span class="ico"><Icon name={ICON[t.type]} size={18} /></span>
      <div class="text">
        <div class="message">{t.message}</div>
        {#if t.detail}<div class="detail">{t.detail}</div>{/if}
      </div>
      {#if t.action}
        <button
          class="btn sm"
          onclick={() => {
            t.action.run();
            toasts.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button class="btn ghost icon sm close" onclick={() => toasts.dismiss(t.id)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(380px, calc(100vw - 32px));
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 8px 10px 12px;
    border-radius: var(--ic-radius);
    background: var(--ic-surface);
    border: 1px solid var(--ic-border);
    box-shadow: var(--ic-shadow);
    border-left: 3px solid var(--c);
  }
  .info { --c: var(--ic-accent); }
  .success { --c: var(--ic-success); }
  .warning { --c: var(--ic-warning); }
  .error { --c: var(--ic-danger); }
  .ico {
    color: var(--c);
    margin-top: 1px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .message {
    font-weight: 550;
  }
  .detail {
    font-size: 12.5px;
    color: var(--ic-text-2);
    margin-top: 2px;
  }
  .close {
    color: var(--ic-text-3);
  }
</style>
