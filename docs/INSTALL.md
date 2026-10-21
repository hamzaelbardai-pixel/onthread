# Install, update, uninstall

## Requirements

- Claude Code with plugin support: the CLI, or the desktop app's Code tab in a local or SSH session.
- [Node.js](https://nodejs.org) 18 or later on your PATH. Check with `node --version`.

## Install

From a terminal:

```bash
claude plugin marketplace add hamzaelbardai-pixel/onthread
claude plugin install onthread@onthread
```

Inside a Claude Code session:

```text
/plugin marketplace add hamzaelbardai-pixel/onthread
/plugin install onthread@onthread
```

In the desktop app, you can also open the plugin browser and add the marketplace `hamzaelbardai-pixel/onthread`.

The desktop app and the CLI read the same settings, so a plugin installed from the terminal also applies to desktop sessions. Start a **new** conversation afterwards, or run `/reload-plugins` in an open one.

Check it works: in a new conversation, ask something real (not just "hi"). Claude's answer should end with a line like `🧭 OnThread · topic: …`. You can also run `/onthread:topic`.

### Install for a team project

To have everyone who clones a repository use OnThread, add this to the repository's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "onthread": { "source": { "source": "github", "repo": "hamzaelbardai-pixel/onthread" } }
  },
  "enabledPlugins": { "onthread@onthread": true }
}
```

Each person then confirms the install once in Claude Code.

### Try it without installing

From a clone of the repository:

```bash
claude --plugin-dir /path/to/onthread
```

The plugin is loaded for that session only.

## Update

```bash
claude plugin marketplace update onthread
claude plugin update onthread@onthread
```

Then run `/reload-plugins` in open sessions. Your recorded conversations are kept across updates.

## Uninstall

```bash
claude plugin uninstall onthread@onthread
```

Or `/plugin uninstall onthread@onthread` inside a session.

- This removes the plugin **and its data folder**: recorded topics and settings. To keep the data for a later reinstall, use `claude plugin uninstall onthread@onthread --keep-data`.
- Nothing else is touched: no other plugin, setting, project file or conversation history.
- To also forget the marketplace: `claude plugin marketplace remove onthread`.
- To pause instead of uninstalling: `/onthread:off all`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "hook error" mentioning `node` | Node.js is missing or not on PATH. Install Node 18+, then restart Claude Code. |
| No `🧭` line ever appears | Run `/reload-plugins` or start a new conversation. Then check that `claude plugin list` shows `onthread@onthread` as enabled. |
| You want to see what was recorded | `/onthread:list` and `/onthread:topic` |
| A hook seems slow | Start Claude Code with `ONTHREAD_TRACE=/path/to/trace.log` set. It records event names and timings only. |
| You want to inspect errors | `onthread-errors.log` in `~/.claude/plugins/data/onthread-onthread/`. It never contains your prompts. |
