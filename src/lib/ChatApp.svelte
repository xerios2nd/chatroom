<script>
  import './styles/theme.css';
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { motion } from './utils/motion.js';
  import { createAppState, setAppState } from './state/index.js';
  import Sidebar from './components/layout/Sidebar.svelte';
  import ChatView from './components/chat/ChatView.svelte';
  import ConfigDrawer from './components/config/ConfigDrawer.svelte';
  import SettingsModal from './components/config/SettingsModal.svelte';
  import Toasts from './components/ui/Toasts.svelte';
  import ConfirmDialog from './components/ui/ConfirmDialog.svelte';
  import Icon from './components/ui/Icon.svelte';

  /**
   * Root of the interview-coach module.
   *
   * Standalone: <ChatApp />
   * Embedded:   <ChatApp options={{ namespace: 'host-app:coach', settings: { baseUrl: '/api/llm/v1' } }} />
   *         or  <ChatApp state={myPrebuiltState} />  (build it with createAppState() to drive it from outside)
   *
   * @type {{ state?: import('./state/index.js').AppState, options?: Parameters<typeof createAppState>[0], class?: string, fullscreen?: boolean }}
   */
  let { state: provided, options = {}, class: className = '', fullscreen = true } = $props();

  // svelte-ignore state_referenced_locally -- the app state is created once per mount on purpose
  const app = setAppState(provided ?? createAppState(options));
  const { conversations, connection, settings, chat, voice } = app;

  let sidebarOpen = $state(typeof window === 'undefined' ? true : window.innerWidth > 860);
  let isNarrow = $state(false);
  let configOpen = $state(false);
  let configSection = $state(null);
  let settingsOpen = $state(false);
  let settingsTab = $state('connection');

  function openSettings(tab = 'connection') {
    settingsTab = tab;
    settingsOpen = true;
  }

  // Voice mode belongs to one conversation: leaving it (or deleting it) ends the session.
  $effect(() => {
    const active = conversations.activeId;
    if (voice.active && voice.convId !== active) voice.stop();
  });

  // ---- theme ----
  let systemDark = $state(typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const theme = $derived(settings.values.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.values.theme);

  onMount(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = (e) => (systemDark = e.matches);
    mq.addEventListener('change', onScheme);

    const nq = window.matchMedia('(max-width: 860px)');
    const onNarrow = (e) => {
      isNarrow = e.matches;
      if (e.matches) sidebarOpen = false;
    };
    onNarrow(nq);
    nq.addEventListener('change', onNarrow);

    const stopConnection = connection.start();

    // First launch: have something to show.
    if (!conversations.list.length) conversations.create();

    return () => {
      mq.removeEventListener('change', onScheme);
      nq.removeEventListener('change', onNarrow);
      stopConnection();
      voice.stop();
      voice.stopReading();
      chat.stopAll();
      conversations.flush();
    };
  });

  // Re-arm the health poller when its interval changes.
  $effect(() => {
    settings.values.healthIntervalMs;
    settings.values.baseUrl;
    settings.values.apiKey;
    connection.check({ silent: true });
  });

  function openConfig(section = null) {
    configSection = section;
    configOpen = true;
  }

  function newInterview() {
    const base = conversations.active?.config;
    conversations.create(base ? $state.snapshot(base) : {});
    if (isNarrow) sidebarOpen = false;
  }

  function onkeydown(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      newInterview();
    } else if (mod && e.key === ',') {
      e.preventDefault();
      openSettings();
    } else if (mod && e.key === '.') {
      e.preventDefault();
      configOpen ? (configOpen = false) : openConfig();
    } else if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      sidebarOpen = !sidebarOpen;
    } else if (e.key === 'Escape' && conversations.activeId && chat.isBusy(conversations.activeId) && !configOpen && !settingsOpen) {
      chat.stop(conversations.activeId);
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="ic-root app {className}" class:fullscreen data-theme={theme} class:sidebar-open={sidebarOpen}>
  {#if sidebarOpen}
    {#if isNarrow}
      <div class="scrim" onclick={() => (sidebarOpen = false)} transition:motion={{ fn: fade, duration: 150 }} role="presentation"></div>
    {/if}
    <div class="side" class:overlay={isNarrow} transition:motion={{ fn: fly, x: -300, duration: 260, easing: cubicOut, opacity: 1 }}>
      <Sidebar onopensettings={() => openSettings()} onnavigate={() => isNarrow && (sidebarOpen = false)} />
    </div>
  {/if}

  <main class="main">
    {#if conversations.active}
      <ChatView
        conversation={conversations.active}
        ontogglesidebar={() => (sidebarOpen = !sidebarOpen)}
        onopenconfig={openConfig}
        onopensettings={openSettings}
      />
    {:else}
      <div class="none" in:fade>
        <Icon name="message-square" size={28} />
        <p>No conversation selected.</p>
        <button class="btn primary" onclick={newInterview}><Icon name="plus" /> New interview</button>
      </div>
    {/if}
  </main>

  {#if conversations.active}
    <ConfigDrawer open={configOpen} conversation={conversations.active} focusSection={configSection} onclose={() => (configOpen = false)} />
  {/if}
  <SettingsModal bind:open={settingsOpen} bind:tab={settingsTab} />
  <ConfirmDialog />
  <Toasts />
</div>

<style>
  .app {
    position: relative;
    display: flex;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background:
      radial-gradient(1200px 600px at 100% -10%, color-mix(in srgb, var(--ic-accent) 7%, transparent), transparent 60%),
      var(--ic-bg);
  }
  .app.fullscreen {
    height: 100vh;
    height: 100dvh;
  }
  .side {
    width: var(--ic-sidebar-w);
    flex-shrink: 0;
    height: 100%;
  }
  .side.overlay {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 30;
    box-shadow: var(--ic-shadow-lg);
  }
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 29;
    background: var(--ic-overlay);
  }
  .main {
    flex: 1;
    min-width: 0;
    height: 100%;
  }
  .none {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--ic-text-3);
  }
</style>
