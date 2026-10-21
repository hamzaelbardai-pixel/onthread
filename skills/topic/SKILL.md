---
name: topic
description: Show the topic OnThread recorded for this conversation, or change it (/onthread:topic <new topic>).
argument-hint: "[new topic]"
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/onthread.mjs" cli *), PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/onthread.mjs" cli *)
---
The user typed `/onthread:topic $ARGUMENTS`.

If your context contains a block starting with "[OnThread command result for /onthread:topic]", it already holds the result. Relay it to the user in one to three short sentences, in their language, and do nothing else.

If there is no such block (older Claude Code without the UserPromptExpansion hook):
- With no argument, run exactly `node "${CLAUDE_PLUGIN_ROOT}/scripts/onthread.mjs" cli topic --session ${CLAUDE_SESSION_ID}` and relay its output.
- With an argument, never put it in a shell command. Confirm the new topic and end your reply with the line: 🧭 OnThread · topic : <the new topic>
