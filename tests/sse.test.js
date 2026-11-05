import { describe, it, expect } from 'vitest';
import { createSSEParser, iterateSSE } from '../src/lib/api/sse.js';

function collect(chunks) {
  const events = [];
  const p = createSSEParser((e) => events.push(e));
  for (const c of chunks) p.feed(c);
  p.end();
  return events;
}

describe('createSSEParser', () => {
  it('parses simple data events', () => {
    expect(collect(['data: a\n\ndata: b\n\n']).map((e) => e.data)).toEqual(['a', 'b']);
  });

  it('handles chunks split mid-line and mid-CRLF', () => {
    const events = collect(['da', 'ta: hel', 'lo\r', '\n\r\ndata: x\r\n\r\n']);
    expect(events.map((e) => e.data)).toEqual(['hello', 'x']);
  });

  it('joins multi-line data and ignores comments', () => {
    const events = collect([': ping\n', 'event: msg\ndata: 1\ndata: 2\n\n']);
    expect(events).toEqual([{ event: 'msg', data: '1\n2', id: undefined }]);
  });

  it('flushes a trailing event without a blank line', () => {
    expect(collect(['data: [DONE]']).map((e) => e.data)).toEqual(['[DONE]']);
  });
});

describe('iterateSSE', () => {
  it('decodes a byte stream, including split multi-byte chars', async () => {
    const bytes = new TextEncoder().encode('data: héllo 👋\n\ndata: [DONE]\n\n');
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3));
        c.close();
      },
    });
    const out = [];
    for await (const e of iterateSSE(stream)) out.push(e.data);
    expect(out).toEqual(['héllo 👋', '[DONE]']);
  });
});
