import { getContext, setContext } from 'svelte';
import { createStorage } from '../core/storage.js';
import { createClient } from '../api/client.js';
import { INTERVIEW_PRESETS } from '../core/presets.js';
import { createToasts } from './toasts.svelte.js';
import { createSettings } from './settings.svelte.js';
import { createConversations } from './conversations.svelte.js';
import { createConnection } from './connection.svelte.js';
import { createChatController } from './chat.svelte.js';
import { createDialogs } from './dialogs.svelte.js';

const KEY = Symbol('interview-coach');

/**
 * Compose the whole app state. No module-level singletons, so you can
 * mount several instances, or embed one in a host app with its own namespace.
 *
 * @param {{
 *   namespace?: string,
 *   settings?: Partial<import('./settings.svelte.js').DEFAULT_SETTINGS>,
 *   defaultConfig?: object,
 *   presets?: typeof INTERVIEW_PRESETS,
 *   fetch?: typeof fetch,
 * }} [options]
 */
export function createAppState(options = {}) {
  const presets = options.presets ?? INTERVIEW_PRESETS;
  const storage = createStorage(options.namespace ?? 'interview-coach');
  const toasts = createToasts();
  const dialogs = createDialogs();
  const settings = createSettings(storage, options.settings);
  const client = createClient(() => settings.values, options.fetch ? { fetchImpl: options.fetch } : undefined);
  const conversations = createConversations({ storage, toasts, defaultConfig: options.defaultConfig });
  const connection = createConnection({ client, settings });
  const chat = createChatController({ client, settings, conversations, connection, toasts, presets });

  return { storage, toasts, dialogs, settings, client, conversations, connection, chat, presets };
}

/** @typedef {ReturnType<typeof createAppState>} AppState */

/** @param {AppState} state */
export function setAppState(state) {
  setContext(KEY, state);
  return state;
}

/** @returns {AppState} */
export function getAppState() {
  const state = getContext(KEY);
  if (!state) throw new Error('getAppState() called outside <ChatApp>');
  return state;
}
