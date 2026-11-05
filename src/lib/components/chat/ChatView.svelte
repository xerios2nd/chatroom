<script>
  import { fade } from 'svelte/transition';
  import ChatHeader from '../layout/ChatHeader.svelte';
  import MessageList from './MessageList.svelte';
  import EmptyState from './EmptyState.svelte';
  import Composer from './Composer.svelte';

  /**
   * @type {{ conversation: import('../../state/conversations.svelte.js').Conversation,
   *   ontogglesidebar: () => void, onopenconfig: (section?: string) => void, onopensettings: () => void }}
   */
  let { conversation, ontogglesidebar, onopenconfig, onopensettings } = $props();
</script>

<section class="chat">
  <ChatHeader {conversation} {ontogglesidebar} onopenconfig={() => onopenconfig()} {onopensettings} />
  {#key conversation.id}
    <div class="stage" in:fade={{ duration: 180 }}>
      {#if conversation.messages.length}
        <MessageList {conversation} />
      {:else}
        <EmptyState {conversation} {onopenconfig} {onopensettings} />
      {/if}
    </div>
  {/key}
  <Composer {conversation} />
</section>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
