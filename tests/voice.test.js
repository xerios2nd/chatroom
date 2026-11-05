import { describe, it, expect, vi } from 'vitest';
import { createSentenceChunker, splitForSpeech, toSpeechText } from '../src/lib/voice/speechText.js';
import { createSpeechQueue } from '../src/lib/voice/tts.js';

function streamThrough(text, size = 3) {
  const c = createSentenceChunker();
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(...c.feed(text.slice(i, i + size)));
  return [...out, ...c.flush()];
}

describe('toSpeechText', () => {
  it('strips markdown, links, emoji and code', () => {
    expect(toSpeechText('## Title\n> **Bold** and *em* with `code`. See [docs](http://x.y) 🚀')).toBe('Title\nBold and em with code. See docs');
    expect(toSpeechText('Before\n```js\nconst x = 1;\n```\nAfter')).toMatch(/Before\n\(I put a code snippet on screen\.\)\nAfter/);
  });
  it('reads tables row by row', () => {
    expect(toSpeechText('| a | b |\n|---|:-:|\n| 1 | 2 |')).toBe('a, b.\n1, 2.');
  });
});

describe('createSentenceChunker', () => {
  it('emits the first sentence immediately, then sentence by sentence', () => {
    const chunks = streamThrough("Hi! I'm Alex, the hiring manager here. Let's start with your background, shall we?");
    expect(chunks).toEqual(['Hi!', "I'm Alex, the hiring manager here.", "Let's start with your background, shall we?"]);
  });

  it('does not split on abbreviations followed by lowercase', () => {
    const chunks = streamThrough('Pick a structure, e.g. the STAR format works well here. Next one please.');
    expect(chunks[0]).toBe('Pick a structure, e.g. the STAR format works well here.');
  });

  it('keeps code blocks whole, even with sentence-like content inside', () => {
    const chunks = streamThrough("Here's an example:\n```js\nconst a = 1. B = 2;\n```\nWhat does it print? Think about it.");
    expect(chunks.filter((c) => c.includes('code snippet'))).toHaveLength(1);
    expect(chunks.join(' ')).toContain('What does it print?');
    expect(chunks.join(' ')).not.toContain('const');
  });

  it('merges very short sentences after the first', () => {
    const chunks = streamThrough('Okay. Good. Fine. Now tell me about a hard bug you fixed recently.');
    expect(chunks).toEqual(['Okay.', 'Good. Fine. Now tell me about a hard bug you fixed recently.']);
  });

  it('force-splits a very long run-on sentence', () => {
    const long = 'word, '.repeat(80);
    const c = createSentenceChunker({ maxChars: 100 });
    const out = c.feed(long);
    expect(out.length).toBe(1);
    expect(out[0].length).toBeLessThanOrEqual(100);
  });

  it('splitForSpeech handles full text', () => {
    expect(splitForSpeech('One sentence here. And another one right here.')).toHaveLength(2);
  });
});

function fakeEngine(log, { failOn } = {}) {
  return {
    prepare(text) {
      let resolve;
      const p = {
        play: () =>
          new Promise((res, rej) => {
            log.push(`play:${text}`);
            if (text === failOn) return rej(new Error('boom'));
            resolve = res;
            setTimeout(res, 5);
          }),
        stop: () => {
          log.push(`stop:${text}`);
          resolve?.();
        },
      };
      log.push(`prepare:${text}`);
      return p;
    },
  };
}

describe('createSpeechQueue', () => {
  it('plays in order and reports start/idle', async () => {
    const log = [];
    const onStart = vi.fn();
    const idle = new Promise((r) => {
      const q = createSpeechQueue(() => fakeEngine(log), { onStart, onIdle: r });
      q.enqueue('a');
      q.enqueue('b');
      expect(q.speaking).toBe(true);
    });
    await idle;
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(log.filter((l) => l.startsWith('play'))).toEqual(['play:a', 'play:b']);
  });

  it('prepares chunks ahead of playback (prefetch)', () => {
    const log = [];
    const q = createSpeechQueue(() => fakeEngine(log));
    q.enqueue('a');
    q.enqueue('b');
    expect(log).toContain('prepare:b');
    q.stop();
  });

  it('stop() halts everything and suppresses onIdle', async () => {
    const log = [];
    const onIdle = vi.fn();
    const q = createSpeechQueue(() => fakeEngine(log), { onIdle });
    q.enqueue('a');
    q.enqueue('b');
    q.stop();
    await new Promise((r) => setTimeout(r, 30));
    expect(onIdle).not.toHaveBeenCalled();
    expect(log).not.toContain('play:b');
    expect(q.speaking).toBe(false);
  });

  it('reports errors and stops', async () => {
    const log = [];
    const err = await new Promise((r) => {
      const q = createSpeechQueue(() => fakeEngine(log, { failOn: 'a' }), { onError: r });
      q.enqueue('a');
      q.enqueue('b');
    });
    expect(err.message).toBe('boom');
    expect(log).not.toContain('play:b');
  });

  it('ignores enqueue when no engine (TTS off)', () => {
    const q = createSpeechQueue(() => null);
    expect(q.enqueue('a')).toBe(false);
    expect(q.speaking).toBe(false);
  });
});
