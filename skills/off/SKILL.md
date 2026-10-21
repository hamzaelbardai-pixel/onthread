---
name: off
description: Turn OnThread off for this conversation, or everywhere with /onthread:off all.
argument-hint: "[all]"
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/onthread.mjs" cli off *), PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/onthread.mjs" cli off *)
---
The user typed `/onthread:off $ARGUMENTS`.

If your context contains a block starting with "[OnThread command result for /onthread:off]", it already holds the result. Relay it to the user in one to three short sentences, in their language, and do nothing else.

If there is no such block (older Claude Code without the UserPromptExpansion hook):
- If the argument is exactly "all", run exactly `node "${CLAUDE_PLUGIN_ROOT}/scripts/onthread.mjs" cli off all --session ${CLAUDE_SESSION_ID}`; otherwise run the same command without `all`. Never pass any other text. Relay the output.
