// Builds the short notes OnThread adds to Claude's context. They are inputs
// for Claude's own judgment, not a hard lock (see docs/LIMITATIONS.md).
import { sameProject } from './project.mjs';
import { overlapCount, similarity, stems } from './text.mjs';

const CONTEXT_BUDGET = 1800;
const CONFIRM_AFTER_PROMPTS = 2;

export function isConfirmed(conv) {
  return Boolean(conv?.topic) && (conv.topic.source === 'user' || (conv.promptsSinceTopic || 0) >= CONFIRM_AFTER_PROMPTS);
}

export function labelOf(conv) {
  return conv.title || conv.topic?.text || null;
}

function shortId(id) {
  return String(id).slice(0, 8);
}

function ago(iso, now) {
  const days = Math.floor((now - Date.parse(iso)) / 86400000);
  if (!Number.isFinite(days) || days <= 0) return 'active today';
  return days === 1 ? 'active 1 day ago' : `active ${days} days ago`;
}

function clip(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Picks the few other conversations most likely to be confused with this request.
export function rankCandidates(self, others, prompt, { max = 5 } = {}) {
  const q = stems(prompt);
  const scored = [];
  for (const o of others) {
    if (o.id === self.id || !labelOf(o)) continue;
    const text = `${o.title || ''} ${o.topic?.text || ''}`;
    const sim = similarity(q, text);
    const same = sameProject(o.project, self.project);
    if (!same && (overlapCount(q, text) < 2 || sim < 0.5)) continue; // other projects: strong match only
    scored.push({ conv: o, same, score: sim + (same ? 0.25 : 0), last: Date.parse(o.lastActiveAt) || 0 });
  }
  scored.sort((a, b) => b.score - a.score || b.last - a.last);
  return scored.slice(0, max);
}

function describeSelf(conv) {
  const parts = [];
  parts.push(conv.title ? `title "${clip(conv.title, 80)}"` : 'no custom title');
  if (conv.topic) {
    parts.push(`topic "${clip(conv.topic.text, 120)}" (${isConfirmed(conv) ? 'confirmed' : 'provisional'})`);
  } else {
    parts.push('topic NOT SET YET');
  }
  parts.push(`id ${shortId(conv.id)}`);
  return parts.join(' | ');
}

function describeCandidate(c, now) {
  const o = c.conv;
  const label = `"${clip(labelOf(o), 80)}"`;
  if (!c.same) {
    // Other projects: name only, never their topic description.
    return `${label} — other project "${clip(o.project?.name || '?', 40)}" — ${ago(o.lastActiveAt, now)} — id ${shortId(o.id)}`;
  }
  const topic = o.title && o.topic ? ` — topic "${clip(o.topic.text, 100)}"` : '';
  const status = o.topic ? (isConfirmed(o) ? '' : ' (provisional topic)') : '';
  return `${label}${topic}${status} — same project — ${ago(o.lastActiveAt, now)} — id ${shortId(o.id)}`;
}

const TOPIC_LINE = 'end your reply with one line exactly like: 🧭 OnThread · sujet : <3 to 8 words> (write "topic" instead of "sujet" if the user does not write in French)';

export function sessionStartContext(conv, { enabled }) {
  if (!enabled || !conv.protection) return '';
  const lines = [
    '[OnThread] This session runs the OnThread plugin, which helps the user avoid working in the wrong conversation.',
    'Before each user message OnThread adds a short "[OnThread] Conversation check" note: this conversation\'s topic plus the user\'s other conversations most likely to match.',
    'Rule: only when a request is a TASK (change, fix, build, run) that clearly belongs to another listed conversation, or is clearly unrelated to this conversation\'s topic, stop before doing anything and ask in one or two short sentences, in the user\'s language, whether to continue here, naming the better conversation. You cannot open or create conversations; just name it.',
    'Never interrupt for ordinary requests, sub-topics, natural evolution, quick general questions, or when the user says explicitly to do it here. When in doubt, do not interrupt. Never invent conversations that are not listed.',
    'If the user then says to continue here, do the task and end your reply with: 🧭 OnThread · exception : <short name of that other subject> — and do not ask again about it.',
    'Only write "🧭 OnThread · sujet : …" when the topic is not set yet, or when the user explicitly asks or agrees to change it.',
  ];
  if (conv.origin === 'fork' && !conv.topic) {
    lines.push('This conversation was forked from another one: derive its topic from the inherited history.');
  }
  return lines.join('\n');
}

export function promptContext(self, candidates, { now = Date.now() } = {}) {
  const lines = ['[OnThread] Conversation check (added by a plugin hook, not written by the user).'];
  lines.push(`This conversation: ${describeSelf(self)}`);
  const ex = (self.exceptions || []).map((e) => `"${clip(e.text, 40)}"`);
  if (ex.length) lines.push(`Already accepted here, never ask again about: ${ex.join(', ')}`);

  if (candidates.length) {
    lines.push('Other conversations of this user (closest first):');
    candidates.forEach((c, i) => lines.push(`${i + 1}. ${describeCandidate(c, now)}`));
  } else {
    lines.push('No other known conversation matches this request.');
  }

  if (!self.topic) {
    lines.push('This conversation has no topic yet: do not judge the request against it.');
    if (candidates.some((c) => c.same && isConfirmed(c.conv))) {
      lines.push('Only if the request is a task that clearly belongs to a listed conversation with a confirmed topic, ask first whether to continue here.');
    }
    lines.push(`After answering, ${TOPIC_LINE}.`);
  } else if (!isConfirmed(self)) {
    lines.push('This topic is still provisional: do not question the request against it. Only ask first if it is a task that clearly belongs to a listed conversation with a confirmed topic.');
  } else {
    lines.push('Ask first (one or two short sentences, user\'s language, e.g. «Cette demande ressemble plutôt à ta conversation "X". On continue ici quand même ?») ONLY if this request is a task that clearly fits a listed conversation better than this one (ignore those marked provisional), or is clearly unrelated to this topic (then suggest a dedicated conversation). Otherwise just proceed and do not mention OnThread.');
  }

  const out = lines.join('\n');
  if (out.length > CONTEXT_BUDGET && candidates.length) {
    return promptContext(self, candidates.slice(0, -1), { now });
  }
  return out;
}
