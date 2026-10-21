# Uninstall

```bash
claude plugin uninstall onthread@onthread
```

What happens:

- The plugin files are removed from Claude Code's plugin cache.
- OnThread's data folder (`~/.claude/plugins/data/onthread-onthread/`, holding topics and settings) is deleted, unless you add `--keep-data`.
- Nothing else changes: no other plugin, no settings unrelated to OnThread, no project file, no conversation history. The test suite checks this (test D31/D33).

Optional clean-up:

```bash
claude plugin marketplace remove onthread
```

To stop OnThread without uninstalling, run `/onthread:off all`, and `/onthread:on all` to resume.
