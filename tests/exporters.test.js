import { describe, it, expect } from 'vitest';
import { parseImport, conversationsToJSON, conversationToMarkdown } from '../src/lib/core/exporters.js';
import { createStorage } from '../src/lib/core/storage.js';

const sample = {
  id: 'c1',
  title: 'Mock',
  createdAt: 1,
  updatedAt: 2,
  config: { presetId: 'behavioral', role: 'Dev' },
  messages: [
    { id: 'm1', role: 'user', content: 'hi' },
    { id: 'm2', role: 'assistant', content: 'hello' },
    { id: 'm3', role: 'system', content: 'should be dropped' },
  ],
};

describe('import/export', () => {
  it('round-trips with fresh ids and filtered roles', () => {
    const [c] = parseImport(conversationsToJSON([sample]));
    expect(c.id).not.toBe('c1');
    expect(c.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(c.config.difficulty).toBe('medium'); // defaults filled in
  });

  it('accepts a bare conversation', () => {
    expect(parseImport(JSON.stringify(sample))).toHaveLength(1);
  });

  it('rejects junk', () => {
    expect(() => parseImport('nope')).toThrow(/valid JSON/);
    expect(() => parseImport('{"a":1}')).toThrow(/No conversations/);
  });

  it('renders markdown', () => {
    const md = conversationToMarkdown(sample);
    expect(md).toContain('# Mock');
    expect(md).toContain('**Role:** Dev');
    expect(md).toContain('hello');
  });
});

describe('createStorage', () => {
  it('namespaces keys and falls back to memory when the backend throws', () => {
    const map = new Map();
    const backend = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
    const s = createStorage('ns', { backend });
    s.set('a', { x: 1 });
    expect([...map.keys()]).toEqual(['ns:a']);
    expect(s.get('a')).toEqual({ x: 1 });

    const full = createStorage('ns', {
      backend: {
        getItem: () => null,
        setItem: () => {
          throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
        },
        removeItem() {},
      },
    });
    expect(full.set('a', 1)).toMatchObject({ ok: false, quota: true });
  });
});
