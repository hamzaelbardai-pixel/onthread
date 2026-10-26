// Group B (brief tests 9-17), mechanical side: what Claude is told for each kind of request.
// Whether Claude then asks or not is measured by the live evaluation (tests/eval).
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { context, project, readConv, runHook, seed, tempDir, topic, uuid } from './helpers.mjs';

const shop = tempDir('onthread-shop-');
const other = tempDir('onthread-hr-');

function shopRegistry() {
  const data = tempDir();
  const marketing = seed(data, { id: uuid(), title: 'Marketing e-commerce', topic: topic('Stratégie marketing et acquisition du site'), project: project(shop) });
  const stripe = seed(data, { id: uuid(), title: 'Intégration Stripe', topic: topic('Paiements Stripe : intégration, webhooks, remboursements'), project: project(shop) });
  const design = seed(data, { id: uuid(), title: 'Design UX/UI', topic: topic('Design du dashboard et des pages produit'), project: project(shop) });
  return { data, marketing, stripe, design };
}

test('B9/B10/B12 a request in the conversation\'s own field gets the "only if clearly elsewhere" rule', () => {
  const { data, stripe } = shopRegistry();
  const ctx = context(runHook('prompt', { session_id: stripe.id, cwd: shop, prompt: 'Ajoute la prise en charge des remboursements partiels' }, data));
  assert.match(ctx, /topic "Paiements Stripe/);
  assert.match(ctx, /ONLY if this request is a task that clearly fits a listed conversation better/);
  assert.match(ctx, /Otherwise just proceed and do not mention OnThread/);
});

test('B11 a quick general question carries the same non-intrusive rule (questions are not tasks)', () => {
  const { data, marketing } = shopRegistry();
  const ctx = context(runHook('prompt', { session_id: marketing.id, cwd: shop, prompt: "Peux-tu m'expliquer rapidement ce qu'est un CRM ?" }, data));
  assert.match(ctx, /ONLY if this request is a task/);
});

test('B13 the matching conversation is ranked first for an obvious confusion', () => {
  const { data, marketing } = shopRegistry();
  const ctx = context(runHook('prompt', { session_id: marketing.id, cwd: shop, prompt: 'Modifie la logique du paiement Stripe pour gérer les remboursements' }, data));
  const first = ctx.split('\n').find((l) => l.startsWith('1. '));
  assert.match(first, /Intégration Stripe/);
});

test('B14 an unrelated new subject finds no matching conversation and the rule suggests a dedicated one', () => {
  const data = tempDir();
  const design = seed(data, { id: uuid(), title: 'Design UX/UI', topic: topic('Design du dashboard'), project: project(shop) });
  seed(data, { id: uuid(), title: 'Comptabilité', topic: topic('Clôture comptable'), project: project(other) });
  const ctx = context(runHook('prompt', { session_id: design.id, cwd: shop, prompt: 'Je veux développer un outil de gestion des ressources humaines' }, data));
  assert.match(ctx, /No other known conversation matches/);
  assert.match(ctx, /suggest a dedicated conversation/);
});

test('B15 a provisional topic is never used to question a request', () => {
  const data = tempDir();
  const id = uuid();
  seed(data, { id, topic: topic('Refonte du site'), promptsSinceTopic: 0, project: project(shop) });
  const ctx = context(runHook('prompt', { session_id: id, cwd: shop, prompt: 'Mets à jour la page des tarifs' }, data));
  assert.match(ctx, /provisional: do not question the request against it/);
});

test('B16 no topic yet: Claude is asked to propose one, not to judge', () => {
  const data = tempDir();
  const id = uuid();
  runHook('start', { session_id: id, cwd: shop, source: 'startup' }, data);
  const ctx = context(runHook('prompt', { session_id: id, cwd: shop, prompt: 'Je veux mettre en place les paiements Stripe sur mon site' }, data));
  assert.match(ctx, /no topic yet: do not judge/);
  assert.match(ctx, /🧭 OnThread · sujet :/);
});

test('B17 after "continue here", the accepted subject is listed and never asked again', () => {
  const { data, marketing } = shopRegistry();
  runHook('stop', { session_id: marketing.id, last_assistant_message: 'Cette demande ressemble plutôt à ta conversation « Intégration Stripe ». On continue ici ?\n\n🧭 OnThread · question : Stripe' }, data);
  assert.match(context(runHook('prompt', { session_id: marketing.id, cwd: shop, prompt: 'oui' }, data)), /🧭 OnThread · exception : Stripe/);
  runHook('stop', { session_id: marketing.id, last_assistant_message: 'C\'est corrigé.\n\n🧭 OnThread · exception : Stripe' }, data);
  const ctx = context(runHook('prompt', { session_id: marketing.id, cwd: shop, prompt: 'Corrige aussi le webhook Stripe' }, data));
  assert.match(ctx, /Already accepted here, never ask again about: "Stripe"/);
  runHook('stop', { session_id: marketing.id, last_assistant_message: '🧭 OnThread · exception : stripe' }, data);
  assert.equal(readConv(data, marketing.id).exceptions.length, 1);
});

test('short replies and slash commands are never checked', () => {
  const { data, marketing } = shopRegistry();
  for (const prompt of ['oui', 'OK !', '1', '2.', 'merci', 'continue', '/onthread:list']) {
    const res = runHook('prompt', { session_id: marketing.id, cwd: shop, prompt }, data);
    assert.equal(res.stdout, '', `"${prompt}" should add nothing`);
  }
});

test('other projects appear only on a strong match, and only by name', () => {
  const data = tempDir();
  const self = seed(data, { id: uuid(), title: 'Marketing', topic: topic('Stratégie marketing'), project: project(shop) });
  seed(data, { id: uuid(), title: 'Paie RH', topic: topic('Gestion de la paie et contrats des salariés'), project: project(other) });
  const weak = context(runHook('prompt', { session_id: self.id, cwd: shop, prompt: 'Prépare un post LinkedIn sur les salariés' }, data));
  assert.doesNotMatch(weak, /Paie RH/);
  const strong = context(runHook('prompt', { session_id: self.id, cwd: shop, prompt: 'Calcule la paie des salariés et prépare leurs contrats' }, data));
  assert.match(strong, /"Paie RH" — other project "onthread-hr-/);
  assert.doesNotMatch(strong, /contrats des salariés/);
});

test('inactive conversations (beyond the inactivity window) are not proposed', () => {
  const data = tempDir();
  const self = seed(data, { id: uuid(), title: 'Marketing', topic: topic('Stratégie marketing'), project: project(shop) });
  const old = new Date(Date.now() - 200 * 86400000).toISOString();
  seed(data, { id: uuid(), title: 'Intégration Stripe', topic: topic('Paiements Stripe'), project: project(shop), lastActiveAt: old });
  const ctx = context(runHook('prompt', { session_id: self.id, cwd: shop, prompt: 'Corrige le paiement Stripe' }, data));
  assert.doesNotMatch(ctx, /Intégration Stripe/);
  assert.ok(path.isAbsolute(shop));
});
