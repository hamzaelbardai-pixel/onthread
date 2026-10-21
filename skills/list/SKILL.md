---
name: list
description: List the conversations OnThread knows, with their topic and last activity.
argument-hint: ""
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/onthread.mjs" cli list *), PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/onthread.mjs" cli list *)
---
The user typed `/onthread:list $ARGUMENTS`.

If your context contains a block starting with "[OnThread command result for /onthread:list]", it already holds the result. Relay it to the user in one to three short sentences, in their language, and do nothing else.

If there is no such block (older Claude Code without the UserPromptExpansion hook):
- Run exactly `node "${CLAUDE_PLUGIN_ROOT}/scripts/onthread.mjs" cli list --session ${CLAUDE_SESSION_ID}` and show its output as a short list.
