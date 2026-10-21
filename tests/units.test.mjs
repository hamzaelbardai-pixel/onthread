// Unit tests: markers, text helpers, commands.
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkers } from '../scripts/lib/markers.mjs';
import { cleanLabel, isTrivialPrompt, stems } from '../scripts/lib/text.mjs';
import { context, readConv, runHook, seed, tempDir, topic, uuid } from './helpers.mjs';

test('markers: French, English, decorated, and last-topic-wins', () => {
  const m = parseMarkers([
    'Voilà.',
    '🧭 OnThread · sujet : Paiements Stripe',
    '*🧭 OnThread — topic: Stripe payments*',
    '🧭️ OnThread · exception: facturation',
  ].join('\n'));
  assert.equal(m.topic, 'Stripe payments');
  assert.deepEqual(m.exceptions, ['facturation']);
});

test('markers: examples in code blocks, quotes or inline code are ignored (Codex OT-005)', () => {
  const m = parseMarkers([
    'Le format est le suivant :',
    '```text',
    '🧭 OnThread · sujet : Exemple dans un bloc',
    '```',
    '> 🧭 OnThread · exception : Exemple cité',
    'Par exemple `🧭 OnThread · sujet : inline`.',
    '~~~',
    '🧭 OnThread · topic: other fence',
    '~~~',
  ].join('\n'));
  assert.equal(m.topic, null);
  assert.deepEqual(m.exceptions, []);
});

test('markers: ignores prose that merely mentions OnThread', () => {
  const m = parseMarkers('OnThread enregistre le sujet : ceci n\'est pas un marqueur.\nLe mot sujet : non plus.');
  assert.equal(m.topic, null);
  assert.deepEqual(m.exceptions, []);
});

test('labels are cleaned and bounded', () => {
  assert.equal(cleanLabel('  **« Paiements `Stripe` »**\u0007 '), 'Paiements Stripe');
  assert.equal(cleanLabel('x'.repeat(500)).length, 160);
});

test('trivial prompts', () => {
  for (const p of ['ok', 'Oui !', '3', 'merci', 'Vas-y', "d'accord", 'c\'est bon']) assert.ok(isTrivialPrompt(p), p);
  for (const p of ['Oui, mais ajoute aussi les tests', 'Corrige le bug', 'ok pour la page tarifs, fais-la']) assert.ok(!isTrivialPrompt(p), p);
});

test('stems ignore accents, case, plurals and pasted content', () => {
  const s = stems('Les PAIEMENTS remboursés <pasted_content id="1">facture facture</pasted_content>');
  assert.ok(s.has('paiem') && s.has('rembo'));
  assert.ok(!s.has('factu'));
});

test('/onthread:topic shows, then sets the topic deterministically', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, topic: topic('Ancien sujet') });
  const show = context(runHook('expansion', { session_id: id, command_name: 'onthread:topic', command_args: '' }, data));
  assert.match(show, /Ancien sujet/);
  const set = context(runHook('expansion', { session_id: id, command_name: 'onthread:topic', command_args: 'Paiements Stripe; rm -rf /' }, data));
  assert.match(set, /Topic updated/);
  assert.equal(readConv(data, id).topic.text, 'Paiements Stripe; rm -rf /');
  assert.equal(readConv(data, id).topic.source, 'user');
});

test('/onthread:list groups by project and flags this conversation', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, title: 'Marketing', project: { path: '/x/shop', name: 'shop' } });
  seed(data, { id: uuid(), title: 'Stripe', project: { path: '/x/shop', name: 'shop' } });
  seed(data, { id: uuid(), topic: topic('Paie'), project: { path: '/x/hr', name: 'hr' } });
  const out = context(runHook('expansion', { session_id: id, command_name: 'onthread:list', command_args: '' }, data));
  assert.match(out, /3 conversation\(s\) recorded/);
  assert.match(out, /Project shop:[\s\S]*"Marketing"[^\n]*this conversation/);
  assert.match(out, /Project hr:/);
});

test('other plugins\' commands are ignored by the expansion hook', () => {
  const res = runHook('expansion', { session_id: uuid(), command_name: 'other:topic', command_args: 'x' }, tempDir());
  assert.equal(res.stdout, '');
});

