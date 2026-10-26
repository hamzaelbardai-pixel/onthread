// Group A: identifying conversations (brief tests 1-8).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { context, project, readConv, runHook, seed, tempDir, topic, uuid } from './helpers.mjs';

const cwd = tempDir('onthread-proj-');

test('A1 new conversation is registered on SessionStart', () => {
  const data = tempDir();
  const id = uuid();
  const res = runHook('start', { session_id: id, cwd, source: 'startup', hook_event_name: 'SessionStart' }, data);
  assert.equal(res.status, 0);
  const conv = readConv(data, id);
  assert.equal(conv.id, id);
  assert.equal(conv.origin, 'startup');
  assert.equal(conv.topic, null);
  assert.equal(conv.project.path, path.resolve(cwd));
  assert.match(context(res), /OnThread/);
});

test('A2 an existing conversation keeps its recorded topic', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, topic: topic('Paiements Stripe'), project: project(cwd) });
  const res = runHook('prompt', { session_id: id, cwd, prompt: 'Ajoute les remboursements partiels' }, data);
  assert.match(context(res), /topic "Paiements Stripe" \(confirmed\)/);
  assert.equal(readConv(data, id).topic.text, 'Paiements Stripe');
});

test('A3 resume restores the same record (origin unchanged)', () => {
  const data = tempDir();
  const id = uuid();
  runHook('start', { session_id: id, cwd, source: 'startup' }, data);
  runHook('stop', { session_id: id, last_assistant_message: 'Fait.\n\n🧭 OnThread · sujet : Paiements Stripe' }, data);
  runHook('start', { session_id: id, cwd, source: 'resume' }, data);
  const conv = readConv(data, id);
  assert.equal(conv.origin, 'startup');
  assert.equal(conv.topic.text, 'Paiements Stripe');
});

test('A4 a renamed conversation gets its new title at the next event', () => {
  const data = tempDir();
  const id = uuid();
  runHook('start', { session_id: id, cwd, source: 'startup', session_title: 'Ancien titre' }, data);
  runHook('prompt', { session_id: id, cwd, prompt: 'Bonjour', session_title: 'Intégration Stripe' }, data);
  assert.equal(readConv(data, id).title, 'Intégration Stripe');
});

test('A5 two conversations in the same folder stay distinct', () => {
  const data = tempDir();
  const a = uuid();
  const b = uuid();
  runHook('start', { session_id: a, cwd, source: 'startup' }, data);
  runHook('start', { session_id: b, cwd, source: 'startup' }, data);
  runHook('stop', { session_id: a, last_assistant_message: '🧭 OnThread · sujet : Stratégie marketing' }, data);
  runHook('stop', { session_id: b, last_assistant_message: '🧭 OnThread · topic: Stripe payments' }, data);
  assert.equal(readConv(data, a).topic.text, 'Stratégie marketing');
  assert.equal(readConv(data, b).topic.text, 'Stripe payments');
  assert.equal(fs.readdirSync(path.join(data, 'conversations')).filter((f) => f.endsWith('.json')).length, 2);
});

test('A6 two conversations with the same title are told apart by id', () => {
  const data = tempDir();
  const self = seed(data, { id: uuid(), title: 'Backend', topic: topic('API REST'), project: project(cwd) });
  const twin = seed(data, { id: uuid(), title: 'Backend', topic: topic('Base de données'), project: project(cwd) });
  const ctx = context(runHook('prompt', { session_id: self.id, cwd, prompt: 'Optimise les index de la base de données' }, data));
  assert.match(ctx, new RegExp(`id ${twin.id.slice(0, 8)}`));
  assert.match(ctx, new RegExp(`id ${self.id.slice(0, 8)}`));
});

test('A7 a conversation without a custom title is labelled by its topic', () => {
  const data = tempDir();
  const self = seed(data, { id: uuid(), topic: topic('Stratégie marketing'), project: project(cwd) });
  seed(data, { id: uuid(), topic: topic('Intégration des paiements Stripe'), project: project(cwd) });
  const ctx = context(runHook('prompt', { session_id: self.id, cwd, prompt: 'Corrige la synchronisation des paiements Stripe' }, data));
  assert.match(ctx, /no custom title/);
  assert.match(ctx, /"Intégration des paiements Stripe"/);
});

test('A8 a forked conversation is a new record with no inherited topic', () => {
  const data = tempDir();
  const parent = seed(data, { id: uuid(), topic: topic('Paiements Stripe'), project: project(cwd) });
  const fork = uuid();
  const res = runHook('start', { session_id: fork, cwd, source: 'fork' }, data);
  const conv = readConv(data, fork);
  assert.equal(conv.origin, 'fork');
  assert.equal(conv.topic, null);
  assert.equal(readConv(data, parent.id).topic.text, 'Paiements Stripe');
  assert.match(context(res), /forked/);
});
