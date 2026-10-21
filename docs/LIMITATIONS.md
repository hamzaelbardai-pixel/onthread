# Known limitations (v0.1)

OnThread only uses documented Claude Code mechanisms. The limits below come from what those mechanisms allow.

## It is a check, not a lock

OnThread adds a short note to Claude's context before each request. **Claude** decides whether the request is in the wrong conversation, and asks before working. Claude follows this well in our tests ([EVAL-RESULTS.md](EVAL-RESULTS.md)), but a note in the context is not a guarantee. On a very long or unusual conversation, Claude may still occasionally start without asking, or ask when it did not need to.

Claude Code can block a prompt outright from a hook. Doing that reliably would need a separate classifier (a "prompt" hook calling another model) on every message. That adds latency, uses quota, and still makes mistakes. It is not in v0.1; a future opt-in "strict mode" may add it.

## It cannot open or create conversations

No documented interface lets a plugin open another conversation or start a new one. When a request belongs elsewhere, OnThread names the conversation. You open it yourself: from the sidebar in the desktop app, or with `claude --resume <id or name>` in a terminal.

## Titles

Hooks receive a conversation's title only when **you** set it, with `/rename`, `claude --name`, or by renaming it in the desktop app. Auto-generated titles exist only in Claude Code's internal files, whose format is undocumented and changes between versions, so OnThread does not read them. Untitled conversations are shown by their topic, for example "Stripe payments", plus a short id. A new title is picked up at the next message.

## Topics come from Claude

Topics are proposed by Claude on a visible line (`🧭 OnThread · topic: …`) and recorded by a hook. If Claude forgets the line, the conversation simply stays without a topic for a while. That is harmless: OnThread never judges a request against a missing or provisional topic. A topic counts as confirmed after two more requests, or right away when you set it with `/onthread:topic`.

## Which conversations are known

- Only conversations used since OnThread was installed. Past history is never read.
- Conversations idle for more than `inactiveDays` (default 90) are not proposed as a better match. They stay in `/onthread:list`.
- Forks, `/branch` and `/clear` start a new conversation with no topic. Claude Code does not tell plugins which conversation they came from. A fork takes its topic from the inherited history on its first answer.

## Matching

Choosing which other conversations to show Claude is a cheap word-overlap ranking (accent- and plural-insensitive, French and English stop words). It can miss a match that shares no words, such as "invoice" vs "billing". Claude still sees the closest same-project conversations, and judges meaning, not words.

## Platforms and versions

| Environment | Status |
|---|---|
| Windows 11, Claude Code desktop app (Code tab), Claude Code 2.1.299 | **Verified** (hooks, commands, live evaluation) |
| Windows 11, `claude` CLI 2.1.299 | **Verified** (install, uninstall, `-p` runs) |
| macOS, Linux | Designed for, not yet verified. CI runs the test suite there once the repository is on GitHub. |
| Older Claude Code versions | Not verified. `session_title`, `last_assistant_message` and the `UserPromptExpansion` hook are recent. Without the latter, the commands fall back to a script run. |
| Claude Code on the web, cloud sessions, WSL sessions of the desktop app | Not supported: the desktop docs say plugins are unavailable there. |
| VS Code / JetBrains | Not verified. The VS Code extension shares plugins with the CLI. |

On Windows, Claude Code runs hook commands with Git Bash when it is installed. That path is verified. Without Git Bash it uses PowerShell: the hook command line is compatible, but that path has not been verified.

Node.js 18+ must be on the PATH. Claude Code does not guarantee Node. Without it the hooks fail to start, Claude Code shows a hook error, and your messages go through normally.

## Data

- Removed when the plugin is uninstalled from its last scope, unless you pass `--keep-data`.
- If a hook fails or times out (5 s), your message goes through unchanged. Errors are logged, without prompt content, to `onthread-errors.log` in the data folder.
