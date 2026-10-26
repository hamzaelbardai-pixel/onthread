![OnThread logo](assets/logo.svg)

# OnThread

**Right task. Right conversation. Every time.**

OnThread is a Claude Code plugin that notices when a request seems to belong to another one of your conversations, and asks before working on it.

```text
You, in the conversation "Marketing e-commerce":
  Fix the Stripe payment sync issue.

Claude:
  This request looks like it belongs to your conversation "Stripe integration".
  Do you want to continue here anyway?
  🧭 OnThread · question : Stripe integration
```

## The problem

You keep several Claude Code conversations open, often in the same project folder: one for the backend, one for the design, one for marketing, one for the Stripe integration. Each has its own context and history.

Then you type a Stripe fix into the marketing conversation. Claude does not know you have a dedicated Stripe conversation, so it starts working right there, without the Stripe history, and the marketing conversation fills up with unrelated work.

## The solution

OnThread gives every conversation a one-line topic and checks each new request against it:

- **Ordinary requests pass silently.** Sub-topics, natural evolutions and quick questions are never interrupted.
- **A clear mismatch gets one short question** before any work starts, naming the conversation that fits better.
- **You decide.** Say "yes, here" and Claude does the task and won't ask again about that subject in this conversation (the last 10 accepted subjects are remembered).

## Features

- **Automatic.** No command to run per message and nothing to configure. Topics are detected from your first request and shown on one visible line:
  `🧭 OnThread · topic: Stripe payments`
- **Conversation-level.** Two conversations in the same folder, or with the same title, stay distinct. OnThread keys everything on Claude Code's own session id.
- **Aware of your other conversations.** It compares a request with your other recorded conversations, starting with the same project.
- **Quiet by design.** Short replies (`ok`, `yes`, `2`) and slash commands are skipped. In doubt, it does not interrupt. Provisional topics are never used against you.
- **Private.** Everything stays on your machine. Only topics, titles, project paths and dates are stored, never your prompts. No server, no telemetry, no API key.
- **Lightweight.** One Node.js script with no dependencies. About 0.13 s per message with 50 recorded conversations.
- **You stay in control.** See or change a topic, list your conversations, or switch OnThread off at any time.

## How it works

| Your request, in the conversation… | OnThread |
|---|---|
| "Stripe integration": *Add partial refunds* | Nothing. Claude just works. |
| "Backend development": *Quick question, what is a CRM?* | Nothing. A general question is not a task. |
| "Marketing": *Fix the Stripe payment sync* | Asks: *looks like your "Stripe integration" conversation, continue here?* |
| "UX/UI design": *I want to build an HR management tool* | Asks: *a new subject, continue here or open a dedicated conversation?* |
| "Marketing": *I know we're in marketing, but let's do backend work here* | Nothing. You said so explicitly. |

Under the hood, Claude Code hooks feed Claude a short note before each request: this conversation's topic and the few other conversations most likely to match. **Claude itself makes the judgment**, with no second model and no extra cost. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and real replies in [docs/EXAMPLES.md](docs/EXAMPLES.md).

## Installation

Requirements: Claude Code with plugin support, and [Node.js](https://nodejs.org) 18 or later on your PATH.

From a terminal:

```bash
claude plugin marketplace add hamzaelbardai-pixel/onthread
claude plugin install onthread@onthread
```

Or inside a Claude Code session:

```text
/plugin marketplace add hamzaelbardai-pixel/onthread
/plugin install onthread@onthread
```

Then start a **new** conversation (or run `/reload-plugins`). Details and the desktop app: [docs/INSTALL.md](docs/INSTALL.md).

## Quick start

Just work as usual.

1. Ask your first real question. Claude answers and adds one line such as `🧭 OnThread · topic: Stripe payments`. That is the conversation's topic.
2. Keep going. You will only hear from OnThread when a task clearly belongs elsewhere.
3. When it asks, answer in plain words: "yes, continue here", or go to the other conversation.

## Commands

| Command | What it does |
|---|---|
| `/onthread:topic` | Shows this conversation's topic. `/onthread:topic Stripe payments` changes it. |
| `/onthread:list` | Lists your conversations with their topic and last activity. |
| `/onthread:off` | Switches OnThread off for this conversation (`/onthread:off all` for every conversation). |
| `/onthread:on` | Switches it back on (`/onthread:on all`). |

## Configuration

Nothing is required. Optional settings live in `settings.json` inside OnThread's data folder (see [Privacy](#privacy)):

| Setting | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Global switch (same as `/onthread:off all` and `/onthread:on all`). |
| `inactiveDays` | `90` | Conversations idle for longer are no longer proposed as a better match. They stay listed. |
| `maxCandidates` | `5` | How many other conversations are shown to Claude per request. |

## Privacy

Stored locally, in Claude Code's plugin data folder (`~/.claude/plugins/data/onthread-onthread/`), as one small JSON file per conversation:

- conversation id, custom title (if you set one), project folder path and name;
- the one-line topic, the subjects you accepted with "continue here", and the on/off switch;
- creation and last-activity dates.

**What runs:** four Claude Code hooks (session start, each message, each `/onthread:*` command, end of each answer) start `node scripts/onthread.mjs` from the plugin folder. It reads and writes only OnThread's data folder, adds a short note (at most 1,800 characters) to Claude's context before each message, and makes no network calls. The four `/onthread:*` skills only pre-approve that same script.

**Not stored:** your prompts, Claude's answers, or file contents. Titles and topics are short labels; obvious credentials in them (`password=…`, API keys, long tokens) are replaced by `[redacted]` before they are stored. Still, do not put secrets in conversation titles. Conversations from other projects are shown to Claude by their custom title only (or as "an untitled conversation"), never by their topic. `/onthread:list`, which you run yourself, lists all recorded conversations with their topics. The error log records only error categories, never message content. Nothing leaves your machine: there are no network calls, no telemetry and no cloud sync. Uninstalling removes the data folder. To keep it, use `--keep-data`. The [example registry](examples/registry) shows exactly what a record looks like.

## Limitations

Please read [docs/LIMITATIONS.md](docs/LIMITATIONS.md). The main ones:

- **It is a check, not a lock.** Claude is asked to stop and ask first. That works well in our tests (see [docs/EVAL-RESULTS.md](docs/EVAL-RESULTS.md)), but it cannot be guaranteed the way a permission rule is.
- **It cannot switch conversations for you.** No Claude Code interface allows opening or creating a conversation from a plugin. OnThread names the right one.
- **Titles.** Claude Code only exposes titles you set yourself (`/rename`, `--name`, renaming in the desktop app). Auto-generated titles are not available to plugins, so OnThread falls back to the topic.
- **Only conversations used since installation are known.** OnThread never reads your past history.

## Contributing

Issues and pull requests are welcome. Run `npm test`. There are no dependencies to install. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 HamzaElbardai

*Documentation en français : [docs/fr/GUIDE.md](docs/fr/GUIDE.md).*
