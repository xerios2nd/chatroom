/**
 * Cheap token estimate (~4 chars/token for English, a bit more for code and punctuation).
 * Good enough for context budgeting without shipping a tokenizer.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const chars = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(Math.max(chars / 4, words * 1.3));
}

/** Per-message overhead used by chat templates (role markers etc). */
export const MESSAGE_OVERHEAD = 4;

export function estimateMessagesTokens(messages) {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + MESSAGE_OVERHEAD, 0);
}
