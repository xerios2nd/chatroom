import { uid } from '../utils/id.js';
import { debounce } from '../utils/format.js';
import { defaultConversationConfig } from '../core/prompt.js';
import { getPreset } from '../core/presets.js';

const STORAGE_KEY = 'conversations';

/** Title derived from the config, used until the user renames the conversation. */
export function autoTitle(config) {
  const preset = getPreset(config?.presetId).label;
  const target = [config?.role?.trim(), config?.company?.trim() && `@ ${config.company.trim()}`].filter(Boolean).join(' ');
  return target ? `${preset}: ${target}` : `${preset} interview`;
}
const ACTIVE_KEY = 'activeConversation';

/**
 * @typedef {{
 *   id: string, role: 'user'|'assistant', content: string, reasoning?: string, createdAt: number,
 *   status: 'done'|'pending'|'streaming'|'error'|'stopped', kind?: string,
 *   error?: {message: string, kind: string, hint?: string, status?: number} | null,
 *   meta?: {model?: string, usage?: any, durationMs?: number, firstTokenMs?: number, tokensPerSec?: number, attempts?: number, trimmed?: number, finishReason?: string} | null
 * }} Message
 * @typedef {{id: string, title: string, createdAt: number, updatedAt: number, pinned: boolean,
 *   config: ReturnType<typeof defaultConversationConfig>, messages: Message[]}} Conversation
 */

export function createConversations({ storage, toasts, defaultConfig = {} }) {
  /** @type {Conversation[]} */
  let list = $state(load());
  let activeId = $state(storage.get(ACTIVE_KEY, null));
  let storageWarned = false;

  if (!list.some((c) => c.id === activeId)) activeId = list[0]?.id ?? null;

  const active = $derived(list.find((c) => c.id === activeId) ?? null);
  const sorted = $derived([...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt));

  function load() {
    const raw = storage.get(STORAGE_KEY, []);
    if (!Array.isArray(raw)) return [];
    // Anything that was mid-flight when the page closed is now dead.
    return raw.map((c) => ({
      ...c,
      config: { ...defaultConversationConfig(), ...c.config, params: { ...defaultConversationConfig().params, ...c.config?.params } },
      messages: (c.messages || []).map((m) =>
        m.status === 'streaming' || m.status === 'pending'
          ? { ...m, status: m.content ? 'stopped' : 'error', error: m.content ? null : { message: 'Interrupted (page was closed)', kind: 'aborted' } }
          : m,
      ),
    }));
  }

  const persist = debounce(() => {
    const res = storage.set(STORAGE_KEY, $state.snapshot(list));
    if (!res.ok && !storageWarned) {
      storageWarned = true;
      toasts?.error(res.quota ? 'Browser storage is full. Delete or export old conversations.' : 'Could not save conversations.', {
        detail: 'Changes are kept in memory until you reload.',
      });
    }
  }, 400);

  function flush() {
    persist.flush();
  }

  function touch(conv) {
    conv.updatedAt = Date.now();
    persist();
  }

  function get(id) {
    return list.find((c) => c.id === id);
  }

  function select(id) {
    activeId = id;
    storage.set(ACTIVE_KEY, id);
  }

  function create(configPatch = {}) {
    const config = { ...defaultConversationConfig(), ...defaultConfig, ...configPatch };
    const now = Date.now();
    const conv = {
      id: uid('c_'),
      title: autoTitle(config),
      customTitle: false,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      config,
      messages: [],
    };
    list.push(conv);
    select(conv.id);
    persist();
    return get(conv.id);
  }

  function remove(id) {
    const idx = list.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const [removed] = list.splice(idx, 1);
    if (activeId === id) select(sorted[0]?.id ?? null);
    persist();
    return removed;
  }

  /** Re-insert a removed conversation (undo). */
  function restore(conv) {
    list.push(conv);
    persist();
  }

  function duplicate(id, { withMessages = false } = {}) {
    const src = get(id);
    if (!src) return null;
    const snap = $state.snapshot(src);
    const now = Date.now();
    const copy = {
      ...snap,
      id: uid('c_'),
      title: `${snap.title} (copy)`,
      customTitle: true,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      messages: withMessages ? snap.messages.map((m) => ({ ...m, id: uid('m_') })) : [],
    };
    list.push(copy);
    select(copy.id);
    persist();
    return get(copy.id);
  }

  function update(id, patch) {
    const conv = get(id);
    if (!conv) return;
    Object.assign(conv, patch);
    touch(conv);
  }

  function rename(id, title) {
    const conv = get(id);
    const t = title?.trim();
    if (!conv || !t) return;
    conv.title = t.slice(0, 120);
    conv.customTitle = true;
    touch(conv);
  }

  function updateConfig(id, patch) {
    const conv = get(id);
    if (!conv) return;
    conv.config = { ...conv.config, ...patch };
    if (!conv.customTitle) conv.title = autoTitle(conv.config);
    touch(conv);
  }

  /** @returns {Message} the reactive message proxy */
  function addMessage(convId, msg) {
    const conv = get(convId);
    if (!conv) throw new Error(`Conversation ${convId} not found`);
    conv.messages.push({ id: uid('m_'), createdAt: Date.now(), status: 'done', error: null, meta: null, reasoning: '', ...msg });
    touch(conv);
    return conv.messages[conv.messages.length - 1];
  }

  function getMessage(convId, msgId) {
    return get(convId)?.messages.find((m) => m.id === msgId);
  }

  function updateMessage(convId, msgId, patch) {
    const msg = getMessage(convId, msgId);
    if (!msg) return;
    Object.assign(msg, patch);
    persist();
  }

  function removeMessage(convId, msgId) {
    const conv = get(convId);
    if (!conv) return;
    conv.messages = conv.messages.filter((m) => m.id !== msgId);
    touch(conv);
  }

  /** Remove every message after (and optionally including) msgId. */
  function truncateFrom(convId, msgId, { inclusive = false } = {}) {
    const conv = get(convId);
    if (!conv) return;
    const idx = conv.messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    conv.messages = conv.messages.slice(0, inclusive ? idx : idx + 1);
    touch(conv);
  }

  function clearMessages(convId) {
    const conv = get(convId);
    if (!conv) return;
    conv.messages = [];
    touch(conv);
  }

  function importMany(convs) {
    list.push(...convs);
    if (convs[0]) select(convs[0].id);
    persist();
  }

  if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush);

  return {
    get list() {
      return list;
    },
    get sorted() {
      return sorted;
    },
    get active() {
      return active;
    },
    get activeId() {
      return activeId;
    },
    get,
    select,
    create,
    remove,
    restore,
    duplicate,
    update,
    rename,
    updateConfig,
    addMessage,
    getMessage,
    updateMessage,
    removeMessage,
    truncateFrom,
    clearMessages,
    importMany,
    flush,
    persist,
  };
}
