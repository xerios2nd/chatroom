<script>
  import { tick } from 'svelte';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { motion } from '../../utils/motion.js';
  import Icon from '../ui/Icon.svelte';
  import MessageBubble from './MessageBubble.svelte';

  /** @type {{ conversation: import('../../state/conversations.svelte.js').Conversation }} */
  let { conversation } = $props();

  let scroller = $state();
  let stick = $state(true);

  const lastAssistantId = $derived(conversation.messages.findLast((m) => m.role === 'assistant')?.id);
  const last = $derived(conversation.messages.at(-1));

  function onscroll() {
    const el = scroller;
    stick = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function scrollToBottom(smooth = true) {
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }

  // Follow new content while the user is at the bottom.
  $effect(() => {
    conversation.messages.length;
    last?.content?.length;
    last?.reasoning?.length;
    last?.status;
    if (stick) tick().then(() => scrollToBottom(false));
  });

  // Jump to bottom when switching conversations.
  $effect(() => {
    conversation.id;
    stick = true;
    tick().then(() => scrollToBottom(false));
  });

  // Always follow when the user sends a new message.
  $effect(() => {
    if (last?.role === 'user') {
      stick = true;
      tick().then(() => scrollToBottom(true));
    }
  });
</script>

<div class="wrap">
  <div class="list scroll" bind:this={scroller} {onscroll} role="log" aria-live="polite" aria-relevant="additions">
    {#each conversation.messages as message (message.id)}
      <MessageBubble {message} convId={conversation.id} isLastAssistant={message.id === lastAssistantId} />
    {/each}
    <div class="spacer"></div>
  </div>

  {#if !stick}
    <button class="jump" onclick={() => scrollToBottom()} transition:motion={{ fn: scale, start: 0.6, duration: 220, easing: backOut }} aria-label="Scroll to latest">
      <Icon name="arrow-down" size={16} />
    </button>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .list {
    flex: 1;
    padding: 24px 20px 8px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .spacer {
    min-height: 8px;
  }
  .jump {
    position: absolute;
    left: 50%;
    bottom: 12px;
    translate: -50% 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: 1px solid var(--ic-border);
    background: var(--ic-surface);
    color: var(--ic-text);
    box-shadow: var(--ic-shadow);
    cursor: pointer;
  }
  .jump:hover {
    border-color: var(--ic-accent);
    color: var(--ic-accent);
  }
  @media (max-width: 640px) {
    .list {
      padding: 16px 12px 8px;
    }
  }
</style>
