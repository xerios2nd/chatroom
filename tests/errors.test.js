import { describe, it, expect } from 'vitest';
import { errorFromResponse, normalizeError, parseRetryAfter, ErrorKind } from '../src/lib/api/errors.js';

const res = (status, headers = {}) => ({ status, headers: { get: (k) => headers[k.toLowerCase()] ?? null } });

describe('errorFromResponse', () => {
  it.each([
    [401, ErrorKind.AUTH, false],
    [404, ErrorKind.NOT_FOUND, false],
    [429, ErrorKind.RATE_LIMIT, true],
    [500, ErrorKind.SERVER, true],
    [503, ErrorKind.SERVER, true],
    [501, ErrorKind.SERVER, false],
    [400, ErrorKind.BAD_REQUEST, false],
  ])('HTTP %i → %s (retryable=%s)', (status, kind, retryable) => {
    const e = errorFromResponse(res(status), '');
    expect(e.kind).toBe(kind);
    expect(e.retryable).toBe(retryable);
  });

  it('extracts OpenAI-style messages and detects context overflow', () => {
    const e = errorFromResponse(res(400), JSON.stringify({ error: { message: "This model's maximum context length is 4096 tokens" } }));
    expect(e.kind).toBe(ErrorKind.CONTEXT_LENGTH);
    expect(e.message).toMatch(/maximum context/);
  });

  it('reads Retry-After', () => {
    expect(errorFromResponse(res(429, { 'retry-after': '2' })).retryAfterMs).toBe(2000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
  });
});

describe('normalizeError', () => {
  it('maps fetch TypeErrors to retryable network errors', () => {
    const e = normalizeError(new TypeError('Failed to fetch'));
    expect(e.kind).toBe(ErrorKind.NETWORK);
    expect(e.retryable).toBe(true);
    expect(e.toJSON().hint).toMatch(/reach the server/);
  });
  it('maps AbortError', () => {
    expect(normalizeError(new DOMException('x', 'AbortError')).kind).toBe(ErrorKind.ABORTED);
  });
});
