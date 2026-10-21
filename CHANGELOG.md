# Changelog

All notable changes to OnThread are documented here. Versions follow [Semantic Versioning](https://semver.org).

## [0.1.0] — 2026-10-21

First public version.

- Automatic per-conversation topic, proposed by Claude on one visible line and recorded locally.
- Check on every non-trivial request: Claude asks before working when a task clearly belongs to another recorded conversation, or to a clearly different subject.
- "Continue here" is remembered per subject, so the same question is not asked twice.
- Commands: `/onthread:topic`, `/onthread:list`, `/onthread:off`, `/onthread:on` (each with `all` for every conversation).
- Local registry: one JSON file per conversation, atomic writes, per-file locks, corruption quarantine, inactive conversations not proposed after 90 days.
- Fail-open hooks: an OnThread error never blocks a message.
- Test suite (Node built-in runner, no dependencies) and a live evaluation against the real Claude Code CLI.
