// Claude reports what OnThread should remember with one visible line, e.g.
//   🧭 OnThread · sujet : Paiements Stripe       (the conversation's topic)
//   🧭 OnThread · question : Stripe              (it just asked "continue here?")
//   🧭 OnThread · exception : Stripe             (the user then said yes)
// The Stop hook reads Claude's final message and stores exactly that text.
// Examples are not decisions: lines in fenced or indented code blocks, quotes or
// inline code are ignored (CommonMark rules: up to 3 leading spaces; a fence,
// possibly after a list marker, closes only with the same character, at least
// the same length, and nothing else on the line).
import { cleanLabel } from './text.mjs';

const MARKER_RE = /^ {0,3}(?:[*_-]+ ?)?\u{1F9ED}️?[\s*_]*OnThread[\s*_]*[·•|:—–-]?[\s*_]*(topic|sujet|tema|thema|question|frage|pregunta|exception|excepcion|excepción|ausnahme)[\s*_]*[:：][\s*_]*(.+?)[\s*_]*$/iu;
const OPEN_FENCE_RE = /^ {0,3}(?:(?:[-*+]|\d{1,9}[.)])\s+)*(`{3,}|~{3,})/;

const KIND = {
  topic: 'topic', sujet: 'topic', tema: 'topic', thema: 'topic',
  question: 'question', frage: 'question', pregunta: 'question',
  exception: 'exception', excepcion: 'exception', 'excepción': 'exception', ausnahme: 'exception',
};

function closesFence(line, fence) {
  const m = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
  return Boolean(m) && m[1][0] === fence.char && m[1].length >= fence.len;
}

export function parseMarkers(text) {
  const result = { topic: null, question: null, exceptions: [] };
  if (typeof text !== 'string' || !text.includes('OnThread')) return result;
  let fence = null; // { char, len } while inside a fenced block
  for (const line of text.split(/\r?\n/)) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const f = OPEN_FENCE_RE.exec(line);
    if (f) { fence = { char: f[1][0], len: f[1].length }; continue; }
    if (/^\s*>/.test(line) || line.includes('`')) continue;
    const m = MARKER_RE.exec(line);
    if (!m) continue;
    const value = cleanLabel(m[2]);
    if (!value || value.length < 2) continue;
    const kind = KIND[m[1].toLowerCase()];
    if (kind === 'exception') { if (!result.exceptions.includes(value)) result.exceptions.push(value); }
    else result[kind] = value; // last one wins
  }
  return result;
}
