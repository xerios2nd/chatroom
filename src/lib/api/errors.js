/**
 * Error model for everything that talks to the model server.
 * Every failure is normalised into an ApiError with a `kind` so the UI
 * can decide how to present it and the retry layer can decide whether
 * it's worth trying again.
 */

export const ErrorKind = Object.freeze({
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  ABORTED: 'aborted',
  AUTH: 'auth',
  NOT_FOUND: 'not_found',
  RATE_LIMIT: 'rate_limit',
  SERVER: 'server',
  BAD_REQUEST: 'bad_request',
  CONTEXT_LENGTH: 'context_length',
  PARSE: 'parse',
  UNKNOWN: 'unknown',
});

const HINTS = {
  [ErrorKind.NETWORK]:
    'Could not reach the server. Is `unsloth run` running, and does the base URL in Settings point at it?',
  [ErrorKind.TIMEOUT]:
    'The server took too long to respond. A large model may still be loading, so try again or raise the timeout in Settings.',
  [ErrorKind.AUTH]: 'The server rejected the API key. Copy a fresh key from Unsloth → Settings → API.',
  [ErrorKind.NOT_FOUND]:
    'Endpoint or model not found. Check the base URL ends in /v1 and a model is loaded in Unsloth.',
  [ErrorKind.RATE_LIMIT]: 'The server is busy. Retrying with backoff.',
  [ErrorKind.SERVER]: 'The server hit an internal error. It may be out of memory or still loading a model.',
  [ErrorKind.BAD_REQUEST]: 'The server rejected the request. Check the model name and generation parameters.',
  [ErrorKind.CONTEXT_LENGTH]:
    'The conversation is longer than the model context. Lower "Max context tokens" in Settings or start a new chat.',
  [ErrorKind.PARSE]: 'The server sent a response this app could not read.',
  [ErrorKind.ABORTED]: 'Stopped.',
  [ErrorKind.UNKNOWN]: 'Something unexpected went wrong.',
};

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{kind?: string, status?: number, retryable?: boolean, retryAfterMs?: number, cause?: unknown, details?: unknown}} [opts]
   */
  constructor(message, opts = {}) {
    super(message, { cause: opts.cause });
    this.name = 'ApiError';
    this.kind = opts.kind ?? ErrorKind.UNKNOWN;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs;
    this.details = opts.details;
  }

  get hint() {
    return HINTS[this.kind] ?? HINTS[ErrorKind.UNKNOWN];
  }

  /** Plain-object form, safe to store in state / localStorage. */
  toJSON() {
    return {
      message: this.message,
      kind: this.kind,
      status: this.status,
      retryable: this.retryable,
      hint: this.hint,
    };
  }
}

/** Parse a Retry-After header (seconds or HTTP date) into ms. */
export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return undefined;
}

/** Pull a human-readable message out of an OpenAI-style error body. */
export function extractServerMessage(bodyText) {
  if (!bodyText) return '';
  try {
    const json = JSON.parse(bodyText);
    const msg = json?.error?.message ?? json?.error ?? json?.detail ?? json?.message;
    if (typeof msg === 'string') return msg;
    if (msg) return JSON.stringify(msg);
  } catch {
    /* not JSON */
  }
  return bodyText.slice(0, 300);
}

const CONTEXT_RE = /context|maximum.*tokens|too long|exceeds/i;

/**
 * Build an ApiError from a non-2xx Response.
 * @param {{status: number, headers?: {get(name: string): string | null}}} res
 * @param {string} [bodyText]
 */
export function errorFromResponse(res, bodyText = '') {
  const status = res.status;
  const serverMsg = extractServerMessage(bodyText);
  const message = serverMsg || `HTTP ${status}`;
  const retryAfterMs = parseRetryAfter(res.headers?.get?.('retry-after'));

  if (status === 401 || status === 403) {
    return new ApiError(message, { kind: ErrorKind.AUTH, status });
  }
  if (status === 404) return new ApiError(message, { kind: ErrorKind.NOT_FOUND, status });
  if (status === 408) return new ApiError(message, { kind: ErrorKind.TIMEOUT, status, retryable: true });
  if (status === 429) {
    return new ApiError(message, { kind: ErrorKind.RATE_LIMIT, status, retryable: true, retryAfterMs });
  }
  if (status === 400 || status === 413 || status === 422) {
    const kind = CONTEXT_RE.test(serverMsg) ? ErrorKind.CONTEXT_LENGTH : ErrorKind.BAD_REQUEST;
    return new ApiError(message, { kind, status });
  }
  if (status >= 500) {
    // 501 Not Implemented won't fix itself; everything else might.
    return new ApiError(message, { kind: ErrorKind.SERVER, status, retryable: status !== 501, retryAfterMs });
  }
  return new ApiError(message, { kind: ErrorKind.UNKNOWN, status });
}

/** Coerce anything thrown into an ApiError. */
export function normalizeError(err) {
  if (err instanceof ApiError) return err;
  if (err?.name === 'AbortError') {
    return new ApiError('Request aborted', { kind: ErrorKind.ABORTED, cause: err });
  }
  if (err?.name === 'TimeoutError') {
    return new ApiError('Request timed out', { kind: ErrorKind.TIMEOUT, retryable: true, cause: err });
  }
  // fetch() rejects with a TypeError on DNS / connection refused / CORS.
  if (err instanceof TypeError) {
    return new ApiError(err.message || 'Network error', { kind: ErrorKind.NETWORK, retryable: true, cause: err });
  }
  if (err instanceof SyntaxError) {
    return new ApiError(err.message, { kind: ErrorKind.PARSE, cause: err });
  }
  return new ApiError(err?.message ?? String(err), { kind: ErrorKind.UNKNOWN, cause: err });
}

export function isAbort(err) {
  return err?.kind === ErrorKind.ABORTED || err?.name === 'AbortError';
}
