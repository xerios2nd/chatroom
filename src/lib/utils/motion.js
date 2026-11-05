/**
 * Wrap Svelte transitions so they respect prefers-reduced-motion.
 * Usage: transition:motion={{ fn: fly, y: 8 }}
 */
const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;

export function prefersReducedMotion() {
  return !!query?.matches;
}

export function motion(node, { fn, ...params }) {
  if (prefersReducedMotion()) return { duration: 0 };
  return fn(node, params);
}
