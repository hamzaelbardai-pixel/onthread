// Claude reports what OnThread should remember with one visible line, e.g.
//   🧭 OnThread · sujet : Paiements Stripe
//   🧭 OnThread · exception : Stripe
// The Stop hook reads Claude's final message and stores exactly that text.
import { cleanLabel } from './text.mjs';

const MARKER_RE = /^[\s>*_`-]*\u{1F9ED}️?[\s*_]*OnThread[\s*_]*[·•|:—–-]?[\s*_]*(topic|sujet|tema|thema|exception|excepcion|excepción|ausnahme)[\s*_]*[:：][\s*_]*(.+?)[\s*_`]*$/gimu;

const TOPIC_WORDS = new Set(['topic', 'sujet', 'tema', 'thema']);

export function parseMarkers(text) {
  const result = { topic: null, exceptions: [] };
  if (typeof text !== 'string' || !text.includes('OnThread')) return result;
  for (const m of text.matchAll(MARKER_RE)) {
    const value = cleanLabel(m[2]);
    if (!value || value.length < 2) continue;
    if (TOPIC_WORDS.has(m[1].toLowerCase())) result.topic = value; // last one wins
    else if (!result.exceptions.includes(value)) result.exceptions.push(value);
  }
  return result;
}
