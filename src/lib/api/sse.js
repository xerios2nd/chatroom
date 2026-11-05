/**
 * Minimal, spec-compliant-enough Server-Sent Events parser.
 * Kept pure (no fetch / DOM) so it's trivially testable and reusable.
 */

/**
 * @param {(event: {event: string, data: string, id?: string}) => void} onEvent
 */
export function createSSEParser(onEvent) {
  let buffer = '';
  let data = [];
  let eventName = '';
  let lastId;

  function dispatch() {
    if (data.length) {
      onEvent({ event: eventName || 'message', data: data.join('\n'), id: lastId });
    }
    data = [];
    eventName = '';
  }

  function processLine(line) {
    if (line === '') return dispatch();
    if (line.startsWith(':')) return; // comment / keep-alive

    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'data') data.push(value);
    else if (field === 'event') eventName = value;
    else if (field === 'id') lastId = value;
    // `retry` and unknown fields are ignored
  }

  return {
    /** Feed decoded text. Handles chunks that split lines anywhere. */
    feed(text) {
      buffer += text;
      // Split on CRLF, LF or CR. A trailing lone CR could be half of a CRLF, so hold it back.
      let match;
      const re = /\r\n|\n|\r(?!$)/g;
      let start = 0;
      while ((match = re.exec(buffer))) {
        processLine(buffer.slice(start, match.index));
        start = match.index + match[0].length;
      }
      buffer = buffer.slice(start);
    },
    /** Flush whatever is left once the stream ends. */
    end() {
      if (buffer) {
        processLine(buffer.replace(/\r$/, ''));
        buffer = '';
      }
      dispatch();
    },
  };
}

/**
 * Iterate SSE events from a fetch() body stream.
 * @param {ReadableStream<Uint8Array>} body
 * @param {{onChunk?: () => void}} [opts] onChunk fires on every raw chunk (used for idle watchdogs)
 */
export async function* iterateSSE(body, { onChunk } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const queue = [];
  const parser = createSSEParser((e) => queue.push(e));

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      onChunk?.();
      parser.feed(decoder.decode(value, { stream: true }));
      while (queue.length) yield queue.shift();
    }
    parser.feed(decoder.decode());
    parser.end();
    while (queue.length) yield queue.shift();
  } finally {
    reader.releaseLock?.();
  }
}
