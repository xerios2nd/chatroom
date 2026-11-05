import { ApiError, ErrorKind, normalizeError } from './errors.js';

/**
 * Exponential backoff with jitter.
 * attempt is 1-based (the first retry is attempt 1).
 */
export function computeBackoff(attempt, { baseDelayMs = 800, maxDelayMs = 15_000, jitter = 0.25, random = Math.random } = {}) {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  const spread = exp * jitter;
  return Math.round(Math.max(0, exp - spread + random() * spread * 2));
}

/** Promise-based sleep that rejects as soon as `signal` aborts. */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError('Aborted', { kind: ErrorKind.ABORTED }));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(t);
      reject(new ApiError('Aborted', { kind: ErrorKind.ABORTED }));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Run `fn` and retry on retryable errors.
 *
 * @template T
 * @param {(attempt: number) => Promise<T>} fn  receives the 0-based attempt number
 * @param {{
 *   retries?: number,
 *   signal?: AbortSignal,
 *   shouldRetry?: (err: ApiError, attempt: number) => boolean,
 *   onRetry?: (info: {attempt: number, retries: number, delayMs: number, error: ApiError}) => void,
 *   baseDelayMs?: number,
 *   maxDelayMs?: number,
 *   sleepFn?: typeof sleep,
 * }} [opts]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, opts = {}) {
  const { retries = 3, signal, shouldRetry = (e) => e.retryable, onRetry, sleepFn = sleep, ...backoff } = opts;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (raw) {
      const err = normalizeError(raw);
      if (signal?.aborted || err.kind === ErrorKind.ABORTED) throw err;
      if (attempt >= retries || !shouldRetry(err, attempt)) throw err;

      const next = attempt + 1;
      const delayMs = Math.min(err.retryAfterMs ?? computeBackoff(next, backoff), backoff.maxDelayMs ?? 30_000);
      onRetry?.({ attempt: next, retries, delayMs, error: err });
      await sleepFn(delayMs, signal);
    }
  }
}
