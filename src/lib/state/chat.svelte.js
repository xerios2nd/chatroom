import { withRetry } from '../api/retry.js';
import { ErrorKind, normalizeError } from '../api/errors.js';
import { buildRequestMessages } from '../core/prompt.js';

/**
 * Runs generations: builds the request, streams tokens into the message,
 * retries transient failures, and exposes per-conversation run status for the UI.
 *
 * Run phases: 'connecting' → 'waiting' (headers in, no tokens yet) → 'streaming'
 *             with 'retrying' (countdown) between failed attempts.
 */
export function createChatController({ client, settings, conversations, connection, toasts, presets }) {
  /** @type {Record<string, {msgId: string, phase: string, attempt: number, maxRetries: number, retryAt: number|null, lastError: string|null, startedAt: number}>} */
  const runs = $state({});
  /** AbortControllers live outside $state: they shouldn't be proxied. */
  const controllers = new Map();

  /**
   * Lifecycle events for other features (voice mode, analytics, a host app):
   *   { type: 'start', convId, msgId }
   *   { type: 'delta', convId, msgId, content }   content only, batched (~30fps)
   *   { type: 'end',   convId, msgId, status: 'done'|'error'|'stopped'|'aborted', error? }
   */
  const listeners = new Set();
  function emit(evt) {
    for (const fn of listeners) {
      try {
        fn(evt);
      } catch (err) {
        console.error('[chat] listener failed', err);
      }
    }
  }
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /** Lets the voice controller tell us which conversations are in voice mode. */
  let voiceModeResolver = () => false;

  const isBusy = (convId) => !!runs[convId];

  async function send(convId, text, { kind } = {}) {
    const content = text?.trim();
    if (!content) return;
    if (isBusy(convId)) {
      toasts.warning('Wait for the current reply to finish, or stop it first.');
      return;
    }
    conversations.addMessage(convId, { role: 'user', content, kind });
    return generate(convId);
  }

  async function generate(convId) {
    const conv = conversations.get(convId);
    if (!conv || isBusy(convId)) return;

    const s = settings.values;
    const p = conv.config.params ?? {};
    const model = p.model || s.model;
    const params = {
      temperature: p.temperature ?? s.temperature,
      topP: p.topP ?? s.topP,
      maxTokens: p.maxTokens ?? s.maxTokens,
    };

    const { messages, trimmedCount, overBudget } = buildRequestMessages(conv, {
      maxContextTokens: s.maxContextTokens,
      reserveTokens: params.maxTokens,
      presets,
      voiceMode: voiceModeResolver(convId),
    });
    if (messages.length < 2) {
      toasts.warning('Nothing to send yet.');
      return;
    }
    if (overBudget) {
      toasts.warning('The system prompt and context documents alone exceed the context budget.', {
        detail: 'Disable some context documents or raise "Max context tokens" in Settings.',
      });
    }

    const msg = conversations.addMessage(convId, { role: 'assistant', content: '', status: 'pending', meta: { model, trimmed: trimmedCount } });
    const msgId = msg.id;
    const patch = (fn) => {
      const m = conversations.getMessage(convId, msgId);
      if (m) fn(m);
    };

    const controller = new AbortController();
    controllers.set(convId, controller);
    runs[convId] = { msgId, phase: 'connecting', attempt: 0, maxRetries: s.maxRetries, retryAt: null, lastError: null, startedAt: Date.now() };
    emit({ type: 'start', convId, msgId });

    // Batch tokens to ~30fps so markdown isn't re-rendered for every single token.
    let pendingContent = '';
    let pendingReasoning = '';
    let flushTimer = null;
    const flush = () => {
      flushTimer = null;
      if (!pendingContent && !pendingReasoning) return;
      const c = pendingContent;
      const r = pendingReasoning;
      pendingContent = pendingReasoning = '';
      patch((m) => {
        m.content += c;
        m.reasoning = (m.reasoning ?? '') + r;
      });
      if (c) emit({ type: 'delta', convId, msgId, content: c });
    };

    let received = false;
    let firstTokenAt = null;
    let usage = null;
    let finishReason = null;
    let attemptStart = performance.now();

    try {
      await withRetry(
        async (attempt) => {
          const run = runs[convId];
          if (run) {
            run.phase = 'connecting';
            run.attempt = attempt;
            run.retryAt = null;
          }
          attemptStart = performance.now();

          const opts = { model, messages, params, signal: controller.signal, includeUsage: s.includeUsage, timeoutMs: s.timeoutMs, idleTimeoutMs: s.idleTimeoutMs };
          const iter = s.stream ? client.streamChat(opts) : client.completeChat(opts);

          for await (const evt of iter) {
            if (evt.type === 'open') {
              if (runs[convId]) runs[convId].phase = 'waiting';
              connection.report(true);
            } else if (evt.type === 'delta') {
              if (!received) {
                received = true;
                firstTokenAt = performance.now();
                if (runs[convId]) runs[convId].phase = 'streaming';
                patch((m) => (m.status = 'streaming'));
              }
              pendingContent += evt.content || '';
              pendingReasoning += evt.reasoning || '';
              flushTimer ??= setTimeout(flush, 33);
            } else if (evt.type === 'usage') {
              usage = evt.usage;
            } else if (evt.type === 'done') {
              finishReason = evt.finishReason;
            }
          }
        },
        {
          retries: s.maxRetries,
          signal: controller.signal,
          // Never auto-retry once tokens have arrived: that would duplicate or garble output.
          shouldRetry: (e) => e.retryable && !received,
          onRetry: ({ attempt, delayMs, error }) => {
            const run = runs[convId];
            if (run) {
              run.phase = 'retrying';
              run.attempt = attempt;
              run.retryAt = Date.now() + delayMs;
              run.lastError = error.message;
            }
            patch((m) => (m.meta = { ...m.meta, attempts: attempt }));
          },
        },
      );

      clearTimeout(flushTimer);
      flush();
      const end = performance.now();
      const completionTokens = usage?.completion_tokens;
      const genMs = firstTokenAt ? end - firstTokenAt : null;
      patch((m) => {
        const empty = !m.content.trim() && !m.reasoning?.trim();
        m.status = empty ? 'error' : 'done';
        m.error = empty ? { message: 'The model returned an empty response.', kind: ErrorKind.PARSE, hint: 'Make sure a model is loaded in Unsloth, then retry.' } : null;
        m.meta = {
          ...m.meta,
          usage,
          finishReason,
          durationMs: Math.round(end - attemptStart),
          firstTokenMs: firstTokenAt ? Math.round(firstTokenAt - attemptStart) : null,
          tokensPerSec: completionTokens && genMs > 0 ? +(completionTokens / (genMs / 1000)).toFixed(1) : null,
        };
      });
      if (finishReason === 'length') {
        toasts.warning('Reply was cut off at the max-token limit.', { detail: 'Raise "Max tokens" in Settings or the conversation config.' });
      }
    } catch (raw) {
      clearTimeout(flushTimer);
      flush();
      const err = normalizeError(raw);
      if (err.kind === ErrorKind.ABORTED) {
        const m = conversations.getMessage(convId, msgId);
        if (m && !m.content && !m.reasoning) conversations.removeMessage(convId, msgId);
        else patch((m) => (m.status = 'stopped'));
      } else {
        patch((m) => {
          m.status = 'error';
          m.error = err.toJSON();
        });
        connection.report(false, err);
        if (conversations.activeId !== convId) {
          toasts.error(`Reply failed in "${conv.title}"`, { detail: err.message });
        }
      }
    } finally {
      delete runs[convId];
      controllers.delete(convId);
      conversations.persist();
      const final = conversations.getMessage(convId, msgId);
      emit({ type: 'end', convId, msgId, status: final?.status ?? 'aborted', error: final?.error ?? null });
    }
  }

  function stop(convId) {
    controllers.get(convId)?.abort();
  }

  function stopAll() {
    for (const c of controllers.values()) c.abort();
  }

  /** Drop an assistant reply (and anything after it) and generate again. */
  async function regenerate(convId, msgId) {
    if (isBusy(convId)) return;
    const conv = conversations.get(convId);
    const msg = conv?.messages.find((m) => m.id === msgId);
    if (!msg) return;
    if (msg.role === 'assistant') conversations.truncateFrom(convId, msgId, { inclusive: true });
    else conversations.truncateFrom(convId, msgId);
    return generate(convId);
  }

  /** Edit a user message, discard everything after it, and regenerate. */
  async function editAndResend(convId, msgId, content) {
    if (isBusy(convId)) return;
    const text = content?.trim();
    if (!text) return;
    conversations.updateMessage(convId, msgId, { content: text });
    conversations.truncateFrom(convId, msgId);
    return generate(convId);
  }

  return {
    get runs() {
      return runs;
    },
    run: (convId) => runs[convId] ?? null,
    isBusy,
    send,
    generate,
    stop,
    stopAll,
    regenerate,
    editAndResend,
    subscribe,
    setVoiceModeResolver(fn) {
      voiceModeResolver = fn;
    },
  };
}
