import { describe, it, expect, vi } from 'vitest';
import { withRetry, computeBackoff, sleep } from '../src/lib/api/retry.js';
import { ApiError, ErrorKind } from '../src/lib/api/errors.js';

const noSleep = () => Promise.resolve();

describe('computeBackoff', () => {
  it('grows exponentially and caps', () => {
    const mid = () => 0.5; // no jitter offset
    expect(computeBackoff(1, { baseDelayMs: 100, random: mid })).toBe(100);
    expect(computeBackoff(3, { baseDelayMs: 100, random: mid })).toBe(400);
    expect(computeBackoff(20, { baseDelayMs: 100, maxDelayMs: 1000, random: mid })).toBe(1000);
  });
});

describe('withRetry', () => {
  it('retries retryable errors then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('down', { kind: ErrorKind.SERVER, retryable: true }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();
    await expect(withRetry(fn, { retries: 3, onRetry, sleepFn: noSleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls.map((c) => c[0].attempt)).toEqual([1, 2]);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError('nope', { kind: ErrorKind.AUTH }));
    await expect(withRetry(fn, { retries: 3, sleepFn: noSleep })).rejects.toMatchObject({ kind: ErrorKind.AUTH });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError('down', { kind: ErrorKind.SERVER, retryable: true }));
    await expect(withRetry(fn, { retries: 2, sleepFn: noSleep })).rejects.toMatchObject({ kind: ErrorKind.SERVER });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('honours Retry-After', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new ApiError('busy', { kind: ErrorKind.RATE_LIMIT, retryable: true, retryAfterMs: 1234 })).mockResolvedValue(1);
    const sleepFn = vi.fn(noSleep);
    await withRetry(fn, { retries: 1, sleepFn });
    expect(sleepFn.mock.calls[0][0]).toBe(1234);
  });

  it('respects a custom shouldRetry', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError('x', { kind: ErrorKind.SERVER, retryable: true }));
    await expect(withRetry(fn, { retries: 5, shouldRetry: () => false, sleepFn: noSleep })).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('sleep rejects on abort', async () => {
    const c = new AbortController();
    const p = sleep(10_000, c.signal);
    c.abort();
    await expect(p).rejects.toMatchObject({ kind: ErrorKind.ABORTED });
  });
});
