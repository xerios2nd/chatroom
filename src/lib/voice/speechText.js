/**
 * Turning streamed markdown into speakable text. Pure functions, no browser APIs.
 */

const CODE_PLACEHOLDER = ' (I put a code snippet on screen.) ';

/** Markdown → text that sounds natural when read by a TTS engine. */
export function toSpeechText(md) {
  return (md || '')
    .replace(/```[\s\S]*?(?:```|$)/g, CODE_PLACEHOLDER)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/^[ \t]*\|?[ \t:|-]*-[ \t:|-]*$/gm, '') // table separator rows
    .replace(/^[ \t]*\|(.*?)\|?[ \t]*$/gm, (_, row) => `${row.split('|').map((c) => c.trim()).filter(Boolean).join(', ')}.`)
    .replace(/^\s*(?:(?:#{1,6}|>|[-*+])\s+)+/gm, '')
    .replace(/(\*\*|__|\*|~~)(.+?)\1/g, '$2')
    .replace(/(^|\s)_(.+?)_(?=\s|[.,!?]|$)/g, '$1$2')
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n+ ?/g, '\n')
    .replace(/^[\s,]+|[\s,]+$/g, '');
}

/**
 * Sentence end: punctuation + whitespace + a character that isn't lowercase
 * (so "e.g. the" doesn't split), or a line break followed by more text.
 * Requiring the next character means we never cut on a boundary we can't confirm yet.
 */
const BOUNDARY = /[.!?…]+["'”’)\]*_]*\s+(?=[^\s\p{Ll}])|\n+(?=\s*\S)/gu;

/**
 * Incrementally split streamed markdown into speakable chunks, so speech can
 * start after the first sentence instead of waiting for the whole reply.
 *
 * - Never cuts inside an open ``` code fence.
 * - Merges very short sentences ("Great.") with the next one to avoid choppy speech.
 * - Force-splits runaway sentences at a comma or space once they pass maxChars.
 */
export function createSentenceChunker({ minChars = 24, maxChars = 260 } = {}) {
  let buffer = '';
  let carry = '';
  let emitted = 0;

  function safeEnd(text) {
    const fences = [...text.matchAll(/```/g)].map((m) => m.index);
    const closed = [];
    for (let i = 0; i + 1 < fences.length; i += 2) closed.push([fences[i], fences[i + 1] + 3]);
    const insideCode = (pos) => closed.some(([a, b]) => pos > a && pos < b);
    // Never look past an unclosed fence.
    const limit = fences.length % 2 === 1 ? fences[fences.length - 1] : text.length;
    const scope = text.slice(0, limit);

    let end = -1;
    BOUNDARY.lastIndex = 0;
    let m;
    while ((m = BOUNDARY.exec(scope))) {
      if (!insideCode(m.index)) end = m.index + m[0].length;
    }
    if (end === -1 && limit === text.length && !closed.length && scope.length > maxChars) {
      const cut = Math.max(scope.lastIndexOf(', ', maxChars), scope.lastIndexOf(' ', maxChars));
      if (cut > maxChars / 3) end = cut + 1;
    }
    return end;
  }

  function push(piece, out) {
    carry += piece;
    const speech = toSpeechText(carry);
    // The first chunk goes out as soon as possible, which matters most for latency.
    if (speech && (emitted === 0 || speech.length >= minChars)) {
      out.push(speech);
      emitted++;
      carry = '';
    }
  }

  return {
    /** @returns {string[]} chunks that are ready to speak */
    feed(delta) {
      buffer += delta;
      const out = [];
      const end = safeEnd(buffer);
      if (end > 0) {
        push(buffer.slice(0, end), out);
        buffer = buffer.slice(end);
      }
      return out;
    },
    /** Call when the stream ends. Returns whatever is left. */
    flush() {
      const speech = toSpeechText(carry + buffer);
      carry = buffer = '';
      return speech ? [speech] : [];
    },
  };
}

/** Split a full (non-streamed) text into chunks. */
export function splitForSpeech(text, opts) {
  const c = createSentenceChunker(opts);
  return [...c.feed(text), ...c.flush()];
}
