// Hook handlers. Each takes the hook's stdin JSON and returns the JSON to print (or null).
import { COMMANDS } from './commands.mjs';
import { promptContext, rankCandidates, sessionStartContext } from './context.mjs';
import { parseMarkers } from './markers.mjs';
import { projectOf } from './project.mjs';
import { isValidId, listConversations, readSettings, updateConversation } from './store.mjs';
import { cleanLabel, isTrivialPrompt } from './text.mjs';

const ORIGINS = new Set(['startup', 'resume', 'clear', 'compact', 'fork']);
const MAX_EXCEPTIONS = 10;

function touch(conv, input, now) {
  if (typeof input.session_title === 'string' && input.session_title.trim()) {
    conv.title = cleanLabel(input.session_title, 120);
  }
  const project = projectOf(input.cwd);
  if (project) conv.project = project;
  conv.lastActiveAt = now.toISOString();
}

function contextOutput(event, text) {
  if (!text) return null;
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}

export function onSessionStart(input, now = new Date()) {
  if (!isValidId(input.session_id)) return null;
  const settings = readSettings();
  const conv = updateConversation(input.session_id, (c) => {
    if (c.origin === 'unknown') c.origin = ORIGINS.has(input.source) ? input.source : 'unknown';
    touch(c, input, now);
  }, now);
  return contextOutput('SessionStart', sessionStartContext(conv, settings));
}

export function onPrompt(input, now = new Date()) {
  if (!isValidId(input.session_id)) return null;
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  const skip = isTrivialPrompt(prompt) || prompt.trimStart().startsWith('/');
  const settings = readSettings();
  const conv = updateConversation(input.session_id, (c) => {
    touch(c, input, now);
    if (!skip && c.topic) c.promptsSinceTopic = (c.promptsSinceTopic || 0) + 1;
  }, now);
  if (skip || !settings.enabled || conv.protection === false) return null;
  const others = listConversations({ activeWithinDays: settings.inactiveDays, now: now.getTime() });
  const candidates = rankCandidates(conv, others, prompt, { max: settings.maxCandidates });
  return contextOutput('UserPromptSubmit', promptContext(conv, candidates, { now: now.getTime() }));
}

export function onStop(input, now = new Date()) {
  if (!isValidId(input.session_id)) return null;
  const markers = parseMarkers(input.last_assistant_message);
  if (!markers.topic && !markers.exceptions.length) return null;
  updateConversation(input.session_id, (c) => {
    if (markers.topic && markers.topic !== c.topic?.text) {
      // Claude only writes a topic line when none exists or the user agreed to a change.
      c.topic = { text: markers.topic, source: c.topic?.source === 'user' ? 'user' : 'auto', setAt: now.toISOString() };
      c.promptsSinceTopic = 0;
    }
    const known = new Set((c.exceptions || []).map((e) => e.text.toLowerCase()));
    for (const text of markers.exceptions) {
      if (!known.has(text.toLowerCase())) (c.exceptions = c.exceptions || []).push({ text, at: now.toISOString() });
    }
    c.exceptions = (c.exceptions || []).slice(-MAX_EXCEPTIONS);
  }, now);
  return null;
}

export function onExpansion(input) {
  const name = typeof input.command_name === 'string' ? input.command_name : '';
  if (!name.startsWith('onthread:') || !isValidId(input.session_id)) return null;
  const run = COMMANDS[name.slice('onthread:'.length)];
  if (!run) return null;
  const result = run(input.session_id, typeof input.command_args === 'string' ? input.command_args : '');
  return contextOutput('UserPromptExpansion', `[OnThread command result for /${name}]\n${result}`);
}

export const HOOKS = { start: onSessionStart, prompt: onPrompt, stop: onStop, expansion: onExpansion };
