import { ApiError, ErrorKind, errorFromResponse, normalizeError } from './errors.js';
import { iterateSSE } from './sse.js';

/**
 * Client for an OpenAI-compatible server. Unsloth exposes `/v1/chat/completions`
 * and `/v1/models`, and so do llama.cpp, vLLM and Ollama, so any of them will work.
 *
 * Takes a getter rather than a static config so it always picks up the latest
 * settings without having to be rebuilt.
 *
 * @typedef {{baseUrl: string, apiKey?: string, timeoutMs?: number, idleTimeoutMs?: number}} ClientConfig
 * @param {() => ClientConfig} getConfig
 */
export function createClient(getConfig, { fetchImpl = (...a) => globalThis.fetch(...a) } = {}) {
  function url(path) {
    const base = (getConfig().baseUrl || '').trim().replace(/\/+$/, '');
    return `${base}${path}`;
  }

  function headers(extra = {}) {
    const { apiKey } = getConfig();
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
      ...extra,
    };
  }

  /**
   * fetch() with a header timeout, linked to an outer abort signal.
   * Returns the Response and a controller (so callers can keep aborting during body reads).
   */
  async function open(path, { method = 'GET', body, signal, timeoutMs, accept } = {}) {
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort(new ApiError('Aborted', { kind: ErrorKind.ABORTED }));
    if (signal?.aborted) onOuterAbort();
    signal?.addEventListener('abort', onOuterAbort, { once: true });

    const limit = timeoutMs ?? getConfig().timeoutMs ?? 60_000;
    const timer = setTimeout(() => {
      controller.abort(new ApiError(`No response within ${Math.round(limit / 1000)}s`, { kind: ErrorKind.TIMEOUT, retryable: true }));
    }, limit);

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
    };

    try {
      const res = await fetchImpl(url(path), {
        method,
        headers: headers(accept ? { Accept: accept } : {}),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw errorFromResponse(res, text);
      }
      return { res, controller, cleanup };
    } catch (err) {
      cleanup();
      // Prefer the reason we aborted with (timeout vs user stop) over the generic AbortError.
      if (controller.signal.aborted && controller.signal.reason instanceof ApiError) throw controller.signal.reason;
      throw normalizeError(err);
    }
  }

  /** GET /models → array of { id, ... } */
  async function listModels({ signal, timeoutMs = 8000 } = {}) {
    const { res, cleanup } = await open('/models', { signal, timeoutMs });
    try {
      const json = await res.json();
      const data = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      return data.map((m) => (typeof m === 'string' ? { id: m } : m)).filter((m) => m?.id);
    } catch (err) {
      throw new ApiError('Invalid /models response', { kind: ErrorKind.PARSE, cause: err });
    } finally {
      cleanup();
    }
  }

  /**
   * Health probe. Treats a 404 on /models as reachable, because some servers
   * don't implement it but still answer chat.
   */
  async function ping({ signal, timeoutMs = 6000 } = {}) {
    const started = performance.now();
    try {
      const models = await listModels({ signal, timeoutMs });
      return { ok: true, latencyMs: Math.round(performance.now() - started), models };
    } catch (err) {
      const e = normalizeError(err);
      if (e.kind === ErrorKind.NOT_FOUND) {
        return { ok: true, latencyMs: Math.round(performance.now() - started), models: [] };
      }
      return { ok: false, latencyMs: Math.round(performance.now() - started), error: e };
    }
  }

  function buildBody({ model, messages, params = {}, stream, includeUsage }) {
    const body = { model: model || 'default', messages, stream };
    if (params.temperature != null) body.temperature = params.temperature;
    if (params.topP != null) body.top_p = params.topP;
    if (params.maxTokens != null) body.max_tokens = params.maxTokens;
    if (params.presencePenalty) body.presence_penalty = params.presencePenalty;
    if (params.frequencyPenalty) body.frequency_penalty = params.frequencyPenalty;
    if (params.stop?.length) body.stop = params.stop;
    if (stream && includeUsage) body.stream_options = { include_usage: true };
    return body;
  }

  /**
   * Stream a chat completion. Yields normalised events:
   *   { type: 'open' }                                  headers received
   *   { type: 'delta', content?: string, reasoning?: string }
   *   { type: 'usage', usage }
   *   { type: 'done', finishReason }
   */
  async function* streamChat({ model, messages, params, signal, includeUsage = true, timeoutMs, idleTimeoutMs }) {
    const body = buildBody({ model, messages, params, stream: true, includeUsage });
    const { res, controller, cleanup } = await open('/chat/completions', {
      method: 'POST',
      body,
      signal,
      timeoutMs,
      accept: 'text/event-stream',
    });

    // Idle watchdog: abort if the server goes quiet mid-stream.
    const idle = idleTimeoutMs ?? getConfig().idleTimeoutMs ?? 45_000;
    let idleTimer;
    const kick = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        controller.abort(
          new ApiError(`Stream stalled: no data for ${Math.round(idle / 1000)}s`, { kind: ErrorKind.TIMEOUT, retryable: true }),
        );
      }, idle);
    };

    let finishReason = null;
    try {
      yield { type: 'open' };
      kick();

      // Some servers ignore stream:true and send one JSON body back. Handle that too.
      const ctype = res.headers.get('content-type') || '';
      if (ctype.includes('application/json')) {
        const json = await res.json();
        yield* fromCompletion(json);
        return;
      }
      if (!res.body) throw new ApiError('Empty response body', { kind: ErrorKind.PARSE });

      for await (const evt of iterateSSE(res.body, { onChunk: kick })) {
        if (evt.data === '[DONE]') break;
        let json;
        try {
          json = JSON.parse(evt.data);
        } catch {
          continue; // tolerate stray non-JSON keep-alives
        }
        if (json.error) {
          const msg = typeof json.error === 'string' ? json.error : json.error.message || 'Server error during stream';
          throw new ApiError(msg, { kind: ErrorKind.SERVER, retryable: false, details: json.error });
        }
        const choice = json.choices?.[0];
        const delta = choice?.delta ?? {};
        const content = delta.content ?? '';
        const reasoning = delta.reasoning_content ?? delta.reasoning ?? '';
        if (content || reasoning) yield { type: 'delta', content, reasoning };
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (json.usage) yield { type: 'usage', usage: json.usage };
      }
      yield { type: 'done', finishReason };
    } catch (err) {
      if (controller.signal.aborted && controller.signal.reason instanceof ApiError) throw controller.signal.reason;
      throw normalizeError(err);
    } finally {
      clearTimeout(idleTimer);
      cleanup();
    }
  }

  function* fromCompletion(json) {
    const choice = json?.choices?.[0];
    const msg = choice?.message ?? {};
    yield {
      type: 'delta',
      content: msg.content ?? '',
      reasoning: msg.reasoning_content ?? msg.reasoning ?? '',
    };
    if (json.usage) yield { type: 'usage', usage: json.usage };
    yield { type: 'done', finishReason: choice?.finish_reason ?? null };
  }

  /** Non-streaming request. Same event shape, delivered in one go. */
  async function* completeChat({ model, messages, params, signal, timeoutMs }) {
    const body = buildBody({ model, messages, params, stream: false });
    const { res, cleanup } = await open('/chat/completions', { method: 'POST', body, signal, timeoutMs: timeoutMs ?? 300_000 });
    try {
      yield { type: 'open' };
      let json;
      try {
        json = await res.json();
      } catch (err) {
        throw new ApiError('Invalid JSON from server', { kind: ErrorKind.PARSE, cause: err });
      }
      yield* fromCompletion(json);
    } finally {
      cleanup();
    }
  }

  /** Single-shot helper (used for things like auto-titling). Returns the text. */
  async function complete(opts) {
    let text = '';
    for await (const e of completeChat(opts)) if (e.type === 'delta') text += e.content;
    return text;
  }

  return { listModels, ping, streamChat, completeChat, complete, url };
}
