// Cheap, local text helpers. They only RANK which known conversations to show
// Claude; the actual "is this the wrong conversation?" judgment is Claude's.

const STOPWORDS = new Set(`
a afin ai aie aient ainsi alors au aucun aussi autre aux avec avoir avons bien bon ca cela celle celles celui ce ces cet cette
chaque ci comme comment dans de des donc dont du elle elles en encore est et etait ete etre eu fait faire fais faut il ils
je juste la le les leur leurs lui ma mais me meme mes moi mon ne ni nos notre nous on ou par pas peu peut peux plus pour
pourquoi quand que quel quelle quelles quels qui quoi sa sans se ses si son sont sur ta te tes toi ton tous tout toute
toutes tres tu un une vos votre vous veux voudrais voir aussi deja ici maintenant merci stp svp moins avant apres
about above after again all also am an and any are as at be because been before being both but by can could did do does
doing done for from further get got had has have having he her here hers him his how i if in into is it its itself just
let me more most my no nor not now of off on once only or other our out over own please same she should so some such than
that the their them then there these they this those through to too under until up very was we were what when where which
while who whom why will with would you your yours make need want like thing things use using
`.trim().split(/\s+/));

const TRIVIAL = new Set([
  'ok', 'okay', 'oui', 'non', 'yes', 'no', 'y', 'n', 'merci', 'thanks', 'thank you', 'thx', 'go', 'vas y', 'vasy',
  'd accord', 'daccord', 'parfait', 'top', 'super', 'cool', 'continue', 'continuer', 'c est bon', 'cest bon',
  'nickel', 'yep', 'nope', 'sure', 'great', 'good', 'fine', 'si', 'ja', 'nein',
]);

export function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Drop pasted blocks: they are material, not intent.
export function stripPasted(s) {
  return String(s || '').replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content[^>]*>/gi, ' ');
}

export function stems(s, limit = 4000) {
  const words = normalize(stripPasted(s).slice(0, limit)).split(/[^a-z0-9]+/);
  const out = new Set();
  for (const w of words) {
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    out.add(w.length > 5 ? w.slice(0, 5) : w);
  }
  return out;
}

export function similarity(queryStems, docText) {
  const doc = stems(docText, 1000);
  if (!doc.size || !queryStems.size) return 0;
  let overlap = 0;
  for (const t of doc) if (queryStems.has(t)) overlap++;
  return overlap / Math.sqrt(doc.size);
}

export function overlapCount(queryStems, docText) {
  let n = 0;
  for (const t of stems(docText, 1000)) if (queryStems.has(t)) n++;
  return n;
}

// Short acknowledgements ("ok", "oui", "2") never need a check.
export function isTrivialPrompt(prompt) {
  const t = normalize(prompt).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return true;
  if (/^[0-9 ]{1,6}$/.test(t)) return true;
  return t.length <= 20 && TRIVIAL.has(t);
}

// Safe one-line label for the registry: no control chars, no markdown, bounded.
export function cleanLabel(s, max = 160) {
  const t = String(s || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[`*_~<>]/g, '')
    .replace(/^["'«“\s]+|["'»”\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
