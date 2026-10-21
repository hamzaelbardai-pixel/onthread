# Architecture

OnThread is a Claude Code plugin made of hooks, four command skills, and one dependency-free Node.js script.

```text
            ┌──────────────── Claude Code ────────────────┐
 you type → │ UserPromptSubmit ─► onthread.mjs hook prompt │ ─► short note in Claude's context
            │ Claude answers (and may print a 🧭 line)     │
            │ Stop ───────────► onthread.mjs hook stop     │ ─► records topic / "continue here"
            │ SessionStart ───► onthread.mjs hook start    │ ─► registers the conversation + rules
            │ /onthread:* ────► onthread.mjs hook expansion│ ─► runs the command, result to Claude
            └──────────────────────────────────────────────┘
                                   │
                    local registry (one JSON file per conversation)
```

## Components

| Path | Role |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest (name `onthread` → commands `/onthread:*`). |
| `.claude-plugin/marketplace.json` | Lets the repository itself be added as a marketplace. |
| `hooks/hooks.json` | `SessionStart`, `UserPromptSubmit`, `UserPromptExpansion`, `Stop`. All are command hooks with a 5 s timeout. |
| `scripts/onthread.mjs` | Entry point: `hook <event>` (JSON on stdin) and `cli <command>` (fallback). |
| `scripts/lib/hooks.mjs` | What each hook does. |
| `scripts/lib/context.mjs` | Chooses candidate conversations and writes the note for Claude. |
| `scripts/lib/store.mjs` | Registry: atomic writes, per-file locks, corruption quarantine. |
| `scripts/lib/markers.mjs` | Parses the visible `🧭 OnThread · …` lines. |
| `scripts/lib/text.mjs` | Normalization, word stems, trivial-reply detection. |
| `scripts/lib/commands.mjs` | `/onthread:topic`, `list`, `off`, `on` (plus `status`, `forget`, `reset` in the CLI). |
| `skills/*/SKILL.md` | The four slash commands. They are user-invoked only: Claude never runs them on its own. |

## Why this design

- **Claude judges, the hook informs.** A script cannot tell whether "refunds" belongs to "Stripe integration" without a language model. Claude, which is about to answer anyway, can. The hook only supplies facts: the topics and the closest conversations. No second model, no extra latency beyond the script itself, no API key.
- **The rules arrive at the right time.** Skills load on demand, so they cannot carry always-on behavior. The full rules are added at `SessionStart`, which also runs after compaction. A compact rule comes with each checked request.
- **Topics are written on a visible line.** The only documented way for a hook to read what Claude decided is the final message passed to the `Stop` hook (`last_assistant_message`). Asking Claude for one visible line means no tool call, no permission prompt, and you see exactly what is stored.
- **Commands run in a hook.** `UserPromptExpansion` receives `/onthread:topic Stripe` as `command_name` and `command_args`. The hook updates the registry itself and gives Claude the result to relay. No shell command is built from your text. If that hook is unavailable, the skill falls back to running the script with fixed arguments.
- **Fail open.** Every hook catches all errors and exits 0 without output. A bug in OnThread can never block your message.

## Registry

One file per conversation in `$CLAUDE_PLUGIN_DATA/conversations/<session-id>.json`. Claude Code keeps that folder across plugin updates. `ONTHREAD_DATA_DIR` overrides it, which the tests use. See [examples/registry](../examples/registry).

- **Concurrency.** Each record is updated read-modify-write under a lock file (`O_EXCL`, stale after 3 s). The new content is written to a temp file and renamed over the old one, with retries for Windows sharing violations. Different conversations never contend. Test C21 runs 48 hooks at once.
- **Corruption.** An unreadable record is renamed `*.corrupt-<time>` and recreated. Listing skips anything unreadable.
- **Scale.** Each check reads the directory once and skips idle records. Measured on Windows 11 with Node 24 (process start about 85 ms): 0 records 129 ms, 50 records 141 ms, 200 records 202 ms, 500 records about 385 ms.
- **Safety.** Session ids must match `[A-Za-z0-9_-]{1,128}` before any path is built. Registry content is never executed. Labels are stripped of control characters and markdown, and capped at 160 characters.

## What Claude sees

Before a checked request, Claude gets a note of at most 1,800 characters, for example:

```text
[OnThread] Conversation check (added by a plugin hook, not written by the user).
This conversation: title "Marketing e-commerce" | topic "Marketing strategy" (confirmed) | id 3f2a9c1e
Other conversations of this user (closest first):
1. "Stripe integration" — topic "Stripe payments, webhooks, refunds" — same project — active today — id ab12cd34
2. "UX/UI design" — topic "Dashboard design" — same project — active 2 days ago — id 9e8d7c6b
Ask first (...) ONLY if this request is a task that clearly fits a listed conversation better than this one,
or is clearly unrelated to this topic (then suggest a dedicated conversation). Otherwise just proceed and do not mention OnThread.
```

Conversations from other projects are listed only on a strong word match, and only by name and project.
