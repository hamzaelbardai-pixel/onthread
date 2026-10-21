// Group C: robustness (brief tests 18-28).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  context, project, readConv, runCli, runHook, runHookAsync, seed, tempDir, topic, uuid,
} from './helpers.mjs';

const cwd = tempDir('onthread-proj-');

test('C18 missing registry: the first hook creates it', () => {
  const data = path.join(tempDir(), 'does', 'not', 'exist');
  const id = uuid();
  const res = runHook('prompt', { session_id: id, cwd, prompt: 'Bonjour, je veux créer une API' }, data);
  assert.equal(res.status, 0);
  assert.equal(readConv(data, id).id, id);
});

test('C19 empty registry folder: works and reports no other conversation', () => {
  const data = tempDir();
  fs.mkdirSync(path.join(data, 'conversations'));
  const res = runHook('prompt', { session_id: uuid(), cwd, prompt: 'Crée une page de contact' }, data);
  assert.match(context(res), /No other known conversation/);
});

test('C20 corrupt registry files are quarantined, never fatal', () => {
  const data = tempDir();
  const id = uuid();
  const dir = path.join(data, 'conversations');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), '{ this is not json');
  fs.writeFileSync(path.join(dir, `${uuid()}.json`), '[]');
  fs.writeFileSync(path.join(data, 'settings.json'), 'garbage');
  const res = runHook('prompt', { session_id: id, cwd, prompt: 'Ajoute un formulaire' }, data);
  assert.equal(res.status, 0);
  assert.equal(readConv(data, id).id, id);
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('.corrupt-')));
});

test('C21 concurrent writers: no lost update, no corrupt file', async () => {
  const data = tempDir();
  const shared = uuid();
  seed(data, { id: shared, topic: topic('Sujet commun'), promptsSinceTopic: 0, project: project(cwd) });
  const jobs = [];
  for (let i = 0; i < 24; i++) {
    jobs.push(runHookAsync('prompt', { session_id: shared, cwd, prompt: `Demande numéro ${i} sur le sujet commun` }, data));
    jobs.push(runHookAsync('prompt', { session_id: uuid(), cwd, prompt: `Autre conversation ${i}` }, data));
  }
  const results = await Promise.all(jobs);
  assert.ok(results.every((r) => r.code === 0));
  assert.equal(readConv(data, shared).promptsSinceTopic, 24);
  const files = fs.readdirSync(path.join(data, 'conversations'));
  assert.equal(files.filter((f) => f.endsWith('.json')).length, 25);
  assert.ok(!files.some((f) => f.endsWith('.tmp') || f.endsWith('.lock')));
});

test('C22 hundreds of conversations: hook stays fast and context stays short', () => {
  const data = tempDir();
  const subjects = ['paiements Stripe', 'design du dashboard', 'SEO du blog', 'API backend', 'emails marketing', 'tests end-to-end'];
  for (let i = 0; i < 500; i++) {
    seed(data, { id: uuid(), title: `Conv ${i} ${subjects[i % subjects.length]}`, topic: topic(`Travail sur ${subjects[i % subjects.length]} n°${i}`), project: project(i % 3 ? cwd : tempDir('onthread-x-')) });
  }
  const self = seed(data, { id: uuid(), title: 'Marketing', topic: topic('Stratégie marketing'), project: project(cwd) });
  const times = [];
  let res;
  for (let i = 0; i < 5; i++) {
    res = runHook('prompt', { session_id: self.id, cwd, prompt: 'Corrige le webhook des paiements Stripe' }, data);
    times.push(res.ms);
  }
  times.sort((a, b) => a - b);
  const median = times[2];
  console.log(`  500 conversations: median hook time ${median.toFixed(0)} ms (process start included)`);
  assert.ok(median < 1500, `hook took ${median} ms`);
  assert.ok(context(res).length <= 1800);
  assert.ok(context(res).split('\n').filter((l) => /^\d\. /.test(l)).length <= 5);
});

test('C23 very long message: handled, never stored', () => {
  const data = tempDir();
  const id = uuid();
  const prompt = 'Corrige le paiement Stripe. '.repeat(40000);
  const res = runHook('prompt', { session_id: id, cwd, prompt }, data);
  assert.equal(res.status, 0);
  const raw = fs.readFileSync(path.join(data, 'conversations', `${id}.json`), 'utf8');
  assert.ok(!raw.includes('Corrige le paiement'));
});

test('C24-C26 French, English and mixed messages match the same conversation', () => {
  const data = tempDir();
  const self = seed(data, { id: uuid(), title: 'Marketing', topic: topic('Stratégie marketing'), project: project(cwd) });
  seed(data, { id: uuid(), title: 'Stripe integration', topic: topic('Stripe payments, webhooks and refunds'), project: project(cwd) });
  seed(data, { id: uuid(), title: 'Design UX', topic: topic('Maquettes du tableau de bord'), project: project(cwd) });
  seed(data, { id: uuid(), title: 'Emailing', topic: topic('Newsletters et campagnes email'), project: project(cwd) });
  for (const prompt of ['Corrige le webhook Stripe des remboursements', 'Fix the Stripe refund webhook', 'Peux-tu fix le webhook Stripe ?']) {
    const first = context(runHook('prompt', { session_id: self.id, cwd, prompt }, data)).split('\n').find((l) => l.startsWith('1. '));
    assert.match(first, /Stripe integration/, prompt);
  }
});

test('C27 bad input or unwritable data dir: exit 0, nothing printed, error logged', () => {
  const data = tempDir();
  const bad = runHook('prompt', '{ not json', data);
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, '');
  assert.match(fs.readFileSync(path.join(data, 'onthread-errors.log'), 'utf8'), /prompt:/);

  const file = path.join(tempDir(), 'a-file');
  fs.writeFileSync(file, 'x');
  const blocked = runHook('prompt', { session_id: uuid(), cwd, prompt: 'Crée une API' }, path.join(file, 'sub'));
  assert.equal(blocked.status, 0);
  assert.equal(blocked.stdout, '');

  const evil = runHook('prompt', { session_id: '../../etc/passwd', cwd, prompt: 'x' }, data);
  assert.equal(evil.status, 0);
  assert.equal(evil.stdout, '');
});

test('C28 off/on for one conversation and for all', () => {
  const data = tempDir();
  const id = uuid();
  const prompt = { session_id: id, cwd, prompt: 'Crée la page des tarifs' };
  assert.ok(context(runHook('prompt', prompt, data)));
  runHook('expansion', { session_id: id, command_name: 'onthread:off', command_args: '' }, data);
  assert.equal(runHook('prompt', prompt, data).stdout, '');
  runHook('expansion', { session_id: id, command_name: 'onthread:on', command_args: '' }, data);
  assert.ok(context(runHook('prompt', prompt, data)));
  assert.match(runCli(['off', 'all', '--session', id], data).stdout, /paused in every conversation/);
  assert.equal(runHook('prompt', prompt, data).stdout, '');
  assert.equal(context(runHook('start', { session_id: uuid(), cwd, source: 'startup' }, data)), '');
  runCli(['on', 'all', '--session', id], data);
  assert.ok(context(runHook('prompt', prompt, data)));
});
