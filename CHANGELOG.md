# Changelog

All notable changes to OnThread are documented here. Versions follow [Semantic Versioning](https://semver.org).

## [0.1.2] — 2026-10-21

Fixes from an independent technical review by Codex (OpenAI), each covered by a regression test (`tests/review-fixes.test.mjs`).

- Privacy: the error log records error categories only. It can no longer contain fragments of a prompt.
- Requests written in Arabic, Cyrillic, Chinese or other non-Latin scripts are now checked; they were previously skipped as "empty".
- Marker lines inside code blocks, quotes or inline code are ignored, so an example can no longer change a topic.
- A malformed registry record is ignored instead of switching the check off for every conversation. Records are fully validated, including that the id matches the file name.
- Other projects' untitled conversations are named "an untitled conversation", never by their topic.
- Stored titles and topics are presented to Claude as data, never as instructions. Each command skill pre-approves only its own subcommand.
- Every checked request carries the "continue here" instruction, so switching OnThread back on mid-conversation works fully.
- Lock files carry an owner token, are only removed by their owner, and are taken over only after 30 s.
- Reads never move files; `reset` moves the registry aside atomically.
- The live evaluation counts a failed Claude run as an error instead of a pass.
- Reliability: hooks stop reading their input as soon as the JSON is complete (they could wait up to 3 s and hit the 5 s timeout on a busy machine); stale locks are recovered after 8 s through a serialized recovery guard; a reset bumps a registry generation so in-flight writes cannot restore old data.
- Markers in indented code and in longer fences are ignored; a topic you set is only replaced after you talked about the topic.
- Records with an invalid counter are ignored; labels written by older versions are re-cleaned when shown, including in `/onthread:list`.
- Hooks are launched directly (exec form, no shell): on Windows, launching through Git Bash could occasionally exceed the 5 s hook timeout when several plugins start at once.
- "Continue here" is only recorded as the answer to a question OnThread asked: questions now end with a visible `🧭 OnThread · question : …` line, and a short "yes" right after one reminds Claude how to record it. `/onthread:list` shows accepted subjects.
- A topic set with `/onthread:topic` can only be changed with `/onthread:topic`.
- Fences close only with the same character; fences after list markers are recognized.
- Reset switches to a new registry generation folder, so in-flight writes can never restore old data.
- Optional `ONTHREAD_TRACE=<file>` writes a timing trace (event names and milliseconds only).
- "Continue here" also requires your reply to be a plain yes about the subject that was asked: every word must belong to a small affirmative vocabulary ("oui", "ok", "vas-y", "continue ici"…). A closing fence indented by 4 spaces does not end a code block. Resets are serialized by a registry-wide lock and delete any stray folder left by a racing write.

## [0.1.1] — 2026-10-21

- Automatic topics now consider the whole conversation, not just the latest request. A conversation that already covers several subjects gets a broad topic, such as "Pilotage général : …", instead of a narrow one. This avoids needless questions in general-purpose conversations.

## [0.1.0] — 2026-10-21

First public version.

- Automatic per-conversation topic, proposed by Claude on one visible line and recorded locally.
- Check on every non-trivial request: Claude asks before working when a task clearly belongs to another recorded conversation, or to a clearly different subject.
- "Continue here" is remembered per subject, so the same question is not asked twice.
- Commands: `/onthread:topic`, `/onthread:list`, `/onthread:off`, `/onthread:on` (each with `all` for every conversation).
- Local registry: one JSON file per conversation, atomic writes, per-file locks, corruption quarantine, inactive conversations not proposed after 90 days.
- Fail-open hooks: an OnThread error never blocks a message.
- Test suite (Node built-in runner, no dependencies) and a live evaluation against the real Claude Code CLI.
