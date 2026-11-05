<script>
  import Modal from './Modal.svelte';
  import { getAppState } from '../../state/index.js';

  const { dialogs } = getAppState();
  const d = $derived(dialogs.current);
</script>

<Modal open={!!d} title={d?.title ?? ''} width="420px" onclose={() => dialogs.settle(false)}>
  {#if d}
    <p class="msg">{d.message}</p>
  {/if}
  {#snippet footer()}
    <button class="btn" onclick={() => dialogs.settle(false)}>Cancel</button>
    <button class="btn {d?.danger ? 'danger solid' : 'primary'}" onclick={() => dialogs.settle(true)} data-autofocus>
      {d?.confirmLabel ?? 'Confirm'}
    </button>
  {/snippet}
</Modal>

<style>
  .msg {
    margin: 0;
    color: var(--ic-text-2);
  }
</style>
