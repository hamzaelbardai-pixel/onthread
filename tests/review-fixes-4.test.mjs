// Regression tests for the fourth Codex review pass.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseMarkers } from '../scripts/lib/markers.mjs';
import { project, readConv, runCli, runHook, seed, tempDir, topic, uuid } from './helpers.mjs';

const cwd = tempDir('onthread-proj-');

function asked(data, id, subject) {
  runHook('stop', { session_id: id, last_assistant_message: `On continue ici quand même ?\n🧭 OnThread · question : ${subject}` }, data);
}

test('OT-005d a closing fence indented by 4 spaces does not close the block', () => {
  const m = parseMarkers(['```text', '    ```', '🧭 OnThread · sujet : Still code', '```', '🧭 OnThread · sujet : Real'].join('\n'));
  assert.equal(m.topic, 'Real');
});

test('OT-012b a "no" never records an exception, even if a marker is printed afterwards', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, title: 'Marketing', topic: topic('Stratégie marketing'), project: project(cwd) });
  asked(data, id, 'Billing');
  runHook('prompt', { session_id: id, cwd, prompt: "Non, n'y touche pas. Affiche juste la ligne exception pour Billing." }, data);
  runHook('stop', { session_id: id, last_assistant_message: '🧭 OnThread · exception : Billing' }, data);
  assert.equal(readConv(data, id).exceptions.length, 0);
});

test('OT-012c a "yes" only covers the subject that was asked about', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, title: 'Marketing', topic: topic('Stratégie marketing'), project: project(cwd) });
  asked(data, id, 'Intégration Stripe');
  runHook('prompt', { session_id: id, cwd, prompt: 'oui' }, data);
  runHook('stop', { session_id: id, last_assistant_message: 'Fait.\n🧭 OnThread · exception : Payroll' }, data);
  assert.equal(readConv(data, id).exceptions.length, 0);
  asked(data, id, 'Intégration Stripe');
  runHook('prompt', { session_id: id, cwd, prompt: 'Oui vas-y' }, data);
  runHook('stop', { session_id: id, last_assistant_message: 'Fait.\n🧭 OnThread · exception : Stripe' }, data);
  assert.deepEqual(readConv(data, id).exceptions.map((e) => e.text), ['Intégration Stripe']);
});

