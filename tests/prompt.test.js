import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildRequestMessages, defaultConversationConfig } from '../src/lib/core/prompt.js';

const conv = (messages, config = {}) => ({ config: { ...defaultConversationConfig(), ...config }, messages });

describe('buildSystemPrompt', () => {
  it('includes role, company, preset focus and enabled contexts only', () => {
    const p = buildSystemPrompt({
      ...defaultConversationConfig(),
      presetId: 'system-design',
      role: 'Backend Engineer',
      company: 'Acme',
      contexts: [
        { id: '1', type: 'resume', title: 'CV', content: 'Built payments at X', enabled: true },
        { id: '2', type: 'notes', title: 'Secret', content: 'do not include', enabled: false },
      ],
    });
    expect(p).toMatch(/Senior Backend Engineer position at Acme/);
    expect(p).toMatch(/system design interview/i);
    expect(p).toContain('Built payments at X');
    expect(p).not.toContain('do not include');
  });

  it('replace mode uses only the custom instructions (+ context)', () => {
    const p = buildSystemPrompt({ ...defaultConversationConfig(), promptMode: 'replace', customInstructions: 'Be a pirate.' });
    expect(p).toBe('Be a pirate.');
  });
});

describe('buildRequestMessages', () => {
  it('drops failed/empty turns and starts with system', () => {
    const { messages } = buildRequestMessages(
      conv([
        { role: 'user', content: 'hi', status: 'done' },
        { role: 'assistant', content: '', status: 'error' },
        { role: 'user', content: 'again', status: 'done' },
      ]),
    );
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'user']);
  });

  it('trims oldest turns to fit the budget and keeps a user turn first', () => {
    const long = 'word '.repeat(400); // ~500 tokens
    const msgs = [];
    for (let i = 0; i < 10; i++) {
      msgs.push({ role: 'user', content: `${i} ${long}`, status: 'done' });
      msgs.push({ role: 'assistant', content: `${i} ${long}`, status: 'done' });
    }
    msgs.push({ role: 'user', content: 'latest', status: 'done' });
    const r = buildRequestMessages(conv(msgs), { maxContextTokens: 3000, reserveTokens: 500 });
    expect(r.trimmedCount).toBeGreaterThan(0);
    expect(r.messages[1].role).toBe('user');
    expect(r.messages.at(-1).content).toBe('latest');
    expect(r.estimatedTokens).toBeLessThanOrEqual(2500);
  });
});
