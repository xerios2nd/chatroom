import { DIFFICULTY, FEEDBACK_MODES, SENIORITY, STYLES, CONTEXT_TYPES, getPreset, INTERVIEW_PRESETS } from './presets.js';
import { estimateTokens, MESSAGE_OVERHEAD } from './tokens.js';

export function defaultConversationConfig() {
  return {
    presetId: 'behavioral',
    role: '',
    company: '',
    seniority: 'senior',
    difficulty: 'medium',
    style: 'neutral',
    feedbackMode: 'on_request',
    language: 'English',
    customInstructions: '',
    /** 'append' adds custom instructions to the generated prompt; 'replace' uses only them. */
    promptMode: 'append',
    /** @type {{id: string, type: string, title: string, content: string, enabled: boolean}[]} */
    contexts: [],
    /** Per-conversation overrides. null = use global setting. */
    params: { model: '', temperature: null, topP: null, maxTokens: null },
  };
}

const label = (list, id) => list.find((x) => x.id === id);

/**
 * Turn a conversation config into a system prompt.
 * @param {ReturnType<typeof defaultConversationConfig>} config
 */
export function buildSystemPrompt(config, presets = INTERVIEW_PRESETS) {
  const c = { ...defaultConversationConfig(), ...config };
  const contexts = (c.contexts || []).filter((x) => x.enabled && x.content?.trim());
  const contextBlock = contexts.length
    ? [
        '## Candidate-provided context',
        'Use this to tailor questions and to judge answers. Do not read it back verbatim.',
        ...contexts.map((x) => {
          const type = label(CONTEXT_TYPES, x.type)?.label ?? 'Context';
          return `### ${x.title?.trim() || type} (${type})\n${x.content.trim()}`;
        }),
      ].join('\n\n')
    : '';

  if (c.promptMode === 'replace' && c.customInstructions.trim()) {
    return [c.customInstructions.trim(), contextBlock].filter(Boolean).join('\n\n');
  }

  const preset = getPreset(c.presetId, presets);
  const seniority = label(SENIORITY, c.seniority)?.label;
  const target = [seniority, c.role.trim() || null].filter(Boolean).join(' ') || 'software engineering';
  const company = c.company.trim() ? ` at ${c.company.trim()}` : '';

  const parts = [
    `You are an experienced interviewer running a realistic mock interview for a ${target} position${company}. The user is the candidate practicing their interview skills.`,
    '## Interview type',
    `${preset.label}. ${preset.focus}`.trim(),
    '## How to run the interview',
    [
      '- Ask exactly ONE question at a time, then wait for the candidate. Never answer your own questions.',
      '- React naturally to answers with short acknowledgements and relevant follow-ups before moving on.',
      '- Keep your turns concise, like a real conversation. No long monologues.',
      '- Adapt depth to the candidate: go deeper when they are strong, and simplify when they struggle.',
      '- If the candidate says something factually wrong, probe it rather than silently accepting it.',
      `- ${label(DIFFICULTY, c.difficulty)?.prompt ?? ''}`,
      `- ${label(STYLES, c.style)?.prompt ?? ''}`,
      `- ${label(FEEDBACK_MODES, c.feedbackMode)?.prompt ?? ''}`,
      '- If the candidate explicitly asks for a hint, feedback, a model answer or a debrief, step out of character briefly to coach them, then resume.',
      '- When starting, introduce yourself in one or two sentences (invent a plausible name and title) and ask the first question.',
      c.language && c.language !== 'English' ? `- Conduct the interview in ${c.language}.` : '',
    ]
      .filter((l) => l && l !== '- ')
      .join('\n'),
  ];

  if (c.customInstructions.trim()) parts.push('## Additional instructions', c.customInstructions.trim());
  if (contextBlock) parts.push(contextBlock);

  return parts.join('\n\n');
}

/** Appended to the system prompt while the candidate is in voice mode. */
export const VOICE_MODE_PROMPT = `## Voice mode
The candidate is talking to you by voice, and your replies are read aloud by a text-to-speech engine.
- Speak naturally, as in a real spoken interview. Keep each turn short: one to three sentences, unless you are giving requested feedback or a debrief.
- Plain spoken English only: no markdown, headings, bullet lists, tables, emojis or code blocks. If code is essential, describe it in words.
- The candidate's words come from speech recognition and may contain transcription errors. Interpret them charitably and don't penalise them for those errors.`;

/**
 * Messages that should be sent to the model: settled user/assistant turns only.
 */
export function isSendable(m) {
  if (m.role !== 'user' && m.role !== 'assistant') return false;
  if (m.role === 'assistant' && (m.status === 'error' || m.status === 'pending') && !m.content) return false;
  return !!m.content?.trim();
}

/**
 * Build the request payload and trim the oldest turns to fit the context budget.
 * The system prompt and the latest user turn are always kept.
 *
 * @param {{config: any, messages: any[]}} conversation
 * @param {{maxContextTokens?: number, reserveTokens?: number, presets?: any[], voiceMode?: boolean}} [opts]
 */
export function buildRequestMessages(conversation, { maxContextTokens = 8192, reserveTokens = 1024, presets, voiceMode = false } = {}) {
  const base = buildSystemPrompt(conversation.config, presets);
  const system = { role: 'system', content: voiceMode ? `${base}\n\n${VOICE_MODE_PROMPT}` : base };
  const history = conversation.messages.filter(isSendable).map((m) => ({ role: m.role, content: m.content }));

  const budget = Math.max(256, maxContextTokens - reserveTokens);
  const cost = (m) => estimateTokens(m.content) + MESSAGE_OVERHEAD;
  let used = cost(system);

  // Walk backwards, keep as many recent turns as fit.
  const kept = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const c = cost(history[i]);
    if (used + c > budget && kept.length > 0) break;
    used += c;
    kept.unshift(history[i]);
  }

  // Most chat templates require the first non-system message to be from the user.
  while (kept.length > 1 && kept[0].role !== 'user') {
    used -= cost(kept.shift());
  }

  return {
    messages: [system, ...kept],
    trimmedCount: history.length - kept.length,
    estimatedTokens: used,
    overBudget: used > budget,
  };
}
