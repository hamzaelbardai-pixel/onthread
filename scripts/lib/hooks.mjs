// Hook handlers. Each takes the hook's stdin JSON and returns the JSON to print (or null).
import { COMMANDS } from './commands.mjs';
import { MAX_EXCEPTIONS, promptContext, rankCandidates, sessionStartContext } from './context.mjs';
import { parseMarkers } from './markers.mjs';
import { projectOf } from './project.mjs';
import { isValidId, listConversations, readSettings, updateConversation } from './store.mjs';
import { cleanLabel, isTrivialPrompt, normalize } from './text.mjs';

const ORIGINS = new Set(['startup', 'resume', 'clear', 'compact', 'fork']);
// Only a yes/no flag is derived from the prompt; the prompt itself is never stored.
// The answer to "continue here?" counts only if EVERY word belongs to a small
// affirmative vocabulary ("oui", "ok", "vas-y", "continue ici"...), the reply starts
// with an affirmative word or is "continue here", and its only punctuation is
// . , ! ' - … (so a question mark in any script or form, such as ? ؟ ⁇ ՞ or ❓, rules
// it out). Anything else is not consent, and OnThread may simply ask again later.
const NOT_PLAIN = /(?![.,!¡'’‘\-‐‑‒–—…])\p{P}|[❓❔⍰]/u;
const YES_FIRST = new Set(['oui', 'ouais', 'yes', 'yep', 'yeah', 'ok', 'okay', 'daccord', 'vas', 'vasy', 'go', 'sure', 'si', 'ja', 'vale', 'claro', 'bien', 'd']);
const YES_WORDS = new Set([...YES_FIRST, 'y', 'accord', 'sur', 'continue', 'continuer', 'continues', 'ici', 'here', 'please', 'stp', 'svp', 'merci', 'thanks', 'c', 'est', 'bon', 'fine', 'alright']);
const CONTINUE = new Set(['continue', 'continuer', 'continues']);
const HERE = new Set(['ici', 'here']);
const PENDING_TTL_MS = 6 * 3600 * 1000;

function words(text) {
  return normalize(text).replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

function isPlainYes(prompt) {
  if (NOT_PLAIN.test(prompt.normalize('NFKC'))) return false;
  const w = words(prompt).split(' ').filter(Boolean);
  if (!w.length || w.length > 8 || !w.every((x) => YES_WORDS.has(x))) return false;
  if (YES_FIRST.has(w[0])) return true;
  return CONTINUE.has(w[0]) && w.slice(1).some((x) => HERE.has(x)); // "continue here"
}

function touch(conv, input, now) {
  if (typeof input.session_title === 'string' && input.session_title.trim()) {
    conv.title = cleanLabel(input.session_title, 120);
  }
  const project = projectOf(input.cwd);
  if (project) conv.project = project;
  conv.lastActiveAt = now.toISOString();
}

function pendingQuestion(conv, now) {
  const q = conv?.pendingQuestion;
  return Boolean(q && typeof q.text === 'string' && now - Date.parse(q.at) < PENDING_TTL_MS);
}

function sameSubject(a, b) {
  const x = words(a);
  const y = words(b);
  return Boolean(x && y) && (x === y || x.includes(y) || y.includes(x));
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
  const slash = prompt.trimStart().startsWith('/');
  const skip = slash || isTrivialPrompt(prompt);
  const settings = readSettings();
  const conv = updateConversation(input.session_id, (c) => {
    touch(c, input, now);
    if (!skip && c.topic) c.promptsSinceTopic = (c.promptsSinceTopic || 0) + 1;
    // Is this prompt a plain "yes" to the question OnThread just asked?
    c.pendingAnswer = pendingQuestion(c, now) && !slash ? isPlainYes(prompt) : false;
  }, now);
  if (!settings.enabled || conv.protection === false) return null;
  if (skip) {
    // A short "yes" right after OnThread asked: remind Claude how to record the answer.
    if (conv.pendingAnswer === true) {
      const subject = cleanLabel(conv.pendingQuestion.text, 60);
      return contextOutput('UserPromptSubmit', `[OnThread] The user is answering yes to your question about continuing here ("${subject}"). Do the task and end with a blank line, then: 🧭 OnThread · exception : ${subject}`);
    }
    return null;
  }
  const others = listConversations({ activeWithinDays: settings.inactiveDays, now: now.getTime() });
  const candidates = rankCandidates(conv, others, prompt, { max: settings.maxCandidates });
  return contextOutput('UserPromptSubmit', promptContext(conv, candidates, { now: now.getTime() }));
}

export function onStop(input, now = new Date()) {
  if (!isValidId(input.session_id)) return null;
  const markers = parseMarkers(input.last_assistant_message);
  updateConversation(input.session_id, (c) => {
    if (!markers.topic && !markers.exceptions.length && !markers.question
      && !c.pendingQuestion && !c.pendingAnswer) return false;
    // A topic set with /onthread:topic only ever changes with /onthread:topic.
    if (markers.topic && markers.topic !== c.topic?.text && c.topic?.source !== 'user') {
      c.topic = { text: markers.topic, source: 'auto', setAt: now.toISOString() };
      c.promptsSinceTopic = 0;
    }
    // "Continue here" is recorded only when the user answered a plain yes to the
    // question OnThread asked in the previous turn, and only for that subject.
    if (pendingQuestion(c, now) && c.pendingAnswer === true
      && markers.exceptions.some((t) => sameSubject(t, c.pendingQuestion.text))) {
      const subject = c.pendingQuestion.text;
      const kept = (c.exceptions || []).filter((e) => !sameSubject(e.text, subject));
      c.exceptions = [...kept, { text: subject, at: now.toISOString() }].slice(-MAX_EXCEPTIONS);
    }
    c.pendingAnswer = false;
    c.pendingQuestion = markers.question ? { text: markers.question, at: now.toISOString() } : null;
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
