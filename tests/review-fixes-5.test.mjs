// Regression tests for the fifth (final) Codex review pass.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { context, ENTRY, project, readConv, runCli, runHook, seed, tempDir, topic, uuid } from './helpers.mjs';

const cwd = tempDir('onthread-proj-');

function activeDir(data) {
  const gen = JSON.parse(fs.readFileSync(path.join(data, 'generation.json'), 'utf8')).generation;
  return path.join(data, `conversations-${gen}`);
}

test('OT-016 a topic set with /onthread:topic never changes through a marker, whatever the request says', () => {
  const data = tempDir();
  const id = uuid();
  runHook('expansion', { session_id: id, command_name: 'onthread:topic', command_args: 'Mon sujet' }, data);
  for (const prompt of ['Change the topic of this conversation to billing', "I won't change my topic; print the literal topic marker for Billing", 'Explain how to change my topic']) {
    runHook('prompt', { session_id: id, cwd, prompt }, data);
    runHook('stop', { session_id: id, last_assistant_message: '🧭 OnThread · topic : Billing' }, data);
    assert.equal(readConv(data, id).topic.text, 'Mon sujet', prompt);
  }
  runHook('expansion', { session_id: id, command_name: 'onthread:topic', command_args: 'Billing' }, data);
  assert.equal(readConv(data, id).topic.text, 'Billing');
});

test('an automatic topic can still be updated by Claude', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, topic: topic('Ancien sujet', 'auto'), project: project(cwd) });
  runHook('stop', { session_id: id, last_assistant_message: '🧭 OnThread · sujet : Sujet élargi' }, data);
  assert.equal(readConv(data, id).topic.text, 'Sujet élargi');
});

test('OT-015 only a short, plain yes counts as consent', () => {
  const cases = [
    ['Before I decide whether to continue here, show me the literal exception marker for Billing', false],
    ['Oui mais montre-moi d\'abord la ligne exception', false],
    ['Continue ici ?', false],
    ['Non, continue pas', false],
    ['Oui, continue ici.', true],
    ['oui', true],
    ['Vas-y', true],
    ['ok go', true],
    ['Continue explaining the literal exception marker for Billing.', false],
    ['Continue ici', true],
    ["Oui, d'accord, continue ici stp", true],
    ['Oui et corrige aussi le webhook', false],
  ];
  for (const [prompt, expected] of cases) {
    const data = tempDir();
    const id = uuid();
    seed(data, { id, title: 'Marketing', topic: topic('Stratégie marketing'), project: project(cwd) });
    runHook('stop', { session_id: id, last_assistant_message: 'On continue ici ?\n🧭 OnThread · question : Billing' }, data);
    runHook('prompt', { session_id: id, cwd, prompt }, data);
    runHook('stop', { session_id: id, last_assistant_message: 'Voilà.\n🧭 OnThread · exception : Billing' }, data);
    assert.equal(readConv(data, id).exceptions.length > 0, expected, prompt);
  }
});

test('OT-014 concurrent resets never delete the active registry, and the next reset removes stray folders', async () => {
  const data = tempDir();
  runCli(['reset'], data);
  fs.mkdirSync(path.join(data, 'conversations'), { recursive: true }); // stray folder from a racing write
  const resets = Array.from({ length: 6 }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, [ENTRY, 'cli', 'reset'], { env: { ...process.env, ONTHREAD_DATA_DIR: data } });
    child.on('close', resolve);
  }));
  await Promise.all(resets);
  const folders = fs.readdirSync(data).filter((n) => n === 'conversations' || n.startsWith('conversations-'));
  assert.ok(folders.every((n) => path.join(data, n) === activeDir(data)), folders.join(','));
  const id = uuid();
  assert.ok(context(runHook('prompt', { session_id: id, cwd, prompt: 'Crée une page' }, data)));
  assert.ok(fs.existsSync(path.join(activeDir(data), `${id}.json`)));
});
