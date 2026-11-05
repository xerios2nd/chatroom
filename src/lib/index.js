/**
 * Public API of the interview-coach module.
 * A host app should import from here only. Everything else is an internal detail.
 */

// UI
export { default as ChatApp } from './ChatApp.svelte';

// State composition (create your own instance to drive the app from outside)
export { createAppState, getAppState, setAppState } from './state/index.js';
export { DEFAULT_SETTINGS } from './state/settings.svelte.js';

// Framework-agnostic pieces, reusable without the UI
export { createClient } from './api/client.js';
export { ApiError, ErrorKind, normalizeError } from './api/errors.js';
export { withRetry, computeBackoff } from './api/retry.js';
export { createSSEParser, iterateSSE } from './api/sse.js';
export { buildSystemPrompt, buildRequestMessages, defaultConversationConfig } from './core/prompt.js';
export { INTERVIEW_PRESETS, QUICK_ACTIONS } from './core/presets.js';
export { conversationToMarkdown, conversationsToJSON, parseImport } from './core/exporters.js';
export { createStorage } from './core/storage.js';
