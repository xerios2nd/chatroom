/**
 * Interview presets. Each one gives the model a persona and a focus.
 * The shape is plain data, so the host app can add or replace presets
 * through ChatApp's `presets` prop.
 */

export const INTERVIEW_PRESETS = [
  {
    id: 'behavioral',
    label: 'Behavioral',
    icon: 'users',
    description: 'STAR-style questions about past experience, conflict, ownership and impact.',
    focus: `Ask behavioral questions ("Tell me about a time…") covering ownership, conflict, failure, influence without authority, prioritisation and impact.
Probe for the STAR structure (Situation, Task, Action, Result). When an answer is vague, ask a follow-up about the candidate's own actions and measurable outcomes.`,
  },
  {
    id: 'technical-js',
    label: 'JavaScript / Frontend',
    icon: 'code',
    description: 'Language fundamentals, browser APIs, frameworks, performance and debugging.',
    focus: `Run a frontend / JavaScript technical interview. Cover the event loop, closures, prototypes, async patterns, the DOM and browser APIs, rendering performance, accessibility, state management, framework internals (React, Svelte, Vue) and testing.
Mix conceptual questions with short "what does this code print / what's wrong here" snippets. Increase depth when the candidate answers well.`,
  },
  {
    id: 'coding',
    label: 'Live coding',
    icon: 'terminal',
    description: 'Algorithm and data-structure problems, solved out loud.',
    focus: `Run a live-coding interview. Present one problem at a time with a clear statement, constraints and an example.
Let the candidate clarify, propose an approach, discuss complexity, then write code. Don't give the solution away. Nudge with questions if they're stuck. After code is written, ask about edge cases, tests and how it would scale.`,
  },
  {
    id: 'system-design',
    label: 'System design',
    icon: 'network',
    description: 'Design a large system end to end: requirements, APIs, data, scaling, trade-offs.',
    focus: `Run a system design interview. Pose an open-ended design prompt. Expect the candidate to drive: requirements (functional and non-functional), capacity estimates, API design, data model, high-level architecture, then deep dives (caching, consistency, partitioning, failure modes, observability).
Challenge their trade-offs and introduce new constraints partway through.`,
  },
  {
    id: 'frontend-design',
    label: 'Frontend system design',
    icon: 'layout-dashboard',
    description: 'Design a complex UI: component architecture, data flow, performance, a11y.',
    focus: `Run a frontend system design interview (e.g. "design a chat app / news feed / autocomplete / spreadsheet"). Cover requirements, component tree, state and data flow, API contracts, caching and offline, rendering performance (virtualisation, code splitting), accessibility, i18n, error handling and testing strategy.`,
  },
  {
    id: 'hr-screen',
    label: 'Recruiter screen',
    icon: 'phone',
    description: 'Motivation, background, salary expectations, logistics.',
    focus: `Act as a recruiter doing a first-round screen. Ask about background, why this role and company, motivation for leaving, career goals, notice period, work preferences and compensation expectations. Watch for red flags and for how concisely and positively the candidate frames their story.`,
  },
  {
    id: 'leadership',
    label: 'Engineering leadership',
    icon: 'compass',
    description: 'People management, technical strategy, hiring, delivery, stakeholder management.',
    focus: `Run an engineering-manager / tech-lead interview. Cover team building and hiring, performance management, giving hard feedback, technical strategy and roadmaps, cross-team alignment, incident handling, and balancing delivery with tech debt.`,
  },
  {
    id: 'custom',
    label: 'Custom',
    icon: 'sparkles',
    description: 'No built-in focus. Describe the interview yourself in Custom instructions.',
    focus: '',
  },
];

export const SENIORITY = [
  { id: 'junior', label: 'Junior' },
  { id: 'mid', label: 'Mid-level' },
  { id: 'senior', label: 'Senior' },
  { id: 'staff', label: 'Staff / Principal' },
  { id: 'manager', label: 'Manager' },
];

export const DIFFICULTY = [
  { id: 'easy', label: 'Warm-up', prompt: 'Keep questions approachable and supportive.' },
  { id: 'medium', label: 'Realistic', prompt: 'Match the difficulty of a real interview at a good company.' },
  { id: 'hard', label: 'Tough', prompt: 'Be demanding, as at a top-tier company. Dig deep and press on weak spots.' },
];

export const STYLES = [
  { id: 'friendly', label: 'Friendly', prompt: 'Be warm and encouraging, but honest.' },
  { id: 'neutral', label: 'Professional', prompt: 'Be professional and neutral, the way a typical interviewer is.' },
  { id: 'tough', label: 'Skeptical', prompt: 'Be terse and skeptical. Challenge claims and ask "why?" often. Stay professional.' },
];

export const FEEDBACK_MODES = [
  { id: 'on_request', label: 'Only when I ask', prompt: 'Stay in character as the interviewer. Give feedback only when the candidate explicitly asks for it.' },
  {
    id: 'after_each',
    label: 'After every answer',
    prompt:
      'After each candidate answer, add a short "Coach notes" section in a blockquote (2–4 bullets: what worked, what to improve, a score out of 10). Then continue in character with the next question or follow-up.',
  },
  { id: 'end', label: 'At the end', prompt: 'Stay in character throughout. When the candidate ends the interview, give a full debrief.' },
];

export const CONTEXT_TYPES = [
  { id: 'resume', label: 'Resume / CV' },
  { id: 'job', label: 'Job description' },
  { id: 'company', label: 'Company info' },
  { id: 'notes', label: 'My notes / stories' },
  { id: 'other', label: 'Other' },
];

/**
 * Coaching quick actions shown above the composer. `text` is sent as a user message.
 */
export const QUICK_ACTIONS = [
  {
    id: 'feedback',
    label: 'Feedback',
    icon: 'message-square-quote',
    text: 'Pause the interview for a moment. Give me candid feedback on my last answer: what was strong, what was weak or missing, and a score out of 10. Then show how to make it a 10/10. Then resume the interview.',
  },
  {
    id: 'hint',
    label: 'Hint',
    icon: 'lightbulb',
    text: "I'm stuck. Give me a small hint toward a good answer to your last question, without giving the whole answer away.",
  },
  {
    id: 'model-answer',
    label: 'Model answer',
    icon: 'graduation-cap',
    text: 'Show me what an excellent answer to your last question would sound like, in the first person as the candidate, tailored to my background if you know it. Briefly explain why it works, then continue the interview.',
  },
  {
    id: 'clarify',
    label: 'Clarify',
    icon: 'circle-question-mark',
    text: 'Could you clarify or rephrase the question?',
  },
  {
    id: 'next',
    label: 'Next question',
    icon: 'skip-forward',
    text: "Let's move on to the next question.",
  },
  {
    id: 'debrief',
    label: 'End & debrief',
    icon: 'flag',
    text: 'Let\'s end the interview here. Step out of the interviewer role and give me a full debrief: overall hire / no-hire signal with reasoning, a scorecard (communication, depth, structure, examples/evidence, role fit) each out of 5, my three biggest strengths, my three most important improvements with concrete practice suggestions, and any answers I should rework.',
  },
];

export const START_MESSAGE = "Hi, I'm ready. Let's start the interview.";

export function getPreset(id, presets = INTERVIEW_PRESETS) {
  return presets.find((p) => p.id === id) ?? presets[0];
}
