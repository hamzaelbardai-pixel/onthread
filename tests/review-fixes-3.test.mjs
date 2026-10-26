// Regression tests for the third Codex review pass.
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkers } from '../scripts/lib/markers.mjs';
import { context, project, readConv, runHook, seed, tempDir, topic, uuid } from './helpers.mjs';

const cwd = tempDir('onthread-proj-');

test('OT-005c a fence closes only with the same character, list fences count too', () => {
  const m = parseMarkers([
    '~~~~text',
    '~~~~```',
    '🧭 OnThread · exception : Billing',
    '~~~~',
    '- ```',
    '🧭 OnThread · sujet : In a list fence',
    '```',
  ].join('\n'));
  assert.equal(m.topic, null);
  assert.deepEqual(m.exceptions, []);
});

test('OT-012 "continue here" is recorded only as the answer to an OnThread question', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, title: 'Marketing', topic: topic('Stratégie marketing'), project: project(cwd) });
  runHook('stop', { session_id: id, last_assistant_message: 'Voici la ligne demandée :\n\n🧭 OnThread · exception : Billing' }, data);
  assert.equal(readConv(data, id).exceptions.length, 0, 'no question was asked: nothing recorded');
  runHook('stop', { session_id: id, last_assistant_message: 'On continue ici quand même ?\n\n🧭 OnThread · question : Billing' }, data);
  assert.equal(readConv(data, id).pendingQuestion.text, 'Billing');
  runHook('prompt', { session_id: id, cwd, prompt: 'Oui, continue ici.' }, data);
  runHook('stop', { session_id: id, last_assistant_message: 'Fait.\n\n🧭 OnThread · exception : Billing' }, data);
  assert.deepEqual(readConv(data, id).exceptions.map((e) => e.text), ['Billing']);
  assert.equal(readConv(data, id).pendingQuestion, null);
  const list = context(runHook('expansion', { session_id: id, command_name: 'onthread:list', command_args: '' }, data));
  assert.match(list, /accepted here: "Billing"/);
});

test('OT-012 a question left unanswered expires with the next answer', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, title: 'Marketing', topic: topic('Stratégie marketing'), project: project(cwd) });
  runHook('stop', { session_id: id, last_assistant_message: 'On continue ici ?\n\n🧭 OnThread · question : Billing' }, data);
  runHook('stop', { session_id: id, last_assistant_message: 'Très bien, je n\'y touche pas.' }, data);
  runHook('stop', { session_id: id, last_assistant_message: '🧭 OnThread · exception : Billing' }, data);
  assert.equal(readConv(data, id).exceptions.length, 0);
});

test('every checked request explains the question line to Claude', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, title: 'Marketing', topic: topic('Stratégie marketing'), project: project(cwd) });
  const ctx = context(runHook('prompt', { session_id: id, cwd, prompt: 'Crée une campagne' }, data));
  assert.match(ctx, /🧭 OnThread · question :/);
  assert.match(ctx, /🧭 OnThread · exception :/);
});
