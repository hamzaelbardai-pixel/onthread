// Claude reports what OnThread should remember with one visible line, e.g.
//   🧭 OnThread · sujet : Paiements Stripe       (the conversation's topic)
//   🧭 OnThread · question : Stripe              (it just asked "continue here?")
//   🧭 OnThread · exception : Stripe             (the user then said yes)
// The Stop hook reads Claude's final message and stores exactly that text.
// Claude is asked to END its reply with these lines, at the start of the line and
// after a blank line, so only that final block counts: a marker followed by any
// other text is an example, whatever its Markdown, and so is a block glued to the
// line above it (a quote, list item or paragraph continued) or indented (a list
// item's continuation). Lines inside a fenced code block and lines with a backtick
// are never markers either (CommonMark fences: up to 3 leading spaces, possibly
// after a list marker, no backtick after a backtick fence, closed only by the same
// character, at least the same length).
import { cleanLabel } from './text.mjs';

const MARKER_RE = /^[*_]*\u{1F9ED}️?[\s*_]*OnThread[\s*_]*[·•|:—–-]?[\s*_]*(topic|sujet|tema|thema|question|frage|pregunta|exception|excepcion|excepción|ausnahme)[\s*_]*[:：][\s*_]*(.+?)[\s*_]*$/iu;
const OPEN_FENCE_RE = /^ {0,3}(?:(?:[-*+]|\d{1,9}[.)])\s+)*(`{3,}|~{3,})/;

const KIND = {
  topic: 'topic', sujet: 'topic', tema: 'topic', thema: 'topic',
  question: 'question', frage: 'question', pregunta: 'question',
  exception: 'exception', excepcion: 'exception', 'excepción': 'exception', ausnahme: 'exception',
};

// A closing fence may be indented up to 3 spaces past its container: the page for a
// top-level fence, the item's content column for a fence opened in a list item.
function closesFence(line, fence) {
  const m = /^( *)(`+|~+)[ \t]*$/.exec(line);
  return Boolean(m) && m[1].length <= fence.indent + 3 && m[2][0] === fence.char && m[2].length >= fence.len;
}

// Indexes of lines inside fenced code blocks (delimiters included).
function fencedLines(lines) {
  const fenced = new Set();
  let fence = null; // { char, len } while inside a fenced block
  lines.forEach((line, i) => {
    if (fence) {
      fenced.add(i);
      if (closesFence(line, fence)) fence = null;
      return;
    }
    const f = OPEN_FENCE_RE.exec(line);
    // "```code```" is inline code: a backtick fence's info string has no backtick.
    if (f && !(f[1][0] === '`' && line.slice(f[0].length).includes('`'))) {
      const prefix = f[0].slice(0, -f[1].length);
      fenced.add(i);
      fence = { char: f[1][0], len: f[1].length, indent: /[-*+]|\d[.)]/.test(prefix) ? prefix.length : 0 };
    }
  });
  return fenced;
}

export function parseMarkers(text) {
  const result = { topic: null, question: null, exceptions: [] };
  if (typeof text !== 'string' || !text.includes('OnThread')) return result;
  const lines = text.split(/\r?\n/);
  const fenced = fencedLines(lines);
  // Walk up from the end: blank lines are skipped, the first other line stops the block.
  const block = [];
  let gap = true; // a blank line separates the block from the line that stopped it
  let i = lines.length - 1;
  for (; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) { gap = true; continue; }
    if (fenced.has(i) || line.includes('`')) break;
    const m = MARKER_RE.exec(line);
    if (!m) break;
    block.unshift(m);
    gap = false;
  }
  if (i >= 0 && !gap) return result; // glued to a quote, list item or paragraph
  for (const m of block) {
    const value = cleanLabel(m[2]);
    if (!value || value.length < 2) continue;
    const kind = KIND[m[1].toLowerCase()];
    if (kind === 'exception') { if (!result.exceptions.includes(value)) result.exceptions.push(value); }
    else result[kind] = value; // last one wins
  }
  return result;
}
