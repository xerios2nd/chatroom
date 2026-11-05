import { uid } from '../utils/id.js';
import { defaultConversationConfig } from './prompt.js';
import { getPreset } from './presets.js';

export const EXPORT_VERSION = 1;

export function conversationToMarkdown(conv) {
  const preset = getPreset(conv.config?.presetId);
  const lines = [
    `# ${conv.title}`,
    '',
    `- **Interview:** ${preset.label}`,
    conv.config?.role ? `- **Role:** ${conv.config.role}` : null,
    conv.config?.company ? `- **Company:** ${conv.config.company}` : null,
    `- **Date:** ${new Date(conv.createdAt).toLocaleString()}`,
    '',
    '---',
    '',
  ].filter((l) => l !== null);

  for (const m of conv.messages) {
    if (!m.content?.trim()) continue;
    const who = m.role === 'user' ? '🧑 Candidate' : '🎙️ Interviewer';
    lines.push(`### ${who}`, '', m.content.trim(), '');
  }
  return lines.join('\n');
}

export function conversationsToJSON(conversations) {
  return JSON.stringify({ app: 'interview-coach', version: EXPORT_VERSION, exportedAt: new Date().toISOString(), conversations }, null, 2);
}

/**
 * Validate and normalise imported data. Accepts the export envelope, a bare array, or a single conversation.
 * Always assigns fresh ids so an import never clobbers existing conversations.
 * @returns {any[]} normalised conversations
 */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.conversations) ? data.conversations : data?.messages ? [data] : null;
  if (!list) throw new Error('No conversations found in that file.');

  return list.map((raw, i) => {
    if (!raw || !Array.isArray(raw.messages)) throw new Error(`Conversation #${i + 1} has no messages array.`);
    const now = Date.now();
    return {
      id: uid('c_'),
      title: String(raw.title || 'Imported conversation').slice(0, 120),
      createdAt: Number(raw.createdAt) || now,
      updatedAt: Number(raw.updatedAt) || now,
      pinned: !!raw.pinned,
      config: { ...defaultConversationConfig(), ...(raw.config || {}) },
      messages: raw.messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m) => ({
          id: uid('m_'),
          role: m.role,
          content: m.content,
          reasoning: typeof m.reasoning === 'string' ? m.reasoning : '',
          createdAt: Number(m.createdAt) || now,
          status: 'done',
          kind: m.kind,
          meta: m.meta ?? null,
          error: null,
        })),
    };
  });
}
