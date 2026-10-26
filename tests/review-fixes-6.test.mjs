// Regression tests for the first full-repository Codex review (OT-101 to OT-109).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { promptContext } from '../scripts/lib/context.mjs';
import { parseMarkers } from '../scripts/lib/markers.mjs';
import { cleanLabel } from '../scripts/lib/text.mjs';
import { context, project, readConv, ROOT, runHook, seed, tempDir, topic, uuid } from './helpers.mjs';

const cwd = tempDir('onthread-proj-');

// Fake keys are assembled at run time so secret scanners do not flag the source.
const fakeKey = (...parts) => parts.join('');

test('OT-101 obvious credentials never reach the registry', () => {
  const cases = [
    ['Database password=Winter2026!', 'Database password: [redacted]'],
    ['Accès serveur mdp : Azerty123', 'Accès serveur mdp: [redacted]'],
    [`Stripe ${fakeKey('sk', '_live_', 'TESTONLY', 'abcdefghijklmnop')}`, 'Stripe [redacted]'],
    [`Repo ${fakeKey('ghp', '_', 'TESTONLY', 'abcdefghijklmnopqrst')}`, 'Repo [redacted]'],
    ['Token a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8', 'Token [redacted]'],
  ];
  for (const [raw, clean] of cases) assert.equal(cleanLabel(raw), clean, raw);
  for (const ok of ['Paiements Stripe', 'Gestion des tokens et mots de passe', 'Pilotage général : tous sujets marketing']) {
    assert.equal(cleanLabel(ok), ok);
  }

  const data = tempDir();
  const id = uuid();
  runHook('prompt', { session_id: id, cwd, prompt: 'Corrige la connexion', session_title: 'Base password=Winter2026!' }, data);
  runHook('stop', { session_id: id, last_assistant_message: `Fait.\n\n🧭 OnThread · sujet : Clé api: ${fakeKey('AIza', 'TESTONLY', '-', 'abcdefghijklmnopqrstuvwxyz0')}` }, data);
  const rec = fs.readFileSync(path.join(data, 'conversations', `${id}.json`), 'utf8');
  assert.doesNotMatch(rec, /Winter2026|AIza|TESTONLY/);
});

test('OT-110 descriptive topics about tokens or secrets are not redacted', () => {
  for (const s of ['OAuth token: rotation', 'OAuth token: revocation', 'Jeton secret : révocation', 'Mot de passe : réinitialisation']) {
    assert.equal(cleanLabel(s), s);
  }
  assert.notEqual(cleanLabel('OAuth token: rotation'), cleanLabel('OAuth token: revocation'));
  assert.equal(cleanLabel('password=hunter'), 'password: [redacted]');
});

test('OT-111 redaction stays fast on hostile input', () => {
  for (const input of ['a-'.repeat(500000), 'x'.repeat(1000000), `${'1a'.repeat(300000)}!`]) {
    const started = Date.now();
    cleanLabel(input, 120);
    assert.ok(Date.now() - started < 500, `took ${Date.now() - started} ms`);
  }
  const started = Date.now();
  parseMarkers(`OnThread\n${Array.from({ length: 20000 }, (_, i) => `${'`'.repeat(1 + (i % 50))} x`).join('\n')}`);
  assert.ok(Date.now() - started < 1000);
});

test('OT-112 literal, escaped or indented backticks do not hide a real marker', () => {
  const marker = '🧭 OnThread · sujet : Syntaxe Markdown';
  for (const before of ['Utilise le caractère \\` pour Markdown.', 'Utilise le caractère ` seul.', "    const tick = '`';"]) {
    assert.equal(parseMarkers(`${before}\n\n${marker}`).topic, 'Syntaxe Markdown', before);
  }
});

test('OT-114/115/116 only the final block of marker lines counts, whatever the Markdown before it', () => {
  const fake = '🧭 OnThread · sujet : Faux sujet';
  for (const text of [
    `Exemple : \`début\n    suite\n${fake}\nfin\``,
    `Voir \`début\n${fake}\nfin\\\``,
    `> Exemple : \`début\n${fake}\nfin\``,
    `${fake}\nVoilà le format à utiliser.`,
    `1. Étape un\n   ${fake}\n2. Étape deux`,
    `> Exemple de ligne :\n${fake}`, // OT-118: lazy continuation of a quote
    `- ${fake}`, // OT-118: a list item
    `Voici le format :\n${fake}`, // glued to the paragraph above
    `- Exemple de format :\n\n  ${fake}`, // OT-120: continuation of a loose list item
    `   ${fake}`, // OT-120: indented
  ]) {
    assert.equal(parseMarkers(text).topic, null, text);
  }
  const real = parseMarkers('Fait.\n\n---\n\n🧭 OnThread · sujet : Paiements\n🧭 OnThread · exception : Stripe  \r\n');
  assert.equal(real.topic, 'Paiements');
  assert.deepEqual(real.exceptions, ['Stripe']);
  // OT-122: a fence opened in a list item closes at the item's indentation.
  for (const item of ['10. ```text\n    echo ok\n    ```', '1. ```text\n   echo ok\n   ```', '- ```\n  x\n  ```']) {
    assert.equal(parseMarkers(`${item}\n\n🧭 OnThread · sujet : Paiements Stripe`).topic, 'Paiements Stripe', item);
  }
  // OT-121: a one-line ```code``` span is not a fence opener.
  assert.equal(parseMarkers('```code```\n\n🧭 OnThread · sujet : Syntaxe Markdown utile').topic, 'Syntaxe Markdown utile');
});

test('OT-113/117 a plain yes has no punctuation beyond . , ! \' - …', () => {
  for (const reply of ['Oui, continue ici.', "D'accord !", 'Vas-y', 'Vas‐y', 'Vas‑y', 'ok 👍', 'oui…']) {
    const data = tempDir();
    const id = uuid();
    seed(data, { id, topic: topic('Marketing'), project: project(cwd), pendingQuestion: { text: 'Billing', at: new Date().toISOString() } });
    runHook('prompt', { session_id: id, cwd, prompt: reply }, data);
    assert.equal(readConv(data, id).pendingAnswer, true, reply);
  }
  for (const reply of ['Oui⁇', 'Yes⁈', 'Oui⁉', 'ok‽', 'oui ❓', 'OK՞', 'Oui ፧', 'oui (ici)']) {
    const data = tempDir();
    const id = uuid();
    seed(data, { id, topic: topic('Marketing'), project: project(cwd), pendingQuestion: { text: 'Billing', at: new Date().toISOString() } });
    runHook('prompt', { session_id: id, cwd, prompt: reply }, data);
    assert.equal(readConv(data, id).pendingAnswer, false, reply);
  }
});

test('OT-102 the /onthread:topic fallback never claims an unperformed change', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills', 'topic', 'SKILL.md'), 'utf8');
  assert.doesNotMatch(skill, /OnThread · topic :/);
  assert.match(skill, /Never say the topic was changed/);
});

test('OT-103 a marker inside inline code spanning several lines is ignored', () => {
  const m = parseMarkers('Exemple : `debut\n🧭 OnThread · sujet : Mauvais sujet\nfin` voilà.\n\n🧭 OnThread · sujet : Bon sujet');
  assert.equal(m.topic, 'Bon sujet');
  // A double-backtick span is only closed by a double backtick.
  const n = parseMarkers('Voir ``a ` b\n🧭 OnThread · sujet : Exemple\n`` fin');
  assert.equal(n.topic, null);
  // An ordinary one-line code span does not hide the next line.
  const o = parseMarkers('Voir `code` ici.\n\n🧭 OnThread · sujet : Vrai sujet');
  assert.equal(o.topic, 'Vrai sujet');
});

test('OT-104 a question in any script is never consent', () => {
  for (const reply of ['Continue ici？', 'Oui؟', '¿Vale', 'ok ﹖']) {
    const data = tempDir();
    const id = uuid();
    seed(data, { id, topic: topic('Marketing'), project: project(cwd), pendingQuestion: { text: 'Billing', at: new Date().toISOString() } });
    runHook('prompt', { session_id: id, cwd, prompt: reply }, data);
    assert.equal(readConv(data, id).pendingAnswer, false, reply);
    runHook('stop', { session_id: id, last_assistant_message: 'Fait.\n\n🧭 OnThread · exception : Billing' }, data);
    assert.deepEqual(readConv(data, id).exceptions, [], reply);
  }
});

test('OT-105 a record whose pendingAnswer is not a boolean is ignored', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, topic: topic('Marketing'), project: project(cwd), pendingQuestion: { text: 'Billing', at: new Date().toISOString() }, pendingAnswer: 'false' });
  runHook('stop', { session_id: id, last_assistant_message: '🧭 OnThread · exception : Billing' }, data);
  const exceptions = readConv(data, id).exceptions || [];
  assert.ok(!exceptions.some((e) => e.text === 'Billing'));
});

test('OT-106 the note stays within budget whatever the record holds', () => {
  const self = {
    id: uuid(),
    title: 'T'.repeat(120),
    topic: topic('S'.repeat(160), 'user'),
    exceptions: Array.from({ length: 100 }, (_, i) => ({ text: `Sujet accepté numéro ${i} `.padEnd(40, 'x'), at: new Date().toISOString() })),
    project: project(cwd),
    lastActiveAt: new Date().toISOString(),
  };
  const note = promptContext(self, []);
  assert.ok(note.length <= 1800, `note is ${note.length} characters`);
  assert.match(note, /numéro 99/);
  assert.doesNotMatch(note, /numéro 89 /);
});

test('OT-107 the live evaluation always loads this checkout', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tests', 'eval', 'run-eval.mjs'), 'utf8');
  assert.match(src, /'--plugin-dir', ROOT/);
  assert.doesNotMatch(src, /installedEnabled/);
});

test('OT-108 the eleventh accepted subject drops the oldest, as documented', () => {
  const data = tempDir();
  const id = uuid();
  const at = new Date().toISOString();
  seed(data, {
    id, topic: topic('Marketing'), project: project(cwd),
    exceptions: Array.from({ length: 10 }, (_, i) => ({ text: `Sujet ${i}`, at })),
    pendingQuestion: { text: 'Billing', at },
  });
  runHook('prompt', { session_id: id, cwd, prompt: 'oui' }, data);
  runHook('stop', { session_id: id, last_assistant_message: '🧭 OnThread · exception : Billing' }, data);
  const texts = readConv(data, id).exceptions.map((e) => e.text);
  assert.equal(texts.length, 10);
  assert.ok(texts.includes('Billing') && !texts.includes('Sujet 0'));
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /last 10 accepted subjects/);
  const note = context(runHook('prompt', { session_id: id, cwd, prompt: 'Corrige le webhook Billing' }, data));
  assert.match(note, /"Billing"/);
});
