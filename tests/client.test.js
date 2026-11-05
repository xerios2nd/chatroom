import { describe, it, expect } from 'vitest';
import { createClient } from '../src/lib/api/client.js';
import { ErrorKind } from '../src/lib/api/errors.js';

function sseResponse(lines, { delayMs = 0 } = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(c) {
      for (const l of lines) {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        c.enqueue(enc.encode(l));
      }
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const chunk = (delta, finish_reason = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`;

async function drain(iter) {
  const out = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe('createClient', () => {
  it('streams content, reasoning, usage and finish reason; sends auth + body', async () => {
    let captured;
    const client = createClient(() => ({ baseUrl: 'http://x/v1/', apiKey: 'sk-unsloth-abc' }), {
      fetchImpl: async (url, init) => {
        captured = { url, init };
        return sseResponse([
          ': keep-alive\n\n',
          chunk({ reasoning_content: 'think' }),
          chunk({ content: 'Hel' }),
          chunk({ content: 'lo' }, 'stop'),
          `data: ${JSON.stringify({ choices: [], usage: { completion_tokens: 2 } })}\n\n`,
          'data: [DONE]\n\n',
        ]);
      },
    });
    const events = await drain(client.streamChat({ model: 'default', messages: [{ role: 'user', content: 'hi' }], params: { temperature: 0.5, maxTokens: 10 } }));
    expect(captured.url).toBe('http://x/v1/chat/completions');
    expect(captured.init.headers.Authorization).toBe('Bearer sk-unsloth-abc');
    const body = JSON.parse(captured.init.body);
    expect(body).toMatchObject({ model: 'default', stream: true, temperature: 0.5, max_tokens: 10, stream_options: { include_usage: true } });

    const text = events.filter((e) => e.type === 'delta').map((e) => e.content).join('');
    expect(text).toBe('Hello');
    expect(events.find((e) => e.reasoning)?.reasoning).toBe('think');
    expect(events.find((e) => e.type === 'usage').usage.completion_tokens).toBe(2);
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'stop' });
  });

  it('maps HTTP errors', async () => {
    const client = createClient(() => ({ baseUrl: '/v1' }), {
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }),
    });
    await expect(drain(client.streamChat({ messages: [] }))).rejects.toMatchObject({ kind: ErrorKind.AUTH, message: 'bad key' });
  });

  it('surfaces in-stream errors', async () => {
    const client = createClient(() => ({ baseUrl: '/v1' }), {
      fetchImpl: async () => sseResponse([chunk({ content: 'a' }), `data: ${JSON.stringify({ error: { message: 'OOM' } })}\n\n`]),
    });
    await expect(drain(client.streamChat({ messages: [] }))).rejects.toMatchObject({ kind: ErrorKind.SERVER, message: 'OOM' });
  });

  it('times out waiting for headers', async () => {
    const client = createClient(() => ({ baseUrl: '/v1', timeoutMs: 30 }), {
      fetchImpl: (url, init) =>
        new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    });
    await expect(drain(client.streamChat({ messages: [] }))).rejects.toMatchObject({ kind: ErrorKind.TIMEOUT, retryable: true });
  });

  it('aborts a stalled stream with the idle watchdog', async () => {
    const client = createClient(() => ({ baseUrl: '/v1' }), {
      fetchImpl: async (url, init) => {
        const body = new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(chunk({ content: 'a' })));
            init.signal.addEventListener('abort', () => c.error(init.signal.reason));
          },
        });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      },
    });
    await expect(drain(client.streamChat({ messages: [], idleTimeoutMs: 40 }))).rejects.toMatchObject({ kind: ErrorKind.TIMEOUT });
  });

  it('handles servers that ignore stream:true', async () => {
    const client = createClient(() => ({ baseUrl: '/v1' }), {
      fetchImpl: async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'whole' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }),
    });
    const events = await drain(client.streamChat({ messages: [] }));
    expect(events.find((e) => e.type === 'delta').content).toBe('whole');
  });

  it('ping treats a 404 on /models as reachable', async () => {
    const client = createClient(() => ({ baseUrl: '/v1' }), { fetchImpl: async () => new Response('nope', { status: 404 }) });
    expect((await client.ping()).ok).toBe(true);
  });

  it('ping reports network failures', async () => {
    const client = createClient(() => ({ baseUrl: '/v1' }), {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const r = await client.ping();
    expect(r.ok).toBe(false);
    expect(r.error.kind).toBe(ErrorKind.NETWORK);
  });
});
