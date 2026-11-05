#!/usr/bin/env node
/**
 * Tiny OpenAI-compatible mock of the Unsloth server, for UI work without a GPU.
 *
 *   node scripts/mock-server.js            # listens on :8888
 *   PORT=9000 FAIL_RATE=0.3 node scripts/mock-server.js
 *
 * Env:
 *   PORT        default 8888
 *   API_KEY     if set, requests must send "Authorization: Bearer <API_KEY>"
 *   FAIL_RATE   0..1 probability of answering 503 (exercises the retry logic)
 *   DELAY_MS    delay before the first token (default 400)
 *   TOKEN_MS    delay between tokens (default 25)
 *   REASONING   "1" to stream a reasoning_content block before the answer
 *
 * Also mocks the voice endpoints: POST /v1/audio/transcriptions (fixed text)
 * and POST /v1/audio/speech (a short WAV tone whose length follows the input).
 */
import http from 'node:http';

const PORT = Number(process.env.PORT || 8888);
const API_KEY = process.env.API_KEY || '';
const FAIL_RATE = Number(process.env.FAIL_RATE || 0);
const DELAY_MS = Number(process.env.DELAY_MS ?? 400);
const TOKEN_MS = Number(process.env.TOKEN_MS ?? 25);
const REASONING = process.env.REASONING === '1';

const QUESTIONS = [
  'Tell me about a time you had to deliver a project with an unrealistic deadline. What did **you** specifically do?',
  'How does the JavaScript event loop decide when to run a `Promise` callback versus a `setTimeout` callback?',
  'Walk me through how you would design an autocomplete component that stays fast with 100k items.',
  'Describe a disagreement with a teammate about a technical decision. How was it resolved?',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mono 16-bit PCM WAV: a soft tone, ~45ms per character (max 6s). */
function toneWav(text) {
  const rate = 16000;
  const seconds = Math.min(6, Math.max(0.4, text.length * 0.045));
  const n = Math.floor(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 800, (n - i) / 800);
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 2500 * env), 44 + i * 2);
  }
  return buf;
}

function reply(messages) {
  const last = messages.at(-1)?.content ?? '';
  const turn = messages.filter((m) => m.role === 'assistant').length;
  if (/feedback|debrief/i.test(last)) {
    return `> **Coach notes**\n> - ✅ Clear structure\n> - ⚠️ Quantify the result: what changed, by how much?\n> - Score: **6/10**\n\nTo make it a 10: lead with the outcome, then explain *your* decisions.\n\n\`\`\`js\n// e.g. "cut p95 latency from 900ms to 180ms"\nconst impact = { before: 900, after: 180 };\n\`\`\`\n\nLet's continue. ${QUESTIONS[(turn + 1) % QUESTIONS.length]}`;
  }
  if (turn === 0) return `Hi! I'm Alex, an engineering manager here. Thanks for making the time.\n\nLet's start: ${QUESTIONS[0]}`;
  return `Thanks, that's helpful. ${turn % 2 ? 'Could you go one level deeper on the trade-offs you considered?' : QUESTIONS[turn % QUESTIONS.length]}`;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    return res.end();
  }
  if (API_KEY && req.headers.authorization !== `Bearer ${API_KEY}`) {
    return json(res, 401, { error: { message: 'Invalid API key', type: 'auth_error' } });
  }
  if (req.url === '/v1/models') {
    return json(res, 200, { object: 'list', data: [{ id: 'default', object: 'model' }, { id: 'unsloth/mock-model', object: 'model' }] });
  }
  if (req.url === '/v1/audio/transcriptions' && req.method === 'POST') {
    let size = 0;
    for await (const chunk of req) size += chunk.length;
    await sleep(300);
    return json(res, 200, { text: size > 0 ? 'I would start by clarifying the requirements and then sketch the data flow.' : '' });
  }
  if (req.url === '/v1/audio/speech' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw || '{}').input || '';
    await sleep(150);
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Access-Control-Allow-Origin': '*' });
    return res.end(toneWav(input));
  }
  if (req.url !== '/v1/chat/completions' || req.method !== 'POST') {
    return json(res, 404, { error: { message: `No route ${req.method} ${req.url}` } });
  }

  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: { message: 'Invalid JSON' } });
  }
  if (Math.random() < FAIL_RATE) {
    res.setHeader('Retry-After', '1');
    return json(res, 503, { error: { message: 'Model is loading (simulated)' } });
  }

  const text = reply(body.messages || []);
  const tokens = text.match(/\S+\s*|\s+/g) || [];
  const id = `chatcmpl-${Date.now()}`;
  const usage = { prompt_tokens: JSON.stringify(body.messages).length >> 2, completion_tokens: tokens.length, total_tokens: 0 };

  if (!body.stream) {
    await sleep(DELAY_MS);
    return json(res, 200, { id, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage });
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
  let closed = false;
  req.on('close', () => (closed = true));
  const send = (obj) => !closed && res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const chunk = (delta, finish_reason = null) => send({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] });

  res.write(': keep-alive\n\n');
  await sleep(DELAY_MS);
  chunk({ role: 'assistant' });
  if (REASONING) {
    for (const t of 'The candidate wants to practice. I should ask one focused question.'.split(/(?<=\s)/)) {
      if (closed) return;
      chunk({ reasoning_content: t });
      await sleep(TOKEN_MS);
    }
  }
  for (const t of tokens) {
    if (closed) return;
    chunk({ content: t });
    await sleep(TOKEN_MS);
  }
  chunk({}, 'stop');
  if (body.stream_options?.include_usage) send({ id, object: 'chat.completion.chunk', choices: [], usage });
  if (!closed) res.end('data: [DONE]\n\n');
});

server.listen(PORT, () => console.log(`Mock Unsloth server on http://localhost:${PORT}/v1${API_KEY ? ' (API key required)' : ''}`));
