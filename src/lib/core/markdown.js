import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const marked = new Marked({ gfm: true, breaks: true });

// Open links in a new tab, safely.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Markdown → sanitised HTML. Never throws; falls back to escaped text. */
export function renderMarkdown(src) {
  if (!src) return '';
  try {
    return DOMPurify.sanitize(marked.parse(src, { async: false }));
  } catch {
    const div = document.createElement('div');
    div.textContent = src;
    return div.innerHTML;
  }
}
