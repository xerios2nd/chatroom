# Interview Coach

A Svelte 5 chat app for practicing job interviews against a local model served by
[Unsloth](https://unsloth.ai/docs/basics/api) (or any OpenAI-compatible server: llama.cpp, vLLM, Ollama).

The model plays the interviewer. You pick the format (behavioral, JS/frontend, live coding,
system design, recruiter screen and more), give it your resume or the job description, and practice.
Quick actions let you ask for feedback, a hint or a model answer at any time.

## Quick start

```bash
npm install
```

Start Unsloth. It prints an endpoint URL and an API key, by default on `http://localhost:8888`:

```bash
unsloth run --model unsloth/<your-model>-GGUF
```

```bash
npm run dev
```

Open http://localhost:5173, then go to **Settings** (⚙ or `Ctrl+,`) and paste the `sk-unsloth-…` API key.
The app calls `/unsloth/v1/...`, and the Vite dev and preview servers proxy that to `UNSLOTH_TARGET`
(default `http://localhost:8888`), so there are no CORS problems. If Unsloth runs elsewhere, copy
`.env.example` to `.env` and change it. You can also enter a full base URL such as
`http://gpu-box:8888/v1` in Settings to call the server directly.

### No GPU handy?

```bash
npm run mock
```

This starts a small OpenAI-compatible mock on `:8888` that streams canned interviewer replies.
These environment variables simulate real-world conditions:

| Variable | Effect |
| --- | --- |
| `FAIL_RATE=0.4` | Return random 503s with `Retry-After`, to exercise the retry logic |
| `API_KEY=secret` | Require a bearer token |
| `REASONING=1` | Stream `reasoning_content` the way thinking models do |
| `DELAY_MS`, `TOKEN_MS` | Delay before the first token, and between tokens |

## Features

- **Multiple conversations**: search, pin, rename, duplicate (setup only, or with messages), delete with undo. Persisted in `localStorage`.
- **Interview setup per conversation**: preset, role, company, seniority, difficulty, interviewer style, feedback mode, language, custom instructions (append to or replace the generated prompt), and per-chat model, temperature, top-p and max-token overrides.
- **Context documents**: resume, job description, company info and notes. Paste them, upload text files, or drag and drop. Each one can be toggled on or off and shows a token estimate. A live system-prompt preview shows how much of the context budget is used.
- **Coaching quick actions**: Feedback, Hint, Model answer, Clarify, Next question, End & debrief (a full scorecard).
- **Streaming** with markdown and code-block copy, plus a collapsible view of the model's reasoning for thinking models.
- **Answer timer**, so you learn to keep spoken answers to 1–2 minutes.
- **Voice dictation** through the Web Speech API, where the browser supports it.
- **Message tools**: copy, edit and resend, regenerate, delete, stop (`Esc`).
- **Export** a conversation as Markdown or JSON, or export and import everything as JSON.
- **Light and dark themes**, a responsive layout, and keyboard shortcuts. All animations respect `prefers-reduced-motion`.

### Reliability

- **Retries** use exponential backoff with jitter and honor `Retry-After`. They cover network errors, timeouts, 408, 429 and 5xx. A request is never retried once tokens have started arriving, so output is never duplicated.
- **Two timeouts**: a header timeout, which covers model warm-up, and a stream-stall watchdog, which aborts if the server goes silent mid-reply.
- **Live run status**: connecting, then waiting with an elapsed-time counter, then streaming. Retries show a countdown and the last error.
- **Typed errors** (`auth`, `network`, `timeout`, `context_length`, …) show inline with a plain-English hint and a Retry button.
- **Connection monitor**: polls `/v1/models`, backs off while the server is down, re-checks on focus and when the browser comes back online, and shows latency and available models.
- **Context budgeting**: the oldest turns are trimmed to fit `Max context tokens`, and the message metadata shows how many were dropped.
- **Storage safety**: storage access is guarded, a full quota shows a warning instead of crashing, and replies interrupted by closing the page are marked as such on reload.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Enter` / `Shift+Enter` | Send / newline (configurable to `Ctrl+Enter`) |
| `Esc` | Stop generating |
| `Ctrl/⌘ + Shift + O` | New interview |
| `Ctrl/⌘ + ,` | Settings |
| `Ctrl/⌘ + .` | Interview setup panel |
| `Ctrl/⌘ + B` | Toggle sidebar |

## Project structure

Everything reusable lives in `src/lib`, which is a self-contained module with one public entry point (`src/lib/index.js`).
`src/App.svelte` and `src/main.js` are only the standalone shell.

```
src/lib/
├── index.js              Public API. Import from here when integrating.
├── ChatApp.svelte        Root component (layout, theme, shortcuts)
├── api/                  Framework-agnostic, no Svelte
│   ├── client.js         OpenAI-compatible client: streamChat / completeChat / listModels / ping
│   ├── sse.js            Server-Sent Events parser
│   ├── retry.js          withRetry + backoff
│   └── errors.js         ApiError, classification, user-facing hints
├── core/                 Pure logic, no Svelte
│   ├── presets.js        Interview types, difficulty/style/feedback options, quick actions
│   ├── prompt.js         System-prompt builder + context-window trimming
│   ├── tokens.js         Token estimation
│   ├── exporters.js      Markdown/JSON export, validated import
│   ├── storage.js        Namespaced, fault-tolerant localStorage
│   └── markdown.js       marked + DOMPurify
├── state/                Svelte 5 runes stores, composed by createAppState()
│   ├── index.js          createAppState / setAppState / getAppState (context-based, no singletons)
│   ├── settings.svelte.js
│   ├── conversations.svelte.js
│   ├── chat.svelte.js    Generation controller (streaming, retries, stop, regenerate, edit)
│   ├── connection.svelte.js
│   ├── toasts.svelte.js
│   └── dialogs.svelte.js
├── components/
│   ├── layout/           Sidebar, ChatHeader
│   ├── chat/             ChatView, MessageList, MessageBubble, Markdown, Composer, EmptyState, RunStatus
│   ├── config/           ConfigDrawer, ContextEditor, SettingsModal
│   └── ui/               Modal, Toasts, ConfirmDialog, StatusBadge, Icon
├── styles/theme.css      Design tokens, all scoped under .ic-root
└── utils/
```

### Integrating into another project

```svelte
<script>
  import { ChatApp } from './interview-coach/index.js';
</script>

<!-- Size it with its container; fullscreen={false} drops the 100vh height -->
<div style="height: 700px">
  <ChatApp
    fullscreen={false}
    options={{
      namespace: 'my-app:coach',                    // localStorage key prefix
      settings: { baseUrl: '/api/llm/v1' },         // defaults; the user's saved settings win
      defaultConfig: { presetId: 'technical-js' },  // defaults for new conversations
      // presets: [...INTERVIEW_PRESETS, myPreset],
      // fetch: authenticatedFetch,                 // inject your own fetch (auth, telemetry…)
    }}
  />
</div>
```

To drive the app from the host, for example to start a conversation from somewhere else, build the state yourself and pass it in:

```js
import { createAppState } from './interview-coach/index.js';
const coach = createAppState({ namespace: 'my-app:coach' });
coach.conversations.create({ presetId: 'system-design', role: 'Staff Engineer' });
// <ChatApp state={coach} />
```

The `api/` and `core/` folders don't depend on Svelte, so another framework can reuse
`createClient`, `withRetry`, `buildSystemPrompt` and the rest directly.

Styles are scoped under `.ic-root`, and every color, radius and font is a `--ic-*` CSS variable
you can override from the host.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server with the `/unsloth` proxy |
| `npm run build` / `npm run preview` | Production build / preview (the preview server also proxies) |
| `npm test` | Unit tests (Vitest): SSE parser, retry, error mapping, client streaming and timeouts, prompt building, import/export |
| `npm run check` | `svelte-check` |
| `npm run mock` | Mock Unsloth server |

> **Deploying the static build:** `dist/` has no proxy. Either serve it behind a reverse proxy that maps
> `/unsloth/` to the Unsloth server, or set a direct base URL in Settings and make sure the server allows CORS.
